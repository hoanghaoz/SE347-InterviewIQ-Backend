import { err, ok, type Result } from 'neverthrow';
import {
  ScoringDomainError,
  ScoringDomainErrorValidation,
} from '../errors/scoring-domain.error';

/** Strength item stored in interview_summaries.strengths (JSONB) */
export interface StrengthItem {
  category: string;
  title: string;
  description: string;
}

/** Improvement item stored in interview_summaries.improvements (JSONB) */
export interface ImprovementItem {
  category: string;
  title: string;
  description: string;
  suggestion?: string;
}

// ---------------------------------------------------------------------------
// Score Entity
// ---------------------------------------------------------------------------

export type ScoreGetParams = {
  readonly id: number;
  readonly publicId: string;
  readonly sessionId: number;
  readonly contentScore: number;
  readonly relevanceScore: number;
  readonly confidenceScore: number;
  readonly overallScore: number;
  readonly scoredAt: Date;
  readonly createdAt: Date;
};

export type ScoreProps = Omit<ScoreGetParams, 'id' | 'publicId' | 'createdAt'> &
  Partial<Pick<ScoreGetParams, 'id' | 'publicId' | 'createdAt'>>;

export type ScoreCreateParams = {
  readonly sessionId: number;
  readonly contentScore: number;
  readonly relevanceScore: number;
  readonly confidenceScore: number;
  readonly overallScore?: number;
  readonly scoredAt?: Date;
};

export class Score {
  private constructor(private readonly params: ScoreProps) {}

  static create(
    params: ScoreCreateParams,
  ): Result<Score, ScoringDomainErrorValidation> {
    const validation = Score.validate(params);
    if (validation.isErr()) {
      return err(validation.error);
    }

    const calculatedOverall =
      params.overallScore ??
      Number(
        (
          params.contentScore * 0.4 +
          params.relevanceScore * 0.4 +
          params.confidenceScore * 0.2
        ).toFixed(1),
      );

    return ok(
      new Score({
        sessionId: params.sessionId,
        contentScore: params.contentScore,
        relevanceScore: params.relevanceScore,
        confidenceScore: params.confidenceScore,
        overallScore: calculatedOverall,
        scoredAt: params.scoredAt ?? new Date(),
      }),
    );
  }

  static getScore(params: ScoreGetParams): Score {
    return new Score(params);
  }

  private static validate(
    params: ScoreCreateParams,
  ): Result<void, ScoringDomainErrorValidation> {
    if (params.contentScore < 0 || params.contentScore > 10) {
      return err(
        new ScoringDomainErrorValidation(
          ScoringDomainError.ScoreOutOfRange,
          'Content score must be between 0 and 10.',
        ),
      );
    }

    if (params.relevanceScore < 0 || params.relevanceScore > 10) {
      return err(
        new ScoringDomainErrorValidation(
          ScoringDomainError.ScoreOutOfRange,
          'Relevance score must be between 0 and 10.',
        ),
      );
    }

    if (params.confidenceScore < 0 || params.confidenceScore > 10) {
      return err(
        new ScoringDomainErrorValidation(
          ScoringDomainError.ScoreOutOfRange,
          'Confidence score must be between 0 and 10.',
        ),
      );
    }

    if (
      params.overallScore !== undefined &&
      (params.overallScore < 0 || params.overallScore > 10)
    ) {
      return err(
        new ScoringDomainErrorValidation(
          ScoringDomainError.ScoreOutOfRange,
          'Overall score must be between 0 and 10.',
        ),
      );
    }

    return ok(undefined);
  }

  get id(): number | undefined {
    return this.params.id;
  }

  get publicId(): string | undefined {
    return this.params.publicId;
  }

  get sessionId(): number {
    return this.params.sessionId;
  }

  get contentScore(): number {
    return this.params.contentScore;
  }

  get relevanceScore(): number {
    return this.params.relevanceScore;
  }

  get confidenceScore(): number {
    return this.params.confidenceScore;
  }

  get overallScore(): number {
    return this.params.overallScore;
  }

  get scoredAt(): Date {
    return this.params.scoredAt;
  }

  get createdAt(): Date | undefined {
    return this.params.createdAt;
  }
}

// ---------------------------------------------------------------------------
// InterviewSummary Entity
// ---------------------------------------------------------------------------

export type InterviewSummaryGetParams = {
  readonly id: number;
  readonly publicId: string;
  readonly sessionId: number;
  readonly overallFeedback: string;
  readonly strengths: readonly StrengthItem[];
  readonly improvements: readonly ImprovementItem[];
  readonly scoringModel: string;
  readonly promptVersion: string | null;
  readonly generatedAt: Date;
  readonly createdAt: Date;
};

export type InterviewSummaryProps = Omit<
  InterviewSummaryGetParams,
  'id' | 'publicId' | 'createdAt'
> &
  Partial<Pick<InterviewSummaryGetParams, 'id' | 'publicId' | 'createdAt'>>;

export type InterviewSummaryCreateParams = {
  readonly sessionId: number;
  readonly overallFeedback: string;
  readonly strengths: readonly StrengthItem[];
  readonly improvements: readonly ImprovementItem[];
  readonly scoringModel: string;
  readonly promptVersion?: string | null;
  readonly generatedAt?: Date;
};

export class InterviewSummary {
  private constructor(private readonly params: InterviewSummaryProps) {}

  static create(
    params: InterviewSummaryCreateParams,
  ): Result<InterviewSummary, ScoringDomainErrorValidation> {
    const validation = InterviewSummary.validate(params);
    if (validation.isErr()) {
      return err(validation.error);
    }

    return ok(
      new InterviewSummary({
        sessionId: params.sessionId,
        overallFeedback: params.overallFeedback.trim(),
        strengths: params.strengths,
        improvements: params.improvements,
        scoringModel: params.scoringModel.trim(),
        promptVersion: params.promptVersion ?? null,
        generatedAt: params.generatedAt ?? new Date(),
      }),
    );
  }

  static getSummary(params: InterviewSummaryGetParams): InterviewSummary {
    return new InterviewSummary(params);
  }

  private static validate(
    params: InterviewSummaryCreateParams,
  ): Result<void, ScoringDomainErrorValidation> {
    if (!params.overallFeedback || params.overallFeedback.trim() === '') {
      return err(
        new ScoringDomainErrorValidation(
          ScoringDomainError.OverallFeedbackEmpty,
          'Overall feedback cannot be empty.',
        ),
      );
    }

    if (params.overallFeedback.length > 10_000) {
      return err(
        new ScoringDomainErrorValidation(
          ScoringDomainError.OverallFeedbackTooLong,
          'Overall feedback must not exceed 10,000 characters.',
        ),
      );
    }

    if (!params.scoringModel || params.scoringModel.trim() === '') {
      return err(
        new ScoringDomainErrorValidation(
          ScoringDomainError.InvalidScoringModel,
          'Scoring model must be specified.',
        ),
      );
    }

    if (!Array.isArray(params.strengths)) {
      return err(
        new ScoringDomainErrorValidation(
          ScoringDomainError.InvalidStrengths,
          'Strengths must be an array.',
        ),
      );
    }

    if (!Array.isArray(params.improvements)) {
      return err(
        new ScoringDomainErrorValidation(
          ScoringDomainError.InvalidImprovements,
          'Improvements must be an array.',
        ),
      );
    }

    return ok(undefined);
  }

  get id(): number | undefined {
    return this.params.id;
  }

  get publicId(): string | undefined {
    return this.params.publicId;
  }

  get sessionId(): number {
    return this.params.sessionId;
  }

  get overallFeedback(): string {
    return this.params.overallFeedback;
  }

  get strengths(): readonly StrengthItem[] {
    return this.params.strengths;
  }

  get improvements(): readonly ImprovementItem[] {
    return this.params.improvements;
  }

  get scoringModel(): string {
    return this.params.scoringModel;
  }

  get promptVersion(): string | null {
    return this.params.promptVersion;
  }

  get generatedAt(): Date {
    return this.params.generatedAt;
  }

  get createdAt(): Date | undefined {
    return this.params.createdAt;
  }
}

// ---------------------------------------------------------------------------
// ScoringResult Aggregate
// ---------------------------------------------------------------------------

export class ScoringResult {
  constructor(
    public readonly score: Score,
    public readonly summary: InterviewSummary,
    public readonly sessionPublicId?: string,
  ) {}
}
