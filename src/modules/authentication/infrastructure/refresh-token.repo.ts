import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import {
  CreateRefreshTokenData,
  IRefreshTokenRepository,
  RefreshTokenAlreadyRevokedError,
  RefreshTokenRecord,
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

  async getRefreshTokenByHash(
    tokenHash: string,
  ): Promise<Result<RefreshTokenRecord | null, Error>> {
    try {
      const token = await this.prisma.refreshToken.findUnique({
        where: { tokenHash },
        select: { id: true, userId: true, expiresAt: true, revokedAt: true },
      });
      return ok(token);
    } catch (error) {
      this.logger.error(
        `getRefreshTokenByHash failed: ${(error as Error).message}`,
      );
      return err(new Error('Failed to find refresh token'));
    }
  }

  async rotateRefreshToken(
    oldTokenId: number,
    newToken: CreateRefreshTokenData,
  ): Promise<Result<void, Error>> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Điều kiện revokedAt: null làm việc kiểm tra + revoke thành một câu lệnh atomic:
        // hai request cùng token thì chỉ một request được count = 1
        const { count } = await tx.refreshToken.updateMany({
          where: { id: oldTokenId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        // Throw (không return err) để Prisma rollback transaction
        if (count === 0) {
          throw new RefreshTokenAlreadyRevokedError();
        }
        await tx.refreshToken.create({
          data: {
            userId: newToken.userId,
            tokenHash: newToken.tokenHash,
            expiresAt: newToken.expiresAt,
          },
        });
      });
      return ok(undefined);
    } catch (error) {
      // Lỗi nghiệp vụ dự kiến: không log error, để service quyết định
      if (error instanceof RefreshTokenAlreadyRevokedError) {
        return err(error);
      }
      this.logger.error(
        `rotateRefreshToken failed: ${(error as Error).message}`,
      );
      return err(new Error('Failed to rotate refresh token'));
    }
  }

  async revokeAllRefreshTokensForUser(
    userId: number,
  ): Promise<Result<void, Error>> {
    try {
      // Chỉ revoke token còn hiệu lực để không ghi đè thời điểm revoke cũ
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return ok(undefined);
    } catch (error) {
      this.logger.error(
        `revokeAllRefreshTokensForUser failed: ${(error as Error).message}`,
      );
      return err(new Error('Failed to revoke refresh tokens'));
    }
  }

  async revokeRefreshTokenByHash(
    tokenHash: string,
  ): Promise<Result<void, Error>> {
    try {
      // updateMany thay vì update: không có token thì count = 0 chứ không throw,
      // và revokedAt: null giữ nguyên thời điểm revoke cũ khi logout lần nữa
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return ok(undefined);
    } catch (error) {
      this.logger.error(
        `revokeRefreshTokenByHash failed: ${(error as Error).message}`,
      );
      return err(new Error('Failed to revoke refresh token'));
    }
  }
}
