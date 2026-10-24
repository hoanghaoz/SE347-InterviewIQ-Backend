import type { UUID } from 'crypto';
import { Result } from 'neverthrow';
import type { CommonUserRole } from '../../../../shared/common/commonEnum';

// Returned by createUser when the email is already taken (unique constraint).
export class UserAlreadyExistsError extends Error {
  constructor() {
    super('A user with this email already exists.');
  }
}

export type UserCredentials = {
  readonly id: number;
  readonly publicId: UUID;
  readonly email: string;
  readonly role: CommonUserRole;
  readonly passwordHash: string;
};

// Đủ để ký access token (sub + role). Không có passwordHash vì caller không cần.
export type UserIdentity = {
  readonly publicId: UUID;
  readonly role: CommonUserRole;
};

export type CreateUserData = {
  readonly email: string;
  readonly passwordHash: string;
  readonly fullName: string;
};

// Mọi thứ trang hồ sơ cần. Không có passwordHash: hồ sơ không bao giờ trả nó ra ngoài.
export type UserProfile = {
  readonly publicId: UUID;
  readonly email: string;
  readonly fullName: string;
  readonly avatarUrl: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

// Field vắng mặt nghĩa là không đổi. Service chặn trường hợp cả hai cùng vắng.
export type UpdateUserProfileData = {
  readonly email?: string;
  readonly fullName?: string;
};

export abstract class IUserRepository {
  abstract getUserByEmail(
    email: string,
  ): Promise<Result<{ id: number } | null, Error>>;

  // Fails with UserAlreadyExistsError on a duplicate email.
  abstract createUser(
    data: CreateUserData,
  ): Promise<Result<{ id: number }, Error>>;

  abstract getUserCredentialsByEmail(
    email: string,
  ): Promise<Result<UserCredentials | null, Error>>;

  // publicId là `sub` của access token. Dùng cái này thay cho email trong token:
  // email có thể đã cũ sau khi user đổi hồ sơ, publicId thì không bao giờ đổi.
  abstract getUserCredentialsByPublicId(
    publicId: UUID,
  ): Promise<Result<UserCredentials | null, Error>>;

  // id là id nội bộ (ví dụ RefreshTokenRecord.userId), không phải publicId
  abstract getUserById(id: number): Promise<Result<UserIdentity | null, Error>>;

  // ok(null) khi không có user nào mang publicId này (token của tài khoản đã bị xóa)
  abstract getUserProfileByPublicId(
    publicId: UUID,
  ): Promise<Result<UserProfile | null, Error>>;

  // ok(null) khi user không còn tồn tại.
  // Fails with UserAlreadyExistsError khi email mới đã thuộc về người khác.
  abstract updateUserProfile(
    publicId: UUID,
    data: UpdateUserProfileData,
  ): Promise<Result<UserProfile | null, Error>>;

  // ok(false) khi user không còn tồn tại. Không trả hồ sơ về vì caller chỉ cần
  // biết lệnh ghi có trúng ai không; URL thì caller vừa truyền vào.
  abstract updateUserAvatarUrl(
    publicId: UUID,
    avatarUrl: string,
  ): Promise<Result<boolean, Error>>;

  // passwordHash phải được hash sẵn ở tầng service, repo không tự hash
  abstract updateUserPassword(
    id: number,
    passwordHash: string,
  ): Promise<Result<void, Error>>;
}
