import type { Result } from 'neverthrow';
import type { CommonSessionStatus } from '../enums/interview-enum';

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
