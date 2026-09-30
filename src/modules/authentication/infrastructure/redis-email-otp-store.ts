import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { IEmailOtpStore } from '../domain/repositories/email-otp-store.interface';
import { RedisService } from 'src/shared/infrastructure/redis/redis.service';

@Injectable()
export class RedisEmailOtpStore implements IEmailOtpStore {
  private readonly logger = new Logger(IEmailOtpStore.name);

  constructor(private readonly redisService: RedisService) {}

  private buildKey(email: string): string {
    return `auth:otp:register:${email.trim().toLowerCase()}`;
  }
  public async saveOtp(
    email: string,
    otpHash: string,
    ttlSeconds: number,
  ): Promise<Result<void, Error>> {
    try {
      await this.redisService.set(this.buildKey(email), otpHash, ttlSeconds);
      return ok(undefined);
    } catch (error) {
      this.logger.error(`Failed to save OTP: ${(error as Error).message}`);
      return err(new Error('Failed'));
    }
  }

  public async findOtp(email: string): Promise<Result<string | null, Error>> {
    try {
      await this.redisService.get(this.buildKey(email));
      return ok(email ?? null);
    } catch (error) {
      this.logger.error(`Failed to get OTP: ${(error as Error).message}`);
      return err(new Error('Failed'));
    }
  }

  public async deleteOtp(email: string): Promise<Result<void, Error>> {
    try {
      await this.redisService.del(this.buildKey(email));
      return ok(undefined);
    } catch (error) {
      this.logger.error(`Failed to delete OTP: ${(error as Error).message}`);
      return err(new Error('Failed'));
    }
  }

  public async getRemainingTtl(
    email: string,
  ): Promise<Result<number | null, Error>> {
    try {
      const ttl = await this.redisService.ttl(this.buildKey(email));
      // Redis: -2 = key không tồn tại, -1 = key không có expire
      if (ttl < 0) return ok(null);
      return ok(ttl); // giây
    } catch (error) {
      this.logger.error(`Failed to get OTP TTL: ${(error as Error).message}`);
      return err(new Error('Failed'));
    }
  }
}
