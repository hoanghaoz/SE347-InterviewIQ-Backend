import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import { SCORING_LIMITS } from '../../../scoring/domain/constants/scoring.constants';
import {
  roundScores,
  subtractScores,
} from '../../domain/interview-stats.calculator';
import {
  IInterviewStatsRepository,
  InterviewStatsData,
  InterviewStatsScores,
  InterviewStatsSessionData,
} from '../../domain/repositories/interview-stats.repo.interface';
import { InterviewStatsQueryDto } from '../dtos/interview-stats.request.dto';
import {
  InterviewStatsDto,
  InterviewStatsScoresDto,
  InterviewStatsSessionDto,
} from '../dtos/interview-stats.response.dto';
import { IInterviewStatsService } from '../interfaces/interview-stats.service.interface';

// Phần so sánh cần buổi mới nhất và buổi liền trước.
const COMPARISON_SESSIONS = 2;

@Injectable()
export class InterviewStatsService implements IInterviewStatsService {
  constructor(private readonly interviewStatsRepo: IInterviewStatsRepository) {}

  async getInterviewStatsAsync(
    userPublicId: string,
    query: InterviewStatsQueryDto,
  ): Promise<Result<InterviewStatsDto, AppError>> {
    // Cùng luật với màn danh sách: khoảng ngày ngược luôn ra rỗng, nên báo 400
    // thay vì để client tưởng là chưa có buổi nào.
    const fromDate =
      query.fromDate === undefined ? undefined : new Date(query.fromDate);
    const toDate =
      query.toDate === undefined ? undefined : new Date(query.toDate);
    if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
      return err(
        new AppError(
          ErrorCode.BadRequest,
          'fromDate must be before or equal to toDate',
        ),
      );
    }

    // Lấy ít nhất 2 buổi để phần so sánh luôn có buổi liền trước, kể cả khi
    // client chỉ xin trend 1 điểm.
    const result = await this.interviewStatsRepo.getInterviewStats(
      userPublicId,
      { fromDate, toDate },
      Math.max(query.limit, COMPARISON_SESSIONS),
    );
    if (result.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to load the interview stats',
        ),
      );
    }

    return ok(toInterviewStatsDto(result.value, query.limit));
  }
}

function toInterviewStatsDto(
  data: InterviewStatsData,
  trendLimit: number,
): InterviewStatsDto {
  const [latest, previous] = data.recent;
  return {
    maxScore: SCORING_LIMITS.maxScore,
    completedSessions: data.completedSessions,
    answeredQuestions: data.answeredQuestions,
    averages: data.averages ? toScoresDto(roundScores(data.averages)) : null,
    best: data.best ? toSessionDto(data.best) : null,
    // Repo trả mới nhất trước; biểu đồ đường cần cũ nhất trước.
    trend: data.recent.slice(0, trendLimit).reverse().map(toSessionDto),
    comparison: latest
      ? {
          latest: toSessionDto(latest),
          previous: previous ? toSessionDto(previous) : null,
          delta: previous
            ? toScoresDto(subtractScores(latest, previous))
            : null,
        }
      : null,
  };
}

function toScoresDto(scores: InterviewStatsScores): InterviewStatsScoresDto {
  return {
    contentScore: scores.contentScore,
    relevanceScore: scores.relevanceScore,
    confidenceScore: scores.confidenceScore,
    overallScore: scores.overallScore,
  };
}

// Điểm từng buổi giữ nguyên giá trị đã lưu, giống trang chi tiết.
function toSessionDto(
  session: InterviewStatsSessionData,
): InterviewStatsSessionDto {
  return {
    id: session.sessionPublicId,
    title: session.title,
    createdAt: session.createdAt.toISOString(),
    ...toScoresDto(session),
  };
}
