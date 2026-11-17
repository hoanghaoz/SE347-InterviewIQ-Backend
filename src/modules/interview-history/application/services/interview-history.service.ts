import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import {
  CommonCheatEventType,
  CommonSessionStatus,
} from '../../../interview/domain/enums/interview-enum';
import { SCORING_LIMITS } from '../../../scoring/domain/constants/scoring.constants';
import { PageResult } from '../../../../shared/common/pagination';
import {
  IInterviewHistoryRepository,
  InterviewHistoryCheatLogData,
  InterviewHistoryDetailData,
  InterviewHistoryFilter,
  InterviewHistoryItemData,
  InterviewHistoryQuestionData,
  InterviewHistoryScoreData,
  InterviewHistorySummaryData,
} from '../../domain/repositories/interview-history.repo.interface';
import { InterviewHistoryQueryDto } from '../dtos/interview-history.request.dto';
import type {
  CheatLogDto,
  CheatSummaryDto,
} from '../../../interview/application/dtos/cheat-log.response.dto';
import {
  InterviewHistoryDetailDto,
  InterviewHistoryItemDto,
  InterviewHistoryQuestionDto,
  InterviewHistoryScoreDto,
  InterviewHistorySummaryDto,
} from '../dtos/interview-history.response.dto';
import { IInterviewHistoryService } from '../interfaces/interview-history.service.interface';

@Injectable()
export class InterviewHistoryService implements IInterviewHistoryService {
  constructor(
    private readonly interviewHistoryRepo: IInterviewHistoryRepository,
  ) {}

  async getInterviewHistoryAsync(
    userPublicId: string,
    query: InterviewHistoryQueryDto,
  ): Promise<Result<PageResult<InterviewHistoryItemDto>, AppError>> {
    // Format của chuỗi đã được ValidationPipe kiểm, ở đây chỉ còn luật nghiệp vụ:
    // khoảng ngày ngược thì luôn ra rỗng, nên báo 400 thay vì để client tưởng
    // là họ chưa có buổi phỏng vấn nào.
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

    const filter: InterviewHistoryFilter = {
      fromDate,
      toDate,
      status: query.status,
    };
    const result = await this.interviewHistoryRepo.getInterviewHistory(
      userPublicId,
      { pageNumber: query.pageNumber, pageSize: query.pageSize },
      filter,
    );
    if (result.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to load the interview history',
        ),
      );
    }

    const page = result.value;
    return ok(
      new PageResult(
        page.items.map(toInterviewHistoryItem),
        page.totalItems,
        query.pageNumber,
        query.pageNumber,
        query.pageSize,
      ),
    );
  }

  async getInterviewAsync(
    userPublicId: string,
    sessionPublicId: string,
  ): Promise<Result<InterviewHistoryDetailDto, AppError>> {
    const result = await this.interviewHistoryRepo.getInterviewDetail(
      userPublicId,
      sessionPublicId,
    );
    if (result.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to load the interview',
        ),
      );
    }
    // Không tồn tại và của người khác dùng chung 404, không bao giờ 403:
    // phân biệt hai cái đó là để lộ publicId nào có thật trong hệ thống.
    if (result.value === null) {
      return err(new AppError(ErrorCode.NotFound, 'Interview not found'));
    }

    return ok(toInterviewHistoryDetail(result.value));
  }
}

function toInterviewHistoryItem(
  data: InterviewHistoryItemData,
): InterviewHistoryItemDto {
  return {
    id: data.sessionPublicId,
    title: data.title,
    status: data.status,
    totalQuestions: data.totalQuestions,
    durationSeconds: data.durationSeconds,
    overallScore: data.overallScore,
    isFlagged: data.cheatEventCount > 0,
    cheatEventCount: data.cheatEventCount,
    startedAt: data.startedAt?.toISOString() ?? null,
    completedAt: data.completedAt?.toISOString() ?? null,
    createdAt: data.createdAt.toISOString(),
  };
}

function toInterviewHistoryDetail(
  data: InterviewHistoryDetailData,
): InterviewHistoryDetailDto {
  // Worker ghi score, summary và status COMPLETED trong cùng một transaction.
  // Chỉ lộ kết quả khi status đã là COMPLETED:
  // - SCORING/FAILED mà vẫn có bản ghi (ví dụ đọc lệch snapshot giữa các câu
  //   SQL của nested select, hoặc dữ liệu cũ) thì đó chưa phải kết quả cuối;
  // - status được đọc trước các quan hệ, nên thấy COMPLETED nghĩa là transaction
  //   đã commit và score/summary chắc chắn đọc được.
  const isScored = data.status === CommonSessionStatus.COMPLETED;
  return {
    id: data.sessionPublicId,
    title: data.title,
    jobDescription: data.jobDescription,
    status: data.status,
    totalQuestions: data.totalQuestions,
    durationSeconds: data.durationSeconds,
    startedAt: data.startedAt?.toISOString() ?? null,
    submittedAt: data.submittedAt?.toISOString() ?? null,
    completedAt: data.completedAt?.toISOString() ?? null,
    createdAt: data.createdAt.toISOString(),
    cv: data.cv ? { id: data.cv.cvPublicId, fileName: data.cv.fileName } : null,
    score: isScored && data.score ? toScoreDto(data.score) : null,
    summary: isScored && data.summary ? toSummaryDto(data.summary) : null,
    // Câu hỏi và câu trả lời luôn trả về, kể cả khi chấm điểm FAILED.
    questions: data.questions.map(toQuestionDto),
    isFlagged: data.cheatLogs.length > 0,
    cheatSummary: toCheatSummary(data.cheatLogs),
    cheatLogs: data.cheatLogs.map(toCheatLogDto),
  };
}

function toQuestionDto(
  question: InterviewHistoryQuestionData,
): InterviewHistoryQuestionDto {
  return {
    id: question.questionPublicId,
    orderIndex: question.orderIndex,
    content: question.content,
    domain: question.domain,
    difficulty: question.difficulty,
    answer: question.answer
      ? {
          videoUrl: question.answer.videoUrl,
          durationSeconds: question.answer.durationSeconds,
          transcript: question.answer.transcript,
        }
      : null,
  };
}

function toScoreDto(
  score: InterviewHistoryScoreData,
): InterviewHistoryScoreDto {
  return {
    contentScore: score.contentScore,
    relevanceScore: score.relevanceScore,
    confidenceScore: score.confidenceScore,
    overallScore: score.overallScore,
    maxScore: SCORING_LIMITS.maxScore,
    scoredAt: score.scoredAt.toISOString(),
  };
}

function toSummaryDto(
  summary: InterviewHistorySummaryData,
): InterviewHistorySummaryDto {
  return {
    overallFeedback: summary.overallFeedback,
    strengths: summary.strengths.map((item) => ({ ...item })),
    improvements: summary.improvements.map((item) => ({ ...item })),
  };
}

function toCheatLogDto(log: InterviewHistoryCheatLogData): CheatLogDto {
  return {
    id: log.cheatLogPublicId,
    eventType: log.eventType,
    description: log.description,
    occurredAt: log.occurredAt.toISOString(),
    createdAt: log.createdAt.toISOString(),
  };
}

// Luôn đủ mọi loại sự kiện (0 nếu chưa có), cùng shape với module cheat-log.
function toCheatSummary(
  logs: readonly InterviewHistoryCheatLogData[],
): CheatSummaryDto {
  const countsByType: Record<CommonCheatEventType, number> = {
    [CommonCheatEventType.TAB_SWITCH]: 0,
    [CommonCheatEventType.WINDOW_BLUR]: 0,
    [CommonCheatEventType.FACE_MISSING]: 0,
    [CommonCheatEventType.MULTIPLE_FACES]: 0,
  };
  for (const log of logs) countsByType[log.eventType] += 1;
  return { totalCount: logs.length, countsByType };
}
