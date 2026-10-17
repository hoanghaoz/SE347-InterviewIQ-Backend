import type { Result } from 'neverthrow';
import { Interview } from '../entities/interview.entity';
import type { CvSnapshot } from '../../../cv/domain/repositories/cv.repo.interface';
import { CommonSessionStatus } from '../enums/interview-enum';
import {
  PageResult,
  PaginationRequest,
} from '../../../../shared/common/pagination';

export type InterviewSessionData = {
  sessionPublicId: string;
  title: string;
  cvPublicId: string | null;
  status: CommonSessionStatus;
  totalQuestion: number;
  jobDescription: string | null;
  createdAt: Date;
};

export type InterviewSessionAuthorizeResult = {
  sessionId: number;
  userId: number;
  cvId: number | null;
  status: CommonSessionStatus;
};

export type SubmitInterviewSessionData = {
  cvSnapshot: CvSnapshot;
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
    cvPublicId?: string,
  ): Promise<Result<InterviewSessionAuthorizeResult | null, Error>>;

  abstract submitInterviewSession(
    sessionPublicId: string,
    data: SubmitInterviewSessionData,
  ): Promise<Result<undefined, Error>>;

  abstract getInterviewSessions(
    userPublicId: string,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<InterviewSessionData>, Error>>;

  abstract startInterviewSession(
    userId: number,
    sessionId: number,
    startedAt: Date,
  ): Promise<Result<undefined, Error>>;
}
