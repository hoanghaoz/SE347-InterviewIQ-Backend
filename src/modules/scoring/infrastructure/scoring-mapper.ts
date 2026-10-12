import type {
  InterviewSummary as PrismaInterviewSummary,
  Score as PrismaScore,
} from '../../../../generated/prisma/client';
import { SessionStatus } from '../../../../generated/prisma/enums';
import {
  ImprovementItem,
  InterviewSummary,
  Score,
  StrengthItem,
} from '../domain/entities/scoring-job.entity';
import { ScoringJobStatus } from '../domain/enums/scoring-enum';
import {
  ImprovementDto,
  ScoreDto,
  SessionResultResponseDto,
  StrengthDto,
  SummaryDto,
} from '../application/dtos/scoring.response.dto';

// ---------------------------------------------------------------------------
// Status Enum Mappings
// ---------------------------------------------------------------------------

const sessionStatusToJobStatus: Partial<
  Record<SessionStatus, ScoringJobStatus>
> = {
  [SessionStatus.SUBMITTED]: ScoringJobStatus.QUEUED,
  [SessionStatus.SCORING]: ScoringJobStatus.PROCESSING,
  [SessionStatus.COMPLETED]: ScoringJobStatus.COMPLETED,
  [SessionStatus.FAILED]: ScoringJobStatus.FAILED,
};

export function mapSessionStatusToJobStatus(
  status: SessionStatus,
): ScoringJobStatus {
  return sessionStatusToJobStatus[status] ?? ScoringJobStatus.QUEUED;
}

// ---------------------------------------------------------------------------
// Prisma Row -> Domain Entity
// ---------------------------------------------------------------------------

export function mapScoreToDomain(row: PrismaScore): Score {
  return Score.getScore({
    id: row.id,
    publicId: row.publicId,
    sessionId: row.sessionId,
    contentScore: row.contentScore,
    relevanceScore: row.relevanceScore,
    confidenceScore: row.confidenceScore,
    overallScore: row.overallScore,
    scoredAt: row.scoredAt,
    createdAt: row.createdAt,
  });
}

export function mapSummaryToDomain(
  row: PrismaInterviewSummary,
): InterviewSummary {
  const strengths = Array.isArray(row.strengths)
    ? (row.strengths as unknown as StrengthItem[])
    : [];
  const improvements = Array.isArray(row.improvements)
    ? (row.improvements as unknown as ImprovementItem[])
    : [];

  return InterviewSummary.getSummary({
    id: row.id,
    publicId: row.publicId,
    sessionId: row.sessionId,
    overallFeedback: row.overallFeedback,
    strengths,
    improvements,
    scoringModel: row.scoringModel,
    promptVersion: row.promptVersion,
    generatedAt: row.generatedAt,
    createdAt: row.createdAt,
  });
}

// ---------------------------------------------------------------------------
// Domain Entity -> Response DTO
// ---------------------------------------------------------------------------

export function mapScoreToDto(score: Score): ScoreDto {
  return {
    publicId: score.publicId ?? '',
    contentScore: score.contentScore,
    relevanceScore: score.relevanceScore,
    confidenceScore: score.confidenceScore,
    overallScore: score.overallScore,
    scoredAt: score.scoredAt.toISOString(),
  };
}

export function mapSummaryToDto(summary: InterviewSummary): SummaryDto {
  const strengths: StrengthDto[] = summary.strengths.map((s) => ({
    category: s.category,
    title: s.title,
    description: s.description,
  }));

  const improvements: ImprovementDto[] = summary.improvements.map((i) => ({
    category: i.category,
    title: i.title,
    description: i.description,
    suggestion: i.suggestion,
  }));

  return {
    publicId: summary.publicId ?? '',
    overallFeedback: summary.overallFeedback,
    strengths,
    improvements,
    scoringModel: summary.scoringModel,
    promptVersion: summary.promptVersion,
    generatedAt: summary.generatedAt.toISOString(),
  };
}

export function mapToSessionResultDto(
  sessionId: string,
  score: Score,
  summary: InterviewSummary,
): SessionResultResponseDto {
  return {
    sessionId,
    scores: mapScoreToDto(score),
    summary: mapSummaryToDto(summary),
  };
}
