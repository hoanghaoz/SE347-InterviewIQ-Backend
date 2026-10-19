import type { Result } from 'neverthrow';
import type { SessionStatus } from '../../../../../generated/prisma/enums';
import type { CvParsedData } from '../../../cv/domain/types/cv-parsed-data.type';
import type {
  InterviewSummary,
  Score,
  ScoringResult,
} from '../entities/scoring-job.entity';

/**
 * Data needed by ScoringWorker to evaluate the session and build prompts.
 */
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

/**
 * Repository interface for scoring operations (Domain Layer).
 * Encapsulates both write operations for Worker and read operations for Query Endpoint.
 */
export abstract class IScoringRepository {
  // -------------------------------------------------------------------------
  // Write Operations (used by Scoring Worker)
  // -------------------------------------------------------------------------

  /**
   * Loads full context of an interview session (cv, questions, answers)
   * needed for scoring. Returns null if session is not found.
   */
  abstract findSessionForScoring(
    sessionPublicId: string,
  ): Promise<Result<SessionScoringContext | null, Error>>;

  /**
   * Updates the status of an interview session (e.g. SCORING, FAILED).
   */
  abstract updateSessionStatus(
    sessionId: number,
    status: SessionStatus,
  ): Promise<Result<void, Error>>;

  /**
   * Atomically saves Score, InterviewSummary, and marks the session COMPLETED.
   */
  abstract saveScoringResult(
    sessionId: number,
    score: Score,
    summary: InterviewSummary,
  ): Promise<Result<void, Error>>;

  /**
   * Marks session as FAILED when scoring fails permanently.
   * Conditional update: only updates if current status is SCORING to prevent race conditions.
   */
  abstract markSessionFailed(
    sessionId: number,
    failureReason: string,
  ): Promise<Result<void, Error>>;

  // -------------------------------------------------------------------------
  // Read Operations (used by Query Endpoints)
  // -------------------------------------------------------------------------

  /**
   * Loads Score + InterviewSummary for a session.
   * Returns null if no score/summary exists for this session.
   */
  abstract findSessionResult(
    sessionPublicId: string,
  ): Promise<Result<ScoringResult | null, Error>>;

  /**
   * Checks session ownership and current status.
   * Returns internal userId, owner publicId and session status if found, null otherwise.
   */
  abstract getSessionOwnerUserId(
    sessionPublicId: string,
    userPublicId?: string,
  ): Promise<Result<SessionOwnerInfo | null, Error>>;
}
