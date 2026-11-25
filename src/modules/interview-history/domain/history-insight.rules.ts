import {
  ALLOWED_FEEDBACK_CATEGORIES,
  FeedbackCategory,
} from '../../scoring/domain/enums/scoring-enum';
import type {
  HistoryFingerprint,
  HistoryInsightData,
  InsightSessionData,
} from './repositories/history-insight.repo.interface';

export type FeedbackCategoryCounts = {
  // Số buổi có ít nhất một nhận xét thuộc category đó (đếm theo buổi, không
  // theo item), để đọc được kiểu "COMMUNICATION xuất hiện ở 7/10 buổi".
  readonly strengths: Readonly<Record<FeedbackCategory, number>>;
  readonly improvements: Readonly<Record<FeedbackCategory, number>>;
  // Số buổi được đếm: không gồm buổi bỏ trống chấm theo luật.
  readonly countedSessions: number;
};

function emptyCounts(): Record<FeedbackCategory, number> {
  const counts = {} as Record<FeedbackCategory, number>;
  for (const category of ALLOWED_FEEDBACK_CATEGORIES) counts[category] = 0;
  return counts;
}

const CATEGORY_SET = new Set<string>(ALLOWED_FEEDBACK_CATEGORIES);

function addPresence(
  counts: Record<FeedbackCategory, number>,
  items: readonly { category: string }[],
): void {
  const seen = new Set(
    items.map((item) => item.category).filter((c) => CATEGORY_SET.has(c)),
  );
  for (const category of seen) counts[category as FeedbackCategory] += 1;
}

export function countFeedbackCategories(
  sessions: readonly InsightSessionData[],
): FeedbackCategoryCounts {
  const strengths = emptyCounts();
  const improvements = emptyCounts();
  let countedSessions = 0;
  for (const session of sessions) {
    // Buổi bỏ trống luôn có một improvement viết sẵn thuộc COMMUNICATION;
    // đếm nó vào thì AI sẽ kết luận sai là người dùng yếu giao tiếp.
    if (session.isRuleBased) continue;
    countedSessions += 1;
    addPresence(strengths, session.strengths);
    addPresence(improvements, session.improvements);
  }
  return { strengths, improvements, countedSessions };
}

export function canGenerateInsight(
  fingerprint: HistoryFingerprint,
  minCompletedSessions: number,
): boolean {
  return fingerprint.completedSessions >= minCompletedSessions;
}

// Nhận xét còn đúng với lịch sử hiện tại khi cả số buổi lẫn mốc hoàn thành mới
// nhất đều không đổi.
export function isInsightCurrent(
  insight: Pick<
    HistoryInsightData,
    'basedOnSessionCount' | 'lastSessionCompletedAt'
  >,
  fingerprint: HistoryFingerprint,
): boolean {
  return (
    insight.basedOnSessionCount === fingerprint.completedSessions &&
    (insight.lastSessionCompletedAt?.getTime() ?? null) ===
      (fingerprint.lastCompletedAt?.getTime() ?? null)
  );
}
