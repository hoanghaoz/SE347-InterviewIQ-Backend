import { err, ok, type Result } from 'neverthrow';
import {
  calculateOverallScore,
  SCORING_LIMITS,
} from './constants/scoring.constants';
import type {
  ImprovementItem,
  StrengthItem,
} from './entities/scoring-job.entity';
import {
  ALLOWED_FEEDBACK_CATEGORIES,
  FeedbackCategory,
} from './enums/scoring-enum';
import {
  ScoringDomainError,
  ScoringDomainErrorValidation,
} from './errors/scoring-domain.error';

const FEEDBACK_CATEGORY_SET = new Set<string>(ALLOWED_FEEDBACK_CATEGORIES);

export interface ValidatedScoringRubric {
  readonly contentScore: number;
  readonly relevanceScore: number;
  readonly confidenceScore: number;
  readonly overallScore: number;
  readonly overallFeedback: string;
  readonly strengths: StrengthItem[];
  readonly improvements: ImprovementItem[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Strips null bytes, HTML tags, and leading/inline Markdown formatting so text renders cleanly
 * inside plain-text <p> elements on Frontend HistoryResultPanel.tsx.
 */
export function cleanRubricPlainText(
  value: unknown,
  maxLength: number,
): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replaceAll('\u0000', '')
    .replace(/<[^>]*>/g, '')
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/^\s*(?:#{1,6}\s+|[-*+]\s+)/gm, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

export function normalizeFeedbackCategory(raw: unknown): FeedbackCategory {
  if (typeof raw !== 'string') {
    return FeedbackCategory.COMMUNICATION;
  }
  const normalized = raw.replaceAll('\u0000', '').trim().toUpperCase();
  if (FEEDBACK_CATEGORY_SET.has(normalized)) {
    return normalized as FeedbackCategory;
  }
  return FeedbackCategory.COMMUNICATION;
}

function parseFiniteClampedScore(
  value: unknown,
  fieldName: string,
): Result<number, ScoringDomainErrorValidation> {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return err(
      new ScoringDomainErrorValidation(
        ScoringDomainError.ScoreOutOfRange,
        `${fieldName} must be a finite number.`,
      ),
    );
  }

  const clamped = Math.min(
    SCORING_LIMITS.maxScore,
    Math.max(SCORING_LIMITS.minScore, value),
  );
  return ok(Number(clamped.toFixed(1)));
}

function normalizeStrengths(rawList: unknown[]): StrengthItem[] {
  const result: StrengthItem[] = [];
  for (const item of rawList) {
    if (!isPlainObject(item)) {
      continue;
    }
    const title = cleanRubricPlainText(
      item.title,
      SCORING_LIMITS.maxItemTitleChars,
    );
    const description = cleanRubricPlainText(
      item.description,
      SCORING_LIMITS.maxItemDescriptionChars,
    );
    if (!title || !description) {
      continue;
    }
    result.push({
      category: normalizeFeedbackCategory(item.category),
      title,
      description,
    });
    if (result.length === SCORING_LIMITS.maxFeedbackItems) {
      break;
    }
  }
  return result;
}

function normalizeImprovements(rawList: unknown[]): ImprovementItem[] {
  const result: ImprovementItem[] = [];
  for (const item of rawList) {
    if (!isPlainObject(item)) {
      continue;
    }
    const title = cleanRubricPlainText(
      item.title,
      SCORING_LIMITS.maxItemTitleChars,
    );
    const description = cleanRubricPlainText(
      item.description,
      SCORING_LIMITS.maxItemDescriptionChars,
    );
    if (!title || !description) {
      continue;
    }
    const suggestion = cleanRubricPlainText(
      item.suggestion,
      SCORING_LIMITS.maxItemSuggestionChars,
    );
    result.push({
      category: normalizeFeedbackCategory(item.category),
      title,
      description,
      ...(suggestion ? { suggestion } : {}),
    });
    if (result.length === SCORING_LIMITS.maxFeedbackItems) {
      break;
    }
  }
  return result;
}

/**
 * Pure domain validator for LLM scoring rubric responses.
 * Rejects NaN/non-numeric scores, cleans HTML/Markdown/null-bytes, and enforces deterministic overallScore.
 */
export function validateScoringRubric(
  raw: unknown,
): Result<ValidatedScoringRubric, ScoringDomainErrorValidation> {
  if (!isPlainObject(raw)) {
    return err(
      new ScoringDomainErrorValidation(
        ScoringDomainError.InvalidRubricPayload,
        'Rubric payload must be a JSON object.',
      ),
    );
  }

  const contentResult = parseFiniteClampedScore(
    raw.contentScore,
    'contentScore',
  );
  if (contentResult.isErr()) {
    return err(contentResult.error);
  }

  const relevanceResult = parseFiniteClampedScore(
    raw.relevanceScore,
    'relevanceScore',
  );
  if (relevanceResult.isErr()) {
    return err(relevanceResult.error);
  }

  const confidenceResult = parseFiniteClampedScore(
    raw.confidenceScore,
    'confidenceScore',
  );
  if (confidenceResult.isErr()) {
    return err(confidenceResult.error);
  }

  const overallFeedback = cleanRubricPlainText(
    raw.overallFeedback,
    SCORING_LIMITS.maxOverallFeedbackChars,
  );
  if (!overallFeedback) {
    return err(
      new ScoringDomainErrorValidation(
        ScoringDomainError.OverallFeedbackEmpty,
        'overallFeedback must not be empty after sanitization.',
      ),
    );
  }

  if (!Array.isArray(raw.strengths)) {
    return err(
      new ScoringDomainErrorValidation(
        ScoringDomainError.InvalidStrengths,
        'strengths must be an array.',
      ),
    );
  }

  if (!Array.isArray(raw.improvements)) {
    return err(
      new ScoringDomainErrorValidation(
        ScoringDomainError.InvalidImprovements,
        'improvements must be an array.',
      ),
    );
  }

  const contentScore = contentResult.value;
  const relevanceScore = relevanceResult.value;
  const confidenceScore = confidenceResult.value;
  const overallScore = calculateOverallScore(
    contentScore,
    relevanceScore,
    confidenceScore,
  );

  return ok({
    contentScore,
    relevanceScore,
    confidenceScore,
    overallScore,
    overallFeedback,
    strengths: normalizeStrengths(raw.strengths),
    improvements: normalizeImprovements(raw.improvements),
  });
}

