import type { Result } from 'neverthrow';
import type { CvParsedData } from '../../../cv/domain/types/cv-parsed-data.type';
import type {
  ImprovementItem,
  StrengthItem,
} from '../../domain/entities/scoring-job.entity';

export const ISCORING_LLM_PROVIDER = 'ISCORING_LLM_PROVIDER';

/**
 * Payload sent to LLM provider to evaluate an interview session.
 * Contract aligned with Luồng 2 (Hiếu) for Gemini Provider integration.
 */
export interface ScoringLlmPayload {
  readonly sessionPublicId: string;
  readonly cvParsedData: CvParsedData | null;
  readonly questions: ReadonlyArray<{
    readonly content: string;
    readonly orderIndex: number;
    readonly transcript: string | null;
    readonly emotionSummary: unknown;
  }>;
}

/**
 * Normalized evaluation result returned by the LLM Provider.
 */
export interface ScoringLlmEvaluationResult {
  readonly contentScore: number;
  readonly relevanceScore: number;
  readonly confidenceScore: number;
  readonly overallScore?: number;
  readonly overallFeedback: string;
  readonly strengths: readonly StrengthItem[];
  readonly improvements: readonly ImprovementItem[];
  readonly scoringModel: string;
  readonly promptVersion: string;
}

/**
 * Contract for AI Scoring Provider (Gemini / LLM).
 * ScoringWorker delegates rubric evaluation to this interface.
 */
export abstract class IScoringLlmProvider {
  abstract evaluateSession(
    payload: ScoringLlmPayload,
  ): Promise<Result<ScoringLlmEvaluationResult, Error>>;
}
