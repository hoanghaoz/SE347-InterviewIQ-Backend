import { FeedbackCategory } from '../../scoring/domain/enums/scoring-enum';
import { HISTORY_INSIGHT_LIMITS } from './constants/history-insight.constants';
import { validateHistoryInsight } from './history-insight.validator';

describe('validateHistoryInsight', () => {
  const weakness = {
    category: FeedbackCategory.COMMUNICATION,
    title: 'Trình bày dài dòng',
    description: 'Nhiều buổi đi vòng trước khi vào ý chính.',
  };

  const valid = {
    overallFeedback: 'Tiến bộ đều ở phần kỹ thuật.',
    strengths: [
      {
        category: FeedbackCategory.TECHNICAL_KNOWLEDGE,
        title: 'Nền tảng vững',
        description: 'Giải thích đúng DI và lifecycle.',
      },
    ],
    weaknesses: [weakness],
    recommendations: [
      { title: 'Luyện STAR', description: 'Chuẩn bị 3 câu chuyện dự án.' },
    ],
  };

  it('accepts a well-formed payload', () => {
    const result = validateHistoryInsight(valid);

    if (result.isErr()) throw result.error;
    expect(result.value).toEqual(valid);
  });

  it.each([null, 'text', 42, []])('rejects %p as payload', (raw) => {
    expect(validateHistoryInsight(raw).isErr()).toBe(true);
  });

  it('rejects an empty overall feedback', () => {
    expect(
      validateHistoryInsight({ ...valid, overallFeedback: '   ' }).isErr(),
    ).toBe(true);
  });

  it('rejects a payload without any valid weakness', () => {
    expect(
      validateHistoryInsight({
        ...valid,
        weaknesses: [{ category: 'COMMUNICATION', title: '', description: '' }],
      }).isErr(),
    ).toBe(true);
  });

  it('strips Markdown and HTML from the text', () => {
    const result = validateHistoryInsight({
      ...valid,
      overallFeedback: '**Tốt** <b>lắm</b>',
    });

    if (result.isErr()) throw result.error;
    expect(result.value.overallFeedback).toBe('Tốt lắm');
  });

  it('falls back to COMMUNICATION for an unknown category', () => {
    const result = validateHistoryInsight({
      ...valid,
      weaknesses: [{ ...weakness, category: 'MADE_UP' }],
    });

    if (result.isErr()) throw result.error;
    expect(result.value.weaknesses[0].category).toBe(
      FeedbackCategory.COMMUNICATION,
    );
  });

  it('drops malformed items, unknown keys and caps every list', () => {
    const many = Array.from({ length: 8 }, () => ({
      ...weakness,
      internal: 'x',
    }));
    const result = validateHistoryInsight({
      ...valid,
      strengths: ['not-an-object', { title: 'only title' }],
      weaknesses: many,
      recommendations: [{ title: 'T', description: 'D', extra: 1 }, null],
    });

    if (result.isErr()) throw result.error;
    expect(result.value.strengths).toEqual([]);
    expect(result.value.weaknesses).toHaveLength(
      HISTORY_INSIGHT_LIMITS.maxItems,
    );
    expect(result.value.weaknesses[0]).not.toHaveProperty('internal');
    expect(result.value.recommendations).toEqual([
      { title: 'T', description: 'D' },
    ]);
  });

  it('treats lists that are not arrays as empty', () => {
    const result = validateHistoryInsight({
      ...valid,
      strengths: { title: 'x' },
      recommendations: 'none',
    });

    if (result.isErr()) throw result.error;
    expect(result.value.strengths).toEqual([]);
    expect(result.value.recommendations).toEqual([]);
  });

  it('cuts the overall feedback to the maximum length', () => {
    const result = validateHistoryInsight({
      ...valid,
      overallFeedback: 'a'.repeat(
        HISTORY_INSIGHT_LIMITS.maxOverallFeedbackChars + 50,
      ),
    });

    if (result.isErr()) throw result.error;
    expect(result.value.overallFeedback).toHaveLength(
      HISTORY_INSIGHT_LIMITS.maxOverallFeedbackChars,
    );
  });
});
