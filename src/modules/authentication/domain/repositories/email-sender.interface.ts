import type { Result } from 'neverthrow';

export abstract class IEmailSender {
  /** Gửi OTP xác thực đăng ký. */
  abstract sendOtp(email: string, otp: string): Promise<Result<void, Error>>;
  /** Gửi OTP đặt lại mật khẩu (nội dung khác để user không nhầm với OTP đăng ký). */
  abstract sendPasswordResetOtp(
    email: string,
    otp: string,
  ): Promise<Result<void, Error>>;
}
