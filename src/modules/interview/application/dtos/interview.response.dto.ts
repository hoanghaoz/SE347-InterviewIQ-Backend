export class InterviewResponseDto {
  publicId!: string;
}

export class SubmitInterviewSessionResponseDto {
  sessionPublicId!: string;
  jobId!: string;
  status!: 'QUEUED';
}
