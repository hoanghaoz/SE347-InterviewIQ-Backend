import { trackCloudinaryCall } from './external-call';
import { recordMetrics } from './metric-recorder.testing';

describe('trackCloudinaryCall', () => {
  let recorded: ReturnType<typeof recordMetrics>;

  beforeEach(() => {
    recorded = recordMetrics();
  });

  afterEach(() => {
    recorded.stop();
  });

  it('returns the result and records an ok duration', async () => {
    const value = await trackCloudinaryCall('cv_get_file', () =>
      Promise.resolve('meta'),
    );

    expect(value).toBe('meta');
    expect(recorded.named('cloudinary.request.duration')).toEqual([
      {
        name: 'cloudinary.request.duration',
        value: expect.any(Number) as number,
        attributes: { operation: 'cv_get_file', outcome: 'ok' },
      },
    ]);
  });

  it('labels the SDK 404 as not_found and rethrows it', async () => {
    // The Cloudinary SDK rejects with a plain object, not an Error.
    const notFound = { error: { http_code: 404 } };

    await expect(
      trackCloudinaryCall('video_get', () =>
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        Promise.reject(notFound),
      ),
    ).rejects.toBe(notFound);

    expect(recorded.named('cloudinary.request.duration')[0].attributes).toEqual(
      { operation: 'video_get', outcome: 'not_found' },
    );
  });

  it('labels any other failure as error', async () => {
    await expect(
      trackCloudinaryCall('avatar_upload', () =>
        Promise.reject(new Error('network')),
      ),
    ).rejects.toThrow('network');

    expect(recorded.named('cloudinary.request.duration')[0].attributes).toEqual(
      { operation: 'avatar_upload', outcome: 'error' },
    );
  });
});
