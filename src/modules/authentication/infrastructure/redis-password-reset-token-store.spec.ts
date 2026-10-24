import { Logger } from '@nestjs/common';
import type { Result } from 'neverthrow';
import { RedisService } from '../../../shared/infrastructure/redis/redis.service';
import { RedisPasswordResetTokenStore } from './redis-password-reset-token-store';

describe('RedisPasswordResetTokenStore', () => {
  const get = jest.fn();
  const set = jest.fn();
  const del = jest.fn();

  const redisService = { get, set, del } as unknown as RedisService;
  const store = new RedisPasswordResetTokenStore(redisService);

  const email = 'a@x.com';
  const key = 'auth:reset-password-token:a@x.com';

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  describe('saveResetToken', () => {
    it('saves the token hash under the reset token key with the given ttl', async () => {
      set.mockResolvedValue(undefined);

      const result = await store.saveResetToken(email, 'hash', 600);

      expect(result.isOk()).toBe(true);
      expect(set).toHaveBeenCalledWith(key, 'hash', 600);
    });

    it('normalizes the email to a trimmed lowercase key', async () => {
      set.mockResolvedValue(undefined);

      await store.saveResetToken('  A@X.com ', 'hash', 600);

      expect(set).toHaveBeenCalledWith(key, 'hash', 600);
    });
  });

  describe('findResetToken', () => {
    it('returns the stored token hash when it exists', async () => {
      get.mockResolvedValue('hash');

      const result = await store.findResetToken(email);

      if (result.isErr()) throw result.error;
      expect(result.value).toBe('hash');
      expect(get).toHaveBeenCalledWith(key);
    });

    it('returns null when no token is stored', async () => {
      get.mockResolvedValue(null);

      const result = await store.findResetToken(email);

      if (result.isErr()) throw result.error;
      expect(result.value).toBeNull();
    });
  });

  describe('deleteResetToken', () => {
    it('deletes the reset token key', async () => {
      del.mockResolvedValue(undefined);

      const result = await store.deleteResetToken(email);

      expect(result.isOk()).toBe(true);
      expect(del).toHaveBeenCalledWith(key);
    });
  });

  it.each<[string, jest.Mock, () => Promise<Result<unknown, Error>>]>([
    ['saving', set, () => store.saveResetToken(email, 'hash', 600)],
    ['finding', get, () => store.findResetToken(email)],
    ['deleting', del, () => store.deleteResetToken(email)],
  ])(
    'returns a safe error when redis fails while %s',
    async (_step, redisMock, call) => {
      redisMock.mockRejectedValue(new Error('redis internal detail'));

      const result = await call();

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.message).not.toContain('redis internal detail');
    },
  );
});
