import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { err, ok } from 'neverthrow';
import { CommonUserRole } from '../../../../shared/common/commonEnum';
import { ErrorCode } from '../../../../shared/common/errorCode';
import { UserAlreadyExistsError } from '../../../user/domain/repositories/user.repo.interface';
import { RefreshTokenAlreadyRevokedError } from '../../domain/repositories/refresh-token.repo.interface';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const userRepository = {
    getUserByEmail: jest.fn(),
    createUser: jest.fn(),
    getUserCredentialsByEmail: jest.fn(),
    getUserById: jest.fn(),
    updateUserPassword: jest.fn(),
  };
  const passwordHasher = {
    hash: jest.fn(),
    compare: jest.fn(),
  };
  const emailSender = {
    sendOtp: jest.fn(),
  };
  const pendingStore = {
    savePendingRegistration: jest.fn(),
    findPendingRegistration: jest.fn(),
    deletePendingRegistration: jest.fn(),
  };
  const otpStore = {
    saveOtp: jest.fn(),
    findOtp: jest.fn(),
    deleteOtp: jest.fn(),
    getRemainingTtl: jest.fn(),
    incrementFailedAttempts: jest.fn(),
    resetFailedAttempts: jest.fn(),
  };
  const accessTokenIssuer = {
    issueAccessToken: jest.fn(),
  };
  const tokenHasher = {
    generateToken: jest.fn(),
    hashToken: jest.fn(),
  };
  const refreshTokenRepository = {
    createRefreshToken: jest.fn(),
    getRefreshTokenByHash: jest.fn(),
    rotateRefreshToken: jest.fn(),
    revokeAllRefreshTokensForUser: jest.fn(),
    revokeRefreshTokenByHash: jest.fn(),
  };
  // ConfigService có private member nên phải ép kiểu
  const configService = {
    getOrThrow: jest.fn().mockReturnValue('604800'),
  } as unknown as ConfigService;

  // Các object mock khớp cấu trúc của contract nên truyền thẳng được, không cần ép kiểu
  const service = new AuthService(
    userRepository,
    passwordHasher,
    emailSender,
    pendingStore,
    otpStore,
    accessTokenIssuer,
    tokenHasher,
    refreshTokenRepository,
    configService,
  );

  const email = 'a@x.com';
  let loggerWarn: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    loggerWarn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  describe('registerAsync', () => {
    const request = {
      email,
      password: 'Str0ngPass',
      fullName: 'Nguyen Van A',
    };

    // Mặc định mọi bước đều thành công; từng test ghi đè bước cần làm hỏng
    beforeEach(() => {
      userRepository.getUserByEmail.mockResolvedValue(ok(null));
      // Chưa có OTP nào đang sống → không vướng cooldown
      otpStore.getRemainingTtl.mockResolvedValue(ok(null));
      passwordHasher.hash.mockImplementation((plain: string) =>
        Promise.resolve(ok(`hashed:${plain}`)),
      );
      pendingStore.savePendingRegistration.mockResolvedValue(ok(undefined));
      otpStore.saveOtp.mockResolvedValue(ok(undefined));
      otpStore.resetFailedAttempts.mockResolvedValue(ok(undefined));
      emailSender.sendOtp.mockResolvedValue(ok(undefined));
    });

    const sentOtp = (): string =>
      (emailSender.sendOtp.mock.calls[0] as [string, string])[1];

    it('stores the pending registration and otp hash, then emails a 6-digit otp', async () => {
      const result = await service.registerAsync(request);

      expect(result.isOk()).toBe(true);
      expect(pendingStore.savePendingRegistration).toHaveBeenCalledWith(
        expect.objectContaining({
          email,
          passwordHash: 'hashed:Str0ngPass',
          fullName: 'Nguyen Van A',
        }),
        900,
      );
      expect(sentOtp()).toMatch(/^\d{6}$/);
      expect(otpStore.saveOtp).toHaveBeenCalledWith(
        email,
        `hashed:${sentOtp()}`,
        300,
      );
      expect(otpStore.resetFailedAttempts).toHaveBeenCalledWith(email);
    });

    it('keeps the pending registration alive longer than the otp', async () => {
      await service.registerAsync(request);

      const pendingTtl = (
        pendingStore.savePendingRegistration.mock.calls[0] as [unknown, number]
      )[1];
      const otpTtl = (
        otpStore.saveOtp.mock.calls[0] as [string, string, number]
      )[2];
      expect(pendingTtl).toBeGreaterThan(otpTtl);
    });

    it('never stores the plain otp or the plain password', async () => {
      await service.registerAsync(request);

      const storedOtp = (otpStore.saveOtp.mock.calls[0] as [string, string])[1];
      expect(storedOtp).not.toBe(sentOtp());
      expect(
        JSON.stringify(pendingStore.savePendingRegistration.mock.calls),
      ).not.toContain('"Str0ngPass"');
    });

    it('returns Conflict and does nothing else when the email is already registered', async () => {
      userRepository.getUserByEmail.mockResolvedValue(ok({ id: 1 }));

      const result = await service.registerAsync(request);

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.code).toBe(ErrorCode.Conflict);
      expect(passwordHasher.hash).not.toHaveBeenCalled();
      expect(emailSender.sendOtp).not.toHaveBeenCalled();
    });

    it('does not save the otp or send email when saving the pending registration fails', async () => {
      pendingStore.savePendingRegistration.mockResolvedValue(
        err(new Error('redis down')),
      );

      const result = await service.registerAsync(request);

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.code).toBe(ErrorCode.InternalServerError);
      expect(otpStore.saveOtp).not.toHaveBeenCalled();
      expect(emailSender.sendOtp).not.toHaveBeenCalled();
    });

    it('still sends the otp when resetting failed attempts fails', async () => {
      otpStore.resetFailedAttempts.mockResolvedValue(
        err(new Error('redis down')),
      );

      const result = await service.registerAsync(request);

      expect(result.isOk()).toBe(true);
      expect(emailSender.sendOtp).toHaveBeenCalled();
      expect(loggerWarn).toHaveBeenCalled();
    });

    it('returns TooManyRequests without touching the pending registration when an otp was sent within the cooldown', async () => {
      // TTL 300s, còn 250s → OTP mới gửi cách đây 50s
      otpStore.getRemainingTtl.mockResolvedValue(ok(250));

      const result = await service.registerAsync(request);

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.code).toBe(ErrorCode.TooManyRequests);
      expect(result.error.message).toBe(
        'Please wait before requesting a new OTP',
      );
      expect(otpStore.getRemainingTtl).toHaveBeenCalledWith(email);
      expect(pendingStore.savePendingRegistration).not.toHaveBeenCalled();
      expect(emailSender.sendOtp).not.toHaveBeenCalled();
    });

    it.each([
      ['the cooldown just ended', 240],
      ['the previous otp expired', null],
    ])('sends a new otp when %s', async (_case, remainingTtl) => {
      otpStore.getRemainingTtl.mockResolvedValue(ok(remainingTtl));

      const result = await service.registerAsync(request);

      expect(result.isOk()).toBe(true);
      expect(emailSender.sendOtp).toHaveBeenCalled();
    });

    it.each([
      ['looking up the user', () => userRepository.getUserByEmail],
      ['checking the otp cooldown', () => otpStore.getRemainingTtl],
      ['saving the otp', () => otpStore.saveOtp],
      ['sending the email', () => emailSender.sendOtp],
    ])(
      'returns a safe InternalServerError when %s fails',
      async (_step, getMock) => {
        getMock().mockResolvedValue(err(new Error('internal detail')));

        const result = await service.registerAsync(request);

        if (result.isOk()) throw new Error('Expected an error result');
        expect(result.error.code).toBe(ErrorCode.InternalServerError);
        expect(result.error.message).not.toContain('internal detail');
      },
    );
  });

  describe('resendRegistrationOtpAsync', () => {
    const request = { email };
    const pending = {
      email,
      passwordHash: 'hashed:Str0ngPass',
      fullName: 'Nguyen Van A',
      createdAt: new Date('2026-10-12T00:00:00.000Z'),
    };

    // Mặc định mọi bước đều thành công; từng test ghi đè bước cần làm hỏng
    beforeEach(() => {
      pendingStore.findPendingRegistration.mockResolvedValue(ok(pending));
      otpStore.getRemainingTtl.mockResolvedValue(ok(null));
      passwordHasher.hash.mockImplementation((plain: string) =>
        Promise.resolve(ok(`hashed:${plain}`)),
      );
      otpStore.saveOtp.mockResolvedValue(ok(undefined));
      otpStore.resetFailedAttempts.mockResolvedValue(ok(undefined));
      emailSender.sendOtp.mockResolvedValue(ok(undefined));
    });

    const sentOtp = (): string =>
      (emailSender.sendOtp.mock.calls[0] as [string, string])[1];

    it('emails a new otp for the pending registration and resets failed attempts', async () => {
      const result = await service.resendRegistrationOtpAsync(request);

      expect(result.isOk()).toBe(true);
      expect(pendingStore.findPendingRegistration).toHaveBeenCalledWith(email);
      expect(sentOtp()).toMatch(/^\d{6}$/);
      expect(otpStore.saveOtp).toHaveBeenCalledWith(
        email,
        `hashed:${sentOtp()}`,
        300,
      );
      expect(otpStore.resetFailedAttempts).toHaveBeenCalledWith(email);
      // Không gia hạn pending: đăng ký vẫn hết hạn đúng mốc ban đầu
      expect(pendingStore.savePendingRegistration).not.toHaveBeenCalled();
    });

    it('returns BadRequest without sending email when the registration expired', async () => {
      pendingStore.findPendingRegistration.mockResolvedValue(ok(null));

      const result = await service.resendRegistrationOtpAsync(request);

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.code).toBe(ErrorCode.BadRequest);
      expect(result.error.message).toBe(
        'Registration expired, please register again',
      );
      expect(otpStore.saveOtp).not.toHaveBeenCalled();
      expect(emailSender.sendOtp).not.toHaveBeenCalled();
    });

    it('returns TooManyRequests without sending email when an otp was sent within the cooldown', async () => {
      otpStore.getRemainingTtl.mockResolvedValue(ok(241));

      const result = await service.resendRegistrationOtpAsync(request);

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.code).toBe(ErrorCode.TooManyRequests);
      expect(otpStore.saveOtp).not.toHaveBeenCalled();
      expect(emailSender.sendOtp).not.toHaveBeenCalled();
    });

    it.each([
      ['the cooldown just ended', 240],
      ['the otp was deleted after too many attempts', null],
    ])('sends a new otp when %s', async (_case, remainingTtl) => {
      otpStore.getRemainingTtl.mockResolvedValue(ok(remainingTtl));

      const result = await service.resendRegistrationOtpAsync(request);

      expect(result.isOk()).toBe(true);
      expect(emailSender.sendOtp).toHaveBeenCalled();
    });

    it.each([
      [
        'finding the pending registration',
        () => pendingStore.findPendingRegistration,
      ],
      ['checking the otp cooldown', () => otpStore.getRemainingTtl],
      ['saving the otp', () => otpStore.saveOtp],
      ['sending the email', () => emailSender.sendOtp],
    ])(
      'returns a safe InternalServerError when %s fails',
      async (_step, getMock) => {
        getMock().mockResolvedValue(err(new Error('internal detail')));

        const result = await service.resendRegistrationOtpAsync(request);

        if (result.isOk()) throw new Error('Expected an error result');
        expect(result.error.code).toBe(ErrorCode.InternalServerError);
        expect(result.error.message).not.toContain('internal detail');
      },
    );
  });

  describe('verifyRegistrationAsync', () => {
    const request = { email, otp: '123456' };
    const pending = {
      email,
      passwordHash: 'hashed:Str0ngPass',
      fullName: 'Nguyen Van A',
      createdAt: new Date('2026-10-12T00:00:00.000Z'),
    };
    const identity = { publicId: randomUUID(), role: CommonUserRole.USER };

    // Mặc định là happy path; từng test ghi đè bước cần làm hỏng
    beforeEach(() => {
      otpStore.findOtp.mockResolvedValue(ok('hashed:123456'));
      passwordHasher.compare.mockResolvedValue(ok(true));
      pendingStore.findPendingRegistration.mockResolvedValue(ok(pending));
      userRepository.createUser.mockResolvedValue(ok({ id: 1 }));
      otpStore.deleteOtp.mockResolvedValue(ok(undefined));
      pendingStore.deletePendingRegistration.mockResolvedValue(ok(undefined));
      otpStore.resetFailedAttempts.mockResolvedValue(ok(undefined));
      userRepository.getUserById.mockResolvedValue(ok(identity));
      accessTokenIssuer.issueAccessToken.mockResolvedValue(ok('access.jwt'));
      tokenHasher.generateToken.mockReturnValue('refresh-raw');
      tokenHasher.hashToken.mockImplementation((raw: string) => `sha:${raw}`);
      refreshTokenRepository.createRefreshToken.mockResolvedValue(
        ok(undefined),
      );
    });

    it('creates the user from the pending data and cleans up all registration keys', async () => {
      const result = await service.verifyRegistrationAsync(request);

      if (result.isErr()) throw result.error;
      expect(passwordHasher.compare).toHaveBeenCalledWith(
        '123456',
        'hashed:123456',
      );
      expect(userRepository.createUser).toHaveBeenCalledWith({
        email,
        passwordHash: 'hashed:Str0ngPass',
        fullName: 'Nguyen Van A',
      });
      expect(otpStore.deleteOtp).toHaveBeenCalledWith(email);
      expect(pendingStore.deletePendingRegistration).toHaveBeenCalledWith(
        email,
      );
      expect(otpStore.resetFailedAttempts).toHaveBeenCalledWith(email);
    });

    it('logs the new user in with a session for the created account', async () => {
      const result = await service.verifyRegistrationAsync(request);

      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({
        accessToken: 'access.jwt',
        refreshToken: 'refresh-raw',
      });
      expect(userRepository.getUserById).toHaveBeenCalledWith(1);
      expect(accessTokenIssuer.issueAccessToken).toHaveBeenCalledWith({
        sub: identity.publicId,
        role: CommonUserRole.USER,
      });
      expect(refreshTokenRepository.createRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, tokenHash: 'sha:refresh-raw' }),
      );
    });

    it.each([
      [
        'looking up the created user fails',
        () =>
          userRepository.getUserById.mockResolvedValue(
            err(new Error('internal detail')),
          ),
      ],
      [
        'the created user cannot be found',
        () => userRepository.getUserById.mockResolvedValue(ok(null)),
      ],
      [
        'issuing the access token fails',
        () =>
          accessTokenIssuer.issueAccessToken.mockResolvedValue(
            err(new Error('internal detail')),
          ),
      ],
      [
        'saving the refresh token fails',
        () =>
          refreshTokenRepository.createRefreshToken.mockResolvedValue(
            err(new Error('internal detail')),
          ),
      ],
    ])(
      'keeps the account and tells the user to log in when %s',
      async (_case, breakStep) => {
        breakStep();

        const result = await service.verifyRegistrationAsync(request);

        if (result.isOk()) throw new Error('Expected an error result');
        expect(result.error.code).toBe(ErrorCode.InternalServerError);
        expect(result.error.message).toBe(
          'Account created but automatic login failed, please log in',
        );
        expect(result.error.message).not.toContain('internal detail');
        // Tài khoản đã tạo thì dữ liệu đăng ký vẫn phải được dọn
        expect(userRepository.createUser).toHaveBeenCalled();
        expect(otpStore.deleteOtp).toHaveBeenCalledWith(email);
        expect(pendingStore.deletePendingRegistration).toHaveBeenCalledWith(
          email,
        );
      },
    );

    it('returns the same BadRequest as a wrong otp when no otp is stored, without checking pending', async () => {
      otpStore.findOtp.mockResolvedValue(ok(null));

      const result = await service.verifyRegistrationAsync(request);

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.code).toBe(ErrorCode.BadRequest);
      expect(result.error.message).toBe('Invalid or expired OTP');
      expect(passwordHasher.compare).not.toHaveBeenCalled();
      expect(pendingStore.findPendingRegistration).not.toHaveBeenCalled();
    });

    it('counts a wrong otp and returns BadRequest while under the attempt limit', async () => {
      passwordHasher.compare.mockResolvedValue(ok(false));
      otpStore.incrementFailedAttempts.mockResolvedValue(ok(1));

      const result = await service.verifyRegistrationAsync(request);

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.code).toBe(ErrorCode.BadRequest);
      expect(result.error.message).toBe('Invalid or expired OTP');
      expect(otpStore.incrementFailedAttempts).toHaveBeenCalledWith(email, 300);
      expect(otpStore.deleteOtp).not.toHaveBeenCalled();
      expect(userRepository.createUser).not.toHaveBeenCalled();
    });

    it('deletes the otp and returns TooManyRequests on the 5th wrong attempt', async () => {
      passwordHasher.compare.mockResolvedValue(ok(false));
      otpStore.incrementFailedAttempts.mockResolvedValue(ok(5));

      const result = await service.verifyRegistrationAsync(request);

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.code).toBe(ErrorCode.TooManyRequests);
      // Pending vẫn còn nên chỉ cần xin OTP mới, không phải đăng ký lại
      expect(result.error.message).toBe(
        'Too many attempts, please request a new OTP',
      );
      expect(otpStore.deleteOtp).toHaveBeenCalledWith(email);
      expect(userRepository.createUser).not.toHaveBeenCalled();
    });

    it('returns BadRequest without creating a user when the pending registration expired', async () => {
      pendingStore.findPendingRegistration.mockResolvedValue(ok(null));

      const result = await service.verifyRegistrationAsync(request);

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.code).toBe(ErrorCode.BadRequest);
      expect(result.error.message).toContain('expired');
      expect(userRepository.createUser).not.toHaveBeenCalled();
    });

    it('returns Conflict when the email was registered in the meantime', async () => {
      userRepository.createUser.mockResolvedValue(
        err(new UserAlreadyExistsError()),
      );

      const result = await service.verifyRegistrationAsync(request);

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.code).toBe(ErrorCode.Conflict);
      expect(otpStore.deleteOtp).not.toHaveBeenCalled();
      expect(accessTokenIssuer.issueAccessToken).not.toHaveBeenCalled();
    });

    it('still succeeds and logs a warning when cleanup fails', async () => {
      otpStore.deleteOtp.mockResolvedValue(err(new Error('redis down')));

      const result = await service.verifyRegistrationAsync(request);

      expect(result.isOk()).toBe(true);
      expect(loggerWarn).toHaveBeenCalled();
    });

    it.each([
      ['finding the otp', () => otpStore.findOtp],
      ['comparing the otp', () => passwordHasher.compare],
      [
        'finding the pending registration',
        () => pendingStore.findPendingRegistration,
      ],
      ['creating the user', () => userRepository.createUser],
    ])(
      'returns a safe InternalServerError when %s fails',
      async (_step, getMock) => {
        getMock().mockResolvedValue(err(new Error('internal detail')));

        const result = await service.verifyRegistrationAsync(request);

        if (result.isOk()) throw new Error('Expected an error result');
        expect(result.error.code).toBe(ErrorCode.InternalServerError);
        expect(result.error.message).not.toContain('internal detail');
      },
    );

    it('returns a safe InternalServerError when counting a wrong attempt fails', async () => {
      passwordHasher.compare.mockResolvedValue(ok(false));
      otpStore.incrementFailedAttempts.mockResolvedValue(
        err(new Error('internal detail')),
      );

      const result = await service.verifyRegistrationAsync(request);

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.code).toBe(ErrorCode.InternalServerError);
      expect(result.error.message).not.toContain('internal detail');
    });
  });

  describe('constructor', () => {
    const buildService = (getOrThrow: () => string) =>
      new AuthService(
        userRepository,
        passwordHasher,
        emailSender,
        pendingStore,
        otpStore,
        accessTokenIssuer,
        tokenHasher,
        refreshTokenRepository,
        { getOrThrow } as unknown as ConfigService,
      );

    it('throws when JWT_REFRESH_EXPIRES_IN is missing', () => {
      expect(() =>
        buildService(() => {
          throw new TypeError('Missing JWT_REFRESH_EXPIRES_IN');
        }),
      ).toThrow();
    });

    it.each(['abc', '0', '-5', '1.5'])(
      'throws when JWT_REFRESH_EXPIRES_IN is %p',
      (value) => {
        expect(() => buildService(() => value)).toThrow(
          'JWT_REFRESH_EXPIRES_IN must be a positive integer',
        );
      },
    );
  });

  describe('loginAsync', () => {
    const request = { email, password: 'Str0ngPass' };
    const user = {
      id: 7,
      publicId: randomUUID(),
      email,
      role: CommonUserRole.USER,
      passwordHash: 'stored-hash',
    };

    // Mặc định mọi bước đều thành công; từng test ghi đè bước cần làm hỏng
    beforeEach(() => {
      userRepository.getUserCredentialsByEmail.mockResolvedValue(ok(user));
      passwordHasher.compare.mockResolvedValue(ok(true));
      accessTokenIssuer.issueAccessToken.mockResolvedValue(ok('access.jwt'));
      tokenHasher.generateToken.mockReturnValue('raw-refresh');
      tokenHasher.hashToken.mockImplementation((raw: string) => `sha:${raw}`);
      refreshTokenRepository.createRefreshToken.mockResolvedValue(
        ok(undefined),
      );
    });

    it('returns both tokens and stores only the refresh token hash with the configured ttl', async () => {
      const now = 1_760_000_000_000;
      const dateNow = jest.spyOn(Date, 'now').mockReturnValue(now);

      const result = await service.loginAsync(request);
      dateNow.mockRestore();

      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({
        accessToken: 'access.jwt',
        refreshToken: 'raw-refresh',
      });
      expect(refreshTokenRepository.createRefreshToken).toHaveBeenCalledWith({
        userId: 7,
        tokenHash: 'sha:raw-refresh',
        expiresAt: new Date(now + 604800 * 1000),
      });
    });

    it('checks the password against the stored hash', async () => {
      await service.loginAsync(request);

      expect(passwordHasher.compare).toHaveBeenCalledWith(
        'Str0ngPass',
        'stored-hash',
      );
    });

    it('signs the access token with only the public id and role', async () => {
      await service.loginAsync(request);

      expect(accessTokenIssuer.issueAccessToken).toHaveBeenCalledWith({
        sub: user.publicId,
        role: CommonUserRole.USER,
      });
    });

    it('still runs bcrypt against a dummy hash when the email is unknown', async () => {
      userRepository.getUserCredentialsByEmail.mockResolvedValue(ok(null));
      passwordHasher.compare.mockResolvedValue(ok(false));

      const result = await service.loginAsync(request);

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.code).toBe(ErrorCode.Unauthorized);
      expect(passwordHasher.compare).toHaveBeenCalledWith(
        'Str0ngPass',
        expect.stringMatching(/^\$2b\$10\$/),
      );
      expect(accessTokenIssuer.issueAccessToken).not.toHaveBeenCalled();
      expect(refreshTokenRepository.createRefreshToken).not.toHaveBeenCalled();
    });

    it('returns Unauthorized and issues no tokens when the password is wrong', async () => {
      passwordHasher.compare.mockResolvedValue(ok(false));

      const result = await service.loginAsync(request);

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.code).toBe(ErrorCode.Unauthorized);
      expect(accessTokenIssuer.issueAccessToken).not.toHaveBeenCalled();
      expect(refreshTokenRepository.createRefreshToken).not.toHaveBeenCalled();
    });

    it('returns the same error for an unknown email and a wrong password', async () => {
      userRepository.getUserCredentialsByEmail.mockResolvedValue(ok(null));
      passwordHasher.compare.mockResolvedValue(ok(false));
      const unknownEmail = await service.loginAsync(request);

      userRepository.getUserCredentialsByEmail.mockResolvedValue(ok(user));
      const wrongPassword = await service.loginAsync(request);

      if (unknownEmail.isOk() || wrongPassword.isOk()) {
        throw new Error('Expected error results');
      }
      expect(unknownEmail.error.code).toBe(wrongPassword.error.code);
      expect(unknownEmail.error.message).toBe(wrongPassword.error.message);
      expect(unknownEmail.error.message).toBe('Invalid email or password');
    });

    it.each([
      ['looking up the user', () => userRepository.getUserCredentialsByEmail],
      ['comparing the password', () => passwordHasher.compare],
      ['issuing the access token', () => accessTokenIssuer.issueAccessToken],
      [
        'saving the refresh token',
        () => refreshTokenRepository.createRefreshToken,
      ],
    ])(
      'returns a safe InternalServerError when %s fails',
      async (_step, getMock) => {
        getMock().mockResolvedValue(err(new Error('internal detail')));

        const result = await service.loginAsync(request);

        if (result.isOk()) throw new Error('Expected an error result');
        expect(result.error.code).toBe(ErrorCode.InternalServerError);
        expect(result.error.message).not.toContain('internal detail');
      },
    );
  });

  describe('refreshAsync', () => {
    const request = { refreshToken: 'old-raw' };
    const now = 1_760_000_000_000;
    const storedToken = {
      id: 3,
      userId: 7,
      expiresAt: new Date(now + 60_000),
      revokedAt: null,
    };
    const identity = { publicId: randomUUID(), role: CommonUserRole.USER };
    let dateNow: jest.SpyInstance;

    // Mọi lỗi phía client (không tồn tại / revoke / hết hạn / user bị xóa / race)
    // phải ra cùng một lỗi để không lộ trạng thái của token
    const expectInvalidRefreshToken = async () => {
      const result = await service.refreshAsync(request);

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.code).toBe(ErrorCode.Unauthorized);
      expect(result.error.message).toBe('Invalid refresh token');
    };

    // Mặc định mọi bước đều thành công; từng test ghi đè bước cần làm hỏng
    beforeEach(() => {
      dateNow = jest.spyOn(Date, 'now').mockReturnValue(now);
      tokenHasher.hashToken.mockImplementation((raw: string) => `sha:${raw}`);
      tokenHasher.generateToken.mockReturnValue('new-raw');
      refreshTokenRepository.getRefreshTokenByHash.mockResolvedValue(
        ok(storedToken),
      );
      userRepository.getUserById.mockResolvedValue(ok(identity));
      accessTokenIssuer.issueAccessToken.mockResolvedValue(ok('access.jwt'));
      refreshTokenRepository.rotateRefreshToken.mockResolvedValue(
        ok(undefined),
      );
      refreshTokenRepository.revokeAllRefreshTokensForUser.mockResolvedValue(
        ok(undefined),
      );
    });

    afterEach(() => {
      dateNow.mockRestore();
    });

    it('returns a new token pair and rotates the old token keeping its expiry', async () => {
      const result = await service.refreshAsync(request);

      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({
        accessToken: 'access.jwt',
        refreshToken: 'new-raw',
      });
      expect(refreshTokenRepository.getRefreshTokenByHash).toHaveBeenCalledWith(
        'sha:old-raw',
      );
      // Absolute expiry: token mới giữ đúng expiresAt của token cũ, không cộng thêm TTL
      expect(refreshTokenRepository.rotateRefreshToken).toHaveBeenCalledWith(
        3,
        {
          userId: 7,
          tokenHash: 'sha:new-raw',
          expiresAt: storedToken.expiresAt,
        },
      );
      expect(
        refreshTokenRepository.revokeAllRefreshTokensForUser,
      ).not.toHaveBeenCalled();
    });

    it('signs the access token with the latest role from the user repository', async () => {
      userRepository.getUserById.mockResolvedValue(
        ok({ ...identity, role: CommonUserRole.ADMIN }),
      );

      await service.refreshAsync(request);

      expect(userRepository.getUserById).toHaveBeenCalledWith(7);
      expect(accessTokenIssuer.issueAccessToken).toHaveBeenCalledWith({
        sub: identity.publicId,
        role: CommonUserRole.ADMIN,
      });
    });

    it('returns Unauthorized when the token does not exist', async () => {
      refreshTokenRepository.getRefreshTokenByHash.mockResolvedValue(ok(null));

      await expectInvalidRefreshToken();
      expect(userRepository.getUserById).not.toHaveBeenCalled();
      expect(refreshTokenRepository.rotateRefreshToken).not.toHaveBeenCalled();
    });

    it.each([
      ['a moment ago', 1_000],
      ['exactly at the grace limit', 10_000],
    ])(
      'returns Unauthorized without revoking other sessions when the token was rotated %s',
      async (_case, revokedAgoMs: number) => {
        refreshTokenRepository.getRefreshTokenByHash.mockResolvedValue(
          ok({ ...storedToken, revokedAt: new Date(now - revokedAgoMs) }),
        );

        await expectInvalidRefreshToken();
        // Tab khác vừa refresh / client retry: không đá user khỏi mọi thiết bị
        expect(
          refreshTokenRepository.revokeAllRefreshTokensForUser,
        ).not.toHaveBeenCalled();
        expect(loggerWarn).not.toHaveBeenCalled();
        expect(accessTokenIssuer.issueAccessToken).not.toHaveBeenCalled();
        expect(
          refreshTokenRepository.rotateRefreshToken,
        ).not.toHaveBeenCalled();
      },
    );

    it('revokes every session of the user when a revoked token is reused after the grace window', async () => {
      refreshTokenRepository.getRefreshTokenByHash.mockResolvedValue(
        ok({ ...storedToken, revokedAt: new Date(now - 10_001) }),
      );

      await expectInvalidRefreshToken();
      expect(
        refreshTokenRepository.revokeAllRefreshTokensForUser,
      ).toHaveBeenCalledWith(7);
      expect(loggerWarn).toHaveBeenCalled();
      expect(accessTokenIssuer.issueAccessToken).not.toHaveBeenCalled();
      expect(refreshTokenRepository.rotateRefreshToken).not.toHaveBeenCalled();
    });

    it('still returns Unauthorized when revoking all sessions fails after reuse', async () => {
      const loggerError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      refreshTokenRepository.getRefreshTokenByHash.mockResolvedValue(
        ok({ ...storedToken, revokedAt: new Date(now - 60_000) }),
      );
      refreshTokenRepository.revokeAllRefreshTokensForUser.mockResolvedValue(
        err(new Error('internal detail')),
      );

      await expectInvalidRefreshToken();
      expect(loggerError).toHaveBeenCalled();
    });

    it.each([
      ['expires exactly now', 0],
      ['expired a second ago', -1_000],
    ])(
      'returns Unauthorized when the token %s',
      async (_case, offsetMs: number) => {
        refreshTokenRepository.getRefreshTokenByHash.mockResolvedValue(
          ok({ ...storedToken, expiresAt: new Date(now + offsetMs) }),
        );

        await expectInvalidRefreshToken();
        expect(userRepository.getUserById).not.toHaveBeenCalled();
        expect(
          refreshTokenRepository.rotateRefreshToken,
        ).not.toHaveBeenCalled();
      },
    );

    it('returns Unauthorized when the user no longer exists', async () => {
      userRepository.getUserById.mockResolvedValue(ok(null));

      await expectInvalidRefreshToken();
      expect(accessTokenIssuer.issueAccessToken).not.toHaveBeenCalled();
      expect(refreshTokenRepository.rotateRefreshToken).not.toHaveBeenCalled();
    });

    it('keeps the old token usable when the access token cannot be issued', async () => {
      accessTokenIssuer.issueAccessToken.mockResolvedValue(
        err(new Error('internal detail')),
      );

      const result = await service.refreshAsync(request);

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.code).toBe(ErrorCode.InternalServerError);
      // Ký trước, rotate sau: ký lỗi thì token cũ không bị revoke oan
      expect(refreshTokenRepository.rotateRefreshToken).not.toHaveBeenCalled();
    });

    it('returns Unauthorized without revoking all sessions when another request rotated the token first', async () => {
      refreshTokenRepository.rotateRefreshToken.mockResolvedValue(
        err(new RefreshTokenAlreadyRevokedError()),
      );

      await expectInvalidRefreshToken();
      expect(
        refreshTokenRepository.revokeAllRefreshTokensForUser,
      ).not.toHaveBeenCalled();
    });

    it.each([
      [
        'looking up the token',
        () => refreshTokenRepository.getRefreshTokenByHash,
      ],
      ['looking up the user', () => userRepository.getUserById],
      ['issuing the access token', () => accessTokenIssuer.issueAccessToken],
      ['rotating the token', () => refreshTokenRepository.rotateRefreshToken],
    ])(
      'returns a safe InternalServerError when %s fails',
      async (_step, getMock) => {
        getMock().mockResolvedValue(err(new Error('internal detail')));

        const result = await service.refreshAsync(request);

        if (result.isOk()) throw new Error('Expected an error result');
        expect(result.error.code).toBe(ErrorCode.InternalServerError);
        expect(result.error.message).not.toContain('internal detail');
      },
    );
  });

  describe('logoutAsync', () => {
    const request = { refreshToken: 'raw' };

    beforeEach(() => {
      tokenHasher.hashToken.mockImplementation((raw: string) => `sha:${raw}`);
      refreshTokenRepository.revokeRefreshTokenByHash.mockResolvedValue(
        ok(undefined),
      );
    });

    it('revokes the token by its hash', async () => {
      const result = await service.logoutAsync(request);

      expect(result.isOk()).toBe(true);
      expect(
        refreshTokenRepository.revokeRefreshTokenByHash,
      ).toHaveBeenCalledWith('sha:raw');
    });

    // Logout lại / token lạ là chuyện bình thường, không phải dấu hiệu token bị lộ
    it('does not revoke the other sessions of the user', async () => {
      await service.logoutAsync(request);

      expect(
        refreshTokenRepository.revokeAllRefreshTokensForUser,
      ).not.toHaveBeenCalled();
      expect(
        refreshTokenRepository.getRefreshTokenByHash,
      ).not.toHaveBeenCalled();
    });

    it('returns a safe InternalServerError when revoking fails', async () => {
      refreshTokenRepository.revokeRefreshTokenByHash.mockResolvedValue(
        err(new Error('internal detail')),
      );

      const result = await service.logoutAsync(request);

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.code).toBe(ErrorCode.InternalServerError);
      expect(result.error.message).toBe('Failed to logout');
    });
  });
});
