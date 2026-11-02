import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  DEFAULT_QUESTION_COUNT,
  MAX_QUESTION_COUNT,
  MIN_QUESTION_COUNT,
} from '../../domain/constants/question-generation.constants';

export class GenerateQuestionsRequestDto {
  @ApiPropertyOptional({
    type: Number,
    minimum: MIN_QUESTION_COUNT,
    maximum: MAX_QUESTION_COUNT,
    default: DEFAULT_QUESTION_COUNT,
  })
  @IsOptional()
  @IsInt()
  @Min(MIN_QUESTION_COUNT)
  @Max(MAX_QUESTION_COUNT)
  count?: number;
}
