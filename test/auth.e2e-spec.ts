import {
  BadRequestException,
  INestApplication,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { err, ok } from 'neverthrow';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthController } from '../src/modules/authentication/api/auth.controller';
import { IAuthService } from '../src/modules/authentication/application/interfaces/auth.service.interface';
import { AuthService } from '../src/modules/authentication/application/services/auth.service';
import { IEmailOtpStore } from '../src/modules/authentication/domain/repositories/email-otp-store.interface';
import { IEmailSender } from '../src/modules/authentication/domain/repositories/email-sender.interface';
import { IPasswordHasher } from '../src/modules/authentication/domain/repositories/password-hasher.interface';
import { IPendingRegistrationStore } from '../src/modules/authentication/domain/repositories/pending-registration-store.interface';
import { BcryptPasswordHasher } from '../src/modules/authentication/infrastructure/bcrypt-password-hasher';
import { RedisEmailOtpStore } from '../src/modules/authentication/infrastructure/redis-email-otp-store';
import { RedisPendingRegistrationStore } from '../src/modules/authentication/infrastructure/redis-pending-registration-store';
import {
  CreateUserData,
  IUserRepository,
  UserAlreadyExistsError,
} from '../src/modules/user/domain/repositories/user.repo.interface';
import { AllExceptionsFilter } from '../src/shared/common/exceptions.filter';
import { ErrorCode } from '../src/shared/common/errorCode';
import { mapValidationErrors } from '../src/shared/common/validation-error.mapper';
import { RedisService } from '../src/shared/infrastructure/redis/redis.service';

/**
 * Chạy luồng register → verify qua HTTP thật với AuthService, Redis stores và bcrypt thật.
 * Chỉ thay hạ tầng bên ngoài bằng bản in-memory: Redis (Map), Postgres (Map), SMTP (ghi lại OTP).
 * Không cần Docker; TTL không được mô phỏng.
 */
class InMemoryRedis {
  readonly store = new Map<string, string>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.store.get(key) ?? null);
  }
  set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
    return Promise.resolve();
  }
  del(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }
  ttl(key: string): Promise<number> {
    return Promise.resolve(this.store.has(key) ? 300 : -2);
  }
  incrementWithTtl(key: string): Promise<number> {
    const next = Number(this.store.get(key) ?? '0') + 1;
    this.store.set(key, String(next));
    return Promise.resolve(next);
  }
}

class InMemoryUserRepository implements IUserRepository {
  readonly users = new Map<string, CreateUserData & { id: number }>();

  getUserByEmail(email: string) {
    const user = this.users.get(email);
    return Promise.resolve(ok(user ? { id: user.id } : null));
  }
  createUser(data: CreateUserData) {
    if (this.users.has(data.email)) {
      return Promise.resolve(err(new UserAlreadyExistsError()));
    }
    const id = this.users.size + 1;
    this.users.set(data.email, { ...data, id });
    return Promise.resolve(ok({ id }));
  }
}

class CapturingEmailSender implements IEmailSender {
  readonly sent: { email: string; otp: string }[] = [];

  sendOtp(email: string, otp: string) {
    this.sent.push({ email, otp });
    return Promise.resolve(ok(undefined));
  }
  lastOtpFor(email: string): string {
    const otp = [...this.sent].reverse().find((m) => m.email === email)?.otp;
    if (!otp) throw new Error(`No OTP was sent to ${email}`);
    return otp;
  }
}

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  let redis: InMemoryRedis;
  let users: InMemoryUserRepository;
  let mailer: CapturingEmailSender;

  const registerRoute = '/api/auth/register';
  const verifyRoute = '/api/auth/register/verify';
  const body = {
    email: 'new.user@example.com',
    password: 'Str0ngPass',
    fullName: 'Nguyen Van A',
  };

  const register = (payload: object = body) =>
    request(app.getHttpServer()).post(registerRoute).send(payload);
  const verify = (payload: object) =>
    request(app.getHttpServer()).post(verifyRoute).send(payload);
  const wrongOtpFor = (otp: string) => (otp === '000000' ? '111111' : '000000');

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    redis = new InMemoryRedis();
    users = new InMemoryUserRepository();
    mailer = new CapturingEmailSender();

    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: IAuthService, useClass: AuthService },
        { provide: IPasswordHasher, useClass: BcryptPasswordHasher },
        { provide: IEmailOtpStore, useClass: RedisEmailOtpStore },
        {
          provide: IPendingRegistrationStore,
          useClass: RedisPendingRegistrationStore,
        },
        { provide: RedisService, useValue: redis },
        { provide: IUserRepository, useValue: users },
        { provide: IEmailSender, useValue: mailer },
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

  describe('POST /api/auth/register/verify', () => {
    it('creates the account with the emailed otp and cleans up redis', async () => {
      await register().expect(200);
      const otp = mailer.lastOtpFor(body.email);

      const response = await verify({ email: body.email, otp }).expect(201);

      expect(response.body).toMatchObject({
        statusCode: 201,
        success: true,
        data: { email: body.email },
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
});
