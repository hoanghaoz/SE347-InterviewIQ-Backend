jest.mock('pg-boss', () => ({
  __esModule: true,
  PgBoss: jest.fn(),
  default: jest.fn(),
}));

import { ok, err } from 'neverthrow';
import { SessionStatus } from '../../../../../generated/prisma/enums';
import type { Job, PgBoss } from 'pg-boss';
import { ScoringJobData } from '../../application/dtos/scoring.request.dto';
import {
  IScoringLlmProvider,
  ScoringLlmEvaluationResult,
} from '../../application/interfaces/scoring-llm.interface';
import {
  InterviewSummary,
  Score,
} from '../../domain/entities/scoring-job.entity';
import {
  IScoringRepository,
  SessionScoringContext,
} from '../../domain/repositories/scoring.repo.interface';
import { ScoringWorkerService } from './scoring-worker.service';

describe('ScoringWorkerService', () => {
  let workerService: ScoringWorkerService;

  const createQueueMock = jest.fn<Promise<void>, [string]>();
  const workMock = jest.fn<
    Promise<string>,
    [
      string,
      { localConcurrency: number },
      (jobs: Job<ScoringJobData>[]) => Promise<void>,
    ]
  >();
  const mockBoss = {
    createQueue: createQueueMock,
    work: workMock,
  } as unknown as PgBoss;

  const findSessionForScoringMock = jest.fn<
    ReturnType<IScoringRepository['findSessionForScoring']>,
    Parameters<IScoringRepository['findSessionForScoring']>
  >();
  const updateSessionStatusMock = jest.fn<
    ReturnType<IScoringRepository['updateSessionStatus']>,
    Parameters<IScoringRepository['updateSessionStatus']>
  >();
  const saveScoringResultMock = jest.fn<
    ReturnType<IScoringRepository['saveScoringResult']>,
    Parameters<IScoringRepository['saveScoringResult']>
  >();
  const findSessionResultMock = jest.fn<
    ReturnType<IScoringRepository['findSessionResult']>,
    Parameters<IScoringRepository['findSessionResult']>
  >();
  const getSessionOwnerUserIdMock = jest.fn<
    ReturnType<IScoringRepository['getSessionOwnerUserId']>,
    Parameters<IScoringRepository['getSessionOwnerUserId']>
  >();
  const markSessionFailedMock = jest.fn<
    ReturnType<IScoringRepository['markSessionFailed']>,
    Parameters<IScoringRepository['markSessionFailed']>
  >();

  const mockScoringRepo: IScoringRepository = {
    findSessionForScoring: findSessionForScoringMock,
    updateSessionStatus: updateSessionStatusMock,
    saveScoringResult: saveScoringResultMock,
    markSessionFailed: markSessionFailedMock,
    findSessionResult: findSessionResultMock,
    getSessionOwnerUserId: getSessionOwnerUserIdMock,
  };

  const mockSessionId = '11111111-1111-4111-8111-111111111111';
  const mockUserId = '22222222-2222-4222-8222-222222222222';
  const mockJob: Job<ScoringJobData> = {
    id: 'job-uuid-1',
    name: 'scoring-jobs',
    data: {
      sessionId: mockSessionId,
      userId: mockUserId,
    },
  } as unknown as Job<ScoringJobData>;

  beforeEach(() => {
    createQueueMock.mockReset();
    workMock.mockReset();
    findSessionForScoringMock.mockReset();
    updateSessionStatusMock.mockReset();
    saveScoringResultMock.mockReset();
    markSessionFailedMock.mockReset();
    findSessionResultMock.mockReset();
    getSessionOwnerUserIdMock.mockReset();

    workerService = new ScoringWorkerService(mockBoss, mockScoringRepo);
  });

  describe('onModuleInit', () => {
    it('should create queue and subscribe with concurrency 2', async () => {
      createQueueMock.mockResolvedValue(undefined);
      workMock.mockResolvedValue('handler-id');

      await workerService.onModuleInit();

      expect(createQueueMock).toHaveBeenCalledWith('scoring-jobs');
      expect(workMock).toHaveBeenCalledWith(
        'scoring-jobs',
        { localConcurrency: 2 },
        expect.any(Function),
      );
    });
  });

  describe('handleJob', () => {
    const mockContext: SessionScoringContext = {
      id: 10,
      publicId: mockSessionId,
      userId: 1,
      status: SessionStatus.SUBMITTED,
      cvParsedData: {
        summary: 'Dev',
        skills: {
          languages: ['TypeScript'],
          frameworks: ['NestJS'],
          databases: ['PostgreSQL'],
          tools: ['Docker'],
        },
        experiences: [],
        education: [],
        projects: [],
      },
      questions: [
        {
          id: 1,
          content: 'What is Clean Architecture?',
          orderIndex: 0,
          answer: {
            id: 1,
            transcript: 'Separation of concerns...',
            emotionSummary: null,
          },
        },
      ],
    };

    it('should successfully score session and save result via repository', async () => {
      findSessionForScoringMock.mockResolvedValue(ok(mockContext));
      updateSessionStatusMock.mockResolvedValue(ok(undefined));
      saveScoringResultMock.mockResolvedValue(ok(undefined));

      await workerService.handleJob(mockJob);

      expect(findSessionForScoringMock).toHaveBeenCalledWith(mockSessionId);
      expect(updateSessionStatusMock).toHaveBeenCalledWith(
        10,
        SessionStatus.SCORING,
      );
      expect(saveScoringResultMock).toHaveBeenCalledWith(
        10,
        expect.any(Score),
        expect.any(InterviewSummary),
      );

      const savedScore = saveScoringResultMock.mock.calls[0]?.[1];
      expect(savedScore).toBeDefined();
      if (savedScore) {
        expect(savedScore.contentScore).toBe(8.0);
        expect(savedScore.overallScore).toBe(7.6);
      }
    });

    it('should return early when session is not found in database', async () => {
      findSessionForScoringMock.mockResolvedValue(ok(null));

      await workerService.handleJob(mockJob);

      expect(findSessionForScoringMock).toHaveBeenCalledWith(mockSessionId);
      expect(updateSessionStatusMock).not.toHaveBeenCalled();
      expect(saveScoringResultMock).not.toHaveBeenCalled();
    });

    it('should throw error when repository findSessionForScoring fails', async () => {
      findSessionForScoringMock.mockResolvedValue(
        err(new Error('DB read error')),
      );

      await expect(workerService.handleJob(mockJob)).rejects.toThrow(
        'DB read error',
      );
      expect(saveScoringResultMock).not.toHaveBeenCalled();
    });

    it('should throw error when repository saveScoringResult fails', async () => {
      findSessionForScoringMock.mockResolvedValue(ok(mockContext));
      updateSessionStatusMock.mockResolvedValue(ok(undefined));
      saveScoringResultMock.mockResolvedValue(err(new Error('DB write error')));

      await expect(workerService.handleJob(mockJob)).rejects.toThrow(
        'DB write error',
      );
    });

    it('should delegate scoring to IScoringLlmProvider when provided', async () => {
      const mockEvaluation: ScoringLlmEvaluationResult = {
        contentScore: 9.0,
        relevanceScore: 8.5,
        confidenceScore: 8.0,
        overallScore: 8.6,
        overallFeedback: 'Excellent interview with deep knowledge',
        strengths: [
          {
            category: 'ARCHITECTURE',
            title: 'Clean Architecture',
            description: 'Understands layers and decoupling',
          },
        ],
        improvements: [
          {
            category: 'TIME_MANAGEMENT',
            title: 'Time pacing',
            description: 'Spend less time on intro',
          },
        ],
        scoringModel: 'gemini-2.5-pro',
        promptVersion: 'v2.0',
      };

      const evaluateSessionMock = jest
        .fn()
        .mockResolvedValue(ok(mockEvaluation));
      const mockLlmProvider: IScoringLlmProvider = {
        evaluateSession: evaluateSessionMock,
      };

      const workerWithLlm = new ScoringWorkerService(
        mockBoss,
        mockScoringRepo,
        mockLlmProvider,
      );

      findSessionForScoringMock.mockResolvedValue(ok(mockContext));
      updateSessionStatusMock.mockResolvedValue(ok(undefined));
      saveScoringResultMock.mockResolvedValue(ok(undefined));

      await workerWithLlm.handleJob(mockJob);

      expect(evaluateSessionMock).toHaveBeenCalledWith({
        sessionPublicId: mockSessionId,
        cvParsedData: mockContext.cvParsedData,
        questions: [
          {
            content: 'What is Clean Architecture?',
            orderIndex: 0,
            transcript: 'Separation of concerns...',
            emotionSummary: null,
          },
        ],
      });

      expect(saveScoringResultMock).toHaveBeenCalledWith(
        10,
        expect.any(Score),
        expect.any(InterviewSummary),
      );

      const savedScore = saveScoringResultMock.mock.calls[0]?.[1];
      const savedSummary = saveScoringResultMock.mock.calls[0]?.[2];

      expect(savedScore?.contentScore).toBe(9.0);
      expect(savedScore?.overallScore).toBe(8.6);
      expect(savedSummary?.scoringModel).toBe('gemini-2.5-pro');
      expect(savedSummary?.promptVersion).toBe('v2.0');
      expect(savedSummary?.overallFeedback).toBe(
        'Excellent interview with deep knowledge',
      );
    });

    it('should throw error when IScoringLlmProvider evaluation fails', async () => {
      const evaluateSessionMock = jest
        .fn()
        .mockResolvedValue(err(new Error('LLM rate limit reached')));
      const mockLlmProvider: IScoringLlmProvider = {
        evaluateSession: evaluateSessionMock,
      };

      const workerWithLlm = new ScoringWorkerService(
        mockBoss,
        mockScoringRepo,
        mockLlmProvider,
      );

      findSessionForScoringMock.mockResolvedValue(ok(mockContext));
      updateSessionStatusMock.mockResolvedValue(ok(undefined));

      await expect(workerWithLlm.handleJob(mockJob)).rejects.toThrow(
        'LLM rate limit reached',
      );
      expect(saveScoringResultMock).not.toHaveBeenCalled();
    });

    it('should call markSessionFailed on the final retry attempt (retrycount + 1 >= retrylimit)', async () => {
      const finalAttemptJob = {
        ...mockJob,
        retrycount: 2,
        retrylimit: 3,
      } as unknown as Job<ScoringJobData>;

      findSessionForScoringMock.mockResolvedValue(ok(mockContext));
      updateSessionStatusMock.mockResolvedValue(ok(undefined));
      saveScoringResultMock.mockResolvedValue(
        err(new Error('Fatal DB write error')),
      );
      markSessionFailedMock.mockResolvedValue(ok(undefined));

      await expect(workerService.handleJob(finalAttemptJob)).rejects.toThrow(
        'Fatal DB write error',
      );

      expect(markSessionFailedMock).toHaveBeenCalledWith(
        mockContext.id,
        'Fatal DB write error',
      );
    });

    it('should not call markSessionFailed on transient retryable failure before final attempt', async () => {
      const firstAttemptJob = {
        ...mockJob,
        retrycount: 0,
        retrylimit: 3,
      } as unknown as Job<ScoringJobData>;

      findSessionForScoringMock.mockResolvedValue(ok(mockContext));
      updateSessionStatusMock.mockResolvedValue(ok(undefined));
      saveScoringResultMock.mockResolvedValue(
        err(new Error('Transient DB timeout')),
      );

      await expect(workerService.handleJob(firstAttemptJob)).rejects.toThrow(
        'Transient DB timeout',
      );

      expect(markSessionFailedMock).not.toHaveBeenCalled();
    });

    it('should call markSessionFailed immediately when encountering non-retryable validation error', async () => {
      const firstAttemptJob = {
        ...mockJob,
        retrycount: 0,
        retrylimit: 3,
      } as unknown as Job<ScoringJobData>;

      const invalidEvaluation: ScoringLlmEvaluationResult = {
        contentScore: 999.0, // Invalid score > 10
        relevanceScore: 8.5,
        confidenceScore: 8.0,
        overallScore: 8.6,
        overallFeedback: 'Great answer',
        strengths: [],
        improvements: [],
        scoringModel: 'gemini-2.5-flash',
        promptVersion: 'v1.0',
      };

      const evaluateSessionMock = jest
        .fn()
        .mockResolvedValue(ok(invalidEvaluation));
      const mockLlmProvider: IScoringLlmProvider = {
        evaluateSession: evaluateSessionMock,
      };

      const workerWithLlm = new ScoringWorkerService(
        mockBoss,
        mockScoringRepo,
        mockLlmProvider,
      );

      findSessionForScoringMock.mockResolvedValue(ok(mockContext));
      updateSessionStatusMock.mockResolvedValue(ok(undefined));
      markSessionFailedMock.mockResolvedValue(ok(undefined));

      await expect(workerWithLlm.handleJob(firstAttemptJob)).rejects.toThrow(
        /must be between 0 and 10/i,
      );

      expect(markSessionFailedMock).toHaveBeenCalledWith(
        mockContext.id,
        expect.stringMatching(/must be between 0 and 10/i),
      );
    });

    it('should still rethrow the original error when markSessionFailed returns error', async () => {
      const finalAttemptJob = {
        ...mockJob,
        retrycount: 2,
        retrylimit: 3,
      } as unknown as Job<ScoringJobData>;

      findSessionForScoringMock.mockResolvedValue(ok(mockContext));
      updateSessionStatusMock.mockResolvedValue(ok(undefined));
      saveScoringResultMock.mockResolvedValue(
        err(new Error('Permanent failure')),
      );
      markSessionFailedMock.mockResolvedValue(
        err(new Error('Mark failed error')),
      );

      await expect(workerService.handleJob(finalAttemptJob)).rejects.toThrow(
        'Permanent failure',
      );

      expect(markSessionFailedMock).toHaveBeenCalledWith(
        mockContext.id,
        'Permanent failure',
      );
    });
  });
});
