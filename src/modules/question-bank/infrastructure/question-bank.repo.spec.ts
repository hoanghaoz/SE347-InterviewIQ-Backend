import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import {
  QuestionDifficulty,
  QuestionDomain,
} from '../../question-generation/domain/enums/question.enum';
import { QuestionBankRepository } from './question-bank.repo';

jest.mock('../../../shared/infrastructure/database/prisma.service', () => ({
  PrismaService: class {},
}));

describe('QuestionBankRepository', () => {
  const findMany = jest.fn();
  const count = jest.fn();
  const repository = new QuestionBankRepository({
    questionBankItem: { findMany, count },
  } as unknown as PrismaService);
  const row = {
    publicId: 'item-1',
    content: 'Explain the difference between a process and a thread.',
    domain: 'TECHNICAL',
    difficulty: 'MEDIUM',
    createdAt: new Date('2026-11-22T07:58:11.000Z'),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    findMany.mockResolvedValue([row]);
    count.mockResolvedValue(1);
  });

  it('lists only the caller items, newest first, with a stable order', async () => {
    const result = await repository.listItems(
      'user-1',
      { pageNumber: 1, pageSize: 20 },
      {},
    );
    if (result.isErr()) throw result.error;
    expect(findMany).toHaveBeenCalledWith({
      where: { user: { publicId: 'user-1' } },
      skip: 0,
      take: 20,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        publicId: true,
        content: true,
        domain: true,
        difficulty: true,
        createdAt: true,
      },
    });
    expect(count).toHaveBeenCalledWith({
      where: { user: { publicId: 'user-1' } },
    });
  });

  it('maps rows to domain values and returns the total', async () => {
    const result = await repository.listItems(
      'user-1',
      { pageNumber: 1, pageSize: 20 },
      {},
    );
    if (result.isErr()) throw result.error;
    expect(result.value).toEqual({
      items: [
        {
          publicId: 'item-1',
          content: row.content,
          domain: QuestionDomain.TECHNICAL,
          difficulty: QuestionDifficulty.MEDIUM,
          createdAt: row.createdAt,
        },
      ],
      totalItems: 1,
    });
  });

  it('computes skip from the page number', async () => {
    await repository.listItems('user-1', { pageNumber: 3, pageSize: 10 }, {});
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });

  it('applies the domain, difficulty and case-insensitive search filters together', async () => {
    await repository.listItems(
      'user-1',
      { pageNumber: 1, pageSize: 20 },
      {
        domain: QuestionDomain.BEHAVIORAL,
        difficulty: QuestionDifficulty.HARD,
        search: 'team',
      },
    );
    const where = {
      user: { publicId: 'user-1' },
      domain: 'BEHAVIORAL',
      difficulty: 'HARD',
      content: { contains: 'team', mode: 'insensitive' },
    };
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(count).toHaveBeenCalledWith({ where });
  });

  it('sanitizes database errors', async () => {
    findMany.mockRejectedValue(new Error('database secret'));
    const result = await repository.listItems(
      'user-1',
      { pageNumber: 1, pageSize: 20 },
      {},
    );
    if (result.isOk()) throw new Error('Expected repository failure');
    expect(result.error.message).toBe('Failed to list the question bank');
  });
});
