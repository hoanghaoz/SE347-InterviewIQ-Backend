import { ApiProperty } from '@nestjs/swagger';
import { ScoringJobStatus } from '../../domain/enums/scoring-enum';
import type {
  ImprovementItem,
  StrengthItem,
} from '../../domain/entities/scoring-job.entity';

export class ScoringJobStatusResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'pg-boss job identifier',
  })
  jobId!: string;

  @ApiProperty({
    format: 'uuid',
    example: '770e8400-e29b-41d4-a716-446655440000',
    description: 'Interview session UUID',
  })
  sessionId!: string;

  @ApiProperty({
    enum: ScoringJobStatus,
    example: ScoringJobStatus.COMPLETED,
    description: 'Current job status in queue',
  })
  status!: ScoringJobStatus;

  @ApiProperty({
    format: 'date-time',
    example: '2026-09-23T10:00:00.000Z',
    description: 'Timestamp when job was created',
  })
  createdAt!: string;

  @ApiProperty({
    nullable: true,
    format: 'date-time',
    example: '2026-09-23T10:02:30.000Z',
    description: 'Timestamp when job was completed, or null if still pending',
  })
  completedAt!: string | null;
}

export class ScoreDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  publicId!: string;

  @ApiProperty({ example: 8.0, description: 'Content quality score (0-10)' })
  contentScore!: number;

  @ApiProperty({ example: 7.5, description: 'Question relevance score (0-10)' })
  relevanceScore!: number;

  @ApiProperty({
    example: 6.5,
    description: 'Delivery confidence score (0-10)',
  })
  confidenceScore!: number;

  @ApiProperty({ example: 7.4, description: 'Weighted overall score (0-10)' })
  overallScore!: number;

  @ApiProperty({
    format: 'date-time',
    example: '2026-09-23T10:02:30.000Z',
  })
  scoredAt!: string;
}

export class StrengthDto implements StrengthItem {
  @ApiProperty({ example: 'TECHNICAL_KNOWLEDGE' })
  category!: string;

  @ApiProperty({ example: 'Nắm vững kiến thức chuyên môn' })
  title!: string;

  @ApiProperty({
    example: 'Hiểu rõ các nguyên lý thiết kế và mô hình kiến trúc.',
  })
  description!: string;
}

export class ImprovementDto implements ImprovementItem {
  @ApiProperty({ example: 'COMMUNICATION' })
  category!: string;

  @ApiProperty({ example: 'Trình bày súc tích và có cấu trúc hơn' })
  title!: string;

  @ApiProperty({
    example: 'Nên đi thẳng vào kết quả trước khi mô tả chi tiết quá trình.',
  })
  description!: string;

  @ApiProperty({
    required: false,
    example: 'Áp dụng mô hình STAR (Situation, Task, Action, Result).',
  })
  suggestion?: string;
}

export class SummaryDto {
  @ApiProperty({
    format: 'uuid',
    example: '660e8400-e29b-41d4-a716-446655440000',
  })
  publicId!: string;

  @ApiProperty({
    example:
      'Ứng viên thể hiện kiến thức nền tảng tốt, tư duy giải quyết vấn đề mạch lạc và tự tin.',
  })
  overallFeedback!: string;

  @ApiProperty({ type: [StrengthDto] })
  strengths!: StrengthDto[];

  @ApiProperty({ type: [ImprovementDto] })
  improvements!: ImprovementDto[];

  @ApiProperty({ example: 'gemini-2.5-flash' })
  scoringModel!: string;

  @ApiProperty({ nullable: true, example: 'v1.0' })
  promptVersion!: string | null;

  @ApiProperty({
    format: 'date-time',
    example: '2026-09-23T10:02:30.000Z',
  })
  generatedAt!: string;
}

export class SessionResultResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '770e8400-e29b-41d4-a716-446655440000',
  })
  sessionId!: string;

  @ApiProperty({ type: ScoreDto })
  scores!: ScoreDto;

  @ApiProperty({ type: SummaryDto })
  summary!: SummaryDto;
}
