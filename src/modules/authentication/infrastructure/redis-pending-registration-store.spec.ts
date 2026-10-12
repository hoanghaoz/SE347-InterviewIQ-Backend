import { Logger } from '@nestjs/common';
import { RedisService } from '../../../shared/infrastructure/redis/redis.service';
import { PendingRegistration } from '../domain/entities/pending-registration.entity';
import { RedisPendingRegistrationStore } from './redis-pending-registration-store';

describe('RedisPendingRegistrationStore', () => {
  const get = jest.fn();
  const set = jest.fn();
  const del = jest.fn();

  const redisService = { get, set, del } as unknown as RedisService;
  const store = new RedisPendingRegistrationStore(redisService);

  const email = 'a@x.com';
  const key = 'auth:pending-registration:a@x.com';
  const createdAt = new Date('2026-10-09T00:00:00.000Z');
  const pending: PendingRegistration = {
    email,
    passwordHash: 'hash',
    fullName: 'Nguyen Van A',
    createdAt,
  };
  const storedJson = JSON.stringify({
    email,
    passwordHash: 'hash',
    fullName: 'Nguyen Van A',
    createdAt: '2026-10-09T00:00:00.000Z',
  });

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  describe('savePendingRegistration', () => {
    it('saves the serialized registration under the pending key with the given ttl', async () => {
      set.mockResolvedValue(undefined);

      const result = await store.savePendingRegistration(pending, 900);

      expect(result.isOk()).toBe(true);
      expect(set).toHaveBeenCalledWith(key, storedJson, 900);
    });

    it('normalizes the email in both the key and the stored payload', async () => {
      set.mockResolvedValue(undefined);

      await store.savePendingRegistration(
        { ...pending, email: '  A@X.com ' },
        900,
      );

      expect(set).toHaveBeenCalledWith(key, storedJson, 900);
    });

    it('returns a safe error when redis fails', async () => {
      set.mockRejectedValue(new Error('redis internal detail'));

      const result = await store.savePendingRegistration(pending, 900);

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.message).not.toContain('redis internal detail');
    });
  });

  describe('findPendingRegistration', () => {
    it('returns the stored registration with createdAt revived as a Date', async () => {
      get.mockResolvedValue(storedJson);

      const result = await store.findPendingRegistration(email);

      if (result.isErr()) throw result.error;
      expect(result.value).toEqual(pending);
      expect(result.value?.createdAt).toBeInstanceOf(Date);
      expect(get).toHaveBeenCalledWith(key);
    });

    it.each([
      ['nothing is stored', null],
      ['the payload is not json', 'not-json'],
      ['the payload is missing fields', JSON.stringify({ email })],
      [
        'createdAt is not a valid date',
        JSON.stringify({ ...JSON.parse(storedJson), createdAt: 'abc' }),
      ],
    ])('returns null when %s', async (_case, stored) => {
      get.mockResolvedValue(stored);

      const result = await store.findPendingRegistration(email);

      if (result.isErr()) throw result.error;
      expect(result.value).toBeNull();
    });

    it('returns a safe error when redis fails', async () => {
      get.mockRejectedValue(new Error('redis internal detail'));

      const result = await store.findPendingRegistration(email);

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.message).not.toContain('redis internal detail');
    });
  });

  describe('deletePendingRegistration', () => {
    it('deletes the registration by its pending key', async () => {
      del.mockResolvedValue(undefined);

      const result = await store.deletePendingRegistration(email);

      expect(result.isOk()).toBe(true);
      expect(del).toHaveBeenCalledWith(key);
    });

    it('normalizes the email to a trimmed lowercase key', async () => {
      del.mockResolvedValue(undefined);

      await store.deletePendingRegistration('  A@X.com ');

      expect(del).toHaveBeenCalledWith(key);
    });

    it('returns a safe error when redis fails', async () => {
      del.mockRejectedValue(new Error('redis internal detail'));

      const result = await store.deletePendingRegistration(email);

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.message).not.toContain('redis internal detail');
    });
  });
});
