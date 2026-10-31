import { ApiProperty } from '@nestjs/swagger';
import {
  QuestionDifficulty,
  QuestionDomain,
} from '../../domain/enums/question.enum';

export class QuestionResponseDto {
  @ApiProperty({ format: 'uuid' })
  publicId!: string;

  @ApiProperty({ type: Number })
  orderIndex!: number;

  @ApiProperty()
  content!: string;

  @ApiProperty({ enum: QuestionDomain })
  domain!: QuestionDomain;

  @ApiProperty({ enum: QuestionDifficulty })
  difficulty!: QuestionDifficulty;
}

export class SessionQuestionsResponseDto {
  @ApiProperty({ format: 'uuid' })
  sessionPublicId!: string;

  @ApiProperty({ type: [QuestionResponseDto] })
  questions!: QuestionResponseDto[];
}
