import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MAX_ANSWER_TRANSCRIPT_LENGTH } from '../../domain/constants/interview-answer.constants';

export class SaveInterviewAnswerRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  cloudinaryPublicId!: string;

  @IsString()
  @MaxLength(MAX_ANSWER_TRANSCRIPT_LENGTH)
  transcript!: string;
}
