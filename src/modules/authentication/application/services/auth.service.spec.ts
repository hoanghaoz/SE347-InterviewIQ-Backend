import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { err, ok } from 'neverthrow';
import { CommonUserRole } from '../../../../shared/common/commonEnum';
import { ErrorCode } from '../../../../shared/common/errorCode';
import { UserAlreadyExistsError } from '../../../user/domain/repositories/user.repo.interface';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const userRepository = {
    getUserByEmail: jest.fn(),
    createUser: jest.fn(),
    getUserCredentialsByEmail: jest.fn(),
    getUserById: jest.fn(),
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

    it.each([
      ['looking up the user', () => userRepository.getUserByEmail],
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

  describe('verifyRegistrationAsync', () => {
    const request = { email, otp: '123456' };
    const pending = {
      email,
      passwordHash: 'hashed:Str0ngPass',
      fullName: 'Nguyen Van A',
      createdAt: new Date('2026-10-12T00:00:00.000Z'),
    };

    // Mặc định là happy path; từng test ghi đè bước cần làm hỏng
    beforeEach(() => {
      otpStore.findOtp.mockResolvedValue(ok('hashed:123456'));
      passwordHasher.compare.mockResolvedValue(ok(true));
      pendingStore.findPendingRegistration.mockResolvedValue(ok(pending));
      userRepository.createUser.mockResolvedValue(ok({ id: 1 }));
      otpStore.deleteOtp.mockResolvedValue(ok(undefined));
      pendingStore.deletePendingRegistration.mockResolvedValue(ok(undefined));
      otpStore.resetFailedAttempts.mockResolvedValue(ok(undefined));
    });

    it('creates the user from the pending data and cleans up all registration keys', async () => {
      const result = await service.verifyRegistrationAsync(request);

      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({ email });
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
});
