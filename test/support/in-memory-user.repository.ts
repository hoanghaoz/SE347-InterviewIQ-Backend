import { randomUUID, type UUID } from 'crypto';
import { err, ok, type Result } from 'neverthrow';
import {
  CreateUserData,
  IUserRepository,
  UpdateUserProfileData,
  UserAlreadyExistsError,
  UserProfile,
} from '../../src/modules/user/domain/repositories/user.repo.interface';
import { CommonUserRole } from '../../src/shared/common/commonEnum';

export type StoredUser = CreateUserData & {
  id: number;
  publicId: UUID;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Thay Postgres bằng một Map, khóa theo email giống unique index thật.
 * Dùng cho e2e để chạy được mà không cần Docker; mọi hành vi quan trọng
 * (email trùng, user đã bị xóa) được mô phỏng theo đúng lỗi Prisma trả về.
 */
export class InMemoryUserRepository implements IUserRepository {
  readonly users = new Map<string, StoredUser>();

  getUserByEmail(email: string) {
    const user = this.users.get(email);
    return Promise.resolve(ok(user ? { id: user.id } : null));
  }

  createUser(data: CreateUserData) {
    if (this.users.has(data.email)) {
      return Promise.resolve(err(new UserAlreadyExistsError()));
    }
    const id = this.users.size + 1;
    const now = new Date();
    this.users.set(data.email, {
      ...data,
      id,
      publicId: randomUUID(),
      avatarUrl: null,
      createdAt: now,
      updatedAt: now,
    });
    return Promise.resolve(ok({ id }));
  }

  getUserCredentialsByEmail(email: string) {
    const user = this.users.get(email);
    return Promise.resolve(ok(user ? toCredentials(user) : null));
  }

  getUserCredentialsByPublicId(publicId: UUID) {
    const user = this.findByPublicId(publicId);
    return Promise.resolve(ok(user ? toCredentials(user) : null));
  }

  getUserById(id: number) {
    const user = [...this.users.values()].find((u) => u.id === id);
    return Promise.resolve(
      ok(user ? { publicId: user.publicId, role: CommonUserRole.USER } : null),
    );
  }

  getUserProfileByPublicId(publicId: UUID) {
    const user = this.findByPublicId(publicId);
    return Promise.resolve(ok(user ? toProfile(user) : null));
  }

  updateUserProfile(publicId: UUID, data: UpdateUserProfileData) {
    const user = this.findByPublicId(publicId);
    if (!user) {
      return Promise.resolve(ok(null));
    }
    // Giống unique index trên email: email mới đang thuộc người khác thì từ chối
    if (data.email !== undefined && data.email !== user.email) {
      if (this.users.has(data.email)) {
        return Promise.resolve(err(new UserAlreadyExistsError()));
      }
      this.users.delete(user.email);
    }
    const updated: StoredUser = {
      ...user,
      email: data.email ?? user.email,
      fullName: data.fullName ?? user.fullName,
      updatedAt: new Date(),
    };
    this.users.set(updated.email, updated);
    return Promise.resolve(ok(toProfile(updated)));
  }

  updateUserAvatarUrl(publicId: UUID, avatarUrl: string) {
    const user = this.findByPublicId(publicId);
    if (!user) {
      return Promise.resolve(ok(false));
    }
    this.users.set(user.email, { ...user, avatarUrl, updatedAt: new Date() });
    return Promise.resolve(ok(true));
  }

  // Giống Prisma update: không có user thì lỗi
  updateUserPassword(
    id: number,
    passwordHash: string,
  ): Promise<Result<void, Error>> {
    const user = [...this.users.values()].find((u) => u.id === id);
    if (!user) {
      return Promise.resolve(err(new Error('Failed to update user password')));
    }
    this.users.set(user.email, { ...user, passwordHash });
    return Promise.resolve(ok(undefined));
  }

  private findByPublicId(publicId: UUID): StoredUser | undefined {
    return [...this.users.values()].find((u) => u.publicId === publicId);
  }
}

function toCredentials(user: StoredUser) {
  return {
    id: user.id,
    publicId: user.publicId,
    email: user.email,
    role: CommonUserRole.USER,
    passwordHash: user.passwordHash,
  };
}

function toProfile(user: StoredUser): UserProfile {
  return {
    publicId: user.publicId,
    email: user.email,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
