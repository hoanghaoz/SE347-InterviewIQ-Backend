import type { Result } from 'neverthrow';

export type CreateRefreshTokenData = {
  readonly userId: number; // id nội bộ, lấy từ UserCredentials.id
  readonly tokenHash: string;
  readonly expiresAt: Date;
};

export abstract class IRefreshTokenRepository {
  abstract createRefreshToken(
    data: CreateRefreshTokenData,
  ): Promise<Result<void, Error>>;
}
