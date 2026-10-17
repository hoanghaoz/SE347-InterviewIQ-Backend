import type {
  InterviewSummary as PrismaInterviewSummary,
  Score as PrismaScore,
} from '../../../../generated/prisma/client';
import { SessionStatus } from '../../../../generated/prisma/enums';
import { InterviewSummary, Score } from '../domain/entities/scoring-job.entity';
import { ScoringJobStatus } from '../domain/enums/scoring-enum';
import {
  mapScoreToDomain,
  mapScoreToDto,
  mapSessionStatusToJobStatus,
  mapSummaryToDomain,
  mapSummaryToDto,
  mapToSessionResultDto,
} from './scoring-mapper';

describe('Scoring Mapper', () => {
  const fixedDate = new Date('2026-09-23T10:00:00.000Z');

  describe('Enum Mapping', () => {
    it('should map SessionStatus to ScoringJobStatus correctly', () => {
      expect(mapSessionStatusToJobStatus(SessionStatus.SUBMITTED)).toBe(
        ScoringJobStatus.QUEUED,
      );
      expect(mapSessionStatusToJobStatus(SessionStatus.SCORING)).toBe(
        ScoringJobStatus.PROCESSING,
      );
      expect(mapSessionStatusToJobStatus(SessionStatus.COMPLETED)).toBe(
        ScoringJobStatus.COMPLETED,
      );
      expect(mapSessionStatusToJobStatus(SessionStatus.FAILED)).toBe(
        ScoringJobStatus.FAILED,
      );
      expect(mapSessionStatusToJobStatus(SessionStatus.CREATED)).toBe(
        ScoringJobStatus.QUEUED,
      );
    });
  });

  describe('Prisma -> Domain Mapping', () => {
    it('should map Prisma Score row to Score domain entity', () => {
      const prismaScore: PrismaScore = {
        id: 1,
        publicId: 'score-uuid-1',
        sessionId: 10,
        contentScore: 8.5,
        relevanceScore: 7.5,
        confidenceScore: 8.0,
        overallScore: 8.0,
        scoredAt: fixedDate,
        createdAt: fixedDate,
      };

      const entity = mapScoreToDomain(prismaScore);
      expect(entity.id).toBe(1);
      expect(entity.publicId).toBe('score-uuid-1');
      expect(entity.sessionId).toBe(10);
      expect(entity.contentScore).toBe(8.5);
      expect(entity.relevanceScore).toBe(7.5);
      expect(entity.confidenceScore).toBe(8.0);
      expect(entity.overallScore).toBe(8.0);
      expect(entity.scoredAt).toEqual(fixedDate);
    });

    it('should map Prisma InterviewSummary row to InterviewSummary domain entity', () => {
      const prismaSummary: PrismaInterviewSummary = {
        id: 2,
        publicId: 'summary-uuid-2',
        sessionId: 10,
        overallFeedback: 'Well structured and clear answers.',
        strengths: [
          {
            category: 'TECH',
            title: 'NestJS Architecture',
            description: 'Good modular design knowledge',
          },
        ],
        improvements: [
          {
            category: 'TIME_MANAGEMENT',
            title: 'Pacing',
            description: 'Spent too much time on introduction',
            suggestion: 'Keep intro under 2 mins',
          },
        ],
        scoringModel: 'gemini-2.5-flash',
        promptVersion: 'v1.0',
        generatedAt: fixedDate,
        createdAt: fixedDate,
      };

      const entity = mapSummaryToDomain(prismaSummary);
      expect(entity.id).toBe(2);
      expect(entity.publicId).toBe('summary-uuid-2');
      expect(entity.sessionId).toBe(10);
      expect(entity.overallFeedback).toBe('Well structured and clear answers.');
      expect(entity.strengths.length).toBe(1);
      expect(entity.strengths[0].title).toBe('NestJS Architecture');
      expect(entity.improvements.length).toBe(1);
      expect(entity.improvements[0].suggestion).toBe('Keep intro under 2 mins');
      expect(entity.scoringModel).toBe('gemini-2.5-flash');
      expect(entity.promptVersion).toBe('v1.0');
    });

    it('should handle non-array strengths and improvements safely', () => {
      const prismaSummary = {
        id: 3,
        publicId: 'summary-uuid-3',
        sessionId: 11,
        overallFeedback: 'Feedback',
        strengths: null,
        improvements: null,
        scoringModel: 'gemini-2.5-flash',
        promptVersion: null,
        generatedAt: fixedDate,
        createdAt: fixedDate,
      } as PrismaInterviewSummary;

      const entity = mapSummaryToDomain(prismaSummary);
      expect(entity.strengths).toEqual([]);
      expect(entity.improvements).toEqual([]);
    });
  });

  describe('Domain -> DTO Mapping', () => {
    const score = Score.getScore({
      id: 1,
      publicId: 'score-uuid-1',
      sessionId: 10,
      contentScore: 8.0,
      relevanceScore: 7.5,
      confidenceScore: 6.5,
      overallScore: 7.5,
      scoredAt: fixedDate,
      createdAt: fixedDate,
    });

    const summary = InterviewSummary.getSummary({
      id: 2,
      publicId: 'summary-uuid-2',
      sessionId: 10,
      overallFeedback: 'Strong candidate overall.',
      strengths: [
        {
          category: 'TECH',
          title: 'Strong fundamentals',
          description: 'Good knowledge',
        },
      ],
      improvements: [
        {
          category: 'COMM',
          title: 'Directness',
          description: 'More direct answers',
        },
      ],
      scoringModel: 'gemini-2.5-flash',
      promptVersion: 'v1.0',
      generatedAt: fixedDate,
      createdAt: fixedDate,
    });

    it('should map Score entity to ScoreDto', () => {
      const dto = mapScoreToDto(score);
      expect(dto.publicId).toBe('score-uuid-1');
      expect(dto.contentScore).toBe(8.0);
      expect(dto.relevanceScore).toBe(7.5);
      expect(dto.confidenceScore).toBe(6.5);
      expect(dto.overallScore).toBe(7.5);
      expect(dto.scoredAt).toBe(fixedDate.toISOString());
    });

    it('should map InterviewSummary entity to SummaryDto', () => {
      const dto = mapSummaryToDto(summary);
      expect(dto.publicId).toBe('summary-uuid-2');
      expect(dto.overallFeedback).toBe('Strong candidate overall.');
      expect(dto.strengths).toHaveLength(1);
      expect(dto.improvements).toHaveLength(1);
      expect(dto.scoringModel).toBe('gemini-2.5-flash');
      expect(dto.generatedAt).toBe(fixedDate.toISOString());
    });

    it('should map domain entities to SessionResultResponseDto', () => {
      const sessionId = 'session-uuid-100';
      const dto = mapToSessionResultDto(sessionId, score, summary);

      expect(dto.sessionId).toBe(sessionId);
      expect(dto.scores.publicId).toBe('score-uuid-1');
      expect(dto.scores.overallScore).toBe(7.5);
      expect(dto.summary.publicId).toBe('summary-uuid-2');
      expect(dto.summary.overallFeedback).toBe('Strong candidate overall.');
    });
  });
});
