import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ALLOWED_EMOTION_LABELS } from '../../../scoring/domain/types/emotion-summary.type';
import {
  MAX_ANSWER_TRANSCRIPT_LENGTH,
  MAX_EMOTION_SAMPLE_COUNT,
  MAX_EMOTION_STATE_LENGTH,
  MAX_EMOTION_TIMELINE_POINTS,
  MAX_EMOTION_TIMELINE_SECONDS,
} from '../../domain/constants/interview-answer.constants';

/**
 * Tỉ lệ thời gian của từng nhãn, 0..1. Mỗi nhãn là một thuộc tính riêng để `whitelist` của
 * ValidationPipe loại khóa lạ; nhãn không có mặt thì bỏ qua.
 */
export class EmotionDistributionRequestDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  positive?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  neutral?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  surprised?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, deprecated: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  happy?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, deprecated: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  sad?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, deprecated: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  angry?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, deprecated: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  fearful?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1, deprecated: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  disgusted?: number;
}

export class EmotionTimelinePointRequestDto {
  @ApiProperty({
    minimum: 0,
    description: 'Seconds since the answer started',
  })
  @IsNumber()
  @Min(0)
  @Max(MAX_EMOTION_TIMELINE_SECONDS)
  t!: number;

  @ApiProperty({ maxLength: MAX_EMOTION_STATE_LENGTH, example: 'positive' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_EMOTION_STATE_LENGTH)
  state!: string;

  @ApiProperty()
  @IsBoolean()
  gazeAway!: boolean;
}

export class EmotionSummaryRequestDto {
  @ApiProperty({ minimum: 1, example: 2000 })
  @IsInt()
  @Min(1)
  @Max(60_000)
  sampleIntervalMs!: number;

  @ApiProperty({ minimum: 0, maximum: MAX_EMOTION_SAMPLE_COUNT })
  @IsInt()
  @Min(0)
  @Max(MAX_EMOTION_SAMPLE_COUNT)
  sampleCount!: number;

  @ApiProperty({
    minimum: 0,
    description: 'Samples with a visible face; must not exceed sampleCount',
  })
  @IsInt()
  @Min(0)
  @Max(MAX_EMOTION_SAMPLE_COUNT)
  validSampleCount!: number;

  @ApiProperty({ type: () => EmotionDistributionRequestDto })
  @IsObject()
  @ValidateNested()
  @Type(() => EmotionDistributionRequestDto)
  distribution!: EmotionDistributionRequestDto;

  @ApiProperty({ minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  gazeAwayRatio!: number;

  @ApiProperty({ enum: ALLOWED_EMOTION_LABELS, example: 'positive' })
  @IsIn(ALLOWED_EMOTION_LABELS)
  dominant!: string;

  @ApiProperty({
    type: () => [EmotionTimelinePointRequestDto],
    maxItems: MAX_EMOTION_TIMELINE_POINTS,
  })
  @IsArray()
  @ArrayMaxSize(MAX_EMOTION_TIMELINE_POINTS)
  @ValidateNested({ each: true })
  @Type(() => EmotionTimelinePointRequestDto)
  timeline!: EmotionTimelinePointRequestDto[];
}

export class SaveInterviewAnswerRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  cloudinaryPublicId!: string;

  @IsString()
  @MaxLength(MAX_ANSWER_TRANSCRIPT_LENGTH)
  transcript!: string;

  @ApiPropertyOptional({
    type: () => EmotionSummaryRequestDto,
    nullable: true,
    description:
      'Client-side facial expression summary. Send null or omit when unavailable.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmotionSummaryRequestDto)
  emotionSummary?: EmotionSummaryRequestDto | null;
}
