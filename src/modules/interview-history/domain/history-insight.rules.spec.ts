import { FeedbackCategory } from '../../scoring/domain/enums/scoring-enum';
import {
  canGenerateInsight,
  countFeedbackCategories,
  isInsightCurrent,
} from './history-insight.rules';
import type { InsightSessionData } from './repositories/history-insight.repo.interface';

describe('history insight rules', () => {
  const session = (
    overrides: Partial<InsightSessionData> = {},
  ): InsightSessionData => ({
    title: 'Session',
    createdAt: new Date('2026-10-01T08:00:00.000Z'),
    contentScore: 7,
    relevanceScore: 7,
    confidenceScore: 7,
    overallScore: 7,
    isRuleBased: false,
    strengths: [],
    improvements: [],
    ...overrides,
  });

  const item = (category: string) => ({
    category,
    title: 'Title',
    description: 'Description',
  });

  describe('countFeedbackCategories', () => {
    it('counts each category once per session, not once per item', () => {
      const counts = countFeedbackCategories([
        session({
          improvements: [
            item(FeedbackCategory.COMMUNICATION),
            item(FeedbackCategory.COMMUNICATION),
          ],
        }),
        session({ improvements: [item(FeedbackCategory.COMMUNICATION)] }),
      ]);

      expect(counts.improvements[FeedbackCategory.COMMUNICATION]).toBe(2);
      expect(counts.countedSessions).toBe(2);
    });

    // Buổi bỏ trống luôn có improvement viết sẵn thuộc COMMUNICATION
    it('ignores sessions scored by the empty-answer rule', () => {
      const counts = countFeedbackCategories([
        session({
          isRuleBased: true,
          improvements: [item(FeedbackCategory.COMMUNICATION)],
        }),
        session({ strengths: [item(FeedbackCategory.TECHNICAL_KNOWLEDGE)] }),
      ]);

      expect(counts.improvements[FeedbackCategory.COMMUNICATION]).toBe(0);
      expect(counts.strengths[FeedbackCategory.TECHNICAL_KNOWLEDGE]).toBe(1);
      expect(counts.countedSessions).toBe(1);
    });

    it('lists every category with 0 and skips unknown ones', () => {
      const counts = countFeedbackCategories([
        session({ strengths: [item('NOT_A_CATEGORY')] }),
      ]);

      expect(Object.keys(counts.strengths).sort()).toEqual(
        Object.values(FeedbackCategory).sort(),
      );
      expect(Object.values(counts.strengths).every((n) => n === 0)).toBe(true);
    });
  });

  describe('canGenerateInsight', () => {
    it('needs the minimum number of completed sessions', () => {
      const lastCompletedAt = null;
      expect(
        canGenerateInsight({ completedSessions: 1, lastCompletedAt }, 2),
      ).toBe(false);
      expect(
        canGenerateInsight({ completedSessions: 2, lastCompletedAt }, 2),
      ).toBe(true);
    });
  });

  describe('isInsightCurrent', () => {
    const at = new Date('2026-10-20T08:14:02.000Z');

    it('is current when the count and the last completion are unchanged', () => {
      expect(
        isInsightCurrent(
          { basedOnSessionCount: 3, lastSessionCompletedAt: new Date(at) },
          { completedSessions: 3, lastCompletedAt: new Date(at) },
        ),
      ).toBe(true);
    });

    it('is stale when a session was completed since', () => {
      expect(
        isInsightCurrent(
          { basedOnSessionCount: 3, lastSessionCompletedAt: at },
          { completedSessions: 4, lastCompletedAt: at },
        ),
      ).toBe(false);
    });

    // Cùng số buổi nhưng buổi mới nhất được chấm lại
    it('is stale when the last completion moved', () => {
      expect(
        isInsightCurrent(
          { basedOnSessionCount: 3, lastSessionCompletedAt: at },
          {
            completedSessions: 3,
            lastCompletedAt: new Date('2026-10-21T08:00:00.000Z'),
          },
        ),
      ).toBe(false);
    });

    it('treats two missing completion dates as equal', () => {
      expect(
        isInsightCurrent(
          { basedOnSessionCount: 2, lastSessionCompletedAt: null },
          { completedSessions: 2, lastCompletedAt: null },
        ),
      ).toBe(true);
      expect(
        isInsightCurrent(
          { basedOnSessionCount: 2, lastSessionCompletedAt: null },
          { completedSessions: 2, lastCompletedAt: at },
        ),
      ).toBe(false);
    });
  });
});
