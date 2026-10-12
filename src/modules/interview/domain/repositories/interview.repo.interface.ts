import type { Result } from 'neverthrow';
import { Interview } from '../entities/interview.entity';

export type InterviewSessionData = {
  sessionId: number;
  userId: number;
  cvId: number;
};

export type InterviewSessionAuthorizeResult = {
  sessionId: number;
  userId: number;
  cvId: number | null;
};

export type SubmitInterviewSessionData = {
  totalQuestions: number;
  durationSeconds: number;
  submittedAt: Date;
};
export abstract class IInterviewRepository {
  abstract createInterviewSession(
    newSession: Interview,
  ): Promise<Result<string, Error>>;

  // abstract getInterviewSessionDataByPublicId(
  //   sessionPublicId: string,
  //   userPublicId: string,
  // ): Promise;

  abstract authorizeInterviewSession(
    sessionPublicId: string,
    userPublicId: string,
    cvPublicId: string,
  ): Promise<Result<InterviewSessionAuthorizeResult | null, Error>>;

  abstract submitInterviewSession(
    sessionPublicId: string,
    data: SubmitInterviewSessionData,
  ): Promise<Result<undefined, Error>>;
}
