import { Result } from 'neverthrow';

// Đúng phần multer đưa ra mà storage cần. Khai báo lại ở đây để tầng application
// không phải phụ thuộc vào kiểu của Express/Multer.
export type AvatarUpload = {
  readonly buffer: Buffer;
  readonly mimetype: string;
  readonly size: number;
};

export type StoredAvatar = {
  readonly url: string;
};

// Port cho storage ảnh (Cloudinary hôm nay). Service không bao giờ import SDK.
export abstract class IAvatarStorage {
  // Mỗi user một public id cố định nên ảnh mới ghi đè ảnh cũ, không để lại rác.
  abstract uploadAvatar(
    userPublicId: string,
    file: AvatarUpload,
  ): Promise<Result<StoredAvatar, Error>>;
}
