import { err, ok, type Result } from 'neverthrow';
import {
  cleanRubricPlainText,
  normalizeFeedbackCategory,
} from '../../scoring/domain/scoring-rubric.validator';
import { HISTORY_INSIGHT_LIMITS } from './constants/history-insight.constants';
import type {
  HistoryInsightContent,
  InsightFeedbackItem,
  InsightRecommendation,
} from './repositories/history-insight.repo.interface';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanTitleAndDescription(
  item: Record<string, unknown>,
): { title: string; description: string } | null {
  const title = cleanRubricPlainText(
    item.title,
    HISTORY_INSIGHT_LIMITS.maxItemTitleChars,
  );
  const description = cleanRubricPlainText(
    item.description,
    HISTORY_INSIGHT_LIMITS.maxItemDescriptionChars,
  );
  return title && description ? { title, description } : null;
}

function normalizeFeedbackItems(raw: unknown): InsightFeedbackItem[] {
  if (!Array.isArray(raw)) return [];
  const result: InsightFeedbackItem[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) continue;
    const text = cleanTitleAndDescription(item);
    if (!text) continue;
    result.push({
      category: normalizeFeedbackCategory(item.category),
      ...text,
    });
    if (result.length === HISTORY_INSIGHT_LIMITS.maxItems) break;
  }
  return result;
}

function normalizeRecommendations(raw: unknown): InsightRecommendation[] {
  if (!Array.isArray(raw)) return [];
  const result: InsightRecommendation[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) continue;
    const text = cleanTitleAndDescription(item);
    if (!text) continue;
    result.push(text);
    if (result.length === HISTORY_INSIGHT_LIMITS.maxItems) break;
  }
  return result;
}

// Output của LLM là dữ liệu không tin cậy: chỉ giữ đúng shape, bỏ Markdown/HTML,
// cắt độ dài, chuẩn hóa category. Thiếu nhận xét tổng quan hoặc không còn điểm
// yếu nào thì coi như hỏng để adapter thử lại.
export function validateHistoryInsight(
  raw: unknown,
): Result<HistoryInsightContent, Error> {
  if (!isPlainObject(raw)) {
    return err(new Error('Insight payload must be a JSON object.'));
  }

  const overallFeedback = cleanRubricPlainText(
    raw.overallFeedback,
    HISTORY_INSIGHT_LIMITS.maxOverallFeedbackChars,
  );
  if (!overallFeedback) {
    return err(new Error('overallFeedback must not be empty.'));
  }

  const weaknesses = normalizeFeedbackItems(raw.weaknesses);
  if (weaknesses.length === 0) {
    return err(new Error('weaknesses must contain at least one valid item.'));
  }

  return ok({
    overallFeedback,
    strengths: normalizeFeedbackItems(raw.strengths),
    weaknesses,
    recommendations: normalizeRecommendations(raw.recommendations),
  });
}
