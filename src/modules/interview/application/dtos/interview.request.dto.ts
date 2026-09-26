import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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

export class UpdateInterviewRequestDto {}
