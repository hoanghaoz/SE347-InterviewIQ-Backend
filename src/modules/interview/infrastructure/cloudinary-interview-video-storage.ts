import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { err, ok, type Result } from 'neverthrow';
import {
  INTERVIEW_VIDEO_FORMATS,
  MAX_INTERVIEW_VIDEO_BYTES,
} from '../domain/constants/interview-answer.constants';
import {
  IInterviewVideoStorage,
  type InterviewVideoSignedUpload,
  type UploadedInterviewVideo,
} from '../application/interfaces/interview-video-storage.interface';

type VideoResource = {
  secure_url: string;
  bytes: number;
  format: string;
  duration?: number;
  width?: number;
  height?: number;
};

@Injectable()
export class CloudinaryInterviewVideoStorage implements IInterviewVideoStorage {
  constructor(private readonly config: ConfigService) {}

  createSignedUpload(
    cloudinaryPublicId: string,
  ): Result<InterviewVideoSignedUpload, Error> {
    const credentials = this.getCredentials();
    if (credentials.isErr()) return err(credentials.error);
    const { cloudName, apiKey, apiSecret } = credentials.value;
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const allowedFormats = INTERVIEW_VIDEO_FORMATS.join(',');
      const signature = cloudinary.utils.api_sign_request(
        {
          timestamp,
          public_id: cloudinaryPublicId,
          allowed_formats: allowedFormats,
          overwrite: false,
        },
        apiSecret,
      );
      return ok({
        uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
        apiKey,
        timestamp,
        signature,
        cloudinaryPublicId,
        resourceType: 'video',
        allowedFormats,
        overwrite: false,
        maxFileSizeBytes: MAX_INTERVIEW_VIDEO_BYTES,
      });
    } catch {
      return err(new Error('Failed to prepare interview video upload.'));
    }
  }

  async getVideo(
    cloudinaryPublicId: string,
  ): Promise<Result<UploadedInterviewVideo | null, Error>> {
    const credentials = this.getCredentials();
    if (credentials.isErr()) return err(credentials.error);
    const { cloudName, apiKey, apiSecret } = credentials.value;
    try {
      // Credentials are passed per call, so this adapter does not mutate SDK globals.
      const resource = (await cloudinary.api.resource(cloudinaryPublicId, {
        resource_type: 'video',
        media_metadata: true,
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
      })) as VideoResource;
      return ok({
        url: resource.secure_url,
        bytes: resource.bytes,
        format: resource.format,
        durationSeconds: resource.duration ?? 0,
        width: resource.width ?? 0,
        height: resource.height ?? 0,
      });
    } catch (error) {
      if (
        (error as { error?: { http_code?: number } } | null)?.error
          ?.http_code === 404
      )
        return ok(null);
      return err(new Error('Failed to read uploaded interview video.'));
    }
  }

  private getCredentials(): Result<
    { cloudName: string; apiKey: string; apiSecret: string },
    Error
  > {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');
    if (!cloudName || !apiKey || !apiSecret)
      return err(new Error('Cloudinary is not configured.'));
    return ok({ cloudName, apiKey, apiSecret });
  }
}
