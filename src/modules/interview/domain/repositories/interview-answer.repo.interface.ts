import type { Result } from 'neverthrow';
import type { CommonSessionStatus } from '../enums/interview-enum';
import type { AnswerEmotionSummary } from '../types/answer-emotion-summary.type';

export type AuthorizedInterviewQuestion = {
  status: CommonSessionStatus;
};

export type SaveInterviewAnswerData = {
  userPublicId: string;
  sessionPublicId: string;
  questionPublicId: string;
  videoUrl: string;
  transcript: string;
  durationSeconds: number;
  /** null xóa tóm tắt cũ: lưu lại câu trả lời nghĩa là có bản ghi hình mới. */
  emotionSummary: AnswerEmotionSummary | null;
};

export type SavedInterviewAnswer = {
  publicId: string;
  videoUrl: string;
  transcript: string;
  durationSeconds: number;
  createdAt: Date;
  updatedAt: Date;
};

export abstract class IInterviewAnswerRepository {
  abstract getQuestionForUser(
    userPublicId: string,
    sessionPublicId: string,
    questionPublicId: string,
  ): Promise<Result<AuthorizedInterviewQuestion | null, Error>>;

  abstract saveAnswer(
    data: SaveInterviewAnswerData,
  ): Promise<Result<SavedInterviewAnswer, Error>>;
}
