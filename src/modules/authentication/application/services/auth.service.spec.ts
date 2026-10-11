import { Logger } from '@nestjs/common';
import { err, ok } from 'neverthrow';
import { ErrorCode } from '../../../../shared/common/errorCode';
import { UserAlreadyExistsError } from '../../../user/domain/repositories/user.repo.interface';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const userRepository = {
    getUserByEmail: jest.fn(),
    createUser: jest.fn(),
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

  // Các object mock khớp cấu trúc của contract nên truyền thẳng được, không cần ép kiểu
  const service = new AuthService(
    userRepository,
    passwordHasher,
    emailSender,
    pendingStore,
    otpStore,
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
});
