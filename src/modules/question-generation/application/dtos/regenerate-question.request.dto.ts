import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import {
  QuestionDifficulty,
  QuestionDomain,
} from '../../domain/enums/question.enum';

export class RegenerateQuestionRequestDto {
  @ApiPropertyOptional({
    enum: QuestionDomain,
    enumName: 'QuestionDomain',
    description: 'Domain of the new question. Omit to keep the current one.',
  })
  @IsOptional()
  @IsEnum(QuestionDomain, { message: 'domain must be a valid question domain' })
  domain?: QuestionDomain;

  @ApiPropertyOptional({
    enum: QuestionDifficulty,
    enumName: 'QuestionDifficulty',
    description:
      'Difficulty of the new question. Omit to keep the current one.',
  })
  @IsOptional()
  @IsEnum(QuestionDifficulty, {
    message: 'difficulty must be a valid question difficulty',
  })
  difficulty?: QuestionDifficulty;
}
