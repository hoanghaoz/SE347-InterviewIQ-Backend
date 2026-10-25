import { Injectable } from '@nestjs/common';
import type { UUID } from 'crypto';
import { err, ok, type Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import {
  ALLOWED_AVATAR_MIME_TYPES,
  MAX_AVATAR_BYTES,
} from '../../domain/constants/avatar.constant';
import {
  IUserRepository,
  UserAlreadyExistsError,
  type UserProfile,
} from '../../domain/repositories/user.repo.interface';
import { UpdateUserProfileRequestDto } from '../dtos/user-profile.request.dto';
import {
  AvatarUploadResponseDto,
  UserProfileResponseDto,
} from '../dtos/user-profile.response.dto';
import {
  AvatarUpload,
  IAvatarStorage,
} from '../interfaces/avatar-storage.interface';
import { IUserProfileService } from '../interfaces/user-profile.service.interface';

@Injectable()
export class UserProfileService implements IUserProfileService {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly avatarStorage: IAvatarStorage,
  ) {}

  async getProfileAsync(
    userPublicId: UUID,
  ): Promise<Result<UserProfileResponseDto, AppError>> {
    const result =
      await this.userRepository.getUserProfileByPublicId(userPublicId);
    if (result.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to load the profile',
        ),
      );
    }
    if (result.value === null) {
      return err(userGoneError());
    }

    return ok(toUserProfileResponse(result.value));
  }

  async updateProfileAsync(
    userPublicId: UUID,
    request: UpdateUserProfileRequestDto,
  ): Promise<Result<UserProfileResponseDto, AppError>> {
    // Body rỗng (hoặc chỉ toàn field lạ đã bị ValidationPipe whitelist loại bỏ)
    // thì không có gì để ghi: báo 400 thay vì chạm DB và trả về hồ sơ y như cũ.
    if (request.email === undefined && request.fullName === undefined) {
      return err(
        new AppError(
          ErrorCode.BadRequest,
          'At least one of email or fullName must be provided',
        ),
      );
    }

    const result = await this.userRepository.updateUserProfile(userPublicId, {
      email: request.email,
      fullName: request.fullName,
    });
    if (result.isErr() && result.error instanceof UserAlreadyExistsError) {
      return err(
        new AppError(ErrorCode.Conflict, 'This email is already in use'),
      );
    }
    if (result.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to update the profile',
        ),
      );
    }
    if (result.value === null) {
      return err(userGoneError());
    }

    return ok(toUserProfileResponse(result.value));
  }

  async updateAvatarAsync(
    userPublicId: UUID,
    file: AvatarUpload | undefined,
  ): Promise<Result<AvatarUploadResponseDto, AppError>> {
    // 1. Luật về file nằm ở đây chứ không chỉ ở multer: test được mà không cần HTTP,
    // và client gửi sai content-type vẫn bị chặn trước khi tốn một lượt gọi Cloudinary.
    if (!file) {
      return err(
        new AppError(ErrorCode.BadRequest, 'An avatar file is required'),
      );
    }
    if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.mimetype)) {
      return err(
        new AppError(
          ErrorCode.BadRequest,
          'Avatar must be a JPEG, PNG or WEBP image',
        ),
      );
    }
    if (file.size > MAX_AVATAR_BYTES) {
      return err(
        new AppError(ErrorCode.BadRequest, 'Avatar must not exceed 2 MB'),
      );
    }

    // 2. Upload trước, ghi DB sau. Nếu user biến mất giữa chừng thì chỉ thừa đúng
    // một file mang public id của chính họ, lần upload sau ghi đè lên.
    const uploaded = await this.avatarStorage.uploadAvatar(userPublicId, file);
    if (uploaded.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to upload the avatar',
        ),
      );
    }

    const saved = await this.userRepository.updateUserAvatarUrl(
      userPublicId,
      uploaded.value.url,
    );
    if (saved.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to save the avatar URL',
        ),
      );
    }
    if (!saved.value) {
      return err(userGoneError());
    }

    return ok({ avatarUrl: uploaded.value.url });
  }
}

// Token hợp lệ nhưng tài khoản không còn: 401 để client xóa token và đăng nhập lại.
function userGoneError(): AppError {
  return new AppError(ErrorCode.Unauthorized, 'User no longer exists');
}

function toUserProfileResponse(profile: UserProfile): UserProfileResponseDto {
  return {
    id: profile.publicId,
    email: profile.email,
    fullName: profile.fullName,
    avatarUrl: profile.avatarUrl,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}
