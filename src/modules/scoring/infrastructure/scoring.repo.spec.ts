import { SessionStatus } from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { InterviewSummary, Score } from '../domain/entities/scoring-job.entity';
import { ScoringRepository } from './scoring.repo';

jest.mock('../../../shared/infrastructure/database/prisma.service', () => ({
  PrismaService: class {},
}));

describe('ScoringRepository', () => {
  let repository: ScoringRepository;

  const findUniqueSessionMock = jest.fn<Promise<unknown>, [unknown]>();
  const updateSessionMock = jest.fn<Promise<unknown>, [unknown]>();
  const updateManySessionMock = jest.fn<Promise<unknown>, [unknown]>();
  const findFirstSessionMock = jest.fn<Promise<unknown>, [unknown]>();
  const upsertScoreMock = jest.fn<Promise<unknown>, [unknown]>();
  const upsertSummaryMock = jest.fn<Promise<unknown>, [unknown]>();
  const transactionMock = jest.fn<
    Promise<unknown>,
    [(tx: unknown) => Promise<unknown>]
  >();

  const mockPrisma = {
    interviewSession: {
      findUnique: findUniqueSessionMock,
      update: updateSessionMock,
      updateMany: updateManySessionMock,
      findFirst: findFirstSessionMock,
    },
    score: {
      upsert: upsertScoreMock,
    },
    interviewSummary: {
      upsert: upsertSummaryMock,
    },
    $transaction: transactionMock,
  } as unknown as PrismaService;

  const mockSessionPublicId = '11111111-1111-4111-8111-111111111111';
  const mockUserPublicId = '22222222-2222-4222-8222-222222222222';
  const fixedDate = new Date('2026-09-23T10:00:00.000Z');

  beforeEach(() => {
    findUniqueSessionMock.mockReset();
    updateSessionMock.mockReset();
    updateManySessionMock.mockReset();
    findFirstSessionMock.mockReset();
    upsertScoreMock.mockReset();
    upsertSummaryMock.mockReset();
    transactionMock.mockReset();

    repository = new ScoringRepository(mockPrisma);
  });

  describe('findSessionForScoring', () => {
    it('should return session context when session exists with CV and questions', async () => {
      findUniqueSessionMock.mockResolvedValue({
        id: 1,
        publicId: mockSessionPublicId,
        userId: 10,
        status: SessionStatus.SUBMITTED,
        cv: {
          id: 5,
          parsedData: {
            skills: {
              languages: ['TypeScript'],
              frameworks: [],
              databases: [],
              tools: [],
            },
            experiences: [],
          },
        },
        questions: [
          {
            id: 100,
            content: 'Explain DDD',
            orderIndex: 0,
            answer: {
              id: 200,
              transcript: 'Domain Driven Design is...',
              emotionSummary: { confidence: 0.8 },
            },
          },
          {
            id: 101,
            content: 'Explain SOLID',
            orderIndex: 1,
            answer: null,
          },
        ],
      });

      const result =
        await repository.findSessionForScoring(mockSessionPublicId);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const ctx = result.value;
        expect(ctx).not.toBeNull();
        expect(ctx?.id).toBe(1);
        expect(ctx?.publicId).toBe(mockSessionPublicId);
        expect(ctx?.cvParsedData?.skills.languages).toEqual(['TypeScript']);
        expect(ctx?.questions).toHaveLength(2);
        expect(ctx?.questions[0].answer?.transcript).toBe(
          'Domain Driven Design is...',
        );
        expect(ctx?.questions[1].answer).toBeNull();
      }
    });

    it('should prioritize cvSnapshot.parsedData when session.cv is null or modified after submit', async () => {
      findUniqueSessionMock.mockResolvedValue({
        id: 2,
        publicId: mockSessionPublicId,
        userId: 10,
        status: SessionStatus.SUBMITTED,
        cvSnapshot: {
          sourceCvPublicId: 'cv-uuid-1',
          fileName: 'snapshot-cv.pdf',
          fileUrl: 'https://example.com/snapshot-cv.pdf',
          fileSize: 1024,
          rawText: 'Snapshot CV',
          parsedData: {
            summary: 'Snapshot summary at submission time',
            skills: {
              languages: ['TypeScript', 'Rust'],
              frameworks: ['NestJS'],
              databases: ['PostgreSQL'],
              tools: ['Docker'],
            },
            experiences: [],
            education: [],
            projects: [],
          },
          parserVersion: 'v1.0',
        },
        cv: {
          id: 5,
          parsedData: {
            summary: 'Edited summary after submission',
            skills: {
              languages: ['Python'],
              frameworks: [],
              databases: [],
              tools: [],
            },
            experiences: [],
          },
        },
        questions: [],
      });

      const result =
        await repository.findSessionForScoring(mockSessionPublicId);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value?.cvParsedData?.summary).toBe(
          'Snapshot summary at submission time',
        );
        expect(result.value?.cvParsedData?.skills.languages).toEqual([
          'TypeScript',
          'Rust',
        ]);
      }
    });

    it('should still read cvSnapshot.parsedData when original CV was deleted (session.cv is null)', async () => {
      findUniqueSessionMock.mockResolvedValue({
        id: 3,
        publicId: mockSessionPublicId,
        userId: 10,
        status: SessionStatus.SUBMITTED,
        cvSnapshot: {
          parsedData: {
            skills: {
              languages: ['Go'],
              frameworks: [],
              databases: [],
              tools: [],
            },
            experiences: [],
          },
        },
        cv: null,
        questions: [],
      });

      const result =
        await repository.findSessionForScoring(mockSessionPublicId);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value?.cvParsedData?.skills.languages).toEqual(['Go']);
      }
    });

    it('should return extended session and question metadata (title, jobDescription, domain, difficulty, durationSeconds)', async () => {
      findUniqueSessionMock.mockResolvedValue({
        id: 4,
        publicId: mockSessionPublicId,
        userId: 10,
        status: SessionStatus.SUBMITTED,
        title: 'Backend Engineer Interview',
        jobDescription: 'Require strong NestJS and PostgreSQL experience.',
        cvSnapshot: null,
        cv: null,
        questions: [
          {
            id: 100,
            content: 'How does PostgreSQL MVCC work?',
            orderIndex: 1,
            domain: 'TECHNICAL',
            difficulty: 'HARD',
            answer: {
              id: 200,
              transcript: 'MVCC uses tuple visibility...',
              emotionSummary: {
                dominant: 'neutral',
                distribution: { neutral: 0.8, happy: 0.2 },
              },
              durationSeconds: 95,
            },
          },
        ],
      });

      const result =
        await repository.findSessionForScoring(mockSessionPublicId);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const ctx = result.value;
        expect(ctx?.title).toBe('Backend Engineer Interview');
        expect(ctx?.jobDescription).toBe(
          'Require strong NestJS and PostgreSQL experience.',
        );
        expect(ctx?.questions[0]?.domain).toBe('TECHNICAL');
        expect(ctx?.questions[0]?.difficulty).toBe('HARD');
        expect(ctx?.questions[0]?.answer?.durationSeconds).toBe(95);
      }
    });

    it('should return null when session does not exist', async () => {
      findUniqueSessionMock.mockResolvedValue(null);

      const result =
        await repository.findSessionForScoring(mockSessionPublicId);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });

    it('should return Err when Prisma throws', async () => {
      findUniqueSessionMock.mockRejectedValue(new Error('DB read failure'));

      const result =
        await repository.findSessionForScoring(mockSessionPublicId);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe(
          'Failed to find session for scoring.',
        );
      }
    });
  });

  describe('updateSessionStatus', () => {
    it('should update session status and return ok', async () => {
      updateSessionMock.mockResolvedValue({
        id: 1,
        status: SessionStatus.SCORING,
      });

      const result = await repository.updateSessionStatus(
        1,
        SessionStatus.SCORING,
      );

      expect(result.isOk()).toBe(true);
      expect(updateSessionMock).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: SessionStatus.SCORING },
      });
    });

    it('should return Err when Prisma update throws', async () => {
      updateSessionMock.mockRejectedValue(new Error('Update failed'));

      const result = await repository.updateSessionStatus(
        1,
        SessionStatus.SCORING,
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe('Failed to update session status.');
      }
    });
  });

  describe('markSessionFailed', () => {
    it('should update session status to FAILED when status is SCORING and return ok', async () => {
      updateManySessionMock.mockResolvedValue({ count: 1 });

      const result = await repository.markSessionFailed(
        1,
        'LLM rate limit exceeded after retries',
      );

      expect(result.isOk()).toBe(true);
      expect(updateManySessionMock).toHaveBeenCalledWith({
        where: {
          id: 1,
          status: SessionStatus.SCORING,
        },
        data: {
          status: SessionStatus.FAILED,
        },
      });
    });

    it('should return Err when Prisma updateMany fails', async () => {
      updateManySessionMock.mockRejectedValue(new Error('DB update failure'));

      const result = await repository.markSessionFailed(
        1,
        'Some failure reason',
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe('Failed to mark session as failed.');
      }
    });
  });

  describe('saveScoringResult', () => {
    const score = Score.getScore({
      id: 1,
      publicId: 'score-uuid-1',
      sessionId: 1,
      contentScore: 8.0,
      relevanceScore: 7.5,
      confidenceScore: 7.0,
      overallScore: 7.6,
      scoredAt: fixedDate,
      createdAt: fixedDate,
    });

    const summary = InterviewSummary.getSummary({
      id: 2,
      publicId: 'summary-uuid-2',
      sessionId: 1,
      overallFeedback: 'Good candidate',
      strengths: [{ category: 'TECH', title: 'NestJS', description: 'Strong' }],
      improvements: [
        { category: 'COMM', title: 'Pacing', description: 'Be faster' },
      ],
      scoringModel: 'gemini-2.5-flash',
      promptVersion: 'v1.0',
      generatedAt: fixedDate,
      createdAt: fixedDate,
    });

    it('should execute transaction saving Score, InterviewSummary and updating session status with SUBMITTED/SCORING guard', async () => {
      updateManySessionMock.mockResolvedValue({ count: 1 });
      transactionMock.mockImplementation(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            score: { upsert: upsertScoreMock },
            interviewSummary: { upsert: upsertSummaryMock },
            interviewSession: {
              update: updateSessionMock,
              updateMany: updateManySessionMock,
            },
          };
          await callback(tx);
        },
      );

      const result = await repository.saveScoringResult(1, score, summary);

      expect(result.isOk()).toBe(true);
      expect(transactionMock).toHaveBeenCalled();

      const scoreArg = upsertScoreMock.mock.calls[0][0] as {
        where: { sessionId: number };
        create: { sessionId: number; overallScore: number };
      };
      expect(scoreArg.where.sessionId).toBe(1);
      expect(scoreArg.create.overallScore).toBe(7.6);

      const summaryArg = upsertSummaryMock.mock.calls[0][0] as {
        where: { sessionId: number };
        create: { sessionId: number; overallFeedback: string };
      };
      expect(summaryArg.where.sessionId).toBe(1);
      expect(summaryArg.create.overallFeedback).toBe('Good candidate');

      const sessionArg = updateManySessionMock.mock.calls[0][0] as {
        where: { id: number; status: { in: SessionStatus[] } };
        data: { status: SessionStatus; completedAt: Date };
      };
      expect(sessionArg.where.id).toBe(1);
      expect(sessionArg.where.status).toEqual({
        in: [SessionStatus.SUBMITTED, SessionStatus.SCORING],
      });
      expect(sessionArg.data.status).toBe(SessionStatus.COMPLETED);
      expect(sessionArg.data.completedAt).toBeInstanceOf(Date);
    });

    it('should rollback transaction and return Err when session is no longer in SUBMITTED or SCORING status (count === 0)', async () => {
      updateManySessionMock.mockResolvedValue({ count: 0 });
      transactionMock.mockImplementation(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            score: { upsert: upsertScoreMock },
            interviewSummary: { upsert: upsertSummaryMock },
            interviewSession: {
              update: updateSessionMock,
              updateMany: updateManySessionMock,
            },
          };
          await callback(tx);
        },
      );

      const result = await repository.saveScoringResult(1, score, summary);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe('Failed to save scoring result.');
      }
    });

    it('should return Err when transaction fails', async () => {
      transactionMock.mockRejectedValue(new Error('Tx rollback'));

      const result = await repository.saveScoringResult(1, score, summary);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe('Failed to save scoring result.');
      }
    });
  });

  describe('findSessionResult', () => {
    it('should return ScoringResult when session has score and summary', async () => {
      findUniqueSessionMock.mockResolvedValue({
        id: 1,
        publicId: mockSessionPublicId,
        score: {
          id: 1,
          publicId: 'score-uuid-1',
          sessionId: 1,
          contentScore: 8.0,
          relevanceScore: 7.5,
          confidenceScore: 7.0,
          overallScore: 7.6,
          scoredAt: fixedDate,
          createdAt: fixedDate,
        },
        interviewSummary: {
          id: 2,
          publicId: 'summary-uuid-2',
          sessionId: 1,
          overallFeedback: 'Good',
          strengths: [],
          improvements: [],
          scoringModel: 'gemini-2.5-flash',
          promptVersion: 'v1.0',
          generatedAt: fixedDate,
          createdAt: fixedDate,
        },
      });

      const result = await repository.findSessionResult(mockSessionPublicId);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).not.toBeNull();
        expect(result.value?.sessionPublicId).toBe(mockSessionPublicId);
        expect(result.value?.score.overallScore).toBe(7.6);
        expect(result.value?.summary.overallFeedback).toBe('Good');
      }
    });

    it('should return null when session has missing score or summary', async () => {
      findUniqueSessionMock.mockResolvedValue({
        id: 1,
        publicId: mockSessionPublicId,
        score: null,
        interviewSummary: null,
      });

      const result = await repository.findSessionResult(mockSessionPublicId);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });

    it('should return Err when Prisma throws', async () => {
      findUniqueSessionMock.mockRejectedValue(new Error('Read failed'));

      const result = await repository.findSessionResult(mockSessionPublicId);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe('Failed to find session result.');
      }
    });
  });

  describe('getSessionOwnerUserId', () => {
    it('should return session owner info when session exists', async () => {
      findUniqueSessionMock.mockResolvedValue({
        userId: 10,
        status: SessionStatus.COMPLETED,
        user: {
          publicId: mockUserPublicId,
        },
      });

      const result =
        await repository.getSessionOwnerUserId(mockSessionPublicId);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({
          userId: 10,
          ownerPublicId: mockUserPublicId,
          sessionStatus: SessionStatus.COMPLETED,
        });
      }
    });

    it('should return null when session does not exist', async () => {
      findUniqueSessionMock.mockResolvedValue(null);

      const result =
        await repository.getSessionOwnerUserId(mockSessionPublicId);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });

    it('should return Err when Prisma throws', async () => {
      findUniqueSessionMock.mockRejectedValue(new Error('Lookup failed'));

      const result =
        await repository.getSessionOwnerUserId(mockSessionPublicId);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe('Failed to get session owner.');
      }
    });
  });
});
