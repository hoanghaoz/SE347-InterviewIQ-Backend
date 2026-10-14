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

  // id là id nội bộ (ví dụ RefreshTokenRecord.userId), không phải publicId
  abstract getUserById(id: number): Promise<Result<UserIdentity | null, Error>>;
}
