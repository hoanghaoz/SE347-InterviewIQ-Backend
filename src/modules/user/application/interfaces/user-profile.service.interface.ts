import type { UUID } from 'crypto';
import { Result } from 'neverthrow';
import { AppError } from '../../../../shared/common/errorCode';
import { UpdateUserProfileRequestDto } from '../dtos/user-profile.request.dto';
import {
  AvatarUploadResponseDto,
  UserProfileResponseDto,
} from '../dtos/user-profile.response.dto';
import { AvatarUpload } from './avatar-storage.interface';

// userPublicId luôn là `sub` của access token: không endpoint nào nhận id từ body.
export abstract class IUserProfileService {
  abstract getProfileAsync(
    userPublicId: UUID,
  ): Promise<Result<UserProfileResponseDto, AppError>>;

  abstract updateProfileAsync(
    userPublicId: UUID,
    request: UpdateUserProfileRequestDto,
  ): Promise<Result<UserProfileResponseDto, AppError>>;

  // file undefined khi request không đính kèm file nào: service trả BadRequest
  abstract updateAvatarAsync(
    userPublicId: UUID,
    file: AvatarUpload | undefined,
  ): Promise<Result<AvatarUploadResponseDto, AppError>>;
}
