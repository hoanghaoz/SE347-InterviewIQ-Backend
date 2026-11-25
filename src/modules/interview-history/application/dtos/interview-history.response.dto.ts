import { ApiProperty } from '@nestjs/swagger';
import {
  CheatLogDto,
  CheatSummaryDto,
} from '../../../interview/application/dtos/cheat-log.response.dto';
import { CommonSessionStatus } from '../../../interview/domain/enums/interview-enum';
import {
  QuestionDifficulty,
  QuestionDomain,
} from '../../../question-generation/domain/enums/question.enum';
import {
  ImprovementDto,
  StrengthDto,
} from '../../../scoring/application/dtos/scoring.response.dto';

// Response DTOs only describe the output for Swagger: no class-validator here.
export class InterviewHistoryItemDto {
  @ApiProperty({
    format: 'uuid',
    example: '3f1c2b9e-8a4d-4f6b-9c1e-2d7a5b0e4f11',
  })
  id!: string;

  @ApiProperty({ example: 'Backend Intern - NestJS' })
  title!: string;

  @ApiProperty({
    enum: CommonSessionStatus,
    enumName: 'CommonSessionStatus',
    example: CommonSessionStatus.COMPLETED,
  })
  status!: CommonSessionStatus;

  @ApiProperty({ example: 5 })
  totalQuestions!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Null until the session is submitted',
    example: 842,
  })
  durationSeconds!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Null until scoring finishes',
    example: 7.5,
  })
  overallScore!: number | null;

  @ApiProperty({
    description: 'True when the session has at least one cheat log',
    example: true,
  })
  isFlagged!: boolean;

  @ApiProperty({
    description: 'Number of cheat events recorded for the session',
    example: 3,
  })
  cheatEventCount!: number;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt!: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-10-20T07:58:11.000Z' })
  createdAt!: string;
}

export class InterviewHistoryCvDto {
  @ApiProperty({
    format: 'uuid',
    example: '9b1c2d3e-4f50-4a6b-8c7d-0e1f2a3b4c5d',
  })
  id!: string;

  @ApiProperty({ example: 'nguyen-van-a-cv.pdf' })
  fileName!: string;
}

export class InterviewHistoryAnswerDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Cloudinary delivery URL stored when the answer was saved. Null when the answer has no video.',
    example:
      'https://res.cloudinary.com/demo/video/upload/v1/interview-answers/answer.webm',
  })
  videoUrl!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Video length in whole seconds',
    example: 95,
  })
  durationSeconds!: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Transcript sent by the frontend. An empty string is a silent answer.',
  })
  transcript!: string | null;
}

export class InterviewHistoryQuestionDto {
  @ApiProperty({
    format: 'uuid',
    example: '5d2e1c4b-7a3f-4e9d-8b6c-1f0a2e3d4c5b',
  })
  id!: string;

  @ApiProperty({ example: 1 })
  orderIndex!: number;

  @ApiProperty({
    example: 'Giải thích cơ chế Dependency Injection trong NestJS.',
  })
  content!: string;

  @ApiProperty({
    enum: QuestionDomain,
    enumName: 'QuestionDomain',
    example: QuestionDomain.TECHNICAL,
  })
  domain!: QuestionDomain;

  @ApiProperty({
    enum: QuestionDifficulty,
    enumName: 'QuestionDifficulty',
    example: QuestionDifficulty.MEDIUM,
  })
  difficulty!: QuestionDifficulty;

  @ApiProperty({
    type: InterviewHistoryAnswerDto,
    nullable: true,
    description: 'Null when the question was never answered',
  })
  answer!: InterviewHistoryAnswerDto | null;
}

export class InterviewHistoryScoreDto {
  @ApiProperty({ example: 8.0 })
  contentScore!: number;

  @ApiProperty({ example: 7.5 })
  relevanceScore!: number;

  @ApiProperty({ example: 7.0 })
  confidenceScore!: number;

  @ApiProperty({
    example: 7.6,
    description: 'content 40% + relevance 40% + confidence 20%',
  })
  overallScore!: number;

  @ApiProperty({
    example: 10,
    description: 'Upper bound of every score above (scale 0..maxScore)',
  })
  maxScore!: number;

  @ApiProperty({ format: 'date-time' })
  scoredAt!: string;
}

export class InterviewHistorySummaryDto {
  @ApiProperty({
    example:
      'Ứng viên nắm vững nền tảng NestJS, trả lời đúng trọng tâm nhưng còn thiếu ví dụ thực tế.',
  })
  overallFeedback!: string;

  @ApiProperty({ type: [StrengthDto] })
  strengths!: StrengthDto[];

  @ApiProperty({ type: [ImprovementDto] })
  improvements!: ImprovementDto[];
}

export class InterviewHistoryDetailDto {
  @ApiProperty({
    format: 'uuid',
    example: '3f1c2b9e-8a4d-4f6b-9c1e-2d7a5b0e4f11',
  })
  id!: string;

  @ApiProperty({ example: 'Backend Intern - NestJS' })
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  jobDescription!: string | null;

  @ApiProperty({
    enum: CommonSessionStatus,
    enumName: 'CommonSessionStatus',
    example: CommonSessionStatus.COMPLETED,
  })
  status!: CommonSessionStatus;

  @ApiProperty({ example: 5 })
  totalQuestions!: number;

  @ApiProperty({ type: Number, nullable: true, example: 842 })
  durationSeconds!: number | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  submittedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({
    type: InterviewHistoryCvDto,
    nullable: true,
    description:
      'Null when no CV was attached, or the CV was deleted (relation is onDelete: SetNull)',
  })
  cv!: InterviewHistoryCvDto | null;

  // score và summary chỉ có giá trị khi status = COMPLETED, kể cả khi database
  // đã có bản ghi: trước lúc đó kết quả chưa phải kết quả cuối.
  @ApiProperty({
    type: InterviewHistoryScoreDto,
    nullable: true,
    description:
      'Session-level scores. Null unless status is COMPLETED. There is no per-question score.',
  })
  score!: InterviewHistoryScoreDto | null;

  @ApiProperty({
    type: InterviewHistorySummaryDto,
    nullable: true,
    description:
      'AI feedback for the whole session. Null unless status is COMPLETED.',
  })
  summary!: InterviewHistorySummaryDto | null;

  @ApiProperty({
    type: [InterviewHistoryQuestionDto],
    description:
      'Ordered by orderIndex ascending. Always an array, never null. Present in every status, including FAILED.',
  })
  questions!: InterviewHistoryQuestionDto[];

  @ApiProperty({
    description: 'True when the session has at least one cheat log',
    example: true,
  })
  isFlagged!: boolean;

  @ApiProperty({ type: CheatSummaryDto })
  cheatSummary!: CheatSummaryDto;

  @ApiProperty({
    type: [CheatLogDto],
    description:
      'Ordered by occurredAt ascending. Always an array, never null.',
  })
  cheatLogs!: CheatLogDto[];
}
