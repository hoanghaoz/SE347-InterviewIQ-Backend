import { IEmailOtpStore } from './email-otp-store.interface';

// Cùng contract với IEmailOtpStore nhưng là token DI riêng: OTP đặt lại mật khẩu
// nằm ở key riêng nên không dùng thay OTP đăng ký được (và ngược lại)
export abstract class IPasswordResetOtpStore extends IEmailOtpStore {}
