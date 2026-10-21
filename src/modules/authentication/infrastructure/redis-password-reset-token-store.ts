import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { IPasswordResetTokenStore } from '../domain/repositories/password-reset-token-store.interface';
import { RedisService } from '../../../shared/infrastructure/redis/redis.service';

@Injectable()
export class RedisPasswordResetTokenStore implements IPasswordResetTokenStore {
  private readonly logger = new Logger(RedisPasswordResetTokenStore.name);

  constructor(private readonly redisService: RedisService) {}

  private buildKey(email: string): string {
    return `auth:reset-password-token:${email.trim().toLowerCase()}`;
  }

  public async saveResetToken(
    email: string,
    tokenHash: string,
    ttlSeconds: number,
  ): Promise<Result<void, Error>> {
    try {
      await this.redisService.set(this.buildKey(email), tokenHash, ttlSeconds);
      return ok(undefined);
    } catch (error) {
      this.logger.error(
        `Failed to save reset token: ${(error as Error).message}`,
      );
      return err(new Error('Failed to save reset token.'));
    }
  }

  public async findResetToken(
    email: string,
  ): Promise<Result<string | null, Error>> {
    try {
      const tokenHash = await this.redisService.get(this.buildKey(email));
      return ok(tokenHash);
    } catch (error) {
      this.logger.error(
        `Failed to get reset token: ${(error as Error).message}`,
      );
      return err(new Error('Failed to find reset token.'));
    }
  }

  public async deleteResetToken(email: string): Promise<Result<void, Error>> {
    try {
      await this.redisService.del(this.buildKey(email));
      return ok(undefined);
    } catch (error) {
      this.logger.error(
        `Failed to delete reset token: ${(error as Error).message}`,
      );
      return err(new Error('Failed to delete reset token.'));
    }
  }
}
