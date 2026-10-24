import type { Result } from 'neverthrow';
import type { SessionStatus } from '../../../../../generated/prisma/enums';
import type { CvParsedData } from '../../../cv/domain/types/cv-parsed-data.type';
import type {
  InterviewSummary,
  Score,
  ScoringResult,
} from '../entities/scoring-job.entity';

export interface SessionScoringContext {
  readonly id: number;
  readonly publicId: string;
  readonly userId: number;
  readonly status: SessionStatus;
  readonly cvParsedData: CvParsedData | null;
  readonly questions: ReadonlyArray<{
    readonly id: number;
    readonly content: string;
    readonly orderIndex: number;
    readonly answer: {
      readonly id: number;
      readonly transcript: string | null;
      readonly emotionSummary: unknown;
    } | null;
  }>;
}

export interface SessionOwnerInfo {
  readonly userId: number;
  readonly ownerPublicId: string;
  readonly sessionStatus: SessionStatus;
}

export abstract class IScoringRepository {
  abstract findSessionForScoring(
    sessionPublicId: string,
  ): Promise<Result<SessionScoringContext | null, Error>>;

  abstract updateSessionStatus(
    sessionId: number,
    status: SessionStatus,
  ): Promise<Result<void, Error>>;

  abstract saveScoringResult(
    sessionId: number,
    score: Score,
    summary: InterviewSummary,
  ): Promise<Result<void, Error>>;

  abstract markSessionFailed(
    sessionId: number,
    failureReason: string,
  ): Promise<Result<void, Error>>;

  abstract findSessionResult(
    sessionPublicId: string,
  ): Promise<Result<ScoringResult | null, Error>>;

  abstract getSessionOwnerUserId(
    sessionPublicId: string,
    userPublicId?: string,
  ): Promise<Result<SessionOwnerInfo | null, Error>>;
}
