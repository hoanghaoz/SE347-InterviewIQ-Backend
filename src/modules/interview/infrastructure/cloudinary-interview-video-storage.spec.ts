import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryInterviewVideoStorage } from './cloudinary-interview-video-storage';

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    utils: { api_sign_request: jest.fn() },
    api: { resource: jest.fn() },
  },
}));

describe('CloudinaryInterviewVideoStorage', () => {
  const config = new ConfigService({
    CLOUDINARY_CLOUD_NAME: 'demo',
    CLOUDINARY_API_KEY: 'test-key',
    CLOUDINARY_API_SECRET: 'test-secret',
  });
  const storage = new CloudinaryInterviewVideoStorage(config);
  const sign = jest.mocked(cloudinary.utils.api_sign_request);
  const resource = jest.mocked(cloudinary.api.resource);
  const asset = 'interview-answers/user/session/question/asset';

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-10-12T10:00:00Z'));
    sign.mockReturnValue('signed');
  });
  afterEach(() => jest.useRealTimers());

  it('signs PDF-independent video restrictions and prevents overwriting', () => {
    const result = storage.createSignedUpload(asset);
    if (result.isErr()) throw result.error;
    expect(sign).toHaveBeenCalledWith(
      {
        public_id: asset,
        timestamp: 1791799200,
        allowed_formats: 'mp4,webm',
        overwrite: false,
      },
      'test-secret',
    );
    expect(result.value).toEqual({
      uploadUrl: 'https://api.cloudinary.com/v1_1/demo/video/upload',
      apiKey: 'test-key',
      timestamp: 1791799200,
      signature: 'signed',
      cloudinaryPublicId: asset,
      resourceType: 'video',
      allowedFormats: 'mp4,webm',
      overwrite: false,
      maxFileSizeBytes: 104857600,
    });
    expect(result.value).not.toHaveProperty('apiSecret');
  });

  it('reads video metadata from the provider with video resource type', async () => {
    resource.mockImplementation((_publicId, options?: unknown) =>
      Promise.resolve({
        secure_url: 'https://example.com/video.webm',
        bytes: 1024,
        format: 'webm',
        duration:
          typeof options === 'object' &&
          options !== null &&
          'media_metadata' in options &&
          options.media_metadata === true
            ? 12.25
            : undefined,
        width: 640,
        height: 480,
      }),
    );
    const result = await storage.getVideo(asset);
    if (result.isErr()) throw result.error;
    expect(resource).toHaveBeenCalledWith(asset, {
      resource_type: 'video',
      media_metadata: true,
      cloud_name: 'demo',
      api_key: 'test-key',
      api_secret: 'test-secret',
    });
    expect(result.value).toEqual({
      url: 'https://example.com/video.webm',
      bytes: 1024,
      format: 'webm',
      durationSeconds: 12.25,
      width: 640,
      height: 480,
    });
  });

  it('keeps missing dimensions/duration detectable for audio-only or invalid files', async () => {
    resource.mockResolvedValue({
      secure_url: 'https://example.com/audio.mp4',
      bytes: 1024,
      format: 'mp4',
    });
    const result = await storage.getVideo(asset);
    if (result.isErr()) throw result.error;
    expect(result.value).toMatchObject({
      durationSeconds: 0,
      width: 0,
      height: 0,
    });
  });

  it('returns null for a missing video', async () => {
    resource.mockRejectedValue({ error: { http_code: 404 } });
    const result = await storage.getVideo(asset);
    if (result.isErr()) throw result.error;
    expect(result.value).toBeNull();
  });

  it('sanitizes resource lookup failures', async () => {
    resource.mockRejectedValue(new Error('Cloudinary secret'));
    const result = await storage.getVideo(asset);
    if (result.isOk()) throw new Error('Expected lookup failure');
    expect(result.error.message).toBe(
      'Failed to read uploaded interview video.',
    );
  });

  it('sanitizes signing failures', () => {
    sign.mockImplementation(() => {
      throw new Error('Cloudinary secret');
    });
    const result = storage.createSignedUpload(asset);
    if (result.isOk()) throw new Error('Expected signing failure');
    expect(result.error.message).toBe(
      'Failed to prepare interview video upload.',
    );
  });

  it.each([
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
  ])('fails safely without %s', async (missing) => {
    const values = {
      CLOUDINARY_CLOUD_NAME: 'demo',
      CLOUDINARY_API_KEY: 'key',
      CLOUDINARY_API_SECRET: 'secret',
      [missing]: '',
    };
    const unconfigured = new CloudinaryInterviewVideoStorage(
      new ConfigService(values),
    );
    expect(unconfigured.createSignedUpload(asset).isErr()).toBe(true);
    expect((await unconfigured.getVideo(asset)).isErr()).toBe(true);
    expect(sign).not.toHaveBeenCalled();
    expect(resource).not.toHaveBeenCalled();
  });
});
