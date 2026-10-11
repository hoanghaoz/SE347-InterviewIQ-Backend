import { Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'crypto';
import { err, ok, type Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import {
  IUserRepository,
  UserAlreadyExistsError,
} from '../../../user/domain/repositories/user.repo.interface';
import { IEmailOtpStore } from '../../domain/repositories/email-otp-store.interface';
import { IEmailSender } from '../../domain/repositories/email-sender.interface';
import { IPasswordHasher } from '../../domain/repositories/password-hasher.interface';
import { IPendingRegistrationStore } from '../../domain/repositories/pending-registration-store.interface';
import { RegisterDto, VerifyRegistrationDto } from '../dtos/auth.request.dto';
import { IAuthService } from '../interfaces/auth.service.interface';

const OTP_TTL_SECONDS = 300;
// Pending phải sống lâu hơn OTP để resend OTP vẫn còn dữ liệu đăng ký
const PENDING_REGISTRATION_TTL_SECONDS = 900;
// Sai OTP quá số lần này thì xóa OTP, user phải đăng ký lại
const MAX_OTP_ATTEMPTS = 5;

@Injectable()
export class AuthService implements IAuthService {
  private readonly logger = new Logger(AuthService.name);

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

    // OTP mới → đếm số lần sai lại từ 0
    const resetAttempts = await this.emailOtpStore.resetFailedAttempts(
      request.email,
    );
    if (resetAttempts.isErr()) {
      this.logger.warn('Failed to reset OTP attempts after issuing a new OTP');
    }

    const sendOtp = await this.emailSender.sendOtp(request.email, otp);
    if (sendOtp.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to send OTP email'),
      );
    }

    return ok(undefined);
  }

  async verifyRegistrationAsync(
    request: VerifyRegistrationDto,
  ): Promise<Result<{ email: string }, AppError>> {
    const { email, otp } = request;

    // 1. OTP trước pending: chỉ ai có OTP đúng mới biết được trạng thái đăng ký.
    // "Không có OTP" và "OTP sai" dùng chung message để không lộ email nào đang chờ.
    const otpHashResult = await this.emailOtpStore.findOtp(email);
    if (otpHashResult.isErr()) {
      return err(this.verifyFailedError());
    }
    if (otpHashResult.value === null) {
      return err(this.invalidOtpError());
    }

    const isOtpValid = await this.passwordHasher.compare(
      otp,
      otpHashResult.value,
    );
    if (isOtpValid.isErr()) {
      return err(this.verifyFailedError());
    }

    // 2. Sai OTP → đếm, quá MAX_OTP_ATTEMPTS thì xóa OTP để chặn brute-force
    if (!isOtpValid.value) {
      const attempts = await this.emailOtpStore.incrementFailedAttempts(
        email,
        OTP_TTL_SECONDS,
      );
      if (attempts.isErr()) {
        return err(this.verifyFailedError());
      }
      if (attempts.value >= MAX_OTP_ATTEMPTS) {
        const deleteOtp = await this.emailOtpStore.deleteOtp(email);
        if (deleteOtp.isErr()) {
          this.logger.warn('Failed to delete OTP after too many attempts');
        }
        return err(
          new AppError(
            ErrorCode.TooManyRequests,
            'Too many attempts, please register again',
          ),
        );
      }
      return err(this.invalidOtpError());
    }

    // 3. OTP đúng → lấy dữ liệu đăng ký đã lưu
    const pendingResult =
      await this.pendingRegistrationStore.findPendingRegistration(email);
    if (pendingResult.isErr()) {
      return err(this.verifyFailedError());
    }
    if (pendingResult.value === null) {
      return err(
        new AppError(
          ErrorCode.BadRequest,
          'Registration expired, please register again',
        ),
      );
    }

    // 4. Tạo user từ dữ liệu pending (không lấy từ request)
    const pending = pendingResult.value;
    const createUserResult = await this.userRepository.createUser({
      email: pending.email,
      passwordHash: pending.passwordHash,
      fullName: pending.fullName,
    });
    if (createUserResult.isErr()) {
      if (createUserResult.error instanceof UserAlreadyExistsError) {
        return err(
          new AppError(ErrorCode.Conflict, 'Email already registered'),
        );
      }
      return err(this.verifyFailedError());
    }

    // 5. Dọn dẹp: user đã được tạo nên lỗi ở đây chỉ log, không fail request (TTL sẽ tự dọn)
    const cleanups = await Promise.all([
      this.emailOtpStore.deleteOtp(email),
      this.pendingRegistrationStore.deletePendingRegistration(email),
      this.emailOtpStore.resetFailedAttempts(email),
    ]);
    if (cleanups.some((result) => result.isErr())) {
      this.logger.warn('Failed to clean up registration data after verify');
    }

    return ok({ email });
  }

  private invalidOtpError(): AppError {
    return new AppError(ErrorCode.BadRequest, 'Invalid or expired OTP');
  }

  private verifyFailedError(): AppError {
    return new AppError(
      ErrorCode.InternalServerError,
      'Failed to verify registration',
    );
  }
}
