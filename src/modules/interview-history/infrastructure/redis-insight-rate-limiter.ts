import { Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { RedisService } from '../../../shared/infrastructure/redis/redis.service';
import { HISTORY_INSIGHT_LIMITS } from '../domain/constants/history-insight.constants';
import { IInsightRateLimiter } from '../domain/repositories/insight-rate-limiter.interface';

@Injectable()
export class RedisInsightRateLimiter implements IInsightRateLimiter {
  private readonly logger = new Logger(RedisInsightRateLimiter.name);

  constructor(private readonly redisService: RedisService) {}

  private buildKey(userPublicId: string): string {
    return `history:insight:generate:${userPublicId}`;
  }

  async tryAcquire(userPublicId: string): Promise<Result<boolean, Error>> {
    try {
      // Fixed window: TTL chỉ được đặt ở lần đầu nên cửa sổ không bị kéo dài.
      const count = await this.redisService.incrementWithTtl(
        this.buildKey(userPublicId),
        HISTORY_INSIGHT_LIMITS.generationWindowSeconds,
      );
      return ok(count <= HISTORY_INSIGHT_LIMITS.maxGenerationsPerWindow);
    } catch (error) {
      this.logger.error(
        `Failed to check the insight rate limit: ${(error as Error).message}`,
      );
      return err(new Error('Failed to check the insight rate limit.'));
    }
  }
}
