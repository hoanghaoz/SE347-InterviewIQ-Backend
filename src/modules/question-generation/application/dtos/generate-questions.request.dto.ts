import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  DEFAULT_QUESTION_COUNT,
  MAX_QUESTION_COUNT,
  MIN_QUESTION_COUNT,
} from '../../domain/constants/question-generation.constants';
import {
  QuestionDifficulty,
  QuestionDomain,
} from '../../domain/enums/question.enum';

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

  @ApiPropertyOptional({
    enum: QuestionDomain,
    enumName: 'QuestionDomain',
    description: 'Make every question of this domain. Omit to mix the domains.',
  })
  @IsOptional()
  @IsEnum(QuestionDomain, { message: 'domain must be a valid question domain' })
  domain?: QuestionDomain;

  @ApiPropertyOptional({
    enum: QuestionDifficulty,
    enumName: 'QuestionDifficulty',
    description:
      'Make every question of this difficulty. Omit to go from easy to hard.',
  })
  @IsOptional()
  @IsEnum(QuestionDifficulty, {
    message: 'difficulty must be a valid question difficulty',
  })
  difficulty?: QuestionDifficulty;
}
