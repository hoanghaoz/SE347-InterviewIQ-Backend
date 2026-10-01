import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { IEmailOtpStore } from '../domain/repositories/email-otp-store.interface';
import { RedisService } from '../../../shared/infrastructure/redis/redis.service';

@Injectable()
export class RedisEmailOtpStore implements IEmailOtpStore {
  private readonly logger = new Logger(RedisEmailOtpStore.name);

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
      return err(new Error('Failed to save OTP.'));
    }
  }

  public async findOtp(email: string): Promise<Result<string | null, Error>> {
    try {
      const otpHash = await this.redisService.get(this.buildKey(email));
      return ok(otpHash);
    } catch (error) {
      this.logger.error(`Failed to get OTP: ${(error as Error).message}`);
      return err(new Error('Failed to find OTP.'));
    }
  }

  public async deleteOtp(email: string): Promise<Result<void, Error>> {
    try {
      await this.redisService.del(this.buildKey(email));
      return ok(undefined);
    } catch (error) {
      this.logger.error(`Failed to delete OTP: ${(error as Error).message}`);
      return err(new Error('Failed to delete OTP.'));
    }
  }

  public async getRemainingTtl(
    email: string,
  ): Promise<Result<number | null, Error>> {
    try {
      const ttl = await this.redisService.ttl(this.buildKey(email));
      // Redis trả -2 khi key không tồn tại, -1 khi key không có expiry
      if (ttl < 0) return ok(null);
      return ok(ttl);
    } catch (error) {
      this.logger.error(`Failed to get OTP TTL: ${(error as Error).message}`);
      return err(new Error('Failed to get OTP remaining TTL.'));
    }
  }
}
