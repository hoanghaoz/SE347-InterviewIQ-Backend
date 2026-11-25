import { err, ok } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import { FeedbackCategory } from '../../../scoring/domain/enums/scoring-enum';
import { HISTORY_INSIGHT_LIMITS } from '../../domain/constants/history-insight.constants';
import type {
  HistoryFingerprint,
  HistoryInsightData,
  InsightSessionData,
} from '../../domain/repositories/history-insight.repo.interface';
import type { InterviewStatsDto } from '../dtos/interview-stats.response.dto';
import { HistoryInsightService } from './history-insight.service';

describe('HistoryInsightService', () => {
  const insightRepo = {
    getHistoryFingerprint: jest.fn(),
    getInsightSessions: jest.fn(),
    findInsight: jest.fn(),
    saveInsight: jest.fn(),
  };
  const statsService = { getInterviewStatsAsync: jest.fn() };
  const insightLlm = { generateInsight: jest.fn() };
  const rateLimiter = { tryAcquire: jest.fn() };
  const service = new HistoryInsightService(
    insightRepo,
    statsService,
    insightLlm,
    rateLimiter,
  );

  const userPublicId = '00000000-0000-4000-8000-000000000001';
  const lastCompletedAt = new Date('2026-10-20T08:14:02.000Z');

  const fingerprint = (completedSessions: number): HistoryFingerprint => ({
    completedSessions,
    lastCompletedAt,
  });

  const storedInsight = (
    overrides: Partial<HistoryInsightData> = {},
  ): HistoryInsightData => ({
    overallFeedback: 'Tiến bộ đều.',
    strengths: [],
    weaknesses: [
      { category: 'COMMUNICATION', title: 'Dài dòng', description: 'Đi vòng' },
    ],
    recommendations: [{ title: 'STAR', description: 'Luyện kể chuyện' }],
    basedOnSessionCount: 3,
    lastSessionCompletedAt: lastCompletedAt,
    generatedAt: new Date('2026-10-21T00:00:00.000Z'),
    ...overrides,
  });

  const insightDto = (data: HistoryInsightData) => ({
    overallFeedback: data.overallFeedback,
    strengths: data.strengths,
    weaknesses: data.weaknesses,
    recommendations: data.recommendations,
    basedOnSessionCount: data.basedOnSessionCount,
    generatedAt: data.generatedAt.toISOString(),
  });

  const stats: InterviewStatsDto = {
    maxScore: 10,
    completedSessions: 4,
    answeredQuestions: 16,
    averages: null,
    best: null,
    trend: [],
    comparison: null,
  };

  const session = (
    overrides: Partial<InsightSessionData> = {},
  ): InsightSessionData => ({
    title: 'Session',
    createdAt: new Date('2026-10-01T08:00:00.000Z'),
    contentScore: 7,
    relevanceScore: 7,
    confidenceScore: 7,
    overallScore: 7,
    isRuleBased: false,
    strengths: [],
    improvements: [],
    ...overrides,
  });

  const generated = {
    overallFeedback: 'Mới',
    strengths: [],
    weaknesses: [
      {
        category: 'CONFIDENCE',
        title: 'Thiếu tự tin',
        description: 'Ngập ngừng',
      },
    ],
    recommendations: [],
    model: 'gemini-2.5-flash',
    promptVersion: 'v1.0',
    provider: 'gemini',
    latencyMs: 900,
  };

  // Lịch sử có 4 buổi, nhận xét đang lưu dựa trên 3 buổi: cần tạo lại.
  const mockStaleHistory = () => {
    insightRepo.getHistoryFingerprint.mockResolvedValue(ok(fingerprint(4)));
    insightRepo.findInsight.mockResolvedValue(ok(storedInsight()));
    rateLimiter.tryAcquire.mockResolvedValue(ok(true));
    statsService.getInterviewStatsAsync.mockResolvedValue(ok(stats));
    insightRepo.getInsightSessions.mockResolvedValue(ok([session()]));
    insightLlm.generateInsight.mockResolvedValue(ok(generated));
    insightRepo.saveInsight.mockImplementation(
      (_user: string, insight: HistoryInsightData) =>
        Promise.resolve(ok(insight)),
    );
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getInsightAsync', () => {
    it('returns no insight and canGenerate=false before enough sessions', async () => {
      insightRepo.getHistoryFingerprint.mockResolvedValue(ok(fingerprint(1)));
      insightRepo.findInsight.mockResolvedValue(ok(null));

      const result = await service.getInsightAsync(userPublicId);

      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({
        completedSessions: 1,
        minCompletedSessions: HISTORY_INSIGHT_LIMITS.minCompletedSessions,
        canGenerate: false,
        isStale: false,
        insight: null,
      });
    });

    it('returns the stored insight as current when history is unchanged', async () => {
      const stored = storedInsight();
      insightRepo.getHistoryFingerprint.mockResolvedValue(ok(fingerprint(3)));
      insightRepo.findInsight.mockResolvedValue(ok(stored));

      const result = await service.getInsightAsync(userPublicId);

      if (result.isErr()) throw result.error;
      expect(result.value).toMatchObject({
        completedSessions: 3,
        canGenerate: true,
        isStale: false,
        insight: insightDto(stored),
      });
    });

    it('flags the stored insight as stale after a new completed session', async () => {
      insightRepo.getHistoryFingerprint.mockResolvedValue(ok(fingerprint(4)));
      insightRepo.findInsight.mockResolvedValue(ok(storedInsight()));

      const result = await service.getInsightAsync(userPublicId);

      if (result.isErr()) throw result.error;
      expect(result.value.isStale).toBe(true);
    });

    it('never calls the AI', async () => {
      insightRepo.getHistoryFingerprint.mockResolvedValue(ok(fingerprint(4)));
      insightRepo.findInsight.mockResolvedValue(ok(storedInsight()));

      await service.getInsightAsync(userPublicId);

      expect(insightLlm.generateInsight).not.toHaveBeenCalled();
      expect(rateLimiter.tryAcquire).not.toHaveBeenCalled();
    });

    it('returns a generic 500 when the repository fails', async () => {
      insightRepo.getHistoryFingerprint.mockResolvedValue(ok(fingerprint(4)));
      insightRepo.findInsight.mockResolvedValue(err(new Error('db')));

      const result = await service.getInsightAsync(userPublicId);

      if (result.isOk()) throw new Error('Expected an error');
      expect(result.error.code).toBe(ErrorCode.InternalServerError);
      expect(result.error.message).toBe('Failed to load the insight');
    });
  });

  describe('generateInsightAsync', () => {
    it('rejects a history below the minimum without touching the AI or the limit', async () => {
      insightRepo.getHistoryFingerprint.mockResolvedValue(ok(fingerprint(1)));

      const result = await service.generateInsightAsync(userPublicId);

      if (result.isOk()) throw new Error('Expected an error');
      expect(result.error.code).toBe(ErrorCode.BadRequest);
      expect(result.error.message).toBe(
        'At least 2 completed interviews are needed to generate an insight',
      );
      expect(rateLimiter.tryAcquire).not.toHaveBeenCalled();
      expect(insightLlm.generateInsight).not.toHaveBeenCalled();
    });

    it('returns the stored insight without calling the AI when history is unchanged', async () => {
      const stored = storedInsight();
      insightRepo.getHistoryFingerprint.mockResolvedValue(ok(fingerprint(3)));
      insightRepo.findInsight.mockResolvedValue(ok(stored));

      const result = await service.generateInsightAsync(userPublicId);

      if (result.isErr()) throw result.error;
      expect(result.value.insight).toEqual(insightDto(stored));
      expect(result.value.isStale).toBe(false);
      // Lấy lại bản cũ không tốn lượt rate limit
      expect(rateLimiter.tryAcquire).not.toHaveBeenCalled();
      expect(insightLlm.generateInsight).not.toHaveBeenCalled();
      expect(insightRepo.saveInsight).not.toHaveBeenCalled();
    });

    it('generates and saves a new insight with the history fingerprint', async () => {
      mockStaleHistory();

      const result = await service.generateInsightAsync(userPublicId);

      if (result.isErr()) throw result.error;
      expect(insightRepo.saveInsight).toHaveBeenCalledWith(
        userPublicId,
        expect.objectContaining({
          overallFeedback: 'Mới',
          weaknesses: generated.weaknesses,
          basedOnSessionCount: 4,
          lastSessionCompletedAt: lastCompletedAt,
          llmModel: 'gemini-2.5-flash',
          promptVersion: 'v1.0',
        }),
      );
      expect(result.value).toMatchObject({
        completedSessions: 4,
        isStale: false,
        insight: { overallFeedback: 'Mới', basedOnSessionCount: 4 },
      });
    });

    it('generates the first insight when none is stored', async () => {
      mockStaleHistory();
      insightRepo.findInsight.mockResolvedValue(ok(null));

      const result = await service.generateInsightAsync(userPublicId);

      expect(result.isOk()).toBe(true);
      expect(insightLlm.generateInsight).toHaveBeenCalledTimes(1);
    });

    it('feeds the AI with the dashboard stats and the recent sessions', async () => {
      mockStaleHistory();
      const sessions = [
        session({
          improvements: [
            {
              category: FeedbackCategory.COMMUNICATION,
              title: 'T',
              description: 'D',
            },
          ],
        }),
        // Buổi bỏ trống không được đếm vào tần suất
        session({
          isRuleBased: true,
          improvements: [
            {
              category: FeedbackCategory.COMMUNICATION,
              title: 'T',
              description: 'D',
            },
          ],
        }),
      ];
      insightRepo.getInsightSessions.mockResolvedValue(ok(sessions));

      await service.generateInsightAsync(userPublicId);

      expect(statsService.getInterviewStatsAsync).toHaveBeenCalledWith(
        userPublicId,
        { limit: HISTORY_INSIGHT_LIMITS.maxSessionsInPrompt },
      );
      expect(insightRepo.getInsightSessions).toHaveBeenCalledWith(
        userPublicId,
        HISTORY_INSIGHT_LIMITS.maxSessionsInPrompt,
      );
      expect(insightLlm.generateInsight).toHaveBeenCalledWith({
        stats,
        sessions,
        categoryCounts: expect.objectContaining({
          countedSessions: 1,
          improvements: expect.objectContaining({
            [FeedbackCategory.COMMUNICATION]: 1,
          }) as unknown,
        }) as unknown,
      });
    });

    it('returns 429 when the user exhausted the generation limit', async () => {
      mockStaleHistory();
      rateLimiter.tryAcquire.mockResolvedValue(ok(false));

      const result = await service.generateInsightAsync(userPublicId);

      if (result.isOk()) throw new Error('Expected an error');
      expect(result.error.code).toBe(ErrorCode.TooManyRequests);
      expect(result.error.message).toBe(
        'Too many insight requests, please try again later',
      );
      expect(insightLlm.generateInsight).not.toHaveBeenCalled();
    });

    // Không kiểm được giới hạn thì không gọi AI
    it('fails closed when the limiter cannot be reached', async () => {
      mockStaleHistory();
      rateLimiter.tryAcquire.mockResolvedValue(err(new Error('redis down')));

      const result = await service.generateInsightAsync(userPublicId);

      if (result.isOk()) throw new Error('Expected an error');
      expect(result.error.code).toBe(ErrorCode.InternalServerError);
      expect(insightLlm.generateInsight).not.toHaveBeenCalled();
    });

    it('maps a busy AI provider to 429 and keeps the stored insight', async () => {
      mockStaleHistory();
      insightLlm.generateInsight.mockResolvedValue(
        err(new AppError(ErrorCode.TooManyRequests, 'vendor quota exceeded')),
      );

      const result = await service.generateInsightAsync(userPublicId);

      if (result.isOk()) throw new Error('Expected an error');
      expect(result.error.code).toBe(ErrorCode.TooManyRequests);
      expect(result.error.message).toBe(
        'AI provider is busy, please try again later',
      );
      expect(insightRepo.saveInsight).not.toHaveBeenCalled();
    });

    it('hides other AI failures behind a generic 500', async () => {
      mockStaleHistory();
      insightLlm.generateInsight.mockResolvedValue(
        err(
          new AppError(
            ErrorCode.InternalServerError,
            'AI provider returned an invalid insight',
          ),
        ),
      );

      const result = await service.generateInsightAsync(userPublicId);

      if (result.isOk()) throw new Error('Expected an error');
      expect(result.error.code).toBe(ErrorCode.InternalServerError);
      expect(result.error.message).toBe('Failed to generate the insight');
      expect(insightRepo.saveInsight).not.toHaveBeenCalled();
    });

    it('returns 404 when the user disappeared before saving', async () => {
      mockStaleHistory();
      insightRepo.saveInsight.mockResolvedValue(ok(null));

      const result = await service.generateInsightAsync(userPublicId);

      if (result.isOk()) throw new Error('Expected an error');
      expect(result.error.code).toBe(ErrorCode.NotFound);
    });

    it('returns a generic 500 when saving fails', async () => {
      mockStaleHistory();
      insightRepo.saveInsight.mockResolvedValue(err(new Error('db')));

      const result = await service.generateInsightAsync(userPublicId);

      if (result.isOk()) throw new Error('Expected an error');
      expect(result.error.code).toBe(ErrorCode.InternalServerError);
      expect(result.error.message).toBe('Failed to generate the insight');
    });
  });
});
