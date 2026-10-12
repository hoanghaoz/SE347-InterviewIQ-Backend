import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import {
  CreateRefreshTokenData,
  IRefreshTokenRepository,
} from '../domain/repositories/refresh-token.repo.interface';

@Injectable()
export class RefreshTokenRepository implements IRefreshTokenRepository {
  private readonly logger = new Logger(RefreshTokenRepository.name);
  constructor(private readonly prisma: PrismaService) {}

  async createRefreshToken(
    data: CreateRefreshTokenData,
  ): Promise<Result<void, Error>> {
    try {
      await this.prisma.refreshToken.create({
        data: {
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
        },
      });
      return ok(undefined);
    } catch (error) {
      this.logger.error(
        `createRefreshToken failed: ${(error as Error).message}`,
      );
      return err(new Error('Failed to create refresh token'));
    }
  }
}
