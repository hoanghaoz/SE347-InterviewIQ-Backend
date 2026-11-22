import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import {
  QuestionDifficulty,
  QuestionDomain,
} from '../../question-generation/domain/enums/question.enum';
import {
  QuestionBankFullError,
  QuestionBankUnavailableError,
} from '../domain/errors/question-bank.error';
import {
  escapeLikePattern,
  QuestionBankRepository,
} from './question-bank.repo';

jest.mock('../../../shared/infrastructure/database/prisma.service', () => ({
  PrismaService: class {},
}));

describe('escapeLikePattern', () => {
  it('escapes the LIKE wildcards and the escape character itself', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%');
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
    expect(escapeLikePattern('c:\\dir')).toBe('c:\\\\dir');
    expect(escapeLikePattern('%_\\')).toBe('\\%\\_\\\\');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeLikePattern('team conflict')).toBe('team conflict');
  });
});

describe('QuestionBankRepository', () => {
  const findMany = jest.fn();
  const count = jest.fn();
  const createMany = jest.fn();
  const deleteMany = jest.fn();
  const findSession = jest.fn();
  const findUser = jest.fn();
  const queryRaw = jest.fn();
  const tx = {
    user: { findUnique: findUser },
    $queryRaw: queryRaw,
    questionBankItem: { findMany, count, createMany },
  };
  const transaction = jest.fn<
    Promise<unknown>,
    [(client: typeof tx) => Promise<unknown>]
  >();
  const repository = new QuestionBankRepository({
    questionBankItem: { findMany, count, deleteMany },
    interviewSession: { findFirst: findSession },
    $transaction: transaction,
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
    transaction.mockImplementation((callback) => callback(tx));
    findUser.mockResolvedValue({ id: 7 });
    queryRaw.mockResolvedValue([{ id: 7 }]);
  });

  describe('listItems', () => {
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

    it('searches the typed text literally, not as a LIKE pattern', async () => {
      await repository.listItems(
        'user-1',
        { pageNumber: 1, pageSize: 20 },
        { search: '100%_' },
      );
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            user: { publicId: 'user-1' },
            content: { contains: '100\\%\\_', mode: 'insensitive' },
          },
        }),
      );
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

  describe('getSessionQuestions', () => {
    it('reads the questions of a session owned by the user, in order', async () => {
      findSession.mockResolvedValue({
        questions: [
          {
            publicId: 'q1',
            content: 'A',
            domain: 'TECHNICAL',
            difficulty: 'EASY',
          },
          {
            publicId: 'q2',
            content: 'B',
            domain: 'BEHAVIORAL',
            difficulty: 'HARD',
          },
        ],
      });
      const result = await repository.getSessionQuestions(
        'user-1',
        'session-1',
      );
      if (result.isErr()) throw result.error;
      expect(findSession).toHaveBeenCalledWith({
        where: { publicId: 'session-1', user: { publicId: 'user-1' } },
        select: {
          questions: {
            orderBy: { orderIndex: 'asc' },
            select: {
              publicId: true,
              content: true,
              domain: true,
              difficulty: true,
            },
          },
        },
      });
      expect(result.value).toEqual([
        {
          publicId: 'q1',
          content: 'A',
          domain: QuestionDomain.TECHNICAL,
          difficulty: QuestionDifficulty.EASY,
        },
        {
          publicId: 'q2',
          content: 'B',
          domain: QuestionDomain.BEHAVIORAL,
          difficulty: QuestionDifficulty.HARD,
        },
      ]);
    });

    it('returns null for a missing or foreign session', async () => {
      findSession.mockResolvedValue(null);
      const result = await repository.getSessionQuestions(
        'user-1',
        'session-1',
      );
      if (result.isErr()) throw result.error;
      expect(result.value).toBeNull();
    });

    it('sanitizes database errors', async () => {
      findSession.mockRejectedValue(new Error('database secret'));
      const result = await repository.getSessionQuestions(
        'user-1',
        'session-1',
      );
      if (result.isOk()) throw new Error('Expected repository failure');
      expect(result.error.message).toBe('Failed to load the session questions');
    });
  });

  describe('addItems', () => {
    const item = (hash: string) => ({
      content: `Question ${hash}`,
      contentHash: hash,
      domain: QuestionDomain.TECHNICAL,
      difficulty: QuestionDifficulty.EASY,
    });

    it('inserts only the items the bank does not hold yet and counts the rest as skipped', async () => {
      findMany.mockResolvedValue([{ contentHash: 'a' }]);
      count.mockResolvedValue(5);
      const result = await repository.addItems(
        'user-1',
        [item('a'), item('b'), item('c')],
        200,
      );
      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({ savedCount: 2, skippedCount: 1 });
      expect(findMany).toHaveBeenCalledWith({
        where: { userId: 7, contentHash: { in: ['a', 'b', 'c'] } },
        select: { contentHash: true },
      });
      expect(createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: 7,
            content: 'Question b',
            contentHash: 'b',
            domain: 'TECHNICAL',
            difficulty: 'EASY',
          },
          {
            userId: 7,
            content: 'Question c',
            contentHash: 'c',
            domain: 'TECHNICAL',
            difficulty: 'EASY',
          },
        ],
        skipDuplicates: true,
      });
    });

    it('locks the user row before counting so parallel saves cannot pass the limit', async () => {
      findMany.mockResolvedValue([]);
      count.mockResolvedValue(0);
      await repository.addItems('user-1', [item('a')], 200);
      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        count.mock.invocationCallOrder[0],
      );
      expect(count.mock.invocationCallOrder[0]).toBeLessThan(
        createMany.mock.invocationCallOrder[0],
      );
    });

    it('stores the same text only once when the request repeats it', async () => {
      findMany.mockResolvedValue([]);
      count.mockResolvedValue(0);
      const result = await repository.addItems(
        'user-1',
        [item('a'), item('a')],
        200,
      );
      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({ savedCount: 1, skippedCount: 1 });
      expect(createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [expect.objectContaining({ contentHash: 'a' })],
        }),
      );
    });

    it('does not insert when everything is already in the bank', async () => {
      findMany.mockResolvedValue([{ contentHash: 'a' }, { contentHash: 'b' }]);
      count.mockResolvedValue(200);
      const result = await repository.addItems(
        'user-1',
        [item('a'), item('b')],
        200,
      );
      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({ savedCount: 0, skippedCount: 2 });
      expect(createMany).not.toHaveBeenCalled();
    });

    it('allows filling the bank exactly to the limit', async () => {
      findMany.mockResolvedValue([]);
      count.mockResolvedValue(198);
      const result = await repository.addItems(
        'user-1',
        [item('a'), item('b')],
        200,
      );
      if (result.isErr()) throw result.error;
      expect(result.value.savedCount).toBe(2);
    });

    it('fails with QuestionBankFullError when the limit would be exceeded and writes nothing', async () => {
      findMany.mockResolvedValue([]);
      count.mockResolvedValue(199);
      const result = await repository.addItems(
        'user-1',
        [item('a'), item('b')],
        200,
      );
      if (result.isOk()) throw new Error('Expected a full bank');
      expect(result.error).toBeInstanceOf(QuestionBankFullError);
      expect(createMany).not.toHaveBeenCalled();
    });

    it('fails with QuestionBankUnavailableError when the user no longer exists', async () => {
      findUser.mockResolvedValue(null);
      const result = await repository.addItems('user-1', [item('a')], 200);
      if (result.isOk()) throw new Error('Expected unavailable');
      expect(result.error).toBeInstanceOf(QuestionBankUnavailableError);
      expect(createMany).not.toHaveBeenCalled();
    });

    it('sanitizes database errors', async () => {
      findMany.mockRejectedValue(new Error('database secret'));
      const result = await repository.addItems('user-1', [item('a')], 200);
      if (result.isOk()) throw new Error('Expected repository failure');
      expect(result.error.message).toBe('Failed to save to the question bank');
    });
  });

  describe('deleteItem', () => {
    it('deletes only an item that belongs to the caller', async () => {
      deleteMany.mockResolvedValue({ count: 1 });
      const result = await repository.deleteItem('user-1', 'item-1');
      expect(result.isOk()).toBe(true);
      expect(deleteMany).toHaveBeenCalledWith({
        where: { publicId: 'item-1', user: { publicId: 'user-1' } },
      });
    });

    it('does not fail when the item is already gone', async () => {
      deleteMany.mockResolvedValue({ count: 0 });
      const result = await repository.deleteItem('user-1', 'item-1');
      expect(result.isOk()).toBe(true);
    });

    it('sanitizes database errors', async () => {
      deleteMany.mockRejectedValue(new Error('database secret'));
      const result = await repository.deleteItem('user-1', 'item-1');
      if (result.isOk()) throw new Error('Expected repository failure');
      expect(result.error.message).toBe('Failed to delete the question');
    });
  });
});
