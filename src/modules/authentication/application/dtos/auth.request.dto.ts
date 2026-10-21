import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72, { message: 'Password must not exceed 72 characters' })
  password!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Full name must be a string' })
  @IsNotEmpty({ message: 'Full name is required' })
  @MaxLength(100, { message: 'Full name must not exceed 100 characters' })
  fullName!: string;
}

export class VerifyRegistrationDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  // String (không phải number) để giữ số 0 ở đầu, ví dụ "012345"
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'OTP must be a string' })
  @Matches(/^\d{6}$/, { message: 'OTP must be exactly 6 digits' })
  otp!: string;
}

export class ResendRegistrationOtpDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;
}

export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  // Không có MinLength: luật độ dài là việc của lúc đăng ký, login không lộ chính sách mật khẩu.
  // MaxLength 72 vì bcrypt chỉ đọc 72 byte đầu.
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  @MaxLength(72, { message: 'Password must not exceed 72 characters' })
  password!: string;
}

export class ForgotPasswordDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;
}

export class VerifyPasswordResetOtpDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'OTP must be a string' })
  @Matches(/^\d{6}$/, { message: 'OTP must be exactly 6 digits' })
  otp!: string;
}

export class ResetPasswordDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  // Token nhận từ bước verify OTP: 32 byte random dạng hex (Sha256TokenHasher.generateToken)
  @IsString({ message: 'Reset token must be a string' })
  @IsNotEmpty({ message: 'Reset token is required' })
  @Matches(/^[0-9a-f]{64}$/, { message: 'Invalid reset token format' })
  resetToken!: string;

  // Cùng luật với mật khẩu lúc đăng ký
  @IsString({ message: 'New password must be a string' })
  @IsNotEmpty({ message: 'New password is required' })
  @MinLength(8, { message: 'New password must be at least 8 characters' })
  @MaxLength(72, { message: 'New password must not exceed 72 characters' })
  newPassword!: string;
}

export class RefreshTokenDto {
  // Token là 32 byte random dạng hex (Sha256TokenHasher.generateToken).
  // Sai format thì chặn ở đây, không để chuỗi rác chạm tới DB.
  @IsString({ message: 'Refresh token must be a string' })
  @IsNotEmpty({ message: 'Refresh token is required' })
  @Matches(/^[0-9a-f]{64}$/, { message: 'Invalid refresh token format' })
  refreshToken!: string;
}
