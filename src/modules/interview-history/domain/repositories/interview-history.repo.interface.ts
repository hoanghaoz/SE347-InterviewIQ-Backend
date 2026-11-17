import type { Result } from 'neverthrow';
import { PaginationRequest } from '../../../../shared/common/pagination';
import {
  CommonCheatEventType,
  CommonSessionStatus,
} from '../../../interview/domain/enums/interview-enum';
import {
  QuestionDifficulty,
  QuestionDomain,
} from '../../../question-generation/domain/enums/question.enum';
import type {
  ImprovementItem,
  StrengthItem,
} from '../../../scoring/domain/entities/scoring-job.entity';

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
  // Số cheat log của buổi; > 0 nghĩa là buổi bị đánh dấu.
  readonly cheatEventCount: number;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
};

export type InterviewHistoryCvData = {
  readonly cvPublicId: string;
  readonly fileName: string;
};

export type InterviewHistoryCheatLogData = {
  readonly cheatLogPublicId: string;
  readonly eventType: CommonCheatEventType;
  readonly description: string | null;
  readonly occurredAt: Date;
  readonly createdAt: Date;
};

// Không có emotionSummary (cột Json chỉ worker chấm điểm dùng) và không có
// cloudinaryPublicId: response chỉ cần URL để phát video.
export type InterviewHistoryAnswerData = {
  readonly videoUrl: string | null;
  readonly durationSeconds: number | null;
  readonly transcript: string | null;
};

export type InterviewHistoryQuestionData = {
  readonly questionPublicId: string;
  readonly orderIndex: number;
  readonly content: string;
  readonly domain: QuestionDomain;
  readonly difficulty: QuestionDifficulty;
  // null khi câu này chưa có bản ghi answer.
  readonly answer: InterviewHistoryAnswerData | null;
};

// Điểm cấp buổi. Schema không có điểm từng câu: LLM chấm cả buổi trong một lần.
export type InterviewHistoryScoreData = {
  readonly contentScore: number;
  readonly relevanceScore: number;
  readonly confidenceScore: number;
  readonly overallScore: number;
  readonly scoredAt: Date;
};

export type InterviewHistorySummaryData = {
  readonly overallFeedback: string;
  readonly strengths: readonly StrengthItem[];
  readonly improvements: readonly ImprovementItem[];
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
  // Sắp theo occurredAt tăng dần; mảng rỗng khi buổi không có vi phạm.
  readonly cheatLogs: readonly InterviewHistoryCheatLogData[];
  // Sắp theo orderIndex tăng dần; mảng rỗng khi buổi chưa sinh câu hỏi.
  readonly questions: readonly InterviewHistoryQuestionData[];
  // Repo trả đúng những gì có trong database. Việc chỉ lộ điểm khi buổi đã
  // COMPLETED là luật nghiệp vụ, nằm ở service.
  readonly score: InterviewHistoryScoreData | null;
  readonly summary: InterviewHistorySummaryData | null;
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
