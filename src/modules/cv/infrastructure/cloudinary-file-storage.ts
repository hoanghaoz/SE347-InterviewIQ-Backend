import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { err, ok, Result } from 'neverthrow';
import {
  CvSignedUpload,
  CvStoredFile,
  ICvFileStorage,
} from '../application/interfaces/cv-file-storage.interface';

// Cloudinary stores PDFs as the `image` resource type (enables page previews).
const RESOURCE_TYPE = 'image';
const ALLOWED_FORMATS = 'pdf';

type CloudinaryCredentials = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

@Injectable()
export class CloudinaryFileStorage implements ICvFileStorage {
  private readonly logger = new Logger(CloudinaryFileStorage.name);

  constructor(private readonly config: ConfigService) {}

  createSignedUpload(
    cloudinaryPublicId: string,
  ): Result<CvSignedUpload, Error> {
    const credentials = this.getCredentials();
    if (credentials.isErr()) {
      return err(credentials.error);
    }
    const { cloudName, apiKey, apiSecret } = credentials.value;

    // Cloudinary rejects signatures whose timestamp is older than 1 hour.
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = {
      timestamp,
      public_id: cloudinaryPublicId,
      allowed_formats: ALLOWED_FORMATS,
    };
    // HMAC-style hash of the params + secret. The secret itself never leaves the server.
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      apiSecret,
    );

    return ok({
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${RESOURCE_TYPE}/upload`,
      apiKey,
      timestamp,
      signature,
      cloudinaryPublicId,
      allowedFormats: ALLOWED_FORMATS,
    });
  }

  async getFile(
    cloudinaryPublicId: string,
  ): Promise<Result<CvStoredFile | null, Error>> {
    const credentials = this.getCredentials();
    if (credentials.isErr()) {
      return err(credentials.error);
    }

    try {
      // Admin API: the real metadata Cloudinary stored for this file.
      const resource = (await cloudinary.api.resource(cloudinaryPublicId, {
        resource_type: RESOURCE_TYPE,
      })) as { secure_url: string; bytes: number; format: string };

      return ok({
        url: resource.secure_url,
        bytes: resource.bytes,
        format: resource.format,
      });
    } catch (error) {
      // The SDK rejects with { error: { http_code } }; 404 = no such file.
      const httpCode = (error as { error?: { http_code?: number } }).error
        ?.http_code;
      if (httpCode === 404) {
        return ok(null);
      }
      this.logger.error(`Cloudinary getFile failed: ${JSON.stringify(error)}`);
      return err(new Error('Failed to read file from storage.'));
    }
  }

  // Read lazily, so the app still boots on machines without Cloudinary keys;
  // only the CV upload endpoints fail (500) until they are set in .env.
  private getCredentials(): Result<CloudinaryCredentials, Error> {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      this.logger.error('Cloudinary credentials are missing in .env');
      return err(new Error('Cloudinary is not configured.'));
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    return ok({ cloudName, apiKey, apiSecret });
  }
}
