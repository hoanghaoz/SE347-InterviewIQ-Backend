import { ApiProperty } from '@nestjs/swagger';

// Response DTOs only describe the output for Swagger: no class-validator here.
export class InterviewStatsScoresDto {
  @ApiProperty({ example: 7.2 })
  contentScore!: number;

  @ApiProperty({ example: 6.8 })
  relevanceScore!: number;

  @ApiProperty({ example: 6.5 })
  confidenceScore!: number;

  @ApiProperty({
    example: 6.9,
    description: 'content 40% + relevance 40% + confidence 20%',
  })
  overallScore!: number;
}

export class InterviewStatsSessionDto extends InterviewStatsScoresDto {
  @ApiProperty({
    format: 'uuid',
    example: '3f1c2b9e-8a4d-4f6b-9c1e-2d7a5b0e4f11',
  })
  id!: string;

  @ApiProperty({ example: 'Backend Intern - NestJS' })
  title!: string;

  @ApiProperty({ format: 'date-time', example: '2026-10-20T07:58:11.000Z' })
  createdAt!: string;
}

export class InterviewStatsComparisonDto {
  @ApiProperty({
    type: InterviewStatsSessionDto,
    description: 'Most recent completed session',
  })
  latest!: InterviewStatsSessionDto;

  @ApiProperty({
    type: InterviewStatsSessionDto,
    nullable: true,
    description: 'Completed session right before latest. Null with only one',
  })
  previous!: InterviewStatsSessionDto | null;

  @ApiProperty({
    type: InterviewStatsScoresDto,
    nullable: true,
    description:
      'latest minus previous for each score, rounded to 1 decimal. Positive means improvement',
  })
  delta!: InterviewStatsScoresDto | null;
}

export class InterviewStatsDto {
  @ApiProperty({
    example: 10,
    description: 'Upper bound of every score (scale 0..maxScore)',
  })
  maxScore!: number;

  @ApiProperty({
    example: 12,
    description: 'Completed sessions in the date range',
  })
  completedSessions!: number;

  @ApiProperty({
    example: 58,
    description:
      'Answers with a non-empty transcript in those completed sessions',
  })
  answeredQuestions!: number;

  @ApiProperty({
    type: InterviewStatsScoresDto,
    nullable: true,
    description:
      'Average of every completed session in the range, rounded to 1 decimal. Sessions scored 0 for having no answer are included. Null when there is none',
  })
  averages!: InterviewStatsScoresDto | null;

  @ApiProperty({
    type: InterviewStatsSessionDto,
    nullable: true,
    description:
      'Session with the highest overallScore; the newest wins a tie. Null when there is none',
  })
  best!: InterviewStatsSessionDto | null;

  @ApiProperty({
    type: [InterviewStatsSessionDto],
    description:
      'Up to `limit` most recent completed sessions, oldest first (ready for a line chart). Always an array',
  })
  trend!: InterviewStatsSessionDto[];

  @ApiProperty({
    type: InterviewStatsComparisonDto,
    nullable: true,
    description: 'Latest vs previous session. Null when there is no session',
  })
  comparison!: InterviewStatsComparisonDto | null;
}
