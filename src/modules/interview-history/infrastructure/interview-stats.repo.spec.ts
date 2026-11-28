import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { InterviewStatsRepository } from './interview-stats.repo';

jest.mock('../../../shared/infrastructure/database/prisma.service', () => ({
  PrismaService: class {},
}));

describe('InterviewStatsRepository', () => {
  const aggregate = jest.fn();
  const answerCount = jest.fn();
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const prisma = {
    score: { aggregate },
    answer: { count: answerCount },
    interviewSession: { findMany, findFirst },
  } as unknown as PrismaService;
  const repository = new InterviewStatsRepository(prisma);

  const userPublicId = '00000000-0000-4000-8000-000000000001';

  // Khớp chính xác: không có điều kiện scoringModel nào, nên buổi bị chấm 0 vì
  // bỏ trống (rule-based) vẫn được tính.
  const completedWhere = {
    user: { publicId: userPublicId },
    status: 'COMPLETED',
  };

  const SESSION_SELECT = {
    publicId: true,
    title: true,
    createdAt: true,
    score: {
      select: {
        contentScore: true,
        relevanceScore: true,
        confidenceScore: true,
        overallScore: true,
      },
    },
  };

  const scores = {
    contentScore: 8,
    relevanceScore: 7.5,
    confidenceScore: 7,
    overallScore: 7.6,
  };

  const sessionRow = (index: number, score: unknown = scores) => ({
    publicId: `00000000-0000-4000-8000-00000000000${index}`,
    title: `Session ${index}`,
    createdAt: new Date(`2026-10-0${index}T08:00:00.000Z`),
    score,
  });

  const emptyAggregate = {
    _avg: {
      contentScore: null,
      relevanceScore: null,
      confidenceScore: null,
      overallScore: null,
    },
    _count: { _all: 0 },
  };

  const mockEmpty = () => {
    aggregate.mockResolvedValue(emptyAggregate);
    answerCount.mockResolvedValue(0);
    findMany.mockResolvedValue([]);
    findFirst.mockResolvedValue(null);
  };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('averages only the completed sessions of the owner', async () => {
    mockEmpty();

    await repository.getInterviewStats(userPublicId, {}, 20);

    expect(aggregate).toHaveBeenCalledWith({
      where: { session: completedWhere },
      _avg: {
        contentScore: true,
        relevanceScore: true,
        confidenceScore: true,
        overallScore: true,
      },
      _count: { _all: true },
    });
  });

  it('counts only answers with a transcript in completed sessions', async () => {
    mockEmpty();

    await repository.getInterviewStats(userPublicId, {}, 20);

    expect(answerCount).toHaveBeenCalledWith({
      where: {
        AND: [{ transcript: { not: null } }, { transcript: { not: '' } }],
        question: { session: completedWhere },
      },
    });
  });

  it('loads the most recent scored sessions newest first', async () => {
    mockEmpty();

    await repository.getInterviewStats(userPublicId, {}, 7);

    expect(findMany).toHaveBeenCalledWith({
      where: { ...completedWhere, score: { isNot: null } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 7,
      select: SESSION_SELECT,
    });
  });

  it('picks the best session by overallScore and the newest on a tie', async () => {
    mockEmpty();

    await repository.getInterviewStats(userPublicId, {}, 20);

    expect(findFirst).toHaveBeenCalledWith({
      where: { ...completedWhere, score: { isNot: null } },
      orderBy: [
        { score: { overallScore: 'desc' } },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      select: SESSION_SELECT,
    });
  });

  it('applies the createdAt range inclusively to every query', async () => {
    mockEmpty();
    const fromDate = new Date('2026-10-01T00:00:00.000Z');
    const toDate = new Date('2026-10-31T23:59:59.000Z');
    const rangedWhere = {
      ...completedWhere,
      createdAt: { gte: fromDate, lte: toDate },
    };

    await repository.getInterviewStats(userPublicId, { fromDate, toDate }, 20);

    expect(aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { session: rangedWhere } }),
    );
    expect(answerCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        question: { session: rangedWhere },
      }) as unknown,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ...rangedWhere, score: { isNot: null } },
      }),
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ...rangedWhere, score: { isNot: null } },
      }),
    );
  });

  it('builds a half-open range when only one end is given', async () => {
    mockEmpty();
    const toDate = new Date('2026-10-31T23:59:59.000Z');

    await repository.getInterviewStats(userPublicId, { toDate }, 20);

    expect(aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { session: { ...completedWhere, createdAt: { lte: toDate } } },
      }),
    );
  });

  it('maps the aggregate, the recent sessions and the best session', async () => {
    aggregate.mockResolvedValue({
      _avg: {
        contentScore: 20 / 3,
        relevanceScore: 6,
        confidenceScore: 5,
        overallScore: 14 / 3,
      },
      _count: { _all: 3 },
    });
    answerCount.mockResolvedValue(14);
    findMany.mockResolvedValue([sessionRow(3), sessionRow(2)]);
    findFirst.mockResolvedValue(sessionRow(2));

    const result = await repository.getInterviewStats(userPublicId, {}, 20);

    if (result.isErr()) throw result.error;
    const mapped = (index: number) => ({
      sessionPublicId: `00000000-0000-4000-8000-00000000000${index}`,
      title: `Session ${index}`,
      createdAt: new Date(`2026-10-0${index}T08:00:00.000Z`),
      ...scores,
    });
    // Trung bình giữ nguyên số thô: làm tròn là việc của service.
    expect(result.value).toEqual({
      completedSessions: 3,
      answeredQuestions: 14,
      averages: {
        contentScore: 20 / 3,
        relevanceScore: 6,
        confidenceScore: 5,
        overallScore: 14 / 3,
      },
      best: mapped(2),
      recent: [mapped(3), mapped(2)],
    });
  });

  it('returns null averages and an empty list when nothing is completed', async () => {
    mockEmpty();

    const result = await repository.getInterviewStats(userPublicId, {}, 20);

    if (result.isErr()) throw result.error;
    expect(result.value).toEqual({
      completedSessions: 0,
      answeredQuestions: 0,
      averages: null,
      best: null,
      recent: [],
    });
  });

  it('skips a row that has no score', async () => {
    mockEmpty();
    findMany.mockResolvedValue([sessionRow(1, null)]);
    findFirst.mockResolvedValue(sessionRow(1, null));

    const result = await repository.getInterviewStats(userPublicId, {}, 20);

    if (result.isErr()) throw result.error;
    expect(result.value.recent).toEqual([]);
    expect(result.value.best).toBeNull();
  });

  it('returns a generic error and hides the database message when Prisma fails', async () => {
    const databaseMessage = 'connect ECONNREFUSED db-internal-host:5432';
    mockEmpty();
    aggregate.mockRejectedValue(new Error(databaseMessage));

    const result = await repository.getInterviewStats(userPublicId, {}, 20);

    if (result.isOk()) throw new Error('Expected repository error');
    expect(result.error.message).toBe('Failed to get the interview stats');
    expect(result.error.message).not.toContain(databaseMessage);
  });
});
