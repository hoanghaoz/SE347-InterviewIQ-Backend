import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { err, ok, type Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import { IUserRepository } from '../../../user/domain/repositories/user.repo.interface';
import { IEmailOtpStore } from '../../domain/repositories/email-otp-store.interface';
import { IEmailSender } from '../../domain/repositories/email-sender.interface';
import { IPasswordHasher } from '../../domain/repositories/password-hasher.interface';
import { IPendingRegistrationStore } from '../../domain/repositories/pending-registration-store.interface';
import { RegisterDto } from '../dtos/auth.request.dto';
import { IAuthService } from '../interfaces/auth.service.interface';

const OTP_TTL_SECONDS = 300;
// Pending phải sống lâu hơn OTP để resend OTP vẫn còn dữ liệu đăng ký
const PENDING_REGISTRATION_TTL_SECONDS = 900;

@Injectable()
export class AuthService implements IAuthService {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly passwordHasher: IPasswordHasher,
    private readonly emailSender: IEmailSender,
    private readonly pendingRegistrationStore: IPendingRegistrationStore,
    private readonly emailOtpStore: IEmailOtpStore,
  ) {}

  async registerAsync(request: RegisterDto): Promise<Result<void, AppError>> {
    const existingUser = await this.userRepository.getUserByEmail(
      request.email,
    );
    if (existingUser.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to register user'),
      );
    }
    if (existingUser.value !== null) {
      return err(new AppError(ErrorCode.Conflict, 'Email already registered'));
    }

    const passwordHash = await this.passwordHasher.hash(request.password);
    if (passwordHash.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to register user'),
      );
    }

    const savePending =
      await this.pendingRegistrationStore.savePendingRegistration(
        {
          email: request.email,
          passwordHash: passwordHash.value,
          fullName: request.fullName,
          createdAt: new Date(),
        },
        PENDING_REGISTRATION_TTL_SECONDS,
      );
    if (savePending.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to register user'),
      );
    }

    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const otpHash = await this.passwordHasher.hash(otp);
    if (otpHash.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to generate OTP'),
      );
    }

    const saveOtp = await this.emailOtpStore.saveOtp(
      request.email,
      otpHash.value,
      OTP_TTL_SECONDS,
    );
    if (saveOtp.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to generate OTP'),
      );
    }

    const sendOtp = await this.emailSender.sendOtp(request.email, otp);
    if (sendOtp.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to send OTP email'),
      );
    }

    return ok(undefined);
  }
}
