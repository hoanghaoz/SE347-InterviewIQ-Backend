import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { err, ok, Result } from 'neverthrow';
import {
  AvatarUpload,
  IAvatarStorage,
  StoredAvatar,
} from '../application/interfaces/avatar-storage.interface';

const RESOURCE_TYPE = 'image';

// Ảnh gốc có thể rất to và méo tỉ lệ. Cắt vuông ngay lúc upload nên DB chỉ giữ
// một URL duy nhất và FE không phải tự resize.
const AVATAR_TRANSFORMATION = {
  width: 512,
  height: 512,
  crop: 'fill',
  gravity: 'face',
};

// Một public id cố định cho mỗi user: ảnh mới ghi đè ảnh cũ nên không cần cột
// lưu public id, cũng không cần job dọn ảnh thừa.
function avatarPublicId(userPublicId: string): string {
  return `avatars/${userPublicId}`;
}

@Injectable()
export class CloudinaryAvatarStorage implements IAvatarStorage {
  private readonly logger = new Logger(CloudinaryAvatarStorage.name);

  constructor(private readonly config: ConfigService) {}

  async uploadAvatar(
    userPublicId: string,
    file: AvatarUpload,
  ): Promise<Result<StoredAvatar, Error>> {
    const configured = this.configureCloudinary();
    if (configured.isErr()) {
      return err(configured.error);
    }

    try {
      const uploaded = await this.uploadBuffer(
        avatarPublicId(userPublicId),
        file.buffer,
      );
      // secure_url chứa version mới sau mỗi lần ghi đè, nên URL trả về luôn khác
      // lần trước và trình duyệt không hiển thị ảnh cũ từ cache.
      return ok({ url: uploaded.secure_url });
    } catch (error) {
      this.logger.error(
        `Cloudinary uploadAvatar failed: ${(error as Error).message}`,
      );
      return err(new Error('Failed to upload the avatar to storage.'));
    }
  }

  // upload_stream dùng callback; bọc lại thành Promise để await được.
  private uploadBuffer(
    publicId: string,
    buffer: Buffer,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          resource_type: RESOURCE_TYPE,
          overwrite: true,
          // Xóa cache CDN của URL cũ, phòng khi có ai còn giữ URL version trước.
          invalidate: true,
          transformation: [AVATAR_TRANSFORMATION],
        },
        (error, result) => {
          if (error) {
            reject(new Error(error.message));
            return;
          }
          if (!result) {
            reject(new Error('Cloudinary returned no upload result'));
            return;
          }
          resolve(result);
        },
      );
      stream.end(buffer);
    });
  }

  // Đọc muộn, giống CloudinaryFileStorage của module CV: máy chưa có key vẫn boot
  // được, chỉ endpoint upload avatar trả 500 cho tới khi .env được điền.
  private configureCloudinary(): Result<void, Error> {
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
    return ok(undefined);
  }
}
