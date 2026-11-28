import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import type { NewHistoryInsight } from '../domain/repositories/history-insight.repo.interface';
import { HistoryInsightRepository } from './history-insight.repo';

jest.mock('../../../shared/infrastructure/database/prisma.service', () => ({
  PrismaService: class {},
}));

describe('HistoryInsightRepository', () => {
  const sessionAggregate = jest.fn();
  const sessionFindMany = jest.fn();
  const insightFindFirst = jest.fn();
  const insightUpsert = jest.fn();
  const userFindUnique = jest.fn();
  const prisma = {
    interviewSession: {
      aggregate: sessionAggregate,
      findMany: sessionFindMany,
    },
    userInsight: { findFirst: insightFindFirst, upsert: insightUpsert },
    user: { findUnique: userFindUnique },
  } as unknown as PrismaService;
  const repository = new HistoryInsightRepository(prisma);

  const userPublicId = '00000000-0000-4000-8000-000000000001';
  const completedWhere = {
    user: { publicId: userPublicId },
    status: 'COMPLETED',
  };

  const INSIGHT_SELECT = {
    overallFeedback: true,
    strengths: true,
    weaknesses: true,
    recommendations: true,
    basedOnSessionCount: true,
    lastSessionCompletedAt: true,
    generatedAt: true,
  };

  const generatedAt = new Date('2026-10-21T00:00:00.000Z');
  const lastSessionCompletedAt = new Date('2026-10-20T08:14:02.000Z');

  const insightRow = {
    overallFeedback: 'Tiến bộ đều.',
    strengths: [{ category: 'EXPERIENCE', title: 'T', description: 'D' }],
    weaknesses: [{ category: 'COMMUNICATION', title: 'T', description: 'D' }],
    recommendations: [{ title: 'STAR', description: 'Luyện' }],
    basedOnSessionCount: 3,
    lastSessionCompletedAt,
    generatedAt,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  describe('getHistoryFingerprint', () => {
    it('counts the completed sessions and takes the latest completion', async () => {
      sessionAggregate.mockResolvedValue({
        _count: { _all: 3 },
        _max: { completedAt: lastSessionCompletedAt },
      });

      const result = await repository.getHistoryFingerprint(userPublicId);

      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({
        completedSessions: 3,
        lastCompletedAt: lastSessionCompletedAt,
      });
      expect(sessionAggregate).toHaveBeenCalledWith({
        where: completedWhere,
        _count: { _all: true },
        _max: { completedAt: true },
      });
    });

    it('returns a null completion date for an empty history', async () => {
      sessionAggregate.mockResolvedValue({
        _count: { _all: 0 },
        _max: { completedAt: null },
      });

      const result = await repository.getHistoryFingerprint(userPublicId);

      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({
        completedSessions: 0,
        lastCompletedAt: null,
      });
    });
  });

  describe('getInsightSessions', () => {
    const sessionRow = (scoringModel: string) => ({
      publicId: '00000000-0000-4000-8000-0000000000a1',
      title: 'Backend Intern',
      createdAt: new Date('2026-10-20T08:00:00.000Z'),
      score: {
        contentScore: 8,
        relevanceScore: 7.6,
        confidenceScore: 6,
        overallScore: 7.4,
      },
      interviewSummary: {
        scoringModel,
        strengths: [
          { category: 'EXPERIENCE', title: 'T', description: 'D', x: 1 },
        ],
        improvements: [
          {
            category: 'COMMUNICATION',
            title: 'T',
            description: 'D',
            suggestion: 'S',
          },
        ],
      },
    });

    // Không kéo transcript, jobDescription hay cvSnapshot về cho prompt
    it('loads the most recent completed sessions with their summary', async () => {
      sessionFindMany.mockResolvedValue([]);

      await repository.getInsightSessions(userPublicId, 20);

      expect(sessionFindMany).toHaveBeenCalledWith({
        where: { ...completedWhere, score: { isNot: null } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
        select: {
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
          interviewSummary: {
            select: { scoringModel: true, strengths: true, improvements: true },
          },
        },
      });
    });

    it('flattens the row and narrows the Json feedback', async () => {
      sessionFindMany.mockResolvedValue([sessionRow('gemini-2.5-flash')]);

      const result = await repository.getInsightSessions(userPublicId, 20);

      if (result.isErr()) throw result.error;
      expect(result.value).toEqual([
        {
          sessionPublicId: '00000000-0000-4000-8000-0000000000a1',
          title: 'Backend Intern',
          createdAt: new Date('2026-10-20T08:00:00.000Z'),
          contentScore: 8,
          relevanceScore: 7.6,
          confidenceScore: 6,
          overallScore: 7.4,
          isRuleBased: false,
          strengths: [{ category: 'EXPERIENCE', title: 'T', description: 'D' }],
          improvements: [
            {
              category: 'COMMUNICATION',
              title: 'T',
              description: 'D',
              suggestion: 'S',
            },
          ],
        },
      ]);
    });

    it('flags a session scored by the empty-answer rule', async () => {
      sessionFindMany.mockResolvedValue([sessionRow('rule-based')]);

      const result = await repository.getInsightSessions(userPublicId, 20);

      if (result.isErr()) throw result.error;
      expect(result.value[0].isRuleBased).toBe(true);
    });

    it('keeps a session without summary with empty feedback', async () => {
      sessionFindMany.mockResolvedValue([
        { ...sessionRow('x'), interviewSummary: null },
      ]);

      const result = await repository.getInsightSessions(userPublicId, 20);

      if (result.isErr()) throw result.error;
      expect(result.value[0]).toMatchObject({
        isRuleBased: false,
        strengths: [],
        improvements: [],
      });
    });
  });

  describe('findInsight', () => {
    it('reads the insight of the owner without internal columns', async () => {
      insightFindFirst.mockResolvedValue(insightRow);

      const result = await repository.findInsight(userPublicId);

      if (result.isErr()) throw result.error;
      expect(insightFindFirst).toHaveBeenCalledWith({
        where: { user: { publicId: userPublicId } },
        select: INSIGHT_SELECT,
      });
      expect(result.value).toEqual(insightRow);
    });

    it('drops malformed Json items', async () => {
      insightFindFirst.mockResolvedValue({
        ...insightRow,
        weaknesses: [{ title: 'no category', description: 'D' }, 'x'],
        recommendations: { title: 'not an array' },
      });

      const result = await repository.findInsight(userPublicId);

      if (result.isErr()) throw result.error;
      expect(result.value?.weaknesses).toEqual([]);
      expect(result.value?.recommendations).toEqual([]);
    });

    it('returns null when the user has no insight yet', async () => {
      insightFindFirst.mockResolvedValue(null);

      const result = await repository.findInsight(userPublicId);

      if (result.isErr()) throw result.error;
      expect(result.value).toBeNull();
    });
  });

  describe('saveInsight', () => {
    const insight: NewHistoryInsight = {
      overallFeedback: 'Tiến bộ đều.',
      strengths: [{ category: 'EXPERIENCE', title: 'T', description: 'D' }],
      weaknesses: [{ category: 'COMMUNICATION', title: 'T', description: 'D' }],
      recommendations: [{ title: 'STAR', description: 'Luyện' }],
      basedOnSessionCount: 3,
      lastSessionCompletedAt,
      generatedAt,
      llmModel: 'gemini-2.5-flash',
      promptVersion: 'v1.0',
    };

    it('overwrites the single insight of the user', async () => {
      userFindUnique.mockResolvedValue({ id: 42 });
      insightUpsert.mockResolvedValue(insightRow);

      const result = await repository.saveInsight(userPublicId, insight);

      if (result.isErr()) throw result.error;
      const data = {
        overallFeedback: insight.overallFeedback,
        strengths: insight.strengths,
        weaknesses: insight.weaknesses,
        recommendations: insight.recommendations,
        basedOnSessionCount: 3,
        lastSessionCompletedAt,
        llmModel: 'gemini-2.5-flash',
        promptVersion: 'v1.0',
        generatedAt,
      };
      expect(insightUpsert).toHaveBeenCalledWith({
        where: { userId: 42 },
        create: { userId: 42, ...data },
        update: data,
        select: INSIGHT_SELECT,
      });
      expect(result.value).toEqual(insightRow);
    });

    it('returns null without writing when the user does not exist', async () => {
      userFindUnique.mockResolvedValue(null);

      const result = await repository.saveInsight(userPublicId, insight);

      if (result.isErr()) throw result.error;
      expect(result.value).toBeNull();
      expect(insightUpsert).not.toHaveBeenCalled();
    });

    it('returns a generic error and hides the database message', async () => {
      const databaseMessage = 'connect ECONNREFUSED db-internal-host:5432';
      userFindUnique.mockResolvedValue({ id: 42 });
      insightUpsert.mockRejectedValue(new Error(databaseMessage));

      const result = await repository.saveInsight(userPublicId, insight);

      if (result.isOk()) throw new Error('Expected repository error');
      expect(result.error.message).toBe('Failed to save the insight');
      expect(result.error.message).not.toContain(databaseMessage);
    });
  });
});
