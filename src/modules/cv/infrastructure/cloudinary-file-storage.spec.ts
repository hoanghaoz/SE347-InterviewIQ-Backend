import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryFileStorage } from './cloudinary-file-storage';

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    api: { resource: jest.fn() },
    utils: {
      api_sign_request: jest.fn(() => 'signature'),
      private_download_url: jest.fn(
        () =>
          'https://api.cloudinary.com/download?api_key=KEY&signature=SECRET-SIG',
      ),
    },
  },
}));

const API_SECRET = 'super-secret-value';

function createStorage(values: Record<string, string> = {}): {
  storage: CloudinaryFileStorage;
  errorLog: jest.SpyInstance;
} {
  const config = {
    get: (key: string) =>
      ({
        CLOUDINARY_CLOUD_NAME: 'demo-cloud',
        CLOUDINARY_API_KEY: '123456789012345',
        CLOUDINARY_API_SECRET: API_SECRET,
        ...values,
      })[key],
  } as unknown as ConfigService;
  const errorLog = jest
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);
  return { storage: new CloudinaryFileStorage(config), errorLog };
}

describe('CloudinaryFileStorage', () => {
  const resource = cloudinary.api.resource as jest.Mock;

  beforeEach(() => {
    jest.restoreAllMocks();
    resource.mockReset();
  });

  // Every field the browser sends must be inside the signature, otherwise Cloudinary
  // rejects the upload with "Invalid Signature".
  it('signs and returns asset_folder as InterviewIQ/<public id folder>', () => {
    const { storage } = createStorage();
    const sign = cloudinary.utils.api_sign_request as jest.Mock;

    const result = storage.createSignedUpload('cvs/user-1/file-1');

    expect(result._unsafeUnwrap().assetFolder).toBe('InterviewIQ/cvs/user-1');
    expect(sign).toHaveBeenCalledWith(
      expect.objectContaining({
        public_id: 'cvs/user-1/file-1',
        asset_folder: 'InterviewIQ/cvs/user-1',
        allowed_formats: 'pdf',
      }),
      API_SECRET,
    );
  });

  it('returns null when Cloudinary says the file does not exist (404)', async () => {
    const { storage } = createStorage();
    resource.mockRejectedValue({ error: { http_code: 404, message: 'x' } });

    const result = await storage.getFile('cvs/u/f');

    expect(result._unsafeUnwrap()).toBeNull();
  });

  it('never writes the API secret to the log when Cloudinary fails', async () => {
    const { storage, errorLog } = createStorage();
    // Same shape the real SDK rejects with: request_options.auth is "key:secret".
    resource.mockRejectedValue({
      request_options: { auth: `123456789012345:${API_SECRET}` },
      error: { http_code: 401, message: 'cloud_name mismatch' },
    });

    const result = await storage.getFile('cvs/u/f');

    expect(result.isErr()).toBe(true);
    const calls = errorLog.mock.calls as unknown[][];
    const logged = calls.map((call) => String(call[0])).join('\n');
    expect(logged).toContain('401');
    expect(logged).toContain('cloud_name mismatch');
    expect(logged).not.toContain(API_SECRET);
  });

  it('fails without calling Cloudinary when the keys are missing', async () => {
    const { storage } = createStorage({ CLOUDINARY_API_SECRET: '' });

    const result = await storage.getFile('cvs/u/f');

    expect(result.isErr()).toBe(true);
    expect(resource).not.toHaveBeenCalled();
  });

  describe('downloadFile', () => {
    const SIGNED_URL =
      'https://api.cloudinary.com/download?api_key=KEY&signature=SECRET-SIG';
    const fetchMock = jest.fn<Promise<Response>, [string]>();
    const privateUrl = cloudinary.utils.private_download_url as jest.Mock;

    beforeEach(() => {
      fetchMock.mockReset();
      jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
    });

    const respond = (
      status: number,
      body: Uint8Array = new Uint8Array(),
      headers: Record<string, string> = {},
    ) => new Response(body as BodyInit, { status, headers });

    const loggedText = (errorLog: jest.SpyInstance) =>
      (errorLog.mock.calls as unknown[][])
        .map((call) => String(call[0]))
        .join('\n');

    it('returns the bytes of the file', async () => {
      const { storage } = createStorage();
      fetchMock.mockResolvedValue(
        respond(200, new Uint8Array([37, 80, 68, 70])),
      );

      const result = await storage.downloadFile('cvs/u/f');

      expect(Array.from(result._unsafeUnwrap() ?? [])).toEqual([
        37, 80, 68, 70,
      ]);
      expect(fetchMock.mock.calls[0][0]).toBe(SIGNED_URL);
    });

    it('asks for a short-lived signed URL of the pdf stored as an image', async () => {
      const { storage } = createStorage();
      fetchMock.mockResolvedValue(respond(200, new Uint8Array([1])));
      const before = Math.floor(Date.now() / 1000);

      await storage.downloadFile('cvs/u/f');

      const [publicId, format, options] = (
        privateUrl.mock.calls as unknown[][]
      )[0] as [
        string,
        string,
        { resource_type: string; type: string; expires_at: number },
      ];
      expect([publicId, format]).toEqual(['cvs/u/f', 'pdf']);
      expect(options.resource_type).toBe('image');
      expect(options.type).toBe('upload');
      expect(options.expires_at).toBeGreaterThanOrEqual(before);
      expect(options.expires_at).toBeLessThanOrEqual(before + 120);
    });

    it('returns null when Cloudinary has no such file (404)', async () => {
      const { storage } = createStorage();
      fetchMock.mockResolvedValue(respond(404));

      expect(
        (await storage.downloadFile('cvs/u/f'))._unsafeUnwrap(),
      ).toBeNull();
    });

    it('fails on another HTTP error without leaking the signed URL', async () => {
      const { storage, errorLog } = createStorage();
      fetchMock.mockResolvedValue(respond(500));

      const result = await storage.downloadFile('cvs/u/f');

      expect(result.isErr()).toBe(true);
      expect(loggedText(errorLog)).toContain('500');
      expect(loggedText(errorLog)).not.toContain('SECRET-SIG');
    });

    it('fails on a network error without leaking the signed URL or the secret', async () => {
      const { storage, errorLog } = createStorage();
      fetchMock.mockRejectedValue(
        new Error(`fetch failed for ${SIGNED_URL} using ${API_SECRET}`),
      );

      const result = await storage.downloadFile('cvs/u/f');

      expect(result.isErr()).toBe(true);
      expect(loggedText(errorLog)).not.toContain('SECRET-SIG');
      expect(loggedText(errorLog)).not.toContain(API_SECRET);
    });

    it('refuses a file whose declared size is over the limit before reading it', async () => {
      const { storage } = createStorage();
      const response = respond(200, new Uint8Array([1]), {
        'content-length': String(7 * 1024 * 1024),
      });
      const readBody = jest.spyOn(response, 'arrayBuffer');
      fetchMock.mockResolvedValue(response);

      const result = await storage.downloadFile('cvs/u/f');

      expect(result.isErr()).toBe(true);
      expect(readBody).not.toHaveBeenCalled();
    });

    it('refuses a body over the limit even when no size was declared', async () => {
      const { storage } = createStorage();
      fetchMock.mockResolvedValue(
        respond(200, new Uint8Array(6 * 1024 * 1024 + 1)),
      );

      expect((await storage.downloadFile('cvs/u/f')).isErr()).toBe(true);
    });

    it('fails without calling Cloudinary when the keys are missing', async () => {
      const { storage } = createStorage({ CLOUDINARY_API_SECRET: '' });

      const result = await storage.downloadFile('cvs/u/f');

      expect(result.isErr()).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
