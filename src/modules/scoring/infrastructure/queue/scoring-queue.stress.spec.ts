jest.mock('pg-boss', () => ({
  __esModule: true,
  PgBoss: jest.fn(),
  default: jest.fn(),
}));

import { ok, err } from 'neverthrow';
import type { Job, PgBoss } from 'pg-boss';
import { SessionStatus } from '../../../../../generated/prisma/enums';
import { IScoringLlmProvider } from '../../application/interfaces/scoring-llm.interface';
import { ScoringJobData } from '../../application/dtos/scoring.request.dto';
import {
  IScoringRepository,
  SessionScoringContext,
} from '../../domain/repositories/scoring.repo.interface';
import { ScoringWorkerService } from './scoring-worker.service';
import { SCORING_QUEUE_NAME } from './scoring-queue.service';

describe('ScoringQueue Stress & Resilience Test (20 Concurrent Jobs)', () => {
  const TOTAL_JOBS = 20;
  const CONCURRENCY_LIMIT = 2;

  const workMock = jest.fn();
  const sendMock = jest.fn();
  const createQueueMock = jest.fn();

  const findSessionForScoringMock = jest.fn();
  const updateSessionStatusMock = jest.fn();
  const saveScoringResultMock = jest.fn();
  const markSessionFailedMock = jest.fn();
  const findSessionResultMock = jest.fn();
  const getSessionOwnerUserIdMock = jest.fn();

  const evaluateSessionMock = jest.fn();

  const mockBoss = {
    work: workMock,
    send: sendMock,
    createQueue: createQueueMock,
  };

  const mockScoringRepo: IScoringRepository = {
    findSessionForScoring: findSessionForScoringMock,
    updateSessionStatus: updateSessionStatusMock,
    saveScoringResult: saveScoringResultMock,
    markSessionFailed: markSessionFailedMock,
    findSessionResult: findSessionResultMock,
    getSessionOwnerUserId: getSessionOwnerUserIdMock,
  };

  const mockLlmProvider: IScoringLlmProvider = {
    evaluateSession: evaluateSessionMock,
  };

  beforeEach(() => {
    workMock.mockReset();
    sendMock.mockReset();
    createQueueMock.mockReset().mockResolvedValue(undefined);

    findSessionForScoringMock.mockReset();
    updateSessionStatusMock.mockReset();
    saveScoringResultMock.mockReset();
    markSessionFailedMock.mockReset();
    findSessionResultMock.mockReset();
    getSessionOwnerUserIdMock.mockReset();

    evaluateSessionMock.mockReset();
  });

  it('safely processes 20 concurrent jobs strictly bounded by concurrency limit of 2', async () => {
    let currentConcurrentWorkers = 0;
    let maxObservedConcurrency = 0;
    const completedJobIds: string[] = [];
    const completedSessionIds: number[] = [];

    findSessionForScoringMock.mockImplementation((publicId: string) => {
      const id = parseInt(publicId.split('-')[1], 10);
      const context: SessionScoringContext = {
        id,
        publicId,
        userId: 100 + id,
        status: SessionStatus.SUBMITTED,
        cvParsedData: null,
        questions: [
          {
            id: id * 10 + 1,
            orderIndex: 0,
            content: 'What is IoC?',
            answer: {
              id: id * 100 + 1,
              transcript: 'Inversion of Control pattern',
              emotionSummary: null,
            },
          },
        ],
      };
      return Promise.resolve(ok(context));
    });

    updateSessionStatusMock.mockResolvedValue(ok(undefined));
    saveScoringResultMock.mockResolvedValue(ok(undefined));

    evaluateSessionMock.mockImplementation(async () => {
      currentConcurrentWorkers++;
      if (currentConcurrentWorkers > maxObservedConcurrency) {
        maxObservedConcurrency = currentConcurrentWorkers;
      }

      await new Promise((resolve) => setTimeout(resolve, 20));

      currentConcurrentWorkers--;
      return ok({
        contentScore: 8.5,
        relevanceScore: 8.0,
        confidenceScore: 7.5,
        overallScore: 8.0,
        overallFeedback: 'Concurrent processing successful',
        strengths: [
          {
            category: 'TECHNICAL_KNOWLEDGE',
            title: 'Solid architecture knowledge',
            description: 'Clear answers on system design.',
          },
        ],
        improvements: [
          {
            category: 'COMMUNICATION',
            title: 'Use structured STAR method',
            description: 'Detail actionable results.',
            suggestion: 'Add quantifiable metrics.',
          },
        ],
        scoringModel: 'gemini-3.8-flash',
        promptVersion: 'v1.0.0',
      });
    });

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'SCORING_WORKER_CONCURRENCY') return CONCURRENCY_LIMIT;
        if (key === 'SCORING_WORKER_PACING_MS') return 0;
        return defaultValue;
      }),
    };

    const workerService = new ScoringWorkerService(
      mockBoss as unknown as PgBoss,
      mockScoringRepo,
      mockLlmProvider,
      mockConfigService as never,
    );

    let registeredHandler:
      | ((jobs: Job<ScoringJobData>[]) => Promise<void>)
      | null = null;
    workMock.mockImplementation((_name, _options, handler) => {
      registeredHandler = handler as (
        jobs: Job<ScoringJobData>[],
      ) => Promise<void>;
      return Promise.resolve('work-subscription-id');
    });

    await workerService.onModuleInit();

    expect(workMock).toHaveBeenCalledWith(
      SCORING_QUEUE_NAME,
      { localConcurrency: CONCURRENCY_LIMIT },
      expect.any(Function),
    );
    expect(registeredHandler).not.toBeNull();

    const jobs: Job<ScoringJobData>[] = Array.from(
      { length: TOTAL_JOBS },
      (_, i) => {
        const idx = i + 1;
        return {
          id: `job-uuid-${idx}`,
          name: SCORING_QUEUE_NAME,
          data: {
            sessionId: `session-${idx}`,
            userId: `user-${idx}`,
            enqueuedAt: new Date().toISOString(),
          },
          retrycount: 0,
          retrylimit: 3,
        } as unknown as Job<ScoringJobData>;
      },
    );

    const pool = [...jobs];
    const activeTasks: Promise<void>[] = [];

    const dispatchNext = async () => {
      while (pool.length > 0) {
        const batch = pool.splice(0, CONCURRENCY_LIMIT);
        const task = registeredHandler!(batch).then(() => {
          batch.forEach((j) => {
            completedJobIds.push(j.id);
            const sid = parseInt(j.data.sessionId.split('-')[1], 10);
            completedSessionIds.push(sid);
          });
        });
        activeTasks.push(task);
        await task;
      }
    };

    await dispatchNext();
    await Promise.all(activeTasks);

    expect(completedJobIds).toHaveLength(TOTAL_JOBS);
    expect(completedSessionIds).toHaveLength(TOTAL_JOBS);

    const uniqueSessions = new Set(completedSessionIds);
    expect(uniqueSessions.size).toBe(TOTAL_JOBS);

    expect(maxObservedConcurrency).toBeLessThanOrEqual(CONCURRENCY_LIMIT);

    expect(updateSessionStatusMock).toHaveBeenCalledTimes(TOTAL_JOBS);
    expect(saveScoringResultMock).toHaveBeenCalledTimes(TOTAL_JOBS);
    expect(markSessionFailedMock).not.toHaveBeenCalled();
  });

  it('gracefully handles partial failures among 20 concurrent jobs without hanging or dropping unaffected jobs', async () => {
    const failedSessionIndices = new Set([3, 7, 12, 18]);
    const succeededSessionIds: number[] = [];
    const failedSessionIds: number[] = [];

    findSessionForScoringMock.mockImplementation((publicId: string) => {
      const id = parseInt(publicId.split('-')[1], 10);
      return Promise.resolve(
        ok({
          id,
          publicId,
          userId: 100 + id,
          status: SessionStatus.SUBMITTED,
          cvParsedData: null,
          questions: [],
        }),
      );
    });

    updateSessionStatusMock.mockResolvedValue(ok(undefined));
    saveScoringResultMock.mockResolvedValue(ok(undefined));
    markSessionFailedMock.mockImplementation((id: number) => {
      failedSessionIds.push(id);
      return Promise.resolve(ok(undefined));
    });

    evaluateSessionMock.mockImplementation(
      (payload: { sessionPublicId: string }) => {
        const id = parseInt(payload.sessionPublicId.split('-')[1], 10);
        if (failedSessionIndices.has(id)) {
          return Promise.resolve(
            err(
              new Error(`AI rate limit permanently exceeded for session ${id}`),
            ),
          );
        }
        return Promise.resolve(
          ok({
            contentScore: 8.0,
            relevanceScore: 8.0,
            confidenceScore: 8.0,
            overallScore: 8.0,
            overallFeedback: 'Feedback',
            strengths: [],
            improvements: [],
            scoringModel: 'gemini-3.8-flash',
            promptVersion: 'v1.0.0',
          }),
        );
      },
    );

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'SCORING_WORKER_CONCURRENCY') return CONCURRENCY_LIMIT;
        if (key === 'SCORING_WORKER_PACING_MS') return 0;
        return defaultValue;
      }),
    };

    const workerService = new ScoringWorkerService(
      mockBoss as unknown as PgBoss,
      mockScoringRepo,
      mockLlmProvider,
      mockConfigService as never,
    );

    let registeredHandler:
      | ((jobs: Job<ScoringJobData>[]) => Promise<void>)
      | null = null;
    workMock.mockImplementation((_name, _options, handler) => {
      registeredHandler = handler as (
        jobs: Job<ScoringJobData>[],
      ) => Promise<void>;
      return Promise.resolve('work-subscription-id');
    });

    await workerService.onModuleInit();

    const jobs: Job<ScoringJobData>[] = Array.from(
      { length: TOTAL_JOBS },
      (_, i) => {
        const idx = i + 1;
        return {
          id: `job-uuid-${idx}`,
          name: SCORING_QUEUE_NAME,
          data: {
            sessionId: `session-${idx}`,
            userId: `user-${idx}`,
            enqueuedAt: new Date().toISOString(),
          },
          retrycount: 2,
          retrylimit: 3,
        } as unknown as Job<ScoringJobData>;
      },
    );

    for (const job of jobs) {
      try {
        await registeredHandler!([job]);
        const id = parseInt(job.data.sessionId.split('-')[1], 10);
        succeededSessionIds.push(id);
      } catch (err) {
        void err;
      }
    }

    expect(succeededSessionIds).toHaveLength(
      TOTAL_JOBS - failedSessionIndices.size,
    );
    expect(failedSessionIds).toHaveLength(failedSessionIndices.size);
    expect(failedSessionIds.sort((a, b) => a - b)).toEqual(
      Array.from(failedSessionIndices).sort((a, b) => a - b),
    );
  });
});
