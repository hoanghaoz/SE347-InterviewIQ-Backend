import type { Result } from 'neverthrow';

export type InterviewVideoSignedUpload = {
  uploadUrl: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  cloudinaryPublicId: string;
  resourceType: 'video';
  allowedFormats: string;
  overwrite: false;
  maxFileSizeBytes: number;
};

export type UploadedInterviewVideo = {
  url: string;
  bytes: number;
  format: string;
  durationSeconds: number;
  width: number;
  height: number;
};

export abstract class IInterviewVideoStorage {
  abstract createSignedUpload(
    cloudinaryPublicId: string,
  ): Result<InterviewVideoSignedUpload, Error>;

  abstract getVideo(
    cloudinaryPublicId: string,
  ): Promise<Result<UploadedInterviewVideo | null, Error>>;
}
