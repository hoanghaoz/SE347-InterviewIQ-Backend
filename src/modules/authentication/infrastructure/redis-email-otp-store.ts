import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { IEmailOtpStore } from '../domain/repositories/email-otp-store.interface';
import { RedisService } from '../../../shared/infrastructure/redis/redis.service';

@Injectable()
export class RedisEmailOtpStore implements IEmailOtpStore {
  private readonly logger = new Logger(this.constructor.name);
  // Mỗi luồng OTP có key riêng để OTP của luồng này không dùng được cho luồng khác.
  // Class con override purpose để có store cho luồng mới.
  protected readonly purpose: string = 'register';

  constructor(private readonly redisService: RedisService) {}

  private buildKey(email: string): string {
    return `auth:otp:${this.purpose}:${email.trim().toLowerCase()}`;
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

  private buildFailedAttemptsKey(email: string): string {
    return `auth:otp:failed-attempts:${this.purpose}:${email.trim().toLowerCase()}`;
  }

  public async incrementFailedAttempts(
    email: string,
    ttlSeconds: number,
  ): Promise<Result<number, Error>> {
    try {
      const count = await this.redisService.incrementWithTtl(
        this.buildFailedAttemptsKey(email),
        ttlSeconds,
      );
      return ok(count);
    } catch (error) {
      this.logger.error(
        `Failed to increment failed attempts: ${(error as Error).message}`,
      );
      return err(new Error('Failed to increment failed attempts.'));
    }
  }

  public async resetFailedAttempts(
    email: string,
  ): Promise<Result<void, Error>> {
    try {
      await this.redisService.del(this.buildFailedAttemptsKey(email));
      return ok(undefined);
    } catch (error) {
      this.logger.error(
        `Failed to reset failed attempts: ${(error as Error).message}`,
      );
      return err(new Error('Failed to reset failed attempts.'));
    }
  }
}
