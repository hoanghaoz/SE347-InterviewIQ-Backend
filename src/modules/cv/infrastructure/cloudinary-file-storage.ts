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
// App folder in the Media Library; the Cloudinary account is shared with other projects.
const ROOT_FOLDER = 'InterviewIQ';
const DOWNLOAD_URL_TTL_SECONDS = 60;
const DOWNLOAD_TIMEOUT_MS = 20_000;
// The upload limit is 5 MB; this only guards against a response that is far bigger.
const MAX_DOWNLOAD_BYTES = 6 * 1024 * 1024;

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

    // Media Library folder = ROOT_FOLDER + the public id without its last segment:
    // "cvs/<userPublicId>/<uuid>" -> "InterviewIQ/cvs/<userPublicId>".
    // Display only (lookups use public_id). Derived here, never taken from the client.
    const parentPath = cloudinaryPublicId.slice(
      0,
      cloudinaryPublicId.lastIndexOf('/'),
    );
    const assetFolder = `${ROOT_FOLDER}/${parentPath}`;

    // Cloudinary rejects signatures whose timestamp is older than 1 hour.
    const timestamp = Math.floor(Date.now() / 1000);
    // Every param the browser sends (except file and api_key) must be signed,
    // otherwise Cloudinary answers "Invalid Signature".
    const paramsToSign = {
      timestamp,
      public_id: cloudinaryPublicId,
      asset_folder: assetFolder,
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
      assetFolder,
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
      // The SDK rejects with { error: { http_code, message }, request_options, ... }.
      const details = (
        error as { error?: { http_code?: number; message?: unknown } }
      ).error;
      if (details?.http_code === 404) {
        return ok(null); // no such file
      }
      // Never log the whole error object: request_options.auth is "api_key:api_secret".
      this.logger.error(
        `Cloudinary getFile failed: HTTP ${details?.http_code ?? 'unknown'}` +
          ` - ${typeof details?.message === 'string' ? details.message : 'no message'}`,
      );
      return err(new Error('Failed to read file from storage.'));
    }
  }

  async downloadFile(
    cloudinaryPublicId: string,
  ): Promise<Result<Uint8Array | null, Error>> {
    const credentials = this.getCredentials();
    if (credentials.isErr()) {
      return err(credentials.error);
    }

    // A signed, short-lived URL made with the API secret. Unlike the public delivery
    // URL it still works when "Allow delivery of PDF and ZIP files" is off (401).
    const url = cloudinary.utils.private_download_url(
      cloudinaryPublicId,
      ALLOWED_FORMATS,
      {
        resource_type: RESOURCE_TYPE,
        type: 'upload',
        expires_at: Math.floor(Date.now() / 1000) + DOWNLOAD_URL_TTL_SECONDS,
      },
    );

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
      if (response.status === 404) {
        return ok(null);
      }
      if (!response.ok) {
        this.logger.error(
          `Cloudinary download failed: HTTP ${response.status}`,
        );
        return err(new Error('Failed to download file from storage.'));
      }

      const declaredBytes = Number(response.headers.get('content-length'));
      const bytes =
        declaredBytes > MAX_DOWNLOAD_BYTES
          ? null
          : new Uint8Array(await response.arrayBuffer());
      if (bytes === null || bytes.byteLength > MAX_DOWNLOAD_BYTES) {
        this.logger.error('Cloudinary download is larger than allowed');
        return err(new Error('Downloaded file is too large.'));
      }
      return ok(bytes);
    } catch (error) {
      // Never log the URL (it carries the api key and signature) or the raw error.
      this.logger.error(
        `Cloudinary download failed: ${error instanceof Error ? error.name : 'unknown error'}`,
      );
      return err(new Error('Failed to download file from storage.'));
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
