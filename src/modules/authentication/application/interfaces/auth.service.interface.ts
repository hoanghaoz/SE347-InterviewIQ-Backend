import type { UUID } from 'crypto';
import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  ResendRegistrationOtpDto,
  ResetPasswordDto,
  VerifyPasswordResetOtpDto,
  VerifyRegistrationDto,
} from '../dtos/auth.request.dto';
import {
  LoginResponseDto,
  PasswordResetTokenResponseDto,
} from '../dtos/auth.response.dto';

export abstract class IAuthService {
  abstract registerAsync(request: RegisterDto): Promise<Result<void, AppError>>;
  abstract resendRegistrationOtpAsync(
    request: ResendRegistrationOtpDto,
  ): Promise<Result<void, AppError>>;
  abstract verifyRegistrationAsync(
    request: VerifyRegistrationDto,
  ): Promise<Result<LoginResponseDto, AppError>>;
  abstract loginAsync(
    request: LoginDto,
  ): Promise<Result<LoginResponseDto, AppError>>;
  abstract refreshAsync(
    request: RefreshTokenDto,
  ): Promise<Result<LoginResponseDto, AppError>>;
  abstract logoutAsync(
    request: RefreshTokenDto,
  ): Promise<Result<void, AppError>>;
  abstract requestPasswordResetAsync(
    request: ForgotPasswordDto,
  ): Promise<Result<void, AppError>>;
  abstract verifyPasswordResetOtpAsync(
    request: VerifyPasswordResetOtpDto,
  ): Promise<Result<PasswordResetTokenResponseDto, AppError>>;
  abstract resetPasswordAsync(
    request: ResetPasswordDto,
  ): Promise<Result<void, AppError>>;
  // Khác resetPasswordAsync: user đang đăng nhập, định danh lấy từ access token
  // (`sub`) và xác thực bằng mật khẩu hiện tại thay vì OTP qua email.
  abstract changePasswordAsync(
    userPublicId: UUID,
    request: ChangePasswordDto,
  ): Promise<Result<void, AppError>>;
}
