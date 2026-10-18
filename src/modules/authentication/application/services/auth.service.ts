import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import { err, ok, type Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import {
  IUserRepository,
  UserAlreadyExistsError,
} from '../../../user/domain/repositories/user.repo.interface';
import { IAccessTokenIssuer } from '../../domain/repositories/access-token-issuer.interface';
import { IEmailOtpStore } from '../../domain/repositories/email-otp-store.interface';
import { IEmailSender } from '../../domain/repositories/email-sender.interface';
import { IPasswordHasher } from '../../domain/repositories/password-hasher.interface';
import { IPendingRegistrationStore } from '../../domain/repositories/pending-registration-store.interface';
import {
  IRefreshTokenRepository,
  RefreshTokenAlreadyRevokedError,
} from '../../domain/repositories/refresh-token.repo.interface';
import { ITokenHasher } from '../../domain/repositories/token-hasher.interface';
import {
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  VerifyRegistrationDto,
} from '../dtos/auth.request.dto';
import { LoginResponseDto } from '../dtos/auth.response.dto';
import { IAuthService } from '../interfaces/auth.service.interface';

const OTP_TTL_SECONDS = 300;
// Pending phải sống lâu hơn OTP để resend OTP vẫn còn dữ liệu đăng ký
const PENDING_REGISTRATION_TTL_SECONDS = 900;
// Sai OTP quá số lần này thì xóa OTP, user phải đăng ký lại
const MAX_OTP_ATTEMPTS = 5;
// Bcrypt hash (10 rounds) của một chuỗi random không ai biết. Email không tồn tại
// vẫn compare với hash này để thời gian phản hồi giống hệt sai mật khẩu.
const DUMMY_PASSWORD_HASH =
  '$2b$10$4oEFBqNbsbZcDyi2c0QAl.lgJx6zuAd.AoNb5eTSVKtzq1jbCNPLu';

@Injectable()
export class AuthService implements IAuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshTokenTtlSeconds: number;

  constructor(
    private readonly userRepository: IUserRepository,
    private readonly passwordHasher: IPasswordHasher,
    private readonly emailSender: IEmailSender,
    private readonly pendingRegistrationStore: IPendingRegistrationStore,
    private readonly emailOtpStore: IEmailOtpStore,
    private readonly accessTokenIssuer: IAccessTokenIssuer,
    private readonly tokenHasher: ITokenHasher,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    configService: ConfigService,
  ) {
    // Thiếu hoặc sai env thì crash lúc khởi động, không để lỗi lộ ra lúc login
    this.refreshTokenTtlSeconds = Number(
      configService.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN'),
    );
    if (
      !Number.isInteger(this.refreshTokenTtlSeconds) ||
      this.refreshTokenTtlSeconds <= 0
    ) {
      throw new Error('JWT_REFRESH_EXPIRES_IN must be a positive integer');
    }
  }

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

  async loginAsync(
    request: LoginDto,
  ): Promise<Result<LoginResponseDto, AppError>> {
    const credentialsResult =
      await this.userRepository.getUserCredentialsByEmail(request.email);
    if (credentialsResult.isErr()) {
      return err(this.loginFailedError());
    }

    // 1. Email không tồn tại vẫn chạy bcrypt (với hash giả) để attacker không
    // đo thời gian phản hồi mà dò ra email nào đã đăng ký
    const user = credentialsResult.value;
    const isPasswordValid = await this.passwordHasher.compare(
      request.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (isPasswordValid.isErr()) {
      return err(this.loginFailedError());
    }
    // Sai email và sai mật khẩu dùng chung một lỗi
    if (user === null || !isPasswordValid.value) {
      return err(
        new AppError(ErrorCode.Unauthorized, 'Invalid email or password'),
      );
    }

    // 2. Access token chỉ mang publicId và role, không lộ id nội bộ
    const accessTokenResult = await this.accessTokenIssuer.issueAccessToken({
      sub: user.publicId,
      role: user.role,
    });
    if (accessTokenResult.isErr()) {
      return err(this.loginFailedError());
    }

    // 3. Refresh token: trả bản gốc cho client, DB chỉ lưu hash
    const refreshToken = this.tokenHasher.generateToken();
    const saveRefreshToken =
      await this.refreshTokenRepository.createRefreshToken({
        userId: user.id,
        tokenHash: this.tokenHasher.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTokenTtlSeconds * 1000),
      });
    if (saveRefreshToken.isErr()) {
      return err(this.loginFailedError());
    }

    return ok({ accessToken: accessTokenResult.value, refreshToken });
  }

  async refreshAsync(
    request: RefreshTokenDto,
  ): Promise<Result<LoginResponseDto, AppError>> {
    // 1. DB chỉ lưu hash nên tìm theo hash của token client gửi lên
    const tokenResult = await this.refreshTokenRepository.getRefreshTokenByHash(
      this.tokenHasher.hashToken(request.refreshToken),
    );
    if (tokenResult.isErr()) {
      return err(this.refreshFailedError());
    }
    const token = tokenResult.value;
    if (token === null) {
      return err(this.invalidRefreshTokenError());
    }

    // 2. Token đã bị rotate mà vẫn được gửi lại → có thể đã bị lộ.
    // Không biết ai là chủ thật nên thu hồi mọi phiên của user, buộc login lại.
    if (token.revokedAt !== null) {
      this.logger.warn(`Refresh token reuse detected for user ${token.userId}`);
      const revokeAll =
        await this.refreshTokenRepository.revokeAllRefreshTokensForUser(
          token.userId,
        );
      if (revokeAll.isErr()) {
        this.logger.error('Failed to revoke refresh tokens after token reuse');
      }
      return err(this.invalidRefreshTokenError());
    }

    if (token.expiresAt.getTime() <= Date.now()) {
      return err(this.invalidRefreshTokenError());
    }

    // 3. Đọc role mới nhất từ DB: đổi role sẽ có hiệu lực từ lần refresh tiếp theo
    const userResult = await this.userRepository.getUserById(token.userId);
    if (userResult.isErr()) {
      return err(this.refreshFailedError());
    }
    const user = userResult.value;
    if (user === null) {
      return err(this.invalidRefreshTokenError());
    }

    // 4. Ký access token trước khi rotate: nếu ký lỗi thì token cũ vẫn còn dùng được,
    // không bị rotate mất mà client lại không nhận được token mới
    const accessTokenResult = await this.accessTokenIssuer.issueAccessToken({
      sub: user.publicId,
      role: user.role,
    });
    if (accessTokenResult.isErr()) {
      return err(this.refreshFailedError());
    }

    // 5. Absolute expiry: token mới giữ nguyên expiresAt của token cũ,
    // hết hạn thì phải login lại dù user vẫn đang hoạt động
    const refreshToken = this.tokenHasher.generateToken();
    const rotateResult = await this.refreshTokenRepository.rotateRefreshToken(
      token.id,
      {
        userId: token.userId,
        tokenHash: this.tokenHasher.hashToken(refreshToken),
        expiresAt: token.expiresAt,
      },
    );
    if (rotateResult.isErr()) {
      // Request khác vừa rotate token này (client gửi trùng): không thu hồi hết
      // như bước 2 vì đa số là retry vô hại, chỉ từ chối request này
      if (rotateResult.error instanceof RefreshTokenAlreadyRevokedError) {
        return err(this.invalidRefreshTokenError());
      }
      return err(this.refreshFailedError());
    }

    return ok({ accessToken: accessTokenResult.value, refreshToken });
  }

  async logoutAsync(request: RefreshTokenDto): Promise<Result<void, AppError>> {
    // Token không tồn tại / đã revoke / hết hạn đều trả ok như RFC 7009:
    // phiên đó vốn đã không dùng được nên mục đích logout đã đạt, và không lộ trạng thái token.
    // Không thu hồi mọi phiên khi gặp token đã revoke như refreshAsync: logout lại bằng token cũ
    // thường chỉ là client retry, kẻ trộm token dùng logout cũng không lấy được gì.
    const revokeResult =
      await this.refreshTokenRepository.revokeRefreshTokenByHash(
        this.tokenHasher.hashToken(request.refreshToken),
      );
    if (revokeResult.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to logout'),
      );
    }

    return ok(undefined);
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

  private loginFailedError(): AppError {
    return new AppError(ErrorCode.InternalServerError, 'Failed to login');
  }

  // Không tồn tại / đã revoke / hết hạn / user đã bị xóa dùng chung một lỗi
  // để không lộ trạng thái của token
  private invalidRefreshTokenError(): AppError {
    return new AppError(ErrorCode.Unauthorized, 'Invalid refresh token');
  }

  private refreshFailedError(): AppError {
    return new AppError(
      ErrorCode.InternalServerError,
      'Failed to refresh token',
    );
  }
}
