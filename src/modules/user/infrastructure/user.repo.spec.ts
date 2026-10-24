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
  const update = jest.fn();
  const prisma = {
    user: { findUnique, create, update },
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

  describe('getUserCredentialsByEmail', () => {
    const credentials = {
      id: 1,
      publicId: '7f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b',
      email: 'test@example.com',
      role: 'USER',
      passwordHash: '$2b$10$hash',
    };

    it('returns the credentials when a user is found', async () => {
      findUnique.mockResolvedValue(credentials);

      const result =
        await repository.getUserCredentialsByEmail('test@example.com');

      if (result.isErr()) throw result.error;
      expect(result.value).toEqual(credentials);
      // Chỉ select đúng các field cần cho login, không kéo theo dữ liệu thừa
      expect(findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        select: {
          id: true,
          publicId: true,
          email: true,
          role: true,
          passwordHash: true,
        },
      });
    });

    it('returns null when no user has that email', async () => {
      findUnique.mockResolvedValue(null);

      const result = await repository.getUserCredentialsByEmail(
        'missing@example.com',
      );

      if (result.isErr()) throw result.error;
      expect(result.value).toBeNull();
    });

    it('returns a generic error and hides the database message when Prisma fails', async () => {
      const databaseMessage = 'connect ECONNREFUSED db-internal-host:5432';
      findUnique.mockRejectedValue(new Error(databaseMessage));

      const result =
        await repository.getUserCredentialsByEmail('test@example.com');

      if (result.isOk()) throw new Error('Expected repository error');
      expect(result.error.message).toBe('Failed to find user credentials');
      expect(result.error.message).not.toContain(databaseMessage);
    });
  });

  describe('updateUserPassword', () => {
    it('updates only the password hash of the given user', async () => {
      update.mockResolvedValue({ id: 1 });

      const result = await repository.updateUserPassword(1, 'new-hash');

      expect(result.isOk()).toBe(true);
      // select id để Prisma không trả passwordHash về
      expect(update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { passwordHash: 'new-hash' },
        select: { id: true },
      });
    });

    it('returns a generic error and hides the database message when Prisma fails', async () => {
      // P2025: không có user nào với id này
      const databaseMessage = 'Record to update not found.';
      update.mockRejectedValue(
        Object.assign(new Error(databaseMessage), { code: 'P2025' }),
      );

      const result = await repository.updateUserPassword(999, 'new-hash');

      if (result.isOk()) throw new Error('Expected repository error');
      expect(result.error.message).toBe('Failed to update user password');
      expect(result.error.message).not.toContain(databaseMessage);
    });
  });
});
