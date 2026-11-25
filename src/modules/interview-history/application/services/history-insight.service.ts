import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import { HISTORY_INSIGHT_LIMITS } from '../../domain/constants/history-insight.constants';
import {
  canGenerateInsight,
  countFeedbackCategories,
  isInsightCurrent,
} from '../../domain/history-insight.rules';
import {
  HistoryFingerprint,
  HistoryInsightData,
  IHistoryInsightRepository,
} from '../../domain/repositories/history-insight.repo.interface';
import { IInsightRateLimiter } from '../../domain/repositories/insight-rate-limiter.interface';
import {
  HistoryInsightDto,
  HistoryInsightStateDto,
} from '../dtos/history-insight.response.dto';
import { IHistoryInsightLlm } from '../interfaces/history-insight-llm.interface';
import { IHistoryInsightService } from '../interfaces/history-insight.service.interface';
import { IInterviewStatsService } from '../interfaces/interview-stats.service.interface';

const MIN_SESSIONS = HISTORY_INSIGHT_LIMITS.minCompletedSessions;

@Injectable()
export class HistoryInsightService implements IHistoryInsightService {
  constructor(
    private readonly insightRepo: IHistoryInsightRepository,
    private readonly statsService: IInterviewStatsService,
    private readonly insightLlm: IHistoryInsightLlm,
    private readonly rateLimiter: IInsightRateLimiter,
  ) {}

  async getInsightAsync(
    userPublicId: string,
  ): Promise<Result<HistoryInsightStateDto, AppError>> {
    const [fingerprint, insight] = await Promise.all([
      this.insightRepo.getHistoryFingerprint(userPublicId),
      this.insightRepo.findInsight(userPublicId),
    ]);
    if (fingerprint.isErr() || insight.isErr()) {
      return err(loadError());
    }
    return ok(toInsightState(fingerprint.value, insight.value));
  }

  async generateInsightAsync(
    userPublicId: string,
  ): Promise<Result<HistoryInsightStateDto, AppError>> {
    const fingerprintResult =
      await this.insightRepo.getHistoryFingerprint(userPublicId);
    if (fingerprintResult.isErr()) return err(generateError());
    const fingerprint = fingerprintResult.value;

    if (!canGenerateInsight(fingerprint, MIN_SESSIONS)) {
      return err(
        new AppError(
          ErrorCode.BadRequest,
          `At least ${MIN_SESSIONS} completed interviews are needed to generate an insight`,
        ),
      );
    }

    // Lịch sử không đổi thì nhận xét cũ vẫn đúng: trả lại, không gọi LLM và
    // không tốn lượt của rate limit.
    const existing = await this.insightRepo.findInsight(userPublicId);
    if (existing.isErr()) return err(generateError());
    if (existing.value && isInsightCurrent(existing.value, fingerprint)) {
      return ok(toInsightState(fingerprint, existing.value));
    }

    // Không đọc được Redis thì từ chối luôn thay vì gọi LLM không giới hạn.
    const acquired = await this.rateLimiter.tryAcquire(userPublicId);
    if (acquired.isErr()) return err(generateError());
    if (!acquired.value) {
      return err(
        new AppError(
          ErrorCode.TooManyRequests,
          'Too many insight requests, please try again later',
        ),
      );
    }

    // Cùng nguồn số với biểu đồ dashboard, để con số trong nhận xét khớp UI.
    const stats = await this.statsService.getInterviewStatsAsync(userPublicId, {
      limit: HISTORY_INSIGHT_LIMITS.maxSessionsInPrompt,
    });
    if (stats.isErr()) return err(generateError());

    const sessions = await this.insightRepo.getInsightSessions(
      userPublicId,
      HISTORY_INSIGHT_LIMITS.maxSessionsInPrompt,
    );
    if (sessions.isErr()) return err(generateError());

    const generated = await this.insightLlm.generateInsight({
      stats: stats.value,
      sessions: sessions.value,
      categoryCounts: countFeedbackCategories(sessions.value),
    });
    if (generated.isErr()) {
      // Nhận xét cũ (nếu có) vẫn nằm nguyên trong database.
      return err(
        generated.error.code === ErrorCode.TooManyRequests
          ? new AppError(
              ErrorCode.TooManyRequests,
              'AI provider is busy, please try again later',
            )
          : generateError(),
      );
    }

    // Lưu dấu vân tay đọc ở đầu request: nếu có buổi mới chấm xong trong lúc chờ
    // LLM thì lần đọc sau thấy isStale = true, đúng với thực tế.
    const saved = await this.insightRepo.saveInsight(userPublicId, {
      overallFeedback: generated.value.overallFeedback,
      strengths: generated.value.strengths,
      weaknesses: generated.value.weaknesses,
      recommendations: generated.value.recommendations,
      basedOnSessionCount: fingerprint.completedSessions,
      lastSessionCompletedAt: fingerprint.lastCompletedAt,
      llmModel: generated.value.model,
      promptVersion: generated.value.promptVersion,
      generatedAt: new Date(),
    });
    if (saved.isErr()) return err(generateError());
    if (saved.value === null) {
      return err(new AppError(ErrorCode.NotFound, 'User not found'));
    }

    return ok(toInsightState(fingerprint, saved.value));
  }
}

function loadError(): AppError {
  return new AppError(
    ErrorCode.InternalServerError,
    'Failed to load the insight',
  );
}

function generateError(): AppError {
  return new AppError(
    ErrorCode.InternalServerError,
    'Failed to generate the insight',
  );
}

function toInsightState(
  fingerprint: HistoryFingerprint,
  insight: HistoryInsightData | null,
): HistoryInsightStateDto {
  return {
    completedSessions: fingerprint.completedSessions,
    minCompletedSessions: MIN_SESSIONS,
    canGenerate: canGenerateInsight(fingerprint, MIN_SESSIONS),
    isStale: insight !== null && !isInsightCurrent(insight, fingerprint),
    insight: insight ? toInsightDto(insight) : null,
  };
}

function toInsightDto(insight: HistoryInsightData): HistoryInsightDto {
  return {
    overallFeedback: insight.overallFeedback,
    strengths: insight.strengths.map((item) => ({ ...item })),
    weaknesses: insight.weaknesses.map((item) => ({ ...item })),
    recommendations: insight.recommendations.map((item) => ({ ...item })),
    basedOnSessionCount: insight.basedOnSessionCount,
    generatedAt: insight.generatedAt.toISOString(),
  };
}
