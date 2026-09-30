import type { Result } from 'neverthrow';

export abstract class IEmailOtpStore {
  /** Lưu OTP (đã hash) cho email, tự hết hạn sau ttlSeconds. Ghi đè OTP cũ nếu có. */
  abstract saveOtp(
    email: string,
    otpHash: string,
    ttlSeconds: number,
  ): Promise<Result<void, Error>>;
  /** Lấy OTP hash của email. Trả null nếu chưa từng gửi hoặc đã hết hạn. */
  abstract findOtp(email: string): Promise<Result<string | null, Error>>;
  /** Xóa OTP của email (sau khi verify thành công). */
  abstract deleteOtp(email: string): Promise<Result<void, Error>>;
  /** Số giây còn lại trước khi OTP hết hạn. Trả 0 nếu không tồn tại. */
  abstract getRemainingTtl(
    email: string,
  ): Promise<Result<number | null, Error>>;
}
