import { normalizeEmotionSummary } from './emotion-summary.type';

describe('normalizeEmotionSummary', () => {
  it('should normalize a valid emotion_summary object with dominant and distribution', () => {
    const raw = {
      dominant: 'neutral',
      distribution: {
        neutral: 0.55,
        happy: 0.25,
        surprised: 0.1,
        sad: 0.05,
        angry: 0.03,
        fearful: 0.02,
      },
    };

    const result = normalizeEmotionSummary(raw);

    expect(result).toEqual({
      dominant: 'neutral',
      distribution: {
        neutral: 0.55,
        happy: 0.25,
        surprised: 0.1,
        sad: 0.05,
        angry: 0.03,
        fearful: 0.02,
      },
    });
  });

  it('should clamp probabilities to [0, 1] and ignore unknown keys like wordsPerMinute', () => {
    const raw = {
      dominant: '  HAPPY\u0000 ',
      wordsPerMinute: 135,
      extraTopLevel: 'ignored',
      distribution: {
        happy: 1.4,
        neutral: -0.25,
        surprised: 0.123456,
        wordsPerMinute: 135,
        unknownEmotion: 0.5,
        sad: Number.NaN,
        angry: 'invalid',
      },
    };

    const result = normalizeEmotionSummary(raw);

    expect(result).toEqual({
      dominant: 'happy',
      distribution: {
        happy: 1,
        neutral: 0,
        surprised: 0.1235,
      },
    });
    expect(result).not.toHaveProperty('wordsPerMinute');
  });

  it('should return null when input is null, undefined, primitive, or array', () => {
    expect(normalizeEmotionSummary(null)).toBeNull();
    expect(normalizeEmotionSummary(undefined)).toBeNull();
    expect(normalizeEmotionSummary('neutral')).toBeNull();
    expect(normalizeEmotionSummary(123)).toBeNull();
    expect(normalizeEmotionSummary([])).toBeNull();
  });

  it('should return null when dominant is missing, empty, or not an allowed emotion label', () => {
    expect(
      normalizeEmotionSummary({
        confidence: 0.85,
      }),
    ).toBeNull();

    expect(
      normalizeEmotionSummary({
        dominant: '   ',
        distribution: { neutral: 1 },
      }),
    ).toBeNull();

    expect(
      normalizeEmotionSummary({
        dominant: 'unknown_label',
        distribution: { neutral: 1 },
      }),
    ).toBeNull();
  });

  it('should return null when distribution is missing, not an object, or has no valid finite entries', () => {
    expect(
      normalizeEmotionSummary({
        dominant: 'neutral',
      }),
    ).toBeNull();

    expect(
      normalizeEmotionSummary({
        dominant: 'neutral',
        distribution: {},
      }),
    ).toBeNull();

    expect(
      normalizeEmotionSummary({
        dominant: 'neutral',
        distribution: {
          unknownKey: 0.8,
          neutral: Number.NaN,
          happy: Number.POSITIVE_INFINITY,
        },
      }),
    ).toBeNull();
  });
});
