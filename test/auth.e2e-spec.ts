import {
  BadRequestException,
  INestApplication,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { err, ok, type Result } from 'neverthrow';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthController } from '../src/modules/authentication/api/auth.controller';
import { IAuthService } from '../src/modules/authentication/application/interfaces/auth.service.interface';
import { AuthService } from '../src/modules/authentication/application/services/auth.service';
import { IEmailOtpStore } from '../src/modules/authentication/domain/repositories/email-otp-store.interface';
import { IEmailSender } from '../src/modules/authentication/domain/repositories/email-sender.interface';
import { IPasswordHasher } from '../src/modules/authentication/domain/repositories/password-hasher.interface';
import { IPasswordResetOtpStore } from '../src/modules/authentication/domain/repositories/password-reset-otp-store.interface';
import { IPasswordResetTokenStore } from '../src/modules/authentication/domain/repositories/password-reset-token-store.interface';
import { IPendingRegistrationStore } from '../src/modules/authentication/domain/repositories/pending-registration-store.interface';
import { BcryptPasswordHasher } from '../src/modules/authentication/infrastructure/bcrypt-password-hasher';
import { RedisEmailOtpStore } from '../src/modules/authentication/infrastructure/redis-email-otp-store';
import { RedisPasswordResetOtpStore } from '../src/modules/authentication/infrastructure/redis-password-reset-otp-store';
import { RedisPasswordResetTokenStore } from '../src/modules/authentication/infrastructure/redis-password-reset-token-store';
import { RedisPendingRegistrationStore } from '../src/modules/authentication/infrastructure/redis-pending-registration-store';
import { IAccessTokenIssuer } from '../src/modules/authentication/domain/repositories/access-token-issuer.interface';
import {
  CreateRefreshTokenData,
  IRefreshTokenRepository,
  RefreshTokenAlreadyRevokedError,
  RefreshTokenRecord,
} from '../src/modules/authentication/domain/repositories/refresh-token.repo.interface';
import { ITokenHasher } from '../src/modules/authentication/domain/repositories/token-hasher.interface';
import { JwtAccessTokenIssuer } from '../src/modules/authentication/infrastructure/jwt-access-token-issuer';
import { Sha256TokenHasher } from '../src/modules/authentication/infrastructure/sha256-token-hasher';
import { IUserRepository } from '../src/modules/user/domain/repositories/user.repo.interface';
import { InMemoryUserRepository } from './support/in-memory-user.repository';
import { CommonUserRole } from '../src/shared/common/commonEnum';
import { AllExceptionsFilter } from '../src/shared/common/exceptions.filter';
import { ErrorCode } from '../src/shared/common/errorCode';
import { mapValidationErrors } from '../src/shared/common/validation-error.mapper';
import { RedisService } from '../src/shared/infrastructure/redis/redis.service';

/**
 * Chạy luồng register → verify → login qua HTTP thật với AuthService, Redis stores,
 * bcrypt, JWT và SHA-256 thật.
 * Chỉ thay hạ tầng bên ngoài bằng bản in-memory: Redis (Map), Postgres (Map), SMTP (ghi lại OTP).
 * Không cần Docker; TTL không tự đếm ngược: test sửa `redis.ttls` để giả lập thời gian trôi.
 */
const JWT_SECRET = 'e2e-test-secret';
const JWT_ACCESS_EXPIRES_IN = 900;
const JWT_REFRESH_EXPIRES_IN = 604800;

const testConfig: Record<string, string> = {
  JWT_SECRET,
  JWT_ACCESS_EXPIRES_IN: String(JWT_ACCESS_EXPIRES_IN),
  JWT_REFRESH_EXPIRES_IN: String(JWT_REFRESH_EXPIRES_IN),
};

class InMemoryRedis {
  readonly store = new Map<string, string>();
  // Số giây còn lại của từng key, giữ nguyên tới khi key bị set lại hoặc xóa
  readonly ttls = new Map<string, number>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.store.get(key) ?? null);
  }
  set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(key, value);
    if (ttlSeconds) {
      this.ttls.set(key, ttlSeconds);
    } else {
      this.ttls.delete(key);
    }
    return Promise.resolve();
  }
  del(key: string): Promise<void> {
    this.store.delete(key);
    this.ttls.delete(key);
    return Promise.resolve();
  }
  // Giống Redis: -2 khi key không tồn tại, -1 khi key không có expiry
  ttl(key: string): Promise<number> {
    if (!this.store.has(key)) return Promise.resolve(-2);
    return Promise.resolve(this.ttls.get(key) ?? -1);
  }
  incrementWithTtl(key: string): Promise<number> {
    const next = Number(this.store.get(key) ?? '0') + 1;
    this.store.set(key, String(next));
    return Promise.resolve(next);
  }
}

type StoredRefreshToken = CreateRefreshTokenData & {
  readonly id: number;
  revokedAt: Date | null;
};

class InMemoryRefreshTokenRepository implements IRefreshTokenRepository {
  readonly tokens: StoredRefreshToken[] = [];

  // Khai báo rõ kiểu trả về để test có thể mock nhánh err()
  createRefreshToken(
    data: CreateRefreshTokenData,
  ): Promise<Result<void, Error>> {
    this.tokens.push({ ...data, id: this.tokens.length + 1, revokedAt: null });
    return Promise.resolve(ok(undefined));
  }

  getRefreshTokenByHash(
    tokenHash: string,
  ): Promise<Result<RefreshTokenRecord | null, Error>> {
    const token = this.tokens.find((t) => t.tokenHash === tokenHash);
    // Trả bản copy như DB, để service không sửa được dữ liệu đã lưu
    return Promise.resolve(
      ok(
        token
          ? {
              id: token.id,
              userId: token.userId,
              expiresAt: token.expiresAt,
              revokedAt: token.revokedAt,
            }
          : null,
      ),
    );
  }

  // Không có await giữa bước check và revoke nên đã atomic trong JS,
  // giống updateMany có điều kiện revokedAt: null của bản Prisma
  rotateRefreshToken(
    oldTokenId: number,
    newToken: CreateRefreshTokenData,
  ): Promise<Result<void, Error>> {
    const old = this.tokens.find((t) => t.id === oldTokenId);
    if (!old || old.revokedAt !== null) {
      return Promise.resolve(err(new RefreshTokenAlreadyRevokedError()));
    }
    old.revokedAt = new Date();
    this.tokens.push({
      ...newToken,
      id: this.tokens.length + 1,
      revokedAt: null,
    });
    return Promise.resolve(ok(undefined));
  }

  revokeAllRefreshTokensForUser(userId: number): Promise<Result<void, Error>> {
    const now = new Date();
    for (const token of this.tokens) {
      if (token.userId === userId && token.revokedAt === null) {
        token.revokedAt = now;
      }
    }
    return Promise.resolve(ok(undefined));
  }

  revokeRefreshTokenByHash(tokenHash: string): Promise<Result<void, Error>> {
    const token = this.tokens.find((t) => t.tokenHash === tokenHash);
    if (token && token.revokedAt === null) {
      token.revokedAt = new Date();
    }
    return Promise.resolve(ok(undefined));
  }
}

type OtpMailKind = 'register' | 'reset-password';

class CapturingEmailSender implements IEmailSender {
  readonly sent: { email: string; otp: string; kind: OtpMailKind }[] = [];

  sendOtp(email: string, otp: string) {
    this.sent.push({ email, otp, kind: 'register' });
    return Promise.resolve(ok(undefined));
  }
  sendPasswordResetOtp(email: string, otp: string) {
    this.sent.push({ email, otp, kind: 'reset-password' });
    return Promise.resolve(ok(undefined));
  }
  lastOtpFor(email: string, kind: OtpMailKind = 'register'): string {
    const otp = [...this.sent]
      .reverse()
      .find((m) => m.email === email && m.kind === kind)?.otp;
    if (!otp) throw new Error(`No ${kind} OTP was sent to ${email}`);
    return otp;
  }
}

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  let redis: InMemoryRedis;
  let users: InMemoryUserRepository;
  let mailer: CapturingEmailSender;
  let refreshTokens: InMemoryRefreshTokenRepository;
  // Có secret ở đây để JwtAuthGuard (route password/change) verify được token
  const jwtService = new JwtService({ secret: JWT_SECRET });

  const registerRoute = '/api/auth/register';
  const resendRoute = '/api/auth/register/resend';
  const verifyRoute = '/api/auth/register/verify';
  const loginRoute = '/api/auth/login';
  const refreshRoute = '/api/auth/refresh';
  const logoutRoute = '/api/auth/logout';
  const forgotPasswordRoute = '/api/auth/password/forgot';
  const verifyResetOtpRoute = '/api/auth/password/verify';
  const resetPasswordRoute = '/api/auth/password/reset';
  const changePasswordRoute = '/api/auth/password/change';
  const body = {
    email: 'new.user@example.com',
    password: 'Str0ngPass',
    fullName: 'Nguyen Van A',
  };

  const register = (payload: object = body) =>
    request(app.getHttpServer()).post(registerRoute).send(payload);
  const resend = (payload: object = { email: body.email }) =>
    request(app.getHttpServer()).post(resendRoute).send(payload);
  const verify = (payload: object) =>
    request(app.getHttpServer()).post(verifyRoute).send(payload);
  const login = (payload: object) =>
    request(app.getHttpServer()).post(loginRoute).send(payload);
  const refresh = (refreshToken: string) =>
    request(app.getHttpServer()).post(refreshRoute).send({ refreshToken });
  const logout = (refreshToken: string) =>
    request(app.getHttpServer()).post(logoutRoute).send({ refreshToken });
  const forgotPassword = (payload: object = { email: body.email }) =>
    request(app.getHttpServer()).post(forgotPasswordRoute).send(payload);
  const verifyResetOtp = (payload: object) =>
    request(app.getHttpServer()).post(verifyResetOtpRoute).send(payload);
  const resetPassword = (payload: object) =>
    request(app.getHttpServer()).post(resetPasswordRoute).send(payload);
  const wrongOtpFor = (otp: string) => (otp === '000000' ? '111111' : '000000');
  // Giả lập OTP hiện tại đã gửi được 100s (TTL 300s), qua cooldown 60s
  const passOtpCooldown = (kind: OtpMailKind = 'register') =>
    redis.ttls.set(`auth:otp:${kind}:${body.email}`, 200);
  const changePassword = (accessToken: string, payload: object) =>
    request(app.getHttpServer())
      .post(changePasswordRoute)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload);
  // Tạo account qua đúng luồng thật để passwordHash là bcrypt thật
  const createAccount = async () => {
    await register().expect(200);
    const otp = mailer.lastOtpFor(body.email);
    await verify({ email: body.email, otp }).expect(201);
  };
  // Verify vừa đăng ký xong là đã đăng nhập luôn, nên lấy token từ đó
  const createAccountAndLogIn = async (): Promise<string> => {
    await register().expect(200);
    const otp = mailer.lastOtpFor(body.email);
    const response = await verify({ email: body.email, otp }).expect(201);
    return (response.body as { data: { accessToken: string } }).data
      .accessToken;
  };

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    redis = new InMemoryRedis();
    users = new InMemoryUserRepository();
    mailer = new CapturingEmailSender();
    refreshTokens = new InMemoryRefreshTokenRepository();

    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: IAuthService, useClass: AuthService },
        { provide: IPasswordHasher, useClass: BcryptPasswordHasher },
        { provide: IEmailOtpStore, useClass: RedisEmailOtpStore },
        {
          provide: IPasswordResetOtpStore,
          useClass: RedisPasswordResetOtpStore,
        },
        {
          provide: IPasswordResetTokenStore,
          useClass: RedisPasswordResetTokenStore,
        },
        {
          provide: IPendingRegistrationStore,
          useClass: RedisPendingRegistrationStore,
        },
        { provide: RedisService, useValue: redis },
        { provide: IUserRepository, useValue: users },
        { provide: IEmailSender, useValue: mailer },
        { provide: IAccessTokenIssuer, useClass: JwtAccessTokenIssuer },
        { provide: JwtService, useValue: jwtService },
        { provide: ITokenHasher, useClass: Sha256TokenHasher },
        { provide: IRefreshTokenRepository, useValue: refreshTokens },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              const value = testConfig[key];
              if (value === undefined) throw new Error(`Missing ${key}`);
              return value;
            },
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        exceptionFactory: (errors) =>
          new BadRequestException({
            code: ErrorCode.BadRequest,
            message: 'Request validation failed',
            errors: mapValidationErrors(errors),
          }),
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('sends a 6-digit otp and stores only hashed secrets', async () => {
      const response = await register().expect(200);

      expect(response.body).toMatchObject({
        statusCode: 200,
        success: true,
        data: { email: body.email },
        message: 'OTP has been sent to your email',
      });
      const otp = mailer.lastOtpFor(body.email);
      expect(otp).toMatch(/^\d{6}$/);

      const storedOtp = redis.store.get(`auth:otp:register:${body.email}`);
      const storedPending = redis.store.get(
        `auth:pending-registration:${body.email}`,
      );
      expect(storedOtp).toMatch(/^\$2[aby]\$10\$/);
      expect(storedOtp).not.toBe(otp);
      expect(storedPending).toBeDefined();
      expect(storedPending).not.toContain(body.password);
    });

    it('normalizes the email before using it', async () => {
      await register({ ...body, email: '  New.User@Example.com ' }).expect(200);

      expect(mailer.lastOtpFor(body.email)).toMatch(/^\d{6}$/);
    });

    it('returns 409 when the email already belongs to a user', async () => {
      await users.createUser({
        email: body.email,
        passwordHash: 'existing',
        fullName: 'Existing User',
      });

      const response = await register().expect(409);

      expect(response.body).toMatchObject({
        statusCode: 409,
        success: false,
        code: ErrorCode.Conflict,
        message: 'Email already registered',
        path: registerRoute,
      });
      expect(mailer.sent).toHaveLength(0);
    });

    it('returns 429 when registering again within the cooldown without changing the pending data', async () => {
      await register().expect(200);
      const pendingKey = `auth:pending-registration:${body.email}`;
      const pendingBefore = redis.store.get(pendingKey);

      const response = await register({
        ...body,
        fullName: 'Someone Else',
      }).expect(429);

      expect(response.body).toMatchObject({
        code: ErrorCode.TooManyRequests,
        message: 'Please wait before requesting a new OTP',
        path: registerRoute,
      });
      expect(redis.store.get(pendingKey)).toBe(pendingBefore);
      expect(mailer.sent).toHaveLength(1);
    });

    it('returns field errors without echoing the rejected password', async () => {
      const response = await register({
        email: 'not-an-email',
        password: 'short',
      }).expect(400);

      const fields = (
        response.body as { errors: { field: string }[] }
      ).errors.map((e) => e.field);
      expect(fields).toEqual(
        expect.arrayContaining(['email', 'password', 'fullName']),
      );
      expect(JSON.stringify(response.body)).not.toContain('short');
    });
  });

  describe('POST /api/auth/register/resend', () => {
    it('emails a new otp that replaces the old one', async () => {
      await register().expect(200);
      const firstOtp = mailer.lastOtpFor(body.email);
      passOtpCooldown();

      const response = await resend().expect(200);

      expect(response.body).toMatchObject({
        statusCode: 200,
        success: true,
        data: { email: body.email },
        message: 'OTP has been sent to your email',
      });
      expect(mailer.sent).toHaveLength(2);
      const secondOtp = mailer.lastOtpFor(body.email);
      await verify({ email: body.email, otp: firstOtp }).expect(400);
      await verify({ email: body.email, otp: secondOtp }).expect(201);
    });

    it('normalizes the email before using it', async () => {
      await register().expect(200);
      passOtpCooldown();

      await resend({ email: '  New.User@Example.com ' }).expect(200);

      expect(mailer.sent).toHaveLength(2);
    });

    it('returns 429 without sending email when asked again within the cooldown', async () => {
      await register().expect(200);

      const response = await resend().expect(429);

      expect(response.body).toMatchObject({
        code: ErrorCode.TooManyRequests,
        message: 'Please wait before requesting a new OTP',
        path: resendRoute,
      });
      expect(mailer.sent).toHaveLength(1);
    });

    it('lets the user get a new otp right after too many wrong attempts', async () => {
      await register().expect(200);
      const wrong = wrongOtpFor(mailer.lastOtpFor(body.email));
      for (let attempt = 1; attempt <= 4; attempt++) {
        await verify({ email: body.email, otp: wrong }).expect(400);
      }
      const locked = await verify({ email: body.email, otp: wrong }).expect(
        429,
      );
      expect(locked.body).toMatchObject({
        message: 'Too many attempts, please request a new OTP',
      });

      // OTP đã bị xóa nên không còn vướng cooldown
      await resend().expect(200);

      const newOtp = mailer.lastOtpFor(body.email);
      await verify({ email: body.email, otp: newOtp }).expect(201);
    });

    it('returns 400 without sending email when there is no pending registration', async () => {
      const response = await resend().expect(400);

      expect(response.body).toMatchObject({
        code: ErrorCode.BadRequest,
        message: 'Registration expired, please register again',
        path: resendRoute,
      });
      expect(mailer.sent).toHaveLength(0);
    });

    it('returns a validation error for a malformed email', async () => {
      const response = await resend({ email: 'not-an-email' }).expect(400);

      expect(response.body).toMatchObject({
        code: ErrorCode.BadRequest,
        message: 'Request validation failed',
        errors: [{ field: 'email', messages: ['Invalid email format'] }],
      });
    });
  });

  describe('POST /api/auth/register/verify', () => {
    it('creates the account with the emailed otp and cleans up redis', async () => {
      await register().expect(200);
      const otp = mailer.lastOtpFor(body.email);

      const response = await verify({ email: body.email, otp }).expect(201);

      expect(response.body).toMatchObject({
        statusCode: 201,
        success: true,
        message: 'Account created successfully',
      });
      const user = users.users.get(body.email);
      expect(user).toMatchObject({
        email: body.email,
        fullName: body.fullName,
      });
      expect(user?.passwordHash).toMatch(/^\$2[aby]\$10\$/);
      expect([...redis.store.keys()]).toHaveLength(0);
    });

    it('logs the user in right after verification', async () => {
      await register().expect(200);
      const otp = mailer.lastOtpFor(body.email);

      const response = await verify({ email: body.email, otp }).expect(201);

      const { accessToken, refreshToken } = (
        response.body as { data: { accessToken: string; refreshToken: string } }
      ).data;
      const payload = await jwtService.verifyAsync<{
        sub: string;
        role: string;
      }>(accessToken, { secret: JWT_SECRET });
      expect(payload).toMatchObject({
        sub: users.users.get(body.email)?.publicId,
        role: CommonUserRole.USER,
      });
      // Phiên tạo từ verify dùng được y như phiên tạo từ login
      await refresh(refreshToken).expect(200);
    });

    it('keeps the account and asks the user to log in when the session cannot be created', async () => {
      await register().expect(200);
      const otp = mailer.lastOtpFor(body.email);
      jest
        .spyOn(refreshTokens, 'createRefreshToken')
        .mockResolvedValueOnce(
          err(new Error('connection refused to postgres')),
        );

      const response = await verify({ email: body.email, otp }).expect(500);

      expect(response.body).toMatchObject({
        code: ErrorCode.InternalServerError,
        success: false,
        message: 'Account created but automatic login failed, please log in',
        path: verifyRoute,
      });
      expect(JSON.stringify(response.body)).not.toContain('postgres');
      expect(response.body).not.toHaveProperty('data');
      // Làm theo lời nhắc: login thủ công vẫn được
      await login({ email: body.email, password: body.password }).expect(200);
    });

    it('rejects a reused otp after the account was created', async () => {
      await register().expect(200);
      const otp = mailer.lastOtpFor(body.email);
      await verify({ email: body.email, otp }).expect(201);

      const response = await verify({ email: body.email, otp }).expect(400);

      expect(response.body).toMatchObject({
        code: ErrorCode.BadRequest,
        message: 'Invalid or expired OTP',
      });
    });

    it('returns the same 400 for an unknown email as for a wrong otp', async () => {
      const unknown = await verify({
        email: 'nobody@example.com',
        otp: '123456',
      }).expect(400);

      await register().expect(200);
      const otp = mailer.lastOtpFor(body.email);
      const wrong = await verify({
        email: body.email,
        otp: wrongOtpFor(otp),
      }).expect(400);

      expect((unknown.body as { message: string }).message).toBe(
        (wrong.body as { message: string }).message,
      );
    });

    it('locks the otp after 5 wrong attempts', async () => {
      await register().expect(200);
      const otp = mailer.lastOtpFor(body.email);
      const wrong = wrongOtpFor(otp);

      for (let attempt = 1; attempt <= 4; attempt++) {
        await verify({ email: body.email, otp: wrong }).expect(400);
      }
      const locked = await verify({ email: body.email, otp: wrong }).expect(
        429,
      );
      expect(locked.body).toMatchObject({ code: ErrorCode.TooManyRequests });

      // OTP đã bị xóa: kể cả OTP đúng cũng không dùng được nữa
      await verify({ email: body.email, otp }).expect(400);
      expect(users.users.has(body.email)).toBe(false);
    });

    it('lets the user finish after registering again following wrong attempts', async () => {
      await register().expect(200);
      const firstOtp = mailer.lastOtpFor(body.email);
      for (let attempt = 1; attempt <= 4; attempt++) {
        await verify({
          email: body.email,
          otp: wrongOtpFor(firstOtp),
        }).expect(400);
      }

      passOtpCooldown();
      await register().expect(200);
      const secondOtp = mailer.lastOtpFor(body.email);

      // Bộ đếm đã reset: 1 lần sai nữa vẫn chưa bị khóa
      await verify({
        email: body.email,
        otp: wrongOtpFor(secondOtp),
      }).expect(400);
      await verify({ email: body.email, otp: secondOtp }).expect(201);
    });

    it('returns 400 when the pending registration expired but the otp is still valid', async () => {
      await register().expect(200);
      const otp = mailer.lastOtpFor(body.email);
      redis.store.delete(`auth:pending-registration:${body.email}`);

      const response = await verify({ email: body.email, otp }).expect(400);

      expect(response.body).toMatchObject({
        message: 'Registration expired, please register again',
      });
      expect(users.users.has(body.email)).toBe(false);
    });

    it.each([
      ['too short', '12345'],
      ['not digits', '12ab56'],
    ])('returns a validation error when the otp is %s', async (_case, otp) => {
      const response = await verify({ email: body.email, otp }).expect(400);

      expect(response.body).toMatchObject({
        code: ErrorCode.BadRequest,
        message: 'Request validation failed',
        errors: [{ field: 'otp', messages: ['OTP must be exactly 6 digits'] }],
      });
    });
  });

  describe('POST /api/auth/login', () => {
    const credentials = { email: body.email, password: body.password };

    it('returns a signed access token and stores only the refresh token hash', async () => {
      await createAccount();
      const user = users.users.get(body.email);
      // Verify đã tạo sẵn một phiên, chỉ xét token do lần login này tạo ra
      const tokensBefore = refreshTokens.tokens.length;
      const before = Date.now();

      const response = await login(credentials).expect(200);

      expect(response.body).toMatchObject({
        statusCode: 200,
        success: true,
        message: 'Login successful',
      });
      const { accessToken, refreshToken } = (
        response.body as { data: { accessToken: string; refreshToken: string } }
      ).data;

      // Access token: ký bằng secret thật, chỉ mang publicId + role
      const payload = await jwtService.verifyAsync<{
        sub: string;
        role: string;
        iat: number;
        exp: number;
      }>(accessToken, { secret: JWT_SECRET });
      expect(payload).toMatchObject({
        sub: user?.publicId,
        role: CommonUserRole.USER,
      });
      expect(payload.exp - payload.iat).toBe(JWT_ACCESS_EXPIRES_IN);
      expect(JSON.stringify(payload)).not.toContain(body.email);

      // Refresh token: client nhận bản gốc, DB chỉ có SHA-256 của nó
      expect(refreshToken).toMatch(/^[0-9a-f]{64}$/);
      expect(refreshTokens.tokens).toHaveLength(tokensBefore + 1);
      const stored = refreshTokens.tokens[tokensBefore];
      expect(stored.userId).toBe(user?.id);
      expect(stored.tokenHash).toBe(
        new Sha256TokenHasher().hashToken(refreshToken),
      );
      expect(stored.tokenHash).not.toBe(refreshToken);
      const expectedExpiry = before + JWT_REFRESH_EXPIRES_IN * 1000;
      expect(stored.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiry);
      expect(stored.expiresAt.getTime()).toBeLessThan(expectedExpiry + 5_000);
    });

    it('issues a different refresh token on every login', async () => {
      await createAccount();
      const tokensBefore = refreshTokens.tokens.length;

      const first = await login(credentials).expect(200);
      const second = await login(credentials).expect(200);

      const tokenOf = (res: request.Response) =>
        (res.body as { data: { refreshToken: string } }).data.refreshToken;
      expect(tokenOf(first)).not.toBe(tokenOf(second));
      expect(refreshTokens.tokens).toHaveLength(tokensBefore + 2);
    });

    it('normalizes the email before looking up the user', async () => {
      await createAccount();

      await login({ ...credentials, email: '  New.User@Example.com ' }).expect(
        200,
      );
    });

    it('returns 401 for a wrong password without issuing tokens', async () => {
      await createAccount();
      const tokensBefore = refreshTokens.tokens.length;

      const response = await login({
        ...credentials,
        password: 'WrongPass1',
      }).expect(401);

      expect(response.body).toMatchObject({
        statusCode: 401,
        success: false,
        code: ErrorCode.Unauthorized,
        message: 'Invalid email or password',
        path: loginRoute,
      });
      expect(response.body).not.toHaveProperty('data');
      expect(refreshTokens.tokens).toHaveLength(tokensBefore);
    });

    it('returns the same 401 for an unknown email as for a wrong password', async () => {
      await createAccount();

      const unknown = await login({
        email: 'nobody@example.com',
        password: body.password,
      }).expect(401);
      const wrong = await login({
        ...credentials,
        password: 'WrongPass1',
      }).expect(401);

      // So mọi thứ trừ timestamp: không được có field nào lộ email có tồn tại hay không
      const withoutTimestamp = (res: request.Response) => ({
        ...(res.body as Record<string, unknown>),
        timestamp: undefined,
      });
      expect(withoutTimestamp(unknown)).toEqual(withoutTimestamp(wrong));
    });

    it('returns 500 without leaking details when the refresh token cannot be saved', async () => {
      await createAccount();
      jest
        .spyOn(refreshTokens, 'createRefreshToken')
        .mockResolvedValue(err(new Error('connection refused to postgres')));

      const response = await login(credentials).expect(500);

      expect(response.body).toMatchObject({
        code: ErrorCode.InternalServerError,
        success: false,
      });
      expect(JSON.stringify(response.body)).not.toContain('postgres');
      expect(response.body).not.toHaveProperty('data');
    });

    it('returns field errors without echoing the rejected password', async () => {
      const response = await login({
        email: 'not-an-email',
        password: 'x'.repeat(73),
      }).expect(400);

      expect(response.body).toMatchObject({
        code: ErrorCode.BadRequest,
        message: 'Request validation failed',
      });
      const fields = (
        response.body as { errors: { field: string }[] }
      ).errors.map((e) => e.field);
      expect(fields).toEqual(expect.arrayContaining(['email', 'password']));
      expect(JSON.stringify(response.body)).not.toContain('x'.repeat(73));
    });

    it('returns 400 when the password is missing', async () => {
      const response = await login({ email: body.email }).expect(400);

      expect(response.body).toMatchObject({
        errors: [
          expect.objectContaining({
            field: 'password',
            messages: expect.arrayContaining([
              'Password is required',
            ]) as string[],
          }),
        ],
      });
    });
  });

  describe('POST /api/auth/refresh', () => {
    const credentials = { email: body.email, password: body.password };
    const refreshTokenOf = (res: request.Response) =>
      (res.body as { data: { refreshToken: string } }).data.refreshToken;
    const loginForRefreshToken = async () =>
      refreshTokenOf(await login(credentials).expect(200));
    const storedTokenOf = (refreshToken: string) =>
      refreshTokens.tokens.find(
        (t) => t.tokenHash === new Sha256TokenHasher().hashToken(refreshToken),
      );

    it('rejects a token reused right after rotation without logging the user out', async () => {
      await createAccount();
      const current = await loginForRefreshToken();
      const otherDevice = await loginForRefreshToken();
      const rotated = refreshTokenOf(await refresh(current).expect(200));

      // Tab khác vẫn giữ token cũ và refresh ngay sau đó
      const response = await refresh(current).expect(401);

      expect(response.body).toMatchObject({
        code: ErrorCode.Unauthorized,
        message: 'Invalid refresh token',
        path: refreshRoute,
      });
      await refresh(rotated).expect(200);
      expect(storedTokenOf(otherDevice)?.revokedAt).toBeNull();
    });

    it('lets one of two concurrent refreshes win without revoking the session', async () => {
      await createAccount();
      const current = await loginForRefreshToken();

      const responses = await Promise.all([refresh(current), refresh(current)]);

      const statuses = responses.map((res) => res.status).sort((a, b) => a - b);
      expect(statuses).toEqual([200, 401]);
      const [winner] = responses.filter((res) => res.status === 200);
      await refresh(refreshTokenOf(winner)).expect(200);
    });

    it('revokes every session when a rotated token is reused after the grace window', async () => {
      await createAccount();
      const current = await loginForRefreshToken();
      const otherDevice = await loginForRefreshToken();
      const rotated = refreshTokenOf(await refresh(current).expect(200));
      // Giả lập token cũ đã bị rotate từ 11 giây trước, quá grace window 10s
      const stored = storedTokenOf(current);
      if (!stored) throw new Error('Expected the old token to be stored');
      stored.revokedAt = new Date(Date.now() - 11_000);

      await refresh(current).expect(401);

      // Không biết ai là chủ thật nên mọi phiên của user đều bị thu hồi
      await refresh(rotated).expect(401);
      await refresh(otherDevice).expect(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    const credentials = { email: body.email, password: body.password };
    const loginForRefreshToken = async () => {
      const response = await login(credentials).expect(200);
      return (response.body as { data: { refreshToken: string } }).data
        .refreshToken;
    };
    const storedTokenOf = (refreshToken: string) =>
      refreshTokens.tokens.find(
        (t) => t.tokenHash === new Sha256TokenHasher().hashToken(refreshToken),
      );

    it('revokes the refresh token so it can no longer be refreshed', async () => {
      await createAccount();
      const refreshToken = await loginForRefreshToken();

      const response = await logout(refreshToken).expect(200);

      expect(response.body).toMatchObject({
        statusCode: 200,
        success: true,
        data: null,
        message: 'Logout successful',
      });
      expect(storedTokenOf(refreshToken)?.revokedAt).toBeInstanceOf(Date);
      await refresh(refreshToken).expect(401);
    });

    it('only logs out the current device', async () => {
      await createAccount();
      const current = await loginForRefreshToken();
      const otherDevice = await loginForRefreshToken();

      await logout(current).expect(200);

      expect(storedTokenOf(otherDevice)?.revokedAt).toBeNull();
      await refresh(otherDevice).expect(200);
    });

    it('returns 200 when logging out again with the same token without touching other sessions', async () => {
      await createAccount();
      const current = await loginForRefreshToken();
      const otherDevice = await loginForRefreshToken();
      await logout(current).expect(200);
      const firstRevokedAt = storedTokenOf(current)?.revokedAt;

      await logout(current).expect(200);

      // Không ghi đè thời điểm revoke cũ, không coi là token bị dùng lại
      expect(storedTokenOf(current)?.revokedAt).toBe(firstRevokedAt);
      expect(storedTokenOf(otherDevice)?.revokedAt).toBeNull();
    });

    it('returns 200 for a token that was never issued', async () => {
      const response = await logout('a'.repeat(64)).expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Logout successful',
      });
    });

    it('returns 500 without leaking details when the token cannot be revoked', async () => {
      await createAccount();
      const refreshToken = await loginForRefreshToken();
      jest
        .spyOn(refreshTokens, 'revokeRefreshTokenByHash')
        .mockResolvedValue(err(new Error('connection refused to postgres')));

      const response = await logout(refreshToken).expect(500);

      expect(response.body).toMatchObject({
        code: ErrorCode.InternalServerError,
        success: false,
        path: logoutRoute,
      });
      expect(JSON.stringify(response.body)).not.toContain('postgres');
      expect(response.body).not.toHaveProperty('data');
    });

    it('returns a validation error without echoing a malformed token', async () => {
      const response = await logout('not-a-token').expect(400);

      expect(response.body).toMatchObject({
        code: ErrorCode.BadRequest,
        message: 'Request validation failed',
        errors: [
          {
            field: 'refreshToken',
            messages: ['Invalid refresh token format'],
          },
        ],
      });
      expect(JSON.stringify(response.body)).not.toContain('not-a-token');
    });
  });

  describe('POST /api/auth/password/forgot', () => {
    const resetMailsTo = (email: string) =>
      mailer.sent.filter(
        (m) => m.kind === 'reset-password' && m.email === email,
      );

    it('emails a reset otp to a registered user and stores only its hash', async () => {
      await createAccount();

      const response = await forgotPassword().expect(200);

      expect(response.body).toMatchObject({
        statusCode: 200,
        success: true,
        data: null,
        message: 'If the email is registered, an OTP has been sent',
      });
      const otp = mailer.lastOtpFor(body.email, 'reset-password');
      expect(otp).toMatch(/^\d{6}$/);
      const storedOtp = redis.store.get(
        `auth:otp:reset-password:${body.email}`,
      );
      expect(storedOtp).toMatch(/^\$2[aby]\$10\$/);
      expect(storedOtp).not.toBe(otp);
    });

    it('returns the same response for an unknown email without sending anything', async () => {
      await createAccount();

      const known = await forgotPassword().expect(200);
      const unknown = await forgotPassword({
        email: 'nobody@example.com',
      }).expect(200);

      // So mọi thứ trừ timestamp: không được có field nào lộ email có tồn tại hay không
      const withoutTimestamp = (res: request.Response) => ({
        ...(res.body as Record<string, unknown>),
        timestamp: undefined,
      });
      expect(withoutTimestamp(unknown)).toEqual(withoutTimestamp(known));
      expect(resetMailsTo('nobody@example.com')).toHaveLength(0);
    });

    it('answers 200 without another email within the cooldown', async () => {
      await createAccount();
      await forgotPassword().expect(200);

      await forgotPassword().expect(200);
      expect(resetMailsTo(body.email)).toHaveLength(1);

      passOtpCooldown('reset-password');
      await forgotPassword().expect(200);
      expect(resetMailsTo(body.email)).toHaveLength(2);
    });

    it('returns a validation error for a malformed email', async () => {
      const response = await forgotPassword({ email: 'not-an-email' }).expect(
        400,
      );

      expect(response.body).toMatchObject({
        code: ErrorCode.BadRequest,
        errors: [{ field: 'email', messages: ['Invalid email format'] }],
      });
    });
  });

  describe('POST /api/auth/password/verify', () => {
    const tokenKey = `auth:reset-password-token:${body.email}`;
    const requestResetOtp = async () => {
      await forgotPassword().expect(200);
      return mailer.lastOtpFor(body.email, 'reset-password');
    };

    it('returns a reset token for the emailed otp and stores only its hash', async () => {
      await createAccount();
      const otp = await requestResetOtp();

      const response = await verifyResetOtp({ email: body.email, otp }).expect(
        200,
      );

      expect(response.body).toMatchObject({
        statusCode: 200,
        success: true,
        message: 'OTP verified successfully',
      });
      const { resetToken } = (response.body as { data: { resetToken: string } })
        .data;
      expect(resetToken).toMatch(/^[0-9a-f]{64}$/);
      const storedToken = redis.store.get(tokenKey);
      expect(storedToken).toMatch(/^[0-9a-f]{64}$/);
      expect(storedToken).not.toBe(resetToken);
      expect(redis.ttls.get(tokenKey)).toBe(600);
      // OTP đã đổi ra token nên bị xóa
      expect(redis.store.has(`auth:otp:reset-password:${body.email}`)).toBe(
        false,
      );
    });

    it('rejects a wrong otp right away without issuing a token', async () => {
      await createAccount();
      const otp = await requestResetOtp();

      const response = await verifyResetOtp({
        email: body.email,
        otp: wrongOtpFor(otp),
      }).expect(400);

      expect(response.body).toMatchObject({
        code: ErrorCode.BadRequest,
        message: 'Invalid or expired OTP',
        path: verifyResetOtpRoute,
      });
      expect(redis.store.has(tokenKey)).toBe(false);
    });

    it('returns the same 400 for an unknown email as for a wrong otp', async () => {
      await createAccount();
      const otp = await requestResetOtp();

      const wrong = await verifyResetOtp({
        email: body.email,
        otp: wrongOtpFor(otp),
      }).expect(400);
      const unknown = await verifyResetOtp({
        email: 'nobody@example.com',
        otp,
      }).expect(400);

      const withoutTimestamp = (res: request.Response) => ({
        ...(res.body as Record<string, unknown>),
        timestamp: undefined,
      });
      expect(withoutTimestamp(unknown)).toEqual(withoutTimestamp(wrong));
    });

    it('rejects reusing the otp once it was exchanged for a token', async () => {
      await createAccount();
      const otp = await requestResetOtp();
      await verifyResetOtp({ email: body.email, otp }).expect(200);

      await verifyResetOtp({ email: body.email, otp }).expect(400);
    });

    it('locks the otp after 5 wrong attempts until a new one is requested', async () => {
      await createAccount();
      const otp = await requestResetOtp();
      const wrong = { email: body.email, otp: wrongOtpFor(otp) };
      for (let attempt = 1; attempt <= 4; attempt++) {
        await verifyResetOtp(wrong).expect(400);
      }

      const locked = await verifyResetOtp(wrong).expect(429);

      expect(locked.body).toMatchObject({
        code: ErrorCode.TooManyRequests,
        message: 'Too many attempts, please request a new OTP',
      });
      // OTP đã bị xóa: kể cả OTP đúng cũng không dùng được nữa
      await verifyResetOtp({ email: body.email, otp }).expect(400);
      // OTP bị xóa nên không còn vướng cooldown, xin OTP mới được ngay
      const newOtp = await requestResetOtp();
      await verifyResetOtp({ email: body.email, otp: newOtp }).expect(200);
    });

    it('returns a validation error for a malformed otp', async () => {
      const response = await verifyResetOtp({
        email: body.email,
        otp: '12',
      }).expect(400);

      expect(response.body).toMatchObject({
        code: ErrorCode.BadRequest,
        errors: [{ field: 'otp', messages: ['OTP must be exactly 6 digits'] }],
      });
    });
  });

  describe('POST /api/auth/password/reset', () => {
    const newPassword = 'N3wStr0ngPass';
    const invalidResetToken =
      'Invalid or expired reset token, please request a new OTP';
    const loginWith = (password: string) =>
      login({ email: body.email, password });
    // Đi đủ luồng thật: forgot → OTP qua mail → verify → reset token
    const requestResetToken = async () => {
      await forgotPassword().expect(200);
      const otp = mailer.lastOtpFor(body.email, 'reset-password');
      const response = await verifyResetOtp({ email: body.email, otp }).expect(
        200,
      );
      return (response.body as { data: { resetToken: string } }).data
        .resetToken;
    };

    it('changes the password and logs out every device', async () => {
      await createAccount();
      const device = (
        (await loginWith(body.password).expect(200)).body as {
          data: { refreshToken: string };
        }
      ).data.refreshToken;
      const resetToken = await requestResetToken();

      const response = await resetPassword({
        email: body.email,
        resetToken,
        newPassword,
      }).expect(200);

      expect(response.body).toMatchObject({
        statusCode: 200,
        success: true,
        data: null,
        message: 'Password reset successfully',
      });
      await loginWith(body.password).expect(401);
      await loginWith(newPassword).expect(200);
      // Phiên đăng nhập bằng mật khẩu cũ không còn refresh được
      await refresh(device).expect(401);
      expect(redis.store.has(`auth:reset-password-token:${body.email}`)).toBe(
        false,
      );
    });

    it('rejects reusing the reset token after a successful reset', async () => {
      await createAccount();
      const resetToken = await requestResetToken();
      await resetPassword({
        email: body.email,
        resetToken,
        newPassword,
      }).expect(200);

      const response = await resetPassword({
        email: body.email,
        resetToken,
        newPassword: 'An0therPass',
      }).expect(400);

      expect(response.body).toMatchObject({
        code: ErrorCode.BadRequest,
        message: invalidResetToken,
        path: resetPasswordRoute,
      });
      await loginWith(newPassword).expect(200);
    });

    it('rejects a wrong reset token without invalidating the real one', async () => {
      await createAccount();
      const resetToken = await requestResetToken();

      await resetPassword({
        email: body.email,
        resetToken: 'f'.repeat(64),
        newPassword,
      }).expect(400);
      await loginWith(body.password).expect(200);

      await resetPassword({
        email: body.email,
        resetToken,
        newPassword,
      }).expect(200);
    });

    it('rejects a reset token sent with another email', async () => {
      await createAccount();
      const resetToken = await requestResetToken();

      await resetPassword({
        email: 'nobody@example.com',
        resetToken,
        newPassword,
      }).expect(400);
      await loginWith(body.password).expect(200);
    });

    it('keeps the reset token usable when logging out the sessions fails', async () => {
      await createAccount();
      const resetToken = await requestResetToken();
      jest
        .spyOn(refreshTokens, 'revokeAllRefreshTokensForUser')
        .mockResolvedValueOnce(
          err(new Error('connection refused to postgres')),
        );

      const response = await resetPassword({
        email: body.email,
        resetToken,
        newPassword,
      }).expect(500);

      expect(response.body).toMatchObject({
        code: ErrorCode.InternalServerError,
        message: 'Failed to reset password',
      });
      expect(JSON.stringify(response.body)).not.toContain('postgres');
      // Gửi lại đúng request đó là xong
      await resetPassword({
        email: body.email,
        resetToken,
        newPassword,
      }).expect(200);
    });

    it('returns field errors without echoing the rejected values', async () => {
      const response = await resetPassword({
        email: body.email,
        resetToken: 'not-a-token',
        newPassword: 'short',
      }).expect(400);

      const fields = (
        response.body as { errors: { field: string }[] }
      ).errors.map((e) => e.field);
      expect(fields).toEqual(
        expect.arrayContaining(['resetToken', 'newPassword']),
      );
      expect(JSON.stringify(response.body)).not.toContain('short');
      expect(JSON.stringify(response.body)).not.toContain('not-a-token');
    });
  });

  describe('POST /api/auth/password/change', () => {
    const newPassword = 'N3wStr0ngPass';

    it('changes the password of the logged-in user and revokes every refresh token', async () => {
      const accessToken = await createAccountAndLogIn();
      const hashBefore = users.users.get(body.email)?.passwordHash;

      const response = await changePassword(accessToken, {
        currentPassword: body.password,
        newPassword,
      }).expect(200);

      expect(response.body).toMatchObject({
        statusCode: 200,
        success: true,
        data: null,
        message: 'Password changed successfully, please log in again',
      });
      // Hash thật của bcrypt, không phải mật khẩu thô
      const hashAfter = users.users.get(body.email)?.passwordHash;
      expect(hashAfter).toMatch(/^\$2[aby]\$10\$/);
      expect(hashAfter).not.toBe(hashBefore);
      expect(hashAfter).not.toContain(newPassword);
      expect(refreshTokens.tokens.every((t) => t.revokedAt !== null)).toBe(
        true,
      );
    });

    it('lets the user log in with the new password and not with the old one', async () => {
      const accessToken = await createAccountAndLogIn();
      await changePassword(accessToken, {
        currentPassword: body.password,
        newPassword,
      }).expect(200);

      await login({ email: body.email, password: body.password }).expect(401);
      await login({ email: body.email, password: newPassword }).expect(200);
    });

    it('returns 401 and keeps the old password when the current password is wrong', async () => {
      const accessToken = await createAccountAndLogIn();
      const hashBefore = users.users.get(body.email)?.passwordHash;

      const response = await changePassword(accessToken, {
        currentPassword: 'WrongPass1',
        newPassword,
      }).expect(401);

      expect(response.body).toMatchObject({
        statusCode: 401,
        success: false,
        code: ErrorCode.Unauthorized,
        message: 'Current password is incorrect',
        path: changePasswordRoute,
      });
      expect(users.users.get(body.email)?.passwordHash).toBe(hashBefore);
    });

    it('returns 401 without a bearer token', async () => {
      await createAccount();

      await request(app.getHttpServer())
        .post(changePasswordRoute)
        .send({ currentPassword: body.password, newPassword })
        .expect(401);
    });

    it('returns 400 when the new password repeats the current one', async () => {
      const accessToken = await createAccountAndLogIn();

      const response = await changePassword(accessToken, {
        currentPassword: body.password,
        newPassword: body.password,
      }).expect(400);

      expect(response.body).toMatchObject({
        code: ErrorCode.BadRequest,
        message: 'New password must be different from the current password',
      });
    });

    it('returns field errors without echoing the rejected values', async () => {
      const accessToken = await createAccountAndLogIn();

      const response = await changePassword(accessToken, {
        currentPassword: '',
        newPassword: 'short',
      }).expect(400);

      const fields = (
        response.body as { errors: { field: string }[] }
      ).errors.map((e) => e.field);
      expect(fields).toEqual(
        expect.arrayContaining(['currentPassword', 'newPassword']),
      );
      expect(JSON.stringify(response.body)).not.toContain('short');
    });
  });
});
