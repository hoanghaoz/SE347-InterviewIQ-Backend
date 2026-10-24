import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  ResendRegistrationOtpDto,
  ResetPasswordDto,
  VerifyRegistrationDto,
} from '../dtos/auth.request.dto';
import { LoginResponseDto } from '../dtos/auth.response.dto';

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
  abstract resetPasswordAsync(
    request: ResetPasswordDto,
  ): Promise<Result<void, AppError>>;
}
