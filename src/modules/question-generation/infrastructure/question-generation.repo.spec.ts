import { CommonSessionStatus } from '../../interview/domain/enums/interview-enum';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { QuestionSetLockedError } from '../domain/errors/question-generation.error';
import {
  QuestionDifficulty,
  QuestionDomain,
} from '../domain/enums/question.enum';
import { QuestionGenerationRepository } from './question-generation.repo';

jest.mock('../../../shared/infrastructure/database/prisma.service', () => ({
  PrismaService: class {},
}));

const generated = [
  {
    orderIndex: 1,
    content: 'First?',
    domain: QuestionDomain.TECHNICAL,
    difficulty: QuestionDifficulty.EASY,
  },
  {
    orderIndex: 2,
    content: 'Second?',
    domain: QuestionDomain.BEHAVIORAL,
    difficulty: QuestionDifficulty.HARD,
  },
];

const rows = [
  {
    publicId: 'q-1',
    orderIndex: 1,
    content: 'First?',
    domain: 'TECHNICAL',
    difficulty: 'EASY',
  },
  {
    publicId: 'q-2',
    orderIndex: 2,
    content: 'Second?',
    domain: 'BEHAVIORAL',
    difficulty: 'HARD',
  },
];

describe('QuestionGenerationRepository', () => {
  const findFirst = jest.fn();
  const updateMany = jest.fn();
  const deleteMany = jest.fn();
  const createMany = jest.fn();
  const findMany = jest.fn();
  const tx = {
    interviewSession: { updateMany },
    question: { deleteMany, createMany, findMany },
  };
  const transaction = jest.fn(
    (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  );
  const prisma = {
    interviewSession: { findFirst },
    $transaction: transaction,
  } as unknown as PrismaService;
  const repository = new QuestionGenerationRepository(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getGenerationContext', () => {
    it('returns the session status, JD and parsed CV data', async () => {
      const parsedData = { summary: 'Dev' };
      findFirst.mockResolvedValue({
        id: 7,
        status: 'CREATED',
        jobDescription: 'NestJS dev',
        cv: { parsedData },
      });

      const result = await repository.getGenerationContext('s-1', 'u-1');

      expect(result._unsafeUnwrap()).toEqual({
        sessionId: 7,
        status: CommonSessionStatus.CREATED,
        jobDescription: 'NestJS dev',
        parsedData,
      });
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { publicId: 's-1', user: { publicId: 'u-1' } },
        }),
      );
    });

    it('returns null parsed data when the session has no CV', async () => {
      findFirst.mockResolvedValue({
        id: 7,
        status: 'CREATED',
        jobDescription: null,
        cv: null,
      });

      const result = await repository.getGenerationContext('s-1', 'u-1');

      expect(result._unsafeUnwrap()?.parsedData).toBeNull();
    });

    it('returns null when the session is not found', async () => {
      findFirst.mockResolvedValue(null);

      const result = await repository.getGenerationContext('s-1', 'u-1');

      expect(result._unsafeUnwrap()).toBeNull();
    });

    it('returns an error without leaking the database message', async () => {
      findFirst.mockRejectedValue(new Error('connection refused to db-host'));

      const result = await repository.getGenerationContext('s-1', 'u-1');

      expect(result._unsafeUnwrapErr().message).toBe(
        'Failed to load the question generation context',
      );
    });
  });

  describe('replaceQuestions', () => {
    it('locks the session, replaces the set and returns stored questions', async () => {
      updateMany.mockResolvedValue({ count: 1 });
      findMany.mockResolvedValue(rows);

      const result = await repository.replaceQuestions(7, generated);

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 7, status: 'CREATED' },
        data: { totalQuestions: 2 },
      });
      expect(deleteMany).toHaveBeenCalledWith({ where: { sessionId: 7 } });
      expect(createMany).toHaveBeenCalledWith({
        data: [
          {
            sessionId: 7,
            orderIndex: 1,
            content: 'First?',
            domain: 'TECHNICAL',
            difficulty: 'EASY',
          },
          {
            sessionId: 7,
            orderIndex: 2,
            content: 'Second?',
            domain: 'BEHAVIORAL',
            difficulty: 'HARD',
          },
        ],
      });
      expect(result._unsafeUnwrap()).toEqual([
        { ...generated[0], publicId: 'q-1' },
        { ...generated[1], publicId: 'q-2' },
      ]);
    });

    it('fails with QuestionSetLockedError when the session left CREATED', async () => {
      updateMany.mockResolvedValue({ count: 0 });

      const result = await repository.replaceQuestions(7, generated);

      expect(result._unsafeUnwrapErr()).toBeInstanceOf(QuestionSetLockedError);
      expect(deleteMany).not.toHaveBeenCalled();
      expect(createMany).not.toHaveBeenCalled();
    });

    it('returns a generic error when the transaction fails', async () => {
      updateMany.mockResolvedValue({ count: 1 });
      deleteMany.mockRejectedValue(new Error('deadlock detected'));

      const result = await repository.replaceQuestions(7, generated);

      expect(result._unsafeUnwrapErr().message).toBe(
        'Failed to save the generated questions',
      );
    });
  });

  describe('getSessionQuestions', () => {
    it('returns the questions ordered by orderIndex', async () => {
      findFirst.mockResolvedValue({ publicId: 's-1', questions: rows });

      const result = await repository.getSessionQuestions('s-1', 'u-1');

      expect(result._unsafeUnwrap()).toEqual({
        sessionPublicId: 's-1',
        questions: [
          { ...generated[0], publicId: 'q-1' },
          { ...generated[1], publicId: 'q-2' },
        ],
      });
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            questions: expect.objectContaining({
              orderBy: { orderIndex: 'asc' },
            }) as unknown,
          }) as unknown,
        }),
      );
    });

    it('returns null when the session is not found', async () => {
      findFirst.mockResolvedValue(null);

      const result = await repository.getSessionQuestions('s-1', 'u-1');

      expect(result._unsafeUnwrap()).toBeNull();
    });

    it('returns a generic error when the query fails', async () => {
      findFirst.mockRejectedValue(new Error('boom'));

      const result = await repository.getSessionQuestions('s-1', 'u-1');

      expect(result._unsafeUnwrapErr().message).toBe(
        'Failed to load the session questions',
      );
    });
  });
});
