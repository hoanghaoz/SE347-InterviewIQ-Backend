import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateInterviewRequestDto {
  @IsUUID()
  cvPublicId: string;

  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  jobDescription: string | null;
}

export class UpdateInterviewRequestDto {}
