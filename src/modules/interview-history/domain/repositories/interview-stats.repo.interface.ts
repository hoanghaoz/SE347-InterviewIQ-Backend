import type { Result } from 'neverthrow';

// Lọc theo createdAt, cùng nghĩa với filter của màn danh sách. Field vắng mặt
// nghĩa là không chặn đầu đó.
export type InterviewStatsFilter = {
  readonly fromDate?: Date;
  readonly toDate?: Date;
};

// Bốn điểm cấp buổi, cùng tên với cột của bảng scores.
export type InterviewStatsScores = {
  readonly contentScore: number;
  readonly relevanceScore: number;
  readonly confidenceScore: number;
  readonly overallScore: number;
};

export type InterviewStatsSessionData = InterviewStatsScores & {
  readonly sessionPublicId: string;
  readonly title: string;
  readonly createdAt: Date;
};

// Repo chỉ trả số liệu thô của các buổi COMPLETED. Làm tròn, cắt trend và tính
// chênh lệch giữa các buổi là việc của service.
export type InterviewStatsData = {
  readonly completedSessions: number;
  // Câu trả lời có transcript khác rỗng, chỉ trong các buổi COMPLETED.
  readonly answeredQuestions: number;
  // Trung bình chưa làm tròn; null khi không có buổi nào.
  readonly averages: InterviewStatsScores | null;
  // Buổi có overallScore cao nhất; hòa điểm thì lấy buổi mới hơn.
  readonly best: InterviewStatsSessionData | null;
  // Mới nhất trước, tối đa recentLimit phần tử.
  readonly recent: readonly InterviewStatsSessionData[];
};

export abstract class IInterviewStatsRepository {
  abstract getInterviewStats(
    userPublicId: string,
    filter: InterviewStatsFilter,
    recentLimit: number,
  ): Promise<Result<InterviewStatsData, Error>>;
}
