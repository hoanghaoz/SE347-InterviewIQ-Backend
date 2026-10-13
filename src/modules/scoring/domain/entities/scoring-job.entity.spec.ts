import { InterviewSummary, Score, ScoringResult } from './scoring-job.entity';
import { ScoringDomainError } from '../errors/scoring-domain.error';

describe('Scoring Domain Entities', () => {
  describe('Score Entity', () => {
    it('should create Score with calculated overallScore when valid params are provided', () => {
      const result = Score.create({
        sessionId: 1,
        contentScore: 8.0,
        relevanceScore: 7.5,
        confidenceScore: 7.0,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const score = result.value;
        expect(score.sessionId).toBe(1);
        expect(score.contentScore).toBe(8.0);
        expect(score.relevanceScore).toBe(7.5);
        expect(score.confidenceScore).toBe(7.0);
        // 8.0 * 0.4 + 7.5 * 0.4 + 7.0 * 0.2 = 3.2 + 3.0 + 1.4 = 7.6
        expect(score.overallScore).toBe(7.6);
        expect(score.scoredAt).toBeInstanceOf(Date);
      }
    });

    it('should allow custom overallScore within valid range', () => {
      const result = Score.create({
        sessionId: 1,
        contentScore: 9.0,
        relevanceScore: 9.0,
        confidenceScore: 9.0,
        overallScore: 9.5,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.overallScore).toBe(9.5);
      }
    });

    it('should fail when contentScore is out of [0..10] range', () => {
      const belowZero = Score.create({
        sessionId: 1,
        contentScore: -1,
        relevanceScore: 8.0,
        confidenceScore: 7.0,
      });
      expect(belowZero.isErr()).toBe(true);
      if (belowZero.isErr()) {
        expect(belowZero.error.errorCode).toBe(
          ScoringDomainError.ScoreOutOfRange,
        );
      }

      const aboveTen = Score.create({
        sessionId: 1,
        contentScore: 11,
        relevanceScore: 8.0,
        confidenceScore: 7.0,
      });
      expect(aboveTen.isErr()).toBe(true);
      if (aboveTen.isErr()) {
        expect(aboveTen.error.errorCode).toBe(
          ScoringDomainError.ScoreOutOfRange,
        );
      }
    });

    it('should fail when relevanceScore is out of [0..10] range', () => {
      const result = Score.create({
        sessionId: 1,
        contentScore: 8.0,
        relevanceScore: 10.5,
        confidenceScore: 7.0,
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.errorCode).toBe(ScoringDomainError.ScoreOutOfRange);
      }
    });

    it('should fail when confidenceScore is out of [0..10] range', () => {
      const result = Score.create({
        sessionId: 1,
        contentScore: 8.0,
        relevanceScore: 8.0,
        confidenceScore: -0.5,
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.errorCode).toBe(ScoringDomainError.ScoreOutOfRange);
      }
    });

    it('should rehydrate Score entity via getScore', () => {
      const now = new Date();
      const score = Score.getScore({
        id: 10,
        publicId: 'score-uuid-123',
        sessionId: 2,
        contentScore: 8.5,
        relevanceScore: 8.0,
        confidenceScore: 7.5,
        overallScore: 8.1,
        scoredAt: now,
        createdAt: now,
      });

      expect(score.id).toBe(10);
      expect(score.publicId).toBe('score-uuid-123');
      expect(score.sessionId).toBe(2);
      expect(score.overallScore).toBe(8.1);
      expect(score.scoredAt).toBe(now);
      expect(score.createdAt).toBe(now);
    });
  });

  describe('InterviewSummary Entity', () => {
    const validStrengths = [
      {
        category: 'TECH',
        title: 'Backend NestJS',
        description: 'Understands DI well',
      },
    ];
    const validImprovements = [
      {
        category: 'COMMUNICATION',
        title: 'Be concise',
        description: 'Provide direct answers',
        suggestion: 'Use STAR method',
      },
    ];

    it('should create InterviewSummary with valid params', () => {
      const result = InterviewSummary.create({
        sessionId: 1,
        overallFeedback: 'Good communication and domain knowledge.',
        strengths: validStrengths,
        improvements: validImprovements,
        scoringModel: 'gemini-2.5-flash',
        promptVersion: 'v1.0',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const summary = result.value;
        expect(summary.sessionId).toBe(1);
        expect(summary.overallFeedback).toBe(
          'Good communication and domain knowledge.',
        );
        expect(summary.strengths).toEqual(validStrengths);
        expect(summary.improvements).toEqual(validImprovements);
        expect(summary.scoringModel).toBe('gemini-2.5-flash');
        expect(summary.promptVersion).toBe('v1.0');
        expect(summary.generatedAt).toBeInstanceOf(Date);
      }
    });

    it('should fail when overallFeedback is empty', () => {
      const result = InterviewSummary.create({
        sessionId: 1,
        overallFeedback: '   ',
        strengths: validStrengths,
        improvements: validImprovements,
        scoringModel: 'gemini-2.5-flash',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.errorCode).toBe(
          ScoringDomainError.OverallFeedbackEmpty,
        );
      }
    });

    it('should fail when overallFeedback exceeds 10,000 characters', () => {
      const result = InterviewSummary.create({
        sessionId: 1,
        overallFeedback: 'A'.repeat(10_001),
        strengths: validStrengths,
        improvements: validImprovements,
        scoringModel: 'gemini-2.5-flash',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.errorCode).toBe(
          ScoringDomainError.OverallFeedbackTooLong,
        );
      }
    });

    it('should fail when scoringModel is empty', () => {
      const result = InterviewSummary.create({
        sessionId: 1,
        overallFeedback: 'Solid performance',
        strengths: validStrengths,
        improvements: validImprovements,
        scoringModel: '  ',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.errorCode).toBe(
          ScoringDomainError.InvalidScoringModel,
        );
      }
    });

    it('should rehydrate InterviewSummary entity via getSummary', () => {
      const now = new Date();
      const summary = InterviewSummary.getSummary({
        id: 20,
        publicId: 'summary-uuid-456',
        sessionId: 5,
        overallFeedback: 'Rehydrated feedback',
        strengths: validStrengths,
        improvements: validImprovements,
        scoringModel: 'gemini-2.5-flash',
        promptVersion: 'v2.0',
        generatedAt: now,
        createdAt: now,
      });

      expect(summary.id).toBe(20);
      expect(summary.publicId).toBe('summary-uuid-456');
      expect(summary.sessionId).toBe(5);
      expect(summary.overallFeedback).toBe('Rehydrated feedback');
      expect(summary.promptVersion).toBe('v2.0');
    });
  });

  describe('ScoringResult Aggregate', () => {
    it('should wrap Score and InterviewSummary with sessionPublicId', () => {
      const now = new Date();
      const score = Score.getScore({
        id: 1,
        publicId: 'sc-1',
        sessionId: 1,
        contentScore: 8,
        relevanceScore: 8,
        confidenceScore: 8,
        overallScore: 8,
        scoredAt: now,
        createdAt: now,
      });

      const summary = InterviewSummary.getSummary({
        id: 2,
        publicId: 'sum-1',
        sessionId: 1,
        overallFeedback: 'Great job',
        strengths: [],
        improvements: [],
        scoringModel: 'gemini-2.5-flash',
        promptVersion: null,
        generatedAt: now,
        createdAt: now,
      });

      const aggregate = new ScoringResult(score, summary, 'session-pub-uuid');
      expect(aggregate.score).toBe(score);
      expect(aggregate.summary).toBe(summary);
      expect(aggregate.sessionPublicId).toBe('session-pub-uuid');
    });
  });
});
