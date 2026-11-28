import {
  roundScore,
  roundScores,
  subtractScores,
} from './interview-stats.calculator';

describe('interview stats calculator', () => {
  describe('roundScore', () => {
    // 8, 6 và 0 điểm (buổi bỏ trống vẫn được tính) cho trung bình 4.666...
    it('rounds an average to one decimal', () => {
      expect(roundScore(14 / 3)).toBe(4.7);
    });

    it('hides floating point noise from a subtraction', () => {
      expect(7.6 - 6.9).not.toBe(0.7);
      expect(roundScore(7.6 - 6.9)).toBe(0.7);
    });

    // toBe dùng Object.is nên phân biệt được 0 và -0
    it('never returns negative zero', () => {
      expect(roundScore(-0.04)).toBe(0);
    });

    it('keeps a real negative value', () => {
      expect(roundScore(-0.06)).toBe(-0.1);
    });
  });

  it('rounds every score of a set', () => {
    expect(
      roundScores({
        contentScore: 20 / 3,
        relevanceScore: 16 / 3,
        confidenceScore: 13 / 3,
        overallScore: 14 / 3,
      }),
    ).toEqual({
      contentScore: 6.7,
      relevanceScore: 5.3,
      confidenceScore: 4.3,
      overallScore: 4.7,
    });
  });

  it('subtracts the previous scores from the current ones', () => {
    expect(
      subtractScores(
        {
          contentScore: 8,
          relevanceScore: 7.6,
          confidenceScore: 6,
          overallScore: 7.4,
        },
        {
          contentScore: 7.5,
          relevanceScore: 6.9,
          confidenceScore: 6.5,
          overallScore: 7.4,
        },
      ),
    ).toEqual({
      contentScore: 0.5,
      relevanceScore: 0.7,
      confidenceScore: -0.5,
      overallScore: 0,
    });
  });
});
