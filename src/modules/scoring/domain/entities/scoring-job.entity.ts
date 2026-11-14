import { err, ok, type Result } from 'neverthrow';
import {
  calculateOverallScore,
  SCORING_LIMITS,
} from '../constants/scoring.constants';
import {
  ScoringDomainError,
  ScoringDomainErrorValidation,
} from '../errors/scoring-domain.error';

export interface StrengthItem {
  category: string;
  title: string;
  description: string;
}

export interface ImprovementItem {
  category: string;
  title: string;
  description: string;
  suggestion?: string;
}

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

function sanitizeDbString(value: string): string {
  return value.replaceAll('\u0000', '').trim();
}

export class Score {
  private constructor(private readonly params: ScoreProps) {}

  static create(
    params: ScoreCreateParams,
  ): Result<Score, ScoringDomainErrorValidation> {
    const validation = Score.validate(params);
    if (validation.isErr()) {
      return err(validation.error);
    }

    const contentScore = Number(params.contentScore.toFixed(1));
    const relevanceScore = Number(params.relevanceScore.toFixed(1));
    const confidenceScore = Number(params.confidenceScore.toFixed(1));
    const calculatedOverall = calculateOverallScore(
      contentScore,
      relevanceScore,
      confidenceScore,
    );

    return ok(
      new Score({
        sessionId: params.sessionId,
        contentScore,
        relevanceScore,
        confidenceScore,
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
    if (
      typeof params.contentScore !== 'number' ||
      !Number.isFinite(params.contentScore) ||
      params.contentScore < SCORING_LIMITS.minScore ||
      params.contentScore > SCORING_LIMITS.maxScore
    ) {
      return err(
        new ScoringDomainErrorValidation(
          ScoringDomainError.ScoreOutOfRange,
          'Content score must be between 0 and 10.',
        ),
      );
    }

    if (
      typeof params.relevanceScore !== 'number' ||
      !Number.isFinite(params.relevanceScore) ||
      params.relevanceScore < SCORING_LIMITS.minScore ||
      params.relevanceScore > SCORING_LIMITS.maxScore
    ) {
      return err(
        new ScoringDomainErrorValidation(
          ScoringDomainError.ScoreOutOfRange,
          'Relevance score must be between 0 and 10.',
        ),
      );
    }

    if (
      typeof params.confidenceScore !== 'number' ||
      !Number.isFinite(params.confidenceScore) ||
      params.confidenceScore < SCORING_LIMITS.minScore ||
      params.confidenceScore > SCORING_LIMITS.maxScore
    ) {
      return err(
        new ScoringDomainErrorValidation(
          ScoringDomainError.ScoreOutOfRange,
          'Confidence score must be between 0 and 10.',
        ),
      );
    }

    if (
      params.overallScore !== undefined &&
      (!Number.isFinite(params.overallScore) ||
        params.overallScore < SCORING_LIMITS.minScore ||
        params.overallScore > SCORING_LIMITS.maxScore)
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

    const cleanedFeedback = sanitizeDbString(params.overallFeedback);
    const cleanedModel = sanitizeDbString(params.scoringModel).slice(
      0,
      SCORING_LIMITS.maxScoringModelChars,
    );
    const cleanedPromptVersion =
      params.promptVersion && sanitizeDbString(params.promptVersion) !== ''
        ? sanitizeDbString(params.promptVersion).slice(
            0,
            SCORING_LIMITS.maxPromptVersionChars,
          )
        : null;

    const cleanedStrengths: StrengthItem[] = params.strengths
      .slice(0, SCORING_LIMITS.maxFeedbackItems)
      .map((item) => ({
        category: sanitizeDbString(item.category),
        title: sanitizeDbString(item.title).slice(
          0,
          SCORING_LIMITS.maxItemTitleChars,
        ),
        description: sanitizeDbString(item.description).slice(
          0,
          SCORING_LIMITS.maxItemDescriptionChars,
        ),
      }));

    const cleanedImprovements: ImprovementItem[] = params.improvements
      .slice(0, SCORING_LIMITS.maxFeedbackItems)
      .map((item) => {
        const cleanedSuggestion =
          item.suggestion !== undefined
            ? sanitizeDbString(item.suggestion).slice(
                0,
                SCORING_LIMITS.maxItemSuggestionChars,
              )
            : undefined;
        return {
          category: sanitizeDbString(item.category),
          title: sanitizeDbString(item.title).slice(
            0,
            SCORING_LIMITS.maxItemTitleChars,
          ),
          description: sanitizeDbString(item.description).slice(
            0,
            SCORING_LIMITS.maxItemDescriptionChars,
          ),
          ...(cleanedSuggestion !== undefined && cleanedSuggestion !== ''
            ? { suggestion: cleanedSuggestion }
            : {}),
        };
      });

    return ok(
      new InterviewSummary({
        sessionId: params.sessionId,
        overallFeedback: cleanedFeedback,
        strengths: cleanedStrengths,
        improvements: cleanedImprovements,
        scoringModel: cleanedModel,
        promptVersion: cleanedPromptVersion,
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
    const cleanedFeedback =
      typeof params.overallFeedback === 'string'
        ? sanitizeDbString(params.overallFeedback)
        : '';

    if (!cleanedFeedback) {
      return err(
        new ScoringDomainErrorValidation(
          ScoringDomainError.OverallFeedbackEmpty,
          'Overall feedback cannot be empty.',
        ),
      );
    }

    if (cleanedFeedback.length > SCORING_LIMITS.maxOverallFeedbackChars) {
      return err(
        new ScoringDomainErrorValidation(
          ScoringDomainError.OverallFeedbackTooLong,
          'Overall feedback must not exceed 10,000 characters.',
        ),
      );
    }

    const cleanedModel =
      typeof params.scoringModel === 'string'
        ? sanitizeDbString(params.scoringModel)
        : '';

    if (!cleanedModel) {
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

export class ScoringResult {
  constructor(
    public readonly score: Score,
    public readonly summary: InterviewSummary,
    public readonly sessionPublicId?: string,
  ) {}
}
