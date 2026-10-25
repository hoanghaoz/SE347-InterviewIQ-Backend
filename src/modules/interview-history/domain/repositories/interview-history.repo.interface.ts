import type { Result } from 'neverthrow';
import { PaginationRequest } from '../../../../shared/common/pagination';
import { CommonSessionStatus } from '../../../interview/domain/enums/interview-enum';

// Field vắng mặt nghĩa là không lọc theo field đó.
export type InterviewHistoryFilter = {
  readonly fromDate?: Date;
  readonly toDate?: Date;
  readonly status?: CommonSessionStatus;
};

// Đúng những gì màn danh sách cần. Không có jobDescription (cột Text, chỉ trang
// chi tiết dùng) và không có cvSnapshot (cột Json rất nặng).
export type InterviewHistoryItemData = {
  readonly sessionPublicId: string;
  readonly title: string;
  readonly status: CommonSessionStatus;
  readonly totalQuestions: number;
  readonly durationSeconds: number | null;
  readonly overallScore: number | null;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
};

export type InterviewHistoryCvData = {
  readonly cvPublicId: string;
  readonly fileName: string;
};

export type InterviewHistoryDetailData = {
  readonly sessionPublicId: string;
  readonly title: string;
  readonly jobDescription: string | null;
  readonly status: CommonSessionStatus;
  readonly totalQuestions: number;
  readonly durationSeconds: number | null;
  readonly startedAt: Date | null;
  readonly submittedAt: Date | null;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
  readonly cv: InterviewHistoryCvData | null;
};

// Trả items + tổng số bản ghi thật, không trả PageResult: PageResult chứa kiểu
// của response nên nếu repo dựng nó thì service phải tháo ra dựng lại khi map
// sang DTO, và totalItems bị mất (PageResult chỉ giữ totalPages đã làm tròn).
export type InterviewHistoryPage = {
  readonly items: readonly InterviewHistoryItemData[];
  readonly totalItems: number;
};

// Module chỉ đọc: không có contract nào ghi dữ liệu.
export abstract class IInterviewHistoryRepository {
  abstract getInterviewHistory(
    userPublicId: string,
    pagination: PaginationRequest,
    filter: InterviewHistoryFilter,
  ): Promise<Result<InterviewHistoryPage, Error>>;

  // ok(null) khi không có buổi phỏng vấn nào vừa mang publicId này vừa thuộc
  // user này. Hai trường hợp đó dùng chung một kết quả nên service không thể
  // vô tình phân biệt "không tồn tại" với "của người khác".
  abstract getInterviewDetail(
    userPublicId: string,
    sessionPublicId: string,
  ): Promise<Result<InterviewHistoryDetailData | null, Error>>;
}
