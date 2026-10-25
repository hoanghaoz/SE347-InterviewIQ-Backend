import { ApiProperty } from '@nestjs/swagger';
import { CommonSessionStatus } from '../../../interview/domain/enums/interview-enum';

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

  // Ba field dưới đây là khung cho trang chi tiết: có mặt trong contract từ bây
  // giờ nhưng chưa có dữ liệu, để khi module sở hữu đổ vào thì shape của
  // response không đổi và frontend không phải sửa.
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description:
      'Reserved for the scoring module (table `scores`). Always null for now.',
    example: null,
  })
  score!: Record<string, unknown> | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description:
      'Reserved for the scoring module (table `interview_summaries`). Always null for now.',
    example: null,
  })
  summary!: Record<string, unknown> | null;

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description:
      'Reserved for the interview module (tables `questions` and `answers`). Always [] for now, never null.',
    example: [],
  })
  questions!: Record<string, unknown>[];
}
