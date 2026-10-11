import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { UserAlreadyExistsError } from '../domain/repositories/user.repo.interface';
import { UserRepository } from './user.repo';

jest.mock('../../../shared/infrastructure/database/prisma.service', () => ({
  PrismaService: class {},
}));

describe('UserRepository', () => {
  const findUnique = jest.fn();
  const create = jest.fn();
  const prisma = {
    user: { findUnique, create },
  } as unknown as PrismaService;
  const repository = new UserRepository(prisma);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('returns the user id when a user is found', async () => {
    findUnique.mockResolvedValue({ id: 1 });

    const result = await repository.getUserByEmail('test@example.com');

    expect(result.isOk()).toBe(true);
    if (result.isErr()) throw result.error;
    expect(result.value).toEqual({ id: 1 });
    expect(findUnique).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
      select: { id: true },
    });
  });

  it('returns null when no user has that email', async () => {
    findUnique.mockResolvedValue(null);

    const result = await repository.getUserByEmail('missing@example.com');

    expect(result.isOk()).toBe(true);
    if (result.isErr()) throw result.error;
    expect(result.value).toBeNull();
  });

  it('returns a generic error and hides the database message when Prisma fails', async () => {
    const databaseMessage = 'connect ECONNREFUSED db-internal-host:5432';
    findUnique.mockRejectedValue(new Error(databaseMessage));

    const result = await repository.getUserByEmail('test@example.com');

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error('Expected repository error');
    expect(result.error.message).toBe('Failed to find user');
    expect(result.error.message).not.toContain(databaseMessage);
  });

  describe('createUser', () => {
    const data = {
      email: 'test@example.com',
      passwordHash: '$2b$10$hash',
      fullName: 'Nguyen Van A',
    };

    it('creates the user and returns its id', async () => {
      create.mockResolvedValue({ id: 1 });

      const result = await repository.createUser(data);

      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({ id: 1 });
      expect(create).toHaveBeenCalledWith({
        data,
        select: { id: true },
      });
    });

    it('returns UserAlreadyExistsError when the email is already taken', async () => {
      create.mockRejectedValue({ code: 'P2002' });

      const result = await repository.createUser(data);

      if (result.isOk()) throw new Error('Expected repository error');
      expect(result.error).toBeInstanceOf(UserAlreadyExistsError);
    });

    it('returns a generic error and hides the database message on other failures', async () => {
      const databaseMessage = 'connect ECONNREFUSED db-internal-host:5432';
      create.mockRejectedValue(new Error(databaseMessage));

      const result = await repository.createUser(data);

      if (result.isOk()) throw new Error('Expected repository error');
      expect(result.error).not.toBeInstanceOf(UserAlreadyExistsError);
      expect(result.error.message).toBe('Failed to create user');
      expect(result.error.message).not.toContain(databaseMessage);
    });
  });
});
