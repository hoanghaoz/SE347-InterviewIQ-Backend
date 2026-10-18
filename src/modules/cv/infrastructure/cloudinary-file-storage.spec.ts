import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryFileStorage } from './cloudinary-file-storage';

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    api: { resource: jest.fn() },
    utils: { api_sign_request: jest.fn(() => 'signature') },
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
});
