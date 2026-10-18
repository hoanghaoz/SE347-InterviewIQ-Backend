import type { Result } from 'neverthrow';

// Returned by rotateRefreshToken when the old token was already revoked,
// e.g. another request rotated it first (race) or it was reused.
export class RefreshTokenAlreadyRevokedError extends Error {
  constructor() {
    super('The refresh token has already been revoked.');
  }
}

export type CreateRefreshTokenData = {
  readonly userId: number; // id nội bộ, lấy từ UserCredentials.id
  readonly tokenHash: string;
  readonly expiresAt: Date;
};

// Không trả tokenHash: caller đã có hash nên không cần, càng ít dữ liệu nhạy cảm đi ra càng tốt
export type RefreshTokenRecord = {
  readonly id: number;
  readonly userId: number;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
};

export abstract class IRefreshTokenRepository {
  abstract createRefreshToken(
    data: CreateRefreshTokenData,
  ): Promise<Result<void, Error>>;

  // Trả cả token đã revoke/hết hạn: service cần revokedAt để phát hiện token bị dùng lại
  abstract getRefreshTokenByHash(
    tokenHash: string,
  ): Promise<Result<RefreshTokenRecord | null, Error>>;

  // Revoke token cũ và tạo token mới trong một transaction.
  // Chỉ revoke khi token cũ chưa bị revoke; nếu đã bị revoke thì fails với
  // RefreshTokenAlreadyRevokedError và không tạo token mới.
  abstract rotateRefreshToken(
    oldTokenId: number,
    newToken: CreateRefreshTokenData,
  ): Promise<Result<void, Error>>;

  // Dùng khi phát hiện token bị dùng lại: đăng xuất user khỏi mọi thiết bị
  abstract revokeAllRefreshTokensForUser(
    userId: number,
  ): Promise<Result<void, Error>>;

  // Dùng khi logout: chỉ revoke đúng token của thiết bị hiện tại.
  // Token không tồn tại hoặc đã bị revoke thì không làm gì và vẫn ok.
  abstract revokeRefreshTokenByHash(
    tokenHash: string,
  ): Promise<Result<void, Error>>;
}
