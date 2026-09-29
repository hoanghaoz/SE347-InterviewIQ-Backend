import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(configService: ConfigService) {
    const url = configService.get<string>('REDIS_URL');
    if (!url) {
      throw new Error('REDIS_URL environment variable is not set');
    }
    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
    this.client.on('error', (error: Error) => {
      this.logger.error(`Redis connection error: ${error.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
  }
  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  // get / set / del / exists / incr / expire
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
      return;
    }
    await this.client.set(key, value);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  /**
   * Increment a counter and set its TTL only on the first hit (fixed window).
   * Runs atomically via MULTI so the key can never be left without an expiry.
   */

  async incrementWithTtl(key: string, ttlSecond: number): Promise<number> {
    const result = await this.client
      .multi()
      .incr(key)
      .expire(key, ttlSecond, 'NX')
      .exec();

    const [incrError, count] = result?.[0] ?? [];
    if (incrError) {
      throw incrError;
    }
    return count as number;
  }
}
