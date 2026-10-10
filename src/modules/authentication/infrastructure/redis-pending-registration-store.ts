import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { PendingRegistration } from '../domain/entities/pending-registration.entity';
import { IPendingRegistrationStore } from '../domain/repositories/pending-registration-store.interface';
import { RedisService } from '../../../shared/infrastructure/redis/redis.service';

@Injectable()
export class RedisPendingRegistrationStore implements IPendingRegistrationStore {
  private readonly logger = new Logger(RedisPendingRegistrationStore.name);

  constructor(private readonly redisService: RedisService) {}

  private buildKey(email: string): string {
    return `auth:pending-registration:${email.trim().toLowerCase()}`;
  }

  public async savePendingRegistration(
    data: PendingRegistration,
    ttlSeconds: number,
  ): Promise<Result<void, Error>> {
    try {
      // Date được JSON.stringify thành ISO string, parse lại ở findPendingRegistration
      const payload = JSON.stringify({
        email: data.email.trim().toLowerCase(),
        passwordHash: data.passwordHash,
        fullName: data.fullName,
        createdAt: data.createdAt,
      });
      await this.redisService.set(
        this.buildKey(data.email),
        payload,
        ttlSeconds,
      );
      return ok(undefined);
    } catch (error) {
      this.logger.error(
        `Failed to save pending registration: ${(error as Error).message}`,
      );
      return err(new Error('Failed to save pending registration.'));
    }
  }

  public async findPendingRegistration(
    email: string,
  ): Promise<Result<PendingRegistration | null, Error>> {
    let raw: string | null;
    try {
      raw = await this.redisService.get(this.buildKey(email));
    } catch (error) {
      this.logger.error(
        `Failed to get pending registration: ${(error as Error).message}`,
      );
      return err(new Error('Failed to find pending registration.'));
    }

    if (raw === null) return ok(null);

    // Dữ liệu hỏng coi như hết hạn: user đăng ký lại sẽ ghi đè key này
    const pending = this.parse(raw);
    if (!pending) {
      this.logger.warn('Pending registration payload is malformed, ignoring.');
      return ok(null);
    }
    return ok(pending);
  }

  public async deletePendingRegistration(
    email: string,
  ): Promise<Result<void, Error>> {
    try {
      await this.redisService.del(this.buildKey(email));
      return ok(undefined);
    } catch (error) {
      this.logger.error(
        `Failed to delete pending registration: ${(error as Error).message}`,
      );
      return err(new Error('Failed to delete pending registration.'));
    }
  }

  private parse(raw: string): PendingRegistration | null {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
    if (typeof value !== 'object' || value === null) return null;

    const { email, passwordHash, fullName, createdAt } = value as Record<
      string,
      unknown
    >;
    if (
      typeof email !== 'string' ||
      typeof passwordHash !== 'string' ||
      typeof fullName !== 'string' ||
      typeof createdAt !== 'string'
    ) {
      return null;
    }

    const createdAtDate = new Date(createdAt);
    if (Number.isNaN(createdAtDate.getTime())) return null;

    return { email, passwordHash, fullName, createdAt: createdAtDate };
  }
}
