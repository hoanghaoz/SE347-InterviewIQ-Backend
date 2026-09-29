import { Result } from 'neverthrow';

export type CvSignedUpload = {
  uploadUrl: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  cloudinaryPublicId: string;
  allowedFormats: string;
};

// What the storage provider reports about an uploaded file (trusted, unlike the client).
export type CvStoredFile = {
  url: string;
  bytes: number;
  format: string;
};

// Port for the file storage (Cloudinary today). The service never imports the SDK.
export abstract class ICvFileStorage {
  // Signs the upload locally with the API secret; no network call.
  abstract createSignedUpload(
    cloudinaryPublicId: string,
  ): Result<CvSignedUpload, Error>;

  // null when no file exists under that id.
  abstract getFile(
    cloudinaryPublicId: string,
  ): Promise<Result<CvStoredFile | null, Error>>;
}
