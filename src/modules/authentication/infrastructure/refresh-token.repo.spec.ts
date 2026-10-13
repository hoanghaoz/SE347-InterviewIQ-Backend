import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { RefreshTokenRepository } from './refresh-token.repo';

jest.mock('../../../shared/infrastructure/database/prisma.service', () => ({
  PrismaService: class {},
}));

describe('RefreshTokenRepository', () => {
  const create = jest.fn();
  const prisma = {
    refreshToken: { create },
  } as unknown as PrismaService;
  const repository = new RefreshTokenRepository(prisma);
  const data = {
    userId: 1,
    tokenHash: 'hashed-token',
    expiresAt: new Date('2026-10-20T00:00:00.000Z'),
  };

  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  describe('createRefreshToken', () => {
    it('stores the token hash for the user and returns ok', async () => {
      create.mockResolvedValue({ id: 10 });

      const result = await repository.createRefreshToken(data);

      expect(result.isOk()).toBe(true);
      expect(create).toHaveBeenCalledWith({
        data: {
          userId: 1,
          tokenHash: 'hashed-token',
          expiresAt: data.expiresAt,
        },
      });
    });

    it('only forwards the known fields to Prisma', async () => {
      create.mockResolvedValue({ id: 10 });

      await repository.createRefreshToken({ ...data, extra: 'x' } as never);

      expect(create).toHaveBeenCalledWith({
        data: {
          userId: 1,
          tokenHash: 'hashed-token',
          expiresAt: data.expiresAt,
        },
      });
    });

    it('returns a safe error and logs when Prisma fails', async () => {
      create.mockRejectedValue(new Error('db internal detail'));

      const result = await repository.createRefreshToken(data);

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.message).toBe('Failed to create refresh token');
      expect(result.error.message).not.toContain('db internal detail');
      expect(loggerError).toHaveBeenCalled();
    });
  });
});
