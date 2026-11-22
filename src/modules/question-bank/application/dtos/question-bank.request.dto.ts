import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_QUESTION_COUNT } from '../../../question-generation/domain/constants/question-generation.constants';
import {
  QuestionDifficulty,
  QuestionDomain,
} from '../../../question-generation/domain/enums/question.enum';
import {
  DEFAULT_BANK_PAGE_SIZE,
  MAX_BANK_PAGE_SIZE,
  MAX_BANK_SEARCH_LENGTH,
} from '../../domain/constants/question-bank.constants';

export class QuestionBankQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageNumber must be an integer' })
  @Min(1, { message: 'pageNumber must be at least 1' })
  pageNumber: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: DEFAULT_BANK_PAGE_SIZE,
    minimum: 1,
    maximum: MAX_BANK_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize must be an integer' })
  @Min(1, { message: 'pageSize must be at least 1' })
  @Max(MAX_BANK_PAGE_SIZE, {
    message: `pageSize must not exceed ${MAX_BANK_PAGE_SIZE}`,
  })
  pageSize: number = DEFAULT_BANK_PAGE_SIZE;

  @ApiPropertyOptional({
    enum: QuestionDomain,
    enumName: 'QuestionDomain',
    description: 'Only questions of this domain',
  })
  @IsOptional()
  @IsEnum(QuestionDomain, { message: 'domain must be a valid question domain' })
  domain?: QuestionDomain;

  @ApiPropertyOptional({
    enum: QuestionDifficulty,
    enumName: 'QuestionDifficulty',
    description: 'Only questions of this difficulty',
  })
  @IsOptional()
  @IsEnum(QuestionDifficulty, {
    message: 'difficulty must be a valid question difficulty',
  })
  difficulty?: QuestionDifficulty;

  @ApiPropertyOptional({
    maxLength: MAX_BANK_SEARCH_LENGTH,
    description: 'Case-insensitive text to look for in the question content',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'search must be a string' })
  @MaxLength(MAX_BANK_SEARCH_LENGTH, {
    message: `search must not exceed ${MAX_BANK_SEARCH_LENGTH} characters`,
  })
  search?: string;
}

export class SaveQuestionBankRequestDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Interview session whose questions are saved to the bank',
  })
  @IsUUID()
  sessionPublicId!: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    maxItems: MAX_QUESTION_COUNT,
    description:
      'Only these questions of the session. Omit to save every question of the session.',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_QUESTION_COUNT)
  @IsUUID('all', { each: true })
  questionPublicIds?: string[];
}
