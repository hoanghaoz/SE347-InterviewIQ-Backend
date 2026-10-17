import { Logger } from '@nestjs/common';
import type { Result } from 'neverthrow';
import { RedisService } from '../../../shared/infrastructure/redis/redis.service';
import { RedisEmailOtpStore } from './redis-email-otp-store';

describe('RedisEmailOtpStore', () => {
  const get = jest.fn();
  const set = jest.fn();
  const del = jest.fn();
  const ttl = jest.fn();
  const incrementWithTtl = jest.fn();

  const redisService = {
    get,
    set,
    del,
    ttl,
    incrementWithTtl,
  } as unknown as RedisService;
  const store = new RedisEmailOtpStore(redisService);

  const email = 'a@x.com';
  const key = 'auth:otp:register:a@x.com';
  const attemptsKey = 'auth:otp:failed-attempts:a@x.com';

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  describe('saveOtp', () => {
    it('saves the otp hash under the register key with the given ttl', async () => {
      set.mockResolvedValue(undefined);

      const result = await store.saveOtp(email, 'hash', 300);

      expect(result.isOk()).toBe(true);
      expect(set).toHaveBeenCalledWith(key, 'hash', 300);
    });

    it('normalizes the email to a trimmed lowercase key', async () => {
      set.mockResolvedValue(undefined);

      await store.saveOtp('  A@X.com ', 'hash', 300);

      expect(set).toHaveBeenCalledWith(key, 'hash', 300);
    });
  });

  describe('findOtp', () => {
    it('returns the stored otp hash when it exists', async () => {
      get.mockResolvedValue('hash');

      const result = await store.findOtp(email);

      if (result.isErr()) throw result.error;
      expect(result.value).toBe('hash');
      expect(get).toHaveBeenCalledWith(key);
    });

    it('returns null when no otp is stored', async () => {
      get.mockResolvedValue(null);

      const result = await store.findOtp(email);

      if (result.isErr()) throw result.error;
      expect(result.value).toBeNull();
    });
  });

  describe('deleteOtp', () => {
    it('deletes the otp by its register key', async () => {
      del.mockResolvedValue(undefined);

      const result = await store.deleteOtp(email);

      expect(result.isOk()).toBe(true);
      expect(del).toHaveBeenCalledWith(key);
    });
  });

  describe('getRemainingTtl', () => {
    it('returns the remaining ttl in seconds when the otp is still valid', async () => {
      ttl.mockResolvedValue(120);

      const result = await store.getRemainingTtl(email);

      if (result.isErr()) throw result.error;
      expect(result.value).toBe(120);
      expect(ttl).toHaveBeenCalledWith(key);
    });

    it.each([-2, -1])('returns null when redis ttl is %i', async (redisTtl) => {
      ttl.mockResolvedValue(redisTtl);

      const result = await store.getRemainingTtl(email);

      if (result.isErr()) throw result.error;
      expect(result.value).toBeNull();
    });
  });

  describe('incrementFailedAttempts', () => {
    it('increments the attempts counter with the given ttl and returns the new count', async () => {
      incrementWithTtl.mockResolvedValue(3);

      const result = await store.incrementFailedAttempts(email, 300);

      if (result.isErr()) throw result.error;
      expect(result.value).toBe(3);
      expect(incrementWithTtl).toHaveBeenCalledWith(attemptsKey, 300);
    });

    it('normalizes the email to a trimmed lowercase key', async () => {
      incrementWithTtl.mockResolvedValue(1);

      await store.incrementFailedAttempts('  A@X.com ', 300);

      expect(incrementWithTtl).toHaveBeenCalledWith(attemptsKey, 300);
    });
  });

  describe('resetFailedAttempts', () => {
    it('deletes only the attempts counter, not the otp itself', async () => {
      del.mockResolvedValue(undefined);

      const result = await store.resetFailedAttempts(email);

      expect(result.isOk()).toBe(true);
      expect(del).toHaveBeenCalledTimes(1);
      expect(del).toHaveBeenCalledWith(attemptsKey);
      expect(del).not.toHaveBeenCalledWith(key);
    });

    it('normalizes the email to a trimmed lowercase key', async () => {
      del.mockResolvedValue(undefined);

      await store.resetFailedAttempts('  A@X.com ');

      expect(del).toHaveBeenCalledWith(attemptsKey);
    });
  });

  describe('when redis fails', () => {
    it.each<{
      method: string;
      mock: jest.Mock;
      call: () => Promise<Result<unknown, Error>>;
    }>([
      {
        method: 'saveOtp',
        mock: set,
        call: () => store.saveOtp(email, 'hash', 300),
      },
      { method: 'findOtp', mock: get, call: () => store.findOtp(email) },
      { method: 'deleteOtp', mock: del, call: () => store.deleteOtp(email) },
      {
        method: 'getRemainingTtl',
        mock: ttl,
        call: () => store.getRemainingTtl(email),
      },
      {
        method: 'incrementFailedAttempts',
        mock: incrementWithTtl,
        call: () => store.incrementFailedAttempts(email, 300),
      },
      {
        method: 'resetFailedAttempts',
        mock: del,
        call: () => store.resetFailedAttempts(email),
      },
    ])('returns a safe error from $method', async ({ mock, call }) => {
      mock.mockRejectedValue(new Error('redis internal detail'));

      const result = await call();

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.message).not.toContain('redis internal detail');
    });
  });
});
