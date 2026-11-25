import { ApiProperty } from '@nestjs/swagger';
import { FeedbackCategory } from '../../../scoring/domain/enums/scoring-enum';

// Response DTOs only describe the output for Swagger: no class-validator here.
export class InsightFeedbackItemDto {
  @ApiProperty({
    enum: FeedbackCategory,
    enumName: 'FeedbackCategory',
    example: FeedbackCategory.COMMUNICATION,
  })
  category!: string;

  @ApiProperty({ example: 'Thiếu ví dụ thực tế theo mô hình STAR' })
  title!: string;

  @ApiProperty({
    example:
      'Ở phần lớn các buổi gần đây, câu trả lời hành vi dừng ở mức lý thuyết.',
  })
  description!: string;
}

export class InsightRecommendationDto {
  @ApiProperty({ example: 'Luyện trả lời theo STAR' })
  title!: string;

  @ApiProperty({
    example:
      'Chuẩn bị sẵn 3 câu chuyện dự án và tập kể theo Situation - Task - Action - Result.',
  })
  description!: string;
}

export class HistoryInsightDto {
  @ApiProperty({
    example:
      'Điểm nội dung tăng đều qua các buổi, nhưng phần trình bày vẫn là điểm yếu lặp lại.',
  })
  overallFeedback!: string;

  @ApiProperty({ type: [InsightFeedbackItemDto] })
  strengths!: InsightFeedbackItemDto[];

  @ApiProperty({ type: [InsightFeedbackItemDto] })
  weaknesses!: InsightFeedbackItemDto[];

  @ApiProperty({ type: [InsightRecommendationDto] })
  recommendations!: InsightRecommendationDto[];

  @ApiProperty({
    example: 8,
    description: 'Completed sessions the insight was generated from',
  })
  basedOnSessionCount!: number;

  @ApiProperty({ format: 'date-time' })
  generatedAt!: string;
}

export class HistoryInsightStateDto {
  @ApiProperty({ example: 9, description: 'Completed sessions right now' })
  completedSessions!: number;

  @ApiProperty({
    example: 2,
    description: 'Completed sessions needed before an insight can be generated',
  })
  minCompletedSessions!: number;

  @ApiProperty({
    description: 'True when completedSessions >= minCompletedSessions',
  })
  canGenerate!: boolean;

  @ApiProperty({
    description:
      'True when an insight exists but the history changed since it was generated. False when there is no insight',
  })
  isStale!: boolean;

  @ApiProperty({
    type: HistoryInsightDto,
    nullable: true,
    description: 'Null until the first successful generation',
  })
  insight!: HistoryInsightDto | null;
}
