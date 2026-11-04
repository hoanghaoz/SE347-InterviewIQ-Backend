import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import { PageResult } from '../../../../shared/common/pagination';
import {
  IInterviewHistoryRepository,
  InterviewHistoryDetailData,
  InterviewHistoryFilter,
  InterviewHistoryItemData,
} from '../../domain/repositories/interview-history.repo.interface';
import { InterviewHistoryQueryDto } from '../dtos/interview-history.request.dto';
import {
  InterviewHistoryDetailDto,
  InterviewHistoryItemDto,
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
    startedAt: data.startedAt?.toISOString() ?? null,
    completedAt: data.completedAt?.toISOString() ?? null,
    createdAt: data.createdAt.toISOString(),
  };
}

function toInterviewHistoryDetail(
  data: InterviewHistoryDetailData,
): InterviewHistoryDetailDto {
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
    // Khung cho module khác: xem docs/api-contract-interview-history.md mục 4.3
    score: null,
    summary: null,
    questions: [],
  };
}
