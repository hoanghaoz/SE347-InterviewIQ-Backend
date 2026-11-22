import { ApiProperty } from '@nestjs/swagger';
import {
  QuestionDifficulty,
  QuestionDomain,
} from '../../../question-generation/domain/enums/question.enum';

// Response DTOs only describe the output for Swagger: no class-validator here.
export class QuestionBankItemDto {
  @ApiProperty({
    format: 'uuid',
    example: '3f1c2b9e-8a4d-4f6b-9c1e-2d7a5b0e4f11',
  })
  id!: string;

  @ApiProperty({
    example: 'Explain the difference between a process and a thread.',
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

  @ApiProperty({ format: 'date-time', example: '2026-11-22T07:58:11.000Z' })
  createdAt!: string;
}

export class SaveQuestionBankResponseDto {
  @ApiProperty({ example: 4, description: 'Questions newly added to the bank' })
  savedCount!: number;

  @ApiProperty({
    example: 1,
    description: 'Questions skipped because the bank already holds them',
  })
  skippedCount!: number;
}
