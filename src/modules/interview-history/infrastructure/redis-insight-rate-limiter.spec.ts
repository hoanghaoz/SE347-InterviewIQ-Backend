import { Logger } from '@nestjs/common';
import type { RedisService } from '../../../shared/infrastructure/redis/redis.service';
import { HISTORY_INSIGHT_LIMITS } from '../domain/constants/history-insight.constants';
import { RedisInsightRateLimiter } from './redis-insight-rate-limiter';

describe('RedisInsightRateLimiter', () => {
  const incrementWithTtl = jest.fn();
  const limiter = new RedisInsightRateLimiter({
    incrementWithTtl,
  } as unknown as RedisService);

  const userPublicId = '00000000-0000-4000-8000-000000000001';

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('counts per user inside a fixed window', async () => {
    incrementWithTtl.mockResolvedValue(1);

    await limiter.tryAcquire(userPublicId);

    expect(incrementWithTtl).toHaveBeenCalledWith(
      `history:insight:generate:${userPublicId}`,
      HISTORY_INSIGHT_LIMITS.generationWindowSeconds,
    );
  });

  it('allows up to the limit', async () => {
    incrementWithTtl.mockResolvedValue(
      HISTORY_INSIGHT_LIMITS.maxGenerationsPerWindow,
    );

    const result = await limiter.tryAcquire(userPublicId);

    if (result.isErr()) throw result.error;
    expect(result.value).toBe(true);
  });

  it('refuses once the limit is exceeded', async () => {
    incrementWithTtl.mockResolvedValue(
      HISTORY_INSIGHT_LIMITS.maxGenerationsPerWindow + 1,
    );

    const result = await limiter.tryAcquire(userPublicId);

    if (result.isErr()) throw result.error;
    expect(result.value).toBe(false);
  });

  it('returns an error when Redis fails', async () => {
    incrementWithTtl.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await limiter.tryAcquire(userPublicId);

    if (result.isOk()) throw new Error('Expected an error');
    expect(result.error.message).toBe(
      'Failed to check the insight rate limit.',
    );
  });
});
