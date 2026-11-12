jest.mock('pg-boss', () => ({
  __esModule: true,
  PgBoss: jest.fn(),
  default: jest.fn(),
}));

import { ConfigService } from '@nestjs/config';
import { ok, err } from 'neverthrow';
import { SessionStatus } from '../../../../../generated/prisma/enums';
import type { Job, PgBoss } from 'pg-boss';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
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

  const defaultEvaluation: ScoringLlmEvaluationResult = {
    contentScore: 8.5,
    relevanceScore: 8.0,
    confidenceScore: 7.5,
    overallScore: 8.1,
    overallFeedback:
      'Ứng viên nắm vững kiến thức chuyên môn và trả lời đúng trọng tâm.',
    strengths: [
      {
        category: 'TECHNICAL_KNOWLEDGE',
        title: 'Nắm vững Clean Architecture',
        description: 'Hiểu rõ nguyên tắc phân tầng và đảo ngược phụ thuộc.',
      },
    ],
    improvements: [
      {
        category: 'COMMUNICATION',
        title: 'Bổ sung dẫn chứng định lượng',
        description: 'Nên nêu số liệu cụ thể khi trình bày kết quả.',
        suggestion: 'Áp dụng mô hình STAR.',
      },
    ],
    scoringModel: 'gemini-3.8-flash',
    promptVersion: 'v2.0',
    provider: 'gemini',
    latencyMs: 1120,
    inputTokens: 750,
    outputTokens: 310,
  };

  const evaluateSessionMock = jest.fn<
    ReturnType<IScoringLlmProvider['evaluateSession']>,
    Parameters<IScoringLlmProvider['evaluateSession']>
  >();

  const mockLlmProvider: IScoringLlmProvider = {
    evaluateSession: evaluateSessionMock,
  };

  const mockSessionId = '11111111-1111-4111-8111-111111111111';
  const mockUserId = '22222222-2222-4222-8222-222222222222';
  const mockJob: Job<ScoringJobData> = {
    id: 'job-uuid-1',
    name: 'scoring-jobs',
    data: {
      sessionId: mockSessionId,
      userId: mockUserId,
      enqueuedAt: '2026-10-19T10:00:00.000Z',
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
    evaluateSessionMock.mockReset().mockResolvedValue(ok(defaultEvaluation));

    workerService = new ScoringWorkerService(
      mockBoss,
      mockScoringRepo,
      mockLlmProvider,
    );
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

    it('should read custom concurrency from ConfigService', async () => {
      createQueueMock.mockResolvedValue(undefined);
      workMock.mockResolvedValue('handler-id');

      const mockConfigService = {
        get: jest
          .fn()
          .mockImplementation((key: string, defaultValue?: unknown) => {
            if (key === 'SCORING_WORKER_CONCURRENCY') return '4';
            if (key === 'SCORING_WORKER_PACING_MS') return '1500';
            return defaultValue;
          }),
      };

      const workerWithConfig = new ScoringWorkerService(
        mockBoss,
        mockScoringRepo,
        mockLlmProvider,
        mockConfigService as unknown as ConfigService,
      );

      await workerWithConfig.onModuleInit();

      expect(workMock).toHaveBeenCalledWith(
        'scoring-jobs',
        { localConcurrency: 4 },
        expect.any(Function),
      );
    });

    it('should apply pacing delay when processing consecutive jobs with pacingMs configured', async () => {
      createQueueMock.mockResolvedValue(undefined);
      let capturedHandler:
        | ((jobs: Job<ScoringJobData>[]) => Promise<void>)
        | undefined;
      workMock.mockImplementation((_queue, _options, handler) => {
        capturedHandler = handler;
        return Promise.resolve('handler-id');
      });

      const mockConfigService = {
        get: jest
          .fn()
          .mockImplementation((key: string, defaultValue?: unknown) => {
            if (key === 'SCORING_WORKER_PACING_MS') return 50;
            return defaultValue;
          }),
      };

      const workerWithPacing = new ScoringWorkerService(
        mockBoss,
        mockScoringRepo,
        mockLlmProvider,
        mockConfigService as unknown as ConfigService,
      );

      await workerWithPacing.onModuleInit();
      expect(capturedHandler).toBeDefined();

      findSessionForScoringMock.mockResolvedValue(ok(null));

      const job1 = { ...mockJob, id: 'job-1' };
      const job2 = { ...mockJob, id: 'job-2' };

      const startTime = Date.now();
      await capturedHandler!([job1, job2]);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });

  describe('handleJob', () => {
    const mockContext: SessionScoringContext = {
      id: 10,
      publicId: mockSessionId,
      userId: 1,
      status: SessionStatus.SUBMITTED,
      title: 'Backend Engineer Interview',
      jobDescription: 'Require NestJS, TypeScript, and PostgreSQL.',
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
          orderIndex: 1,
          domain: 'TECHNICAL',
          difficulty: 'MEDIUM',
          answer: {
            id: 1,
            transcript: 'Separation of concerns...',
            emotionSummary: {
              dominant: 'neutral',
              distribution: { neutral: 0.9 },
            },
            durationSeconds: 70,
          },
        },
      ],
    };

    it('should evaluate session via IScoringLlmProvider with full extended context and save result via repository', async () => {
      findSessionForScoringMock.mockResolvedValue(ok(mockContext));
      updateSessionStatusMock.mockResolvedValue(ok(undefined));
      saveScoringResultMock.mockResolvedValue(ok(undefined));

      await workerService.handleJob(mockJob);

      expect(findSessionForScoringMock).toHaveBeenCalledWith(mockSessionId);
      expect(updateSessionStatusMock).toHaveBeenCalledWith(
        10,
        SessionStatus.SCORING,
      );
      expect(evaluateSessionMock).toHaveBeenCalledWith({
        sessionPublicId: mockSessionId,
        title: 'Backend Engineer Interview',
        jobDescription: 'Require NestJS, TypeScript, and PostgreSQL.',
        cvParsedData: mockContext.cvParsedData,
        questions: [
          {
            content: 'What is Clean Architecture?',
            orderIndex: 1,
            domain: 'TECHNICAL',
            difficulty: 'MEDIUM',
            transcript: 'Separation of concerns...',
            emotionSummary: {
              dominant: 'neutral',
              distribution: { neutral: 0.9 },
            },
            durationSeconds: 70,
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
      expect(savedScore?.contentScore).toBe(8.5);
      expect(savedScore?.overallScore).toBe(8.1);
      expect(savedSummary?.scoringModel).toBe('gemini-3.8-flash');
      expect(savedSummary?.promptVersion).toBe('v2.0');
    });

    it('should return early when session is not found in database', async () => {
      findSessionForScoringMock.mockResolvedValue(ok(null));

      await workerService.handleJob(mockJob);

      expect(findSessionForScoringMock).toHaveBeenCalledWith(mockSessionId);
      expect(updateSessionStatusMock).not.toHaveBeenCalled();
      expect(evaluateSessionMock).not.toHaveBeenCalled();
      expect(saveScoringResultMock).not.toHaveBeenCalled();
    });

    it.each([SessionStatus.COMPLETED, SessionStatus.CANCELLED])(
      'should safely skip job (idempotent no-op) when session is already in %s status',
      async (terminalStatus) => {
        findSessionForScoringMock.mockResolvedValue(
          ok({
            ...mockContext,
            status: terminalStatus,
          }),
        );

        await workerService.handleJob(mockJob);

        expect(updateSessionStatusMock).not.toHaveBeenCalled();
        expect(evaluateSessionMock).not.toHaveBeenCalled();
        expect(saveScoringResultMock).not.toHaveBeenCalled();
        expect(markSessionFailedMock).not.toHaveBeenCalled();
      },
    );

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

    it('should call markSessionFailed immediately on first attempt (retrycount: 0) when evaluateSession returns AppError(BadRequest)', async () => {
      const firstAttemptJob = {
        ...mockJob,
        retrycount: 0,
        retrylimit: 3,
      } as unknown as Job<ScoringJobData>;

      findSessionForScoringMock.mockResolvedValue(ok(mockContext));
      updateSessionStatusMock.mockResolvedValue(ok(undefined));
      evaluateSessionMock.mockResolvedValue(
        err(new AppError(ErrorCode.BadRequest, 'Rejected by safety filter')),
      );
      markSessionFailedMock.mockResolvedValue(ok(undefined));

      await expect(workerService.handleJob(firstAttemptJob)).rejects.toThrow(
        'Rejected by safety filter',
      );

      expect(markSessionFailedMock).toHaveBeenCalledWith(
        mockContext.id,
        'Rejected by safety filter',
      );
      expect(saveScoringResultMock).not.toHaveBeenCalled();
    });

    it('should NOT call markSessionFailed on first attempt when evaluateSession returns retryable AppError(TooManyRequests)', async () => {
      const firstAttemptJob = {
        ...mockJob,
        retrycount: 0,
        retrylimit: 3,
      } as unknown as Job<ScoringJobData>;

      findSessionForScoringMock.mockResolvedValue(ok(mockContext));
      updateSessionStatusMock.mockResolvedValue(ok(undefined));
      evaluateSessionMock.mockResolvedValue(
        err(new AppError(ErrorCode.TooManyRequests, 'Rate limited')),
      );

      await expect(workerService.handleJob(firstAttemptJob)).rejects.toThrow(
        'Rate limited',
      );

      expect(markSessionFailedMock).not.toHaveBeenCalled();
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

    it('should call markSessionFailed immediately when encountering non-retryable domain validation error', async () => {
      const firstAttemptJob = {
        ...mockJob,
        retrycount: 0,
        retrylimit: 3,
      } as unknown as Job<ScoringJobData>;

      const invalidEvaluation: ScoringLlmEvaluationResult = {
        contentScore: 999.0,
        relevanceScore: 8.5,
        confidenceScore: 8.0,
        overallScore: 8.6,
        overallFeedback: 'Great answer',
        strengths: [],
        improvements: [],
        scoringModel: 'gemini-3.8-flash',
        promptVersion: 'v2.0',
      };

      evaluateSessionMock.mockResolvedValue(ok(invalidEvaluation));
      findSessionForScoringMock.mockResolvedValue(ok(mockContext));
      updateSessionStatusMock.mockResolvedValue(ok(undefined));
      markSessionFailedMock.mockResolvedValue(ok(undefined));

      await expect(workerService.handleJob(firstAttemptJob)).rejects.toThrow(
        /must be between 0 and 10/i,
      );

      expect(markSessionFailedMock).toHaveBeenCalledWith(
        mockContext.id,
        expect.stringMatching(/must be between 0 and 10/i),
      );
    });

    it('should fail immediately instead of saving mock scores when IScoringLlmProvider is not provided', async () => {
      const workerWithoutLlm = new ScoringWorkerService(
        mockBoss,
        mockScoringRepo,
        undefined as unknown as IScoringLlmProvider,
      );

      const firstAttemptJob = {
        ...mockJob,
        retrycount: 0,
        retrylimit: 3,
      } as unknown as Job<ScoringJobData>;

      findSessionForScoringMock.mockResolvedValue(ok(mockContext));
      updateSessionStatusMock.mockResolvedValue(ok(undefined));
      markSessionFailedMock.mockResolvedValue(ok(undefined));

      await expect(workerWithoutLlm.handleJob(firstAttemptJob)).rejects.toThrow(
        /IScoringLlmProvider is not configured/i,
      );

      expect(saveScoringResultMock).not.toHaveBeenCalled();
      expect(markSessionFailedMock).toHaveBeenCalledWith(
        mockContext.id,
        expect.stringMatching(/IScoringLlmProvider is not configured/i),
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
