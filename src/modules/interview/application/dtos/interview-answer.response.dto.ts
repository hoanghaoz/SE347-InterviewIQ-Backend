import type { InterviewVideoSignedUpload } from '../interfaces/interview-video-storage.interface';

export class InterviewVideoSignedParamsResponseDto implements InterviewVideoSignedUpload {
  uploadUrl!: string;
  apiKey!: string;
  timestamp!: number;
  signature!: string;
  cloudinaryPublicId!: string;
  resourceType!: 'video';
  allowedFormats!: string;
  overwrite!: false;
  maxFileSizeBytes!: number;
}

export class InterviewAnswerResponseDto {
  publicId!: string;
  questionPublicId!: string;
  videoUrl!: string;
  transcript!: string;
  durationSeconds!: number;
  createdAt!: string;
  updatedAt!: string;
}
