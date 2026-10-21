import type { Result } from 'neverthrow';

// Token đổi được từ OTP đặt lại mật khẩu, dùng cho bước đặt mật khẩu mới.
// Mỗi email chỉ có một token: lưu token mới sẽ ghi đè token cũ.
export abstract class IPasswordResetTokenStore {
  /** Lưu hash của reset token cho email, tự hết hạn sau ttlSeconds. */
  abstract saveResetToken(
    email: string,
    tokenHash: string,
    ttlSeconds: number,
  ): Promise<Result<void, Error>>;
  /** Lấy hash của reset token. Trả null nếu chưa có hoặc đã hết hạn. */
  abstract findResetToken(email: string): Promise<Result<string | null, Error>>;
  /** Xóa reset token (sau khi đặt mật khẩu thành công). */
  abstract deleteResetToken(email: string): Promise<Result<void, Error>>;
}
