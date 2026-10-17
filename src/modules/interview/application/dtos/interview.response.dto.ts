import { ApiProperty } from '@nestjs/swagger';
import { CommonSessionStatus } from '../../domain/enums/interview-enum';

export class InterviewResponseDto {
  publicId!: string;
}

export class SubmitInterviewSessionResponseDto {
  sessionPublicId!: string;
  jobId!: string;
  status!: 'QUEUED';
}

export class InterviewSessionResponse {
  @ApiProperty({ format: 'uuid' })
  sessionPublicId!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  cvPublicId!: string | null;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: CommonSessionStatus })
  status!: CommonSessionStatus;

  @ApiProperty({ type: Number })
  totalQuestion!: number;

  @ApiProperty({ type: String, nullable: true })
  jobDescription!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class StartInterviewSessionResponseDto {
  @ApiProperty({ format: 'uuid' })
  sessionPublicId!: string;

  @ApiProperty({ enum: [CommonSessionStatus.IN_PROGRESS] })
  status!: CommonSessionStatus.IN_PROGRESS;

  @ApiProperty({ type: String, format: 'date-time' })
  startedAt!: string;
}
