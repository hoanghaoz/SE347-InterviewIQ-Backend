import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt, type UUID } from 'crypto';
import { err, ok, type Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import {
  IUserRepository,
  UserAlreadyExistsError,
  type UserIdentity,
} from '../../../user/domain/repositories/user.repo.interface';
import { IAccessTokenIssuer } from '../../domain/repositories/access-token-issuer.interface';
import { IEmailOtpStore } from '../../domain/repositories/email-otp-store.interface';
import { IEmailSender } from '../../domain/repositories/email-sender.interface';
import { IPasswordHasher } from '../../domain/repositories/password-hasher.interface';
import { IPasswordResetOtpStore } from '../../domain/repositories/password-reset-otp-store.interface';
import { IPasswordResetTokenStore } from '../../domain/repositories/password-reset-token-store.interface';
import { IPendingRegistrationStore } from '../../domain/repositories/pending-registration-store.interface';
import {
  IRefreshTokenRepository,
  RefreshTokenAlreadyRevokedError,
} from '../../domain/repositories/refresh-token.repo.interface';
import { ITokenHasher } from '../../domain/repositories/token-hasher.interface';
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
import { IAuthService } from '../interfaces/auth.service.interface';

const OTP_TTL_SECONDS = 300;
// Chặn spam mail: OTP vừa gửi chưa quá khoảng này thì không gửi OTP mới
const OTP_RESEND_COOLDOWN_SECONDS = 60;
// Pending phải sống lâu hơn OTP để resend OTP vẫn còn dữ liệu đăng ký
const PENDING_REGISTRATION_TTL_SECONDS = 900;
// Sai OTP quá số lần này thì xóa OTP, user phải xin OTP mới
const MAX_OTP_ATTEMPTS = 5;
// Đủ để gõ mật khẩu mới; ngắn để token có bị lộ (log, lịch sử) cũng sớm vô dụng
const PASSWORD_RESET_TOKEN_TTL_SECONDS = 600;
// Token vừa bị rotate trong khoảng này mà bị gửi lại thường là các tab refresh cùng lúc
// hoặc client retry khi mất response, không phải bị trộm
const REFRESH_TOKEN_REUSE_GRACE_SECONDS = 10;
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
    private readonly passwordResetOtpStore: IPasswordResetOtpStore,
    private readonly passwordResetTokenStore: IPasswordResetTokenStore,
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

    // Không có cooldown thì gọi lại register sẽ lách được cooldown của resend.
    // Kiểm tra trước khi ghi đè pending để request bị chặn không đổi dữ liệu đăng ký.
    const cooldown = await this.ensureOtpCooldownPassedAsync(
      this.emailOtpStore,
      request.email,
    );
    if (cooldown.isErr()) {
      return err(cooldown.error);
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

    return this.sendRegistrationOtpAsync(request.email);
  }

  async resendRegistrationOtpAsync(
    request: ResendRegistrationOtpDto,
  ): Promise<Result<void, AppError>> {
    // Chỉ cần email: dữ liệu đăng ký đã nằm trong pending, client không phải giữ mật khẩu.
    // Không giấu "không có pending" vì register đã trả 409 cho email đã có tài khoản.
    const pendingResult =
      await this.pendingRegistrationStore.findPendingRegistration(
        request.email,
      );
    if (pendingResult.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to resend OTP'),
      );
    }
    if (pendingResult.value === null) {
      return err(this.registrationExpiredError());
    }

    const cooldown = await this.ensureOtpCooldownPassedAsync(
      this.emailOtpStore,
      request.email,
    );
    if (cooldown.isErr()) {
      return err(cooldown.error);
    }

    // Không gia hạn pending: đăng ký chỉ chờ tối đa PENDING_REGISTRATION_TTL_SECONDS
    return this.sendRegistrationOtpAsync(request.email);
  }

  async verifyRegistrationAsync(
    request: VerifyRegistrationDto,
  ): Promise<Result<LoginResponseDto, AppError>> {
    const { email, otp } = request;

    // 1. OTP trước pending: chỉ ai có OTP đúng mới biết được trạng thái đăng ký
    const otpCheck = await this.checkOtpAsync(
      this.emailOtpStore,
      email,
      otp,
      this.verifyFailedError(),
    );
    if (otpCheck.isErr()) {
      return err(otpCheck.error);
    }

    // 2. OTP đúng → lấy dữ liệu đăng ký đã lưu
    const pendingResult =
      await this.pendingRegistrationStore.findPendingRegistration(email);
    if (pendingResult.isErr()) {
      return err(this.verifyFailedError());
    }
    if (pendingResult.value === null) {
      return err(this.registrationExpiredError());
    }

    // 3. Tạo user từ dữ liệu pending (không lấy từ request)
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

    // 4. Dọn dẹp: user đã được tạo nên lỗi ở đây chỉ log, không fail request (TTL sẽ tự dọn)
    const cleanups = await Promise.all([
      this.emailOtpStore.deleteOtp(email),
      this.pendingRegistrationStore.deletePendingRegistration(email),
      this.emailOtpStore.resetFailedAttempts(email),
    ]);
    if (cleanups.some((result) => result.isErr())) {
      this.logger.warn('Failed to clean up registration data after verify');
    }

    // 5. Đăng nhập luôn để user không phải gõ lại email + mật khẩu vừa đặt.
    // Làm sau bước dọn dẹp: tài khoản đã tồn tại thì dữ liệu đăng ký phải được xóa
    // dù đăng nhập có lỗi hay không
    const userId = createUserResult.value.id;
    const identityResult = await this.userRepository.getUserById(userId);
    if (identityResult.isErr() || identityResult.value === null) {
      return err(this.autoLoginFailedError());
    }

    const tokensResult = await this.issueTokenPairAsync({
      id: userId,
      ...identityResult.value,
    });
    if (tokensResult.isErr()) {
      return err(this.autoLoginFailedError());
    }

    return ok(tokensResult.value);
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

    // 2. Cấp phiên mới cho thiết bị này
    const tokensResult = await this.issueTokenPairAsync(user);
    if (tokensResult.isErr()) {
      return err(this.loginFailedError());
    }

    return ok(tokensResult.value);
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
      // Trong grace window chỉ từ chối request này: thu hồi mọi phiên ở đây sẽ đá
      // user ra khỏi mọi thiết bị chỉ vì mở nhiều tab
      const revokedAgoMs = Date.now() - token.revokedAt.getTime();
      if (revokedAgoMs <= REFRESH_TOKEN_REUSE_GRACE_SECONDS * 1000) {
        return err(this.invalidRefreshTokenError());
      }

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

  async requestPasswordResetAsync(
    request: ForgotPasswordDto,
  ): Promise<Result<void, AppError>> {
    const { email } = request;

    // Email lạ và đang trong cooldown đều trả ok như khi gửi thật:
    // response không cho biết email nào đã có tài khoản
    const userResult = await this.userRepository.getUserByEmail(email);
    if (userResult.isErr()) {
      return err(this.passwordResetRequestFailedError());
    }
    if (userResult.value === null) {
      return ok(undefined);
    }

    // OTP trước còn dùng được nên trong cooldown chỉ cần không gửi mail mới
    const inCooldown = await this.isOtpInCooldownAsync(
      this.passwordResetOtpStore,
      email,
    );
    if (inCooldown.isErr()) {
      return err(this.passwordResetRequestFailedError());
    }
    if (inCooldown.value) {
      return ok(undefined);
    }

    const otp = await this.issueOtpAsync(this.passwordResetOtpStore, email);
    if (otp.isErr()) {
      return err(otp.error);
    }

    const sendOtp = await this.emailSender.sendPasswordResetOtp(
      email,
      otp.value,
    );
    if (sendOtp.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to send OTP email'),
      );
    }

    return ok(undefined);
  }

  async verifyPasswordResetOtpAsync(
    request: VerifyPasswordResetOtpDto,
  ): Promise<Result<PasswordResetTokenResponseDto, AppError>> {
    const { email, otp } = request;

    // 1. Chỉ chủ email mới đi tiếp được. Sai quá MAX_OTP_ATTEMPTS thì OTP bị xóa như luồng đăng ký
    const otpCheck = await this.checkOtpAsync(
      this.passwordResetOtpStore,
      email,
      otp,
      this.verifyPasswordResetOtpFailedError(),
    );
    if (otpCheck.isErr()) {
      return err(otpCheck.error);
    }

    // 2. Đổi OTP lấy reset token cho bước đặt mật khẩu. Store chỉ giữ hash
    const resetToken = this.tokenHasher.generateToken();
    const saveToken = await this.passwordResetTokenStore.saveResetToken(
      email,
      this.tokenHasher.hashToken(resetToken),
      PASSWORD_RESET_TOKEN_TTL_SECONDS,
    );
    if (saveToken.isErr()) {
      // OTP chưa bị xóa nên user gửi lại đúng OTP đó là được
      return err(this.verifyPasswordResetOtpFailedError());
    }

    // 3. OTP chỉ dùng một lần. Lỗi dọn dẹp chỉ log: verify lại cũng chỉ ghi đè token cũ
    const cleanups = await Promise.all([
      this.passwordResetOtpStore.deleteOtp(email),
      this.passwordResetOtpStore.resetFailedAttempts(email),
    ]);
    if (cleanups.some((result) => result.isErr())) {
      this.logger.warn('Failed to clean up password reset OTP after verify');
    }

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

  async requestPasswordResetAsync(
    request: ForgotPasswordDto,
  ): Promise<Result<void, AppError>> {
    const { email } = request;

    // Email lạ và đang trong cooldown đều trả ok như khi gửi thật:
    // response không cho biết email nào đã có tài khoản
    const userResult = await this.userRepository.getUserByEmail(email);
    if (userResult.isErr()) {
      return err(this.passwordResetRequestFailedError());
    }
    if (userResult.value === null) {
      return ok(undefined);
    }

    // OTP trước còn dùng được nên trong cooldown chỉ cần không gửi mail mới
    const inCooldown = await this.isOtpInCooldownAsync(
      this.passwordResetOtpStore,
      email,
    );
    if (inCooldown.isErr()) {
      return err(this.passwordResetRequestFailedError());
    }
    if (inCooldown.value) {
      return ok(undefined);
    }

    const otp = await this.issueOtpAsync(this.passwordResetOtpStore, email);
    if (otp.isErr()) {
      return err(otp.error);
    }

    const sendOtp = await this.emailSender.sendPasswordResetOtp(
      email,
      otp.value,
    );
    if (sendOtp.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to send OTP email'),
      );
    }

    return ok(undefined);
  }

  async verifyPasswordResetOtpAsync(
    request: VerifyPasswordResetOtpDto,
  ): Promise<Result<PasswordResetTokenResponseDto, AppError>> {
    const { email, otp } = request;

    // 1. Chỉ chủ email mới đi tiếp được. Sai quá MAX_OTP_ATTEMPTS thì OTP bị xóa như luồng đăng ký
    const otpCheck = await this.checkOtpAsync(
      this.passwordResetOtpStore,
      email,
      otp,
      this.verifyPasswordResetOtpFailedError(),
    );
    if (otpCheck.isErr()) {
      return err(otpCheck.error);
    }

    // 2. Đổi OTP lấy reset token cho bước đặt mật khẩu. Store chỉ giữ hash
    const resetToken = this.tokenHasher.generateToken();
    const saveToken = await this.passwordResetTokenStore.saveResetToken(
      email,
      this.tokenHasher.hashToken(resetToken),
      PASSWORD_RESET_TOKEN_TTL_SECONDS,
    );
    if (saveToken.isErr()) {
      // OTP chưa bị xóa nên user gửi lại đúng OTP đó là được
      return err(this.verifyPasswordResetOtpFailedError());
    }

    // 3. OTP chỉ dùng một lần. Lỗi dọn dẹp chỉ log: verify lại cũng chỉ ghi đè token cũ
    const cleanups = await Promise.all([
      this.passwordResetOtpStore.deleteOtp(email),
      this.passwordResetOtpStore.resetFailedAttempts(email),
    ]);
    if (cleanups.some((result) => result.isErr())) {
      this.logger.warn('Failed to clean up password reset OTP after verify');
    }

    return ok({ resetToken });
  }

  async resetPasswordAsync(
    request: ResetPasswordDto,
  ): Promise<Result<void, AppError>> {
    const { email, resetToken, newPassword } = request;

    // 1. Chỉ ai vừa verify OTP mới có token. Không đếm số lần sai như OTP:
    // token 32 byte random thì không đoán được.
    // So hash thay vì token gốc nên đo thời gian so sánh cũng không suy ra được token.
    const tokenHashResult =
      await this.passwordResetTokenStore.findResetToken(email);
    if (tokenHashResult.isErr()) {
      return err(this.resetPasswordFailedError());
    }
    // Không có token và token sai dùng chung một lỗi
    if (tokenHashResult.value !== this.tokenHasher.hashToken(resetToken)) {
      return err(this.invalidResetTokenError());
    }

    // 2. Tài khoản bị xóa sau khi verify: báo như token sai, không lộ trạng thái tài khoản
    const userResult = await this.userRepository.getUserByEmail(email);
    if (userResult.isErr()) {
      return err(this.resetPasswordFailedError());
    }
    if (userResult.value === null) {
      return err(this.invalidResetTokenError());
    }
    const userId = userResult.value.id;

    // 3. Đổi mật khẩu
    const passwordHash = await this.passwordHasher.hash(newPassword);
    if (passwordHash.isErr()) {
      return err(this.resetPasswordFailedError());
    }
    const updateResult = await this.userRepository.updateUserPassword(
      userId,
      passwordHash.value,
    );
    if (updateResult.isErr()) {
      return err(this.resetPasswordFailedError());
    }

    // 4. Đá mọi phiên cũ: reset thường là vì nghi tài khoản bị chiếm.
    // Lỗi ở đây vẫn giữ token để user gửi lại đúng request này (đổi mật khẩu lần nữa là vô hại)
    const revokeAll =
      await this.refreshTokenRepository.revokeAllRefreshTokensForUser(userId);
    if (revokeAll.isErr()) {
      return err(this.resetPasswordFailedError());
    }

    // 5. Xong hết mới xóa token: token chỉ dùng một lần. Lỗi dọn dẹp chỉ log, TTL sẽ tự dọn
    const deleteToken =
      await this.passwordResetTokenStore.deleteResetToken(email);
    if (deleteToken.isErr()) {
      this.logger.warn('Failed to delete password reset token');
    }

    return ok(undefined);
  }

  async changePasswordAsync(
    userPublicId: UUID,
    request: ChangePasswordDto,
  ): Promise<Result<void, AppError>> {
    const { currentPassword, newPassword } = request;

    // 1. Tra user theo publicId (`sub` của token), không theo email: email trong
    // token có thể đã cũ sau khi user đổi email ở trang hồ sơ.
    const userResult =
      await this.userRepository.getUserCredentialsByPublicId(userPublicId);
    if (userResult.isErr()) {
      return err(this.changePasswordFailedError());
    }
    // Token còn hiệu lực nhưng tài khoản đã bị xóa
    if (userResult.value === null) {
      return err(new AppError(ErrorCode.Unauthorized, 'User no longer exists'));
    }
    const user = userResult.value;

    // 2. Mật khẩu hiện tại là thứ chứng minh người đang gọi đúng là chủ tài khoản,
    // không phải ai đó mượn được access token.
    const isCurrentPasswordValid = await this.passwordHasher.compare(
      currentPassword,
      user.passwordHash,
    );
    if (isCurrentPasswordValid.isErr()) {
      return err(this.changePasswordFailedError());
    }
    if (!isCurrentPasswordValid.value) {
      return err(
        new AppError(ErrorCode.Unauthorized, 'Current password is incorrect'),
      );
    }

    // 3. Đặt lại đúng mật khẩu cũ thì mọi phiên bị đá ra mà chẳng được gì
    if (newPassword === currentPassword) {
      return err(
        new AppError(
          ErrorCode.BadRequest,
          'New password must be different from the current password',
        ),
      );
    }

    const passwordHash = await this.passwordHasher.hash(newPassword);
    if (passwordHash.isErr()) {
      return err(this.changePasswordFailedError());
    }
    const updateResult = await this.userRepository.updateUserPassword(
      user.id,
      passwordHash.value,
    );
    if (updateResult.isErr()) {
      return err(this.changePasswordFailedError());
    }

    // 4. Đá mọi phiên cũ, kể cả thiết bị đang gọi: đổi mật khẩu thường là vì nghi
    // mật khẩu bị lộ, nên refresh token đã phát ra không được sống tiếp.
    const revokeAll =
      await this.refreshTokenRepository.revokeAllRefreshTokensForUser(user.id);
    if (revokeAll.isErr()) {
      // Mật khẩu đã đổi xong, chỉ phần dọn phiên lỗi. Vẫn báo 500 để client đi
      // đăng nhập lại thay vì tin rằng mọi thứ bình thường.
      return err(this.changePasswordFailedError());
    }

    return ok(undefined);
  }

  // OTP còn sống lâu hơn (TTL - cooldown) nghĩa là vừa được gửi chưa quá cooldown.
  // Dùng luôn TTL của OTP nên không cần thêm key Redis riêng cho cooldown.
  private async isOtpInCooldownAsync(
    store: IEmailOtpStore,
    email: string,
  ): Promise<Result<boolean, AppError>> {
    const remainingTtl = await store.getRemainingTtl(email);
    if (remainingTtl.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to generate OTP'),
      );
    }

    return ok(
      remainingTtl.value !== null &&
        remainingTtl.value > OTP_TTL_SECONDS - OTP_RESEND_COOLDOWN_SECONDS,
    );
  }

  private async ensureOtpCooldownPassedAsync(
    store: IEmailOtpStore,
    email: string,
  ): Promise<Result<void, AppError>> {
    const inCooldown = await this.isOtpInCooldownAsync(store, email);
    if (inCooldown.isErr()) {
      return err(inCooldown.error);
    }
    if (inCooldown.value) {
      return err(
        new AppError(
          ErrorCode.TooManyRequests,
          'Please wait before requesting a new OTP',
        ),
      );
    }

    return ok(undefined);
  }

  // OTP mới thay OTP cũ, bộ đếm sai reset về 0. Store chỉ giữ hash;
  // trả OTP gốc để caller tự gửi mail đúng nội dung của luồng mình.
  private async issueOtpAsync(
    store: IEmailOtpStore,
    email: string,
  ): Promise<Result<string, AppError>> {
    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const otpHash = await this.passwordHasher.hash(otp);
    if (otpHash.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to generate OTP'),
      );
    }

    const saveOtp = await store.saveOtp(email, otpHash.value, OTP_TTL_SECONDS);
    if (saveOtp.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to generate OTP'),
      );
    }

    const resetAttempts = await store.resetFailedAttempts(email);
    if (resetAttempts.isErr()) {
      this.logger.warn('Failed to reset OTP attempts after issuing a new OTP');
    }

    return ok(otp);
  }

  // "Không có OTP" và "OTP sai" dùng chung lỗi để không lộ email nào đang có OTP.
  // Sai quá MAX_OTP_ATTEMPTS thì xóa OTP để chặn brute-force.
  // failedError là lỗi 500 riêng của luồng gọi, dùng khi hạ tầng lỗi.
  private async checkOtpAsync(
    store: IEmailOtpStore,
    email: string,
    otp: string,
    failedError: AppError,
  ): Promise<Result<void, AppError>> {
    const otpHashResult = await store.findOtp(email);
    if (otpHashResult.isErr()) {
      return err(failedError);
    }
    if (otpHashResult.value === null) {
      return err(this.invalidOtpError());
    }

    const isOtpValid = await this.passwordHasher.compare(
      otp,
      otpHashResult.value,
    );
    if (isOtpValid.isErr()) {
      return err(failedError);
    }
    if (isOtpValid.value) {
      return ok(undefined);
    }

    const attempts = await store.incrementFailedAttempts(
      email,
      OTP_TTL_SECONDS,
    );
    if (attempts.isErr()) {
      return err(failedError);
    }
    if (attempts.value >= MAX_OTP_ATTEMPTS) {
      const deleteOtp = await store.deleteOtp(email);
      if (deleteOtp.isErr()) {
        this.logger.warn('Failed to delete OTP after too many attempts');
      }
      return err(
        new AppError(
          ErrorCode.TooManyRequests,
          'Too many attempts, please request a new OTP',
        ),
      );
    }
    return err(this.invalidOtpError());
  }

  // Register và resend dùng chung
  private async sendRegistrationOtpAsync(
    email: string,
  ): Promise<Result<void, AppError>> {
    const otp = await this.issueOtpAsync(this.emailOtpStore, email);
    if (otp.isErr()) {
      return err(otp.error);
    }

    const sendOtp = await this.emailSender.sendOtp(email, otp.value);
    if (sendOtp.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to send OTP email'),
      );
    }

    return ok(undefined);
  }

  // Mọi luồng cấp phiên mới (login, verify đăng ký) dùng chung: trả Error thô
  // để mỗi caller tự map ra AppError của luồng mình
  private async issueTokenPairAsync(
    user: UserIdentity & { readonly id: number },
  ): Promise<Result<LoginResponseDto, Error>> {
    // Access token chỉ mang publicId và role, không lộ id nội bộ
    const accessTokenResult = await this.accessTokenIssuer.issueAccessToken({
      sub: user.publicId,
      role: user.role,
    });
    if (accessTokenResult.isErr()) {
      return err(accessTokenResult.error);
    }

    // Refresh token: trả bản gốc cho client, DB chỉ lưu hash
    const refreshToken = this.tokenHasher.generateToken();
    const saveRefreshToken =
      await this.refreshTokenRepository.createRefreshToken({
        userId: user.id,
        tokenHash: this.tokenHasher.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTokenTtlSeconds * 1000),
      });
    if (saveRefreshToken.isErr()) {
      return err(saveRefreshToken.error);
    }

    return ok({ accessToken: accessTokenResult.value, refreshToken });
  }

  private invalidOtpError(): AppError {
    return new AppError(ErrorCode.BadRequest, 'Invalid or expired OTP');
  }

  private registrationExpiredError(): AppError {
    return new AppError(
      ErrorCode.BadRequest,
      'Registration expired, please register again',
    );
  }

  private verifyFailedError(): AppError {
    return new AppError(
      ErrorCode.InternalServerError,
      'Failed to verify registration',
    );
  }

  // Tài khoản đã được tạo và OTP đã bị xóa: verify lại chỉ ra "OTP sai",
  // nên message phải chỉ client sang màn login
  private autoLoginFailedError(): AppError {
    return new AppError(
      ErrorCode.InternalServerError,
      'Account created but automatic login failed, please log in',
    );
  }

  private passwordResetRequestFailedError(): AppError {
    return new AppError(
      ErrorCode.InternalServerError,
      'Failed to request password reset',
    );
  }

  private verifyPasswordResetOtpFailedError(): AppError {
    return new AppError(ErrorCode.InternalServerError, 'Failed to verify OTP');
  }

  // Token hết hạn hoặc đã dùng thì chỉ còn cách xin OTP mới, message phải chỉ client quay lại bước đó
  private invalidResetTokenError(): AppError {
    return new AppError(
      ErrorCode.BadRequest,
      'Invalid or expired reset token, please request a new OTP',
    );
  }

  private resetPasswordFailedError(): AppError {
    return new AppError(
      ErrorCode.InternalServerError,
      'Failed to reset password',
    );
  }

  private changePasswordFailedError(): AppError {
    return new AppError(
      ErrorCode.InternalServerError,
      'Failed to change password',
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
