import { Logger } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { BcryptPasswordHasher } from './bcrypt-password-hasher';

describe('BcryptPasswordHasher', () => {
  const hasher = new BcryptPasswordHasher();
  const plain = 'Str0ng-Passw0rd';

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  describe('hash', () => {
    it('returns a bcrypt hash with 10 salt rounds that differs from the plain value', async () => {
      const result = await hasher.hash(plain);

      if (result.isErr()) throw result.error;
      expect(result.value).not.toBe(plain);
      expect(result.value).toMatch(/^\$2[aby]\$10\$/);
    });

    it('produces a different hash for the same input because of the random salt', async () => {
      const first = await hasher.hash(plain);
      const second = await hasher.hash(plain);

      if (first.isErr()) throw first.error;
      if (second.isErr()) throw second.error;
      expect(first.value).not.toBe(second.value);
    });

    it('returns a safe error when bcrypt fails', async () => {
      jest
        .spyOn(bcrypt, 'hash')
        .mockRejectedValueOnce(new Error('bcrypt internal detail') as never);

      const result = await hasher.hash(plain);

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.message).not.toContain('bcrypt internal detail');
    });
  });

  describe('compare', () => {
    it('returns true when the plain value matches its hash', async () => {
      const hashed = await hasher.hash(plain);
      if (hashed.isErr()) throw hashed.error;

      const result = await hasher.compare(plain, hashed.value);

      if (result.isErr()) throw result.error;
      expect(result.value).toBe(true);
    });

    it.each([
      ['the plain value is wrong', 'wrong-password', undefined],
      ['the stored hash is malformed', plain, 'not-a-hash'],
    ])('returns ok(false) when %s', async (_case, input, storedHash) => {
      const hashed = await hasher.hash(plain);
      if (hashed.isErr()) throw hashed.error;

      const result = await hasher.compare(input, storedHash ?? hashed.value);

      if (result.isErr()) throw result.error;
      expect(result.value).toBe(false);
    });

    it('returns a safe error when bcrypt fails', async () => {
      jest
        .spyOn(bcrypt, 'compare')
        .mockRejectedValueOnce(new Error('bcrypt internal detail') as never);

      const result = await hasher.compare(plain, 'any-hash');

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.message).not.toContain('bcrypt internal detail');
    });
  });
});
