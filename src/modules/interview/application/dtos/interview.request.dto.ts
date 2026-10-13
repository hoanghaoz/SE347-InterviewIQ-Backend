import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateInterviewRequestDto {
  @IsUUID()
  cvPublicId: string;

  @IsString()
  @MaxLength(255, {
    message: 'Interview title must not exceed 255 characters.',
  })
  title: string;

  @IsString()
  @IsOptional()
  @MaxLength(10_000, {
    message: 'Job description must not exceed 10,000 characters.',
  })
  jobDescription?: string | null;
}

export class SubmitInterviewSessionRequestDto {
  @IsUUID()
  cvPublicId: string;

  @IsInt()
  @Min(1)
  totalQuestions: number;

  @IsInt()
  @Min(0)
  durationSeconds: number;
}
export class UpdateInterviewRequestDto {}
