import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { UserRepository } from './user.repo';

jest.mock('../../../shared/infrastructure/database/prisma.service', () => ({
  PrismaService: class {},
}));

describe('UserRepository', () => {
  const findUnique = jest.fn();
  const prisma = {
    user: { findUnique },
  } as unknown as PrismaService;
  const repository = new UserRepository(prisma);

  beforeEach(() => findUnique.mockReset());

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
});
