import { Injectable, Logger } from '@nestjs/common';
import { UUID } from 'crypto';
import { err, ok, Result } from 'neverthrow';
import { CommonUserRole } from '../../../shared/common/commonEnum';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import {
  CreateUserData,
  IUserRepository,
  UpdateUserProfileData,
  UserAlreadyExistsError,
  UserCredentials,
  UserIdentity,
  UserProfile,
} from '../domain/repositories/user.repo.interface';

// Đúng các cột trang hồ sơ cần. Không bao giờ select passwordHash ở đây.
const PROFILE_SELECT = {
  publicId: true,
  email: true,
  fullName: true,
  avatarUrl: true,
  createdAt: true,
  updatedAt: true,
} as const;

type UserProfileRow = {
  publicId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toUserProfile(row: UserProfileRow): UserProfile {
  return {
    // Cột public_id là @db.Uuid nên giá trị luôn đúng format UUID
    publicId: row.publicId as UUID,
    email: row.email,
    fullName: row.fullName,
    avatarUrl: row.avatarUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class UserRepository implements IUserRepository {
  private readonly logger = new Logger(UserRepository.name);
  constructor(private readonly prismaService: PrismaService) {}
  async getUserByEmail(
    email: string,
  ): Promise<Result<{ id: number } | null, Error>> {
    try {
      const user = await this.prismaService.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (!user) {
        return ok(null);
      }
      return ok({ id: user.id });
    } catch (error) {
      this.logger.error(`getUserByEmail failed: ${(error as Error).message}`);
      return err(new Error('Failed to find user'));
    }
  }

  async createUser(
    data: CreateUserData,
  ): Promise<Result<{ id: number }, Error>> {
    try {
      const newUser = await this.prismaService.user.create({
        data: {
          email: data.email,
          passwordHash: data.passwordHash,
          fullName: data.fullName,
        },
        select: { id: true },
      });
      return ok({ id: newUser.id });
    } catch (error) {
      // P2002 = Prisma unique constraint violation (here: email).
      if ((error as { code?: string }).code === 'P2002') {
        return err(new UserAlreadyExistsError());
      }
      this.logger.error(`createUser failed: ${(error as Error).message}`);
      return err(new Error('Failed to create user'));
    }
  }

  async getUserCredentialsByEmail(
    email: string,
  ): Promise<Result<UserCredentials | null, Error>> {
    try {
      const user = await this.prismaService.user.findUnique({
        where: { email },
        select: {
          id: true,
          publicId: true,
          email: true,
          role: true,
          passwordHash: true,
        },
      });
      if (!user) {
        return ok(null);
      }
      return ok({
        id: user.id,
        // Cột public_id là @db.Uuid nên giá trị luôn đúng format UUID
        publicId: user.publicId as UUID,
        email: user.email,
        role: CommonUserRole[user.role],
        passwordHash: user.passwordHash,
      });
    } catch (error) {
      this.logger.error(
        `getUserCredentialsByEmail failed: ${(error as Error).message}`,
      );
      return err(new Error('Failed to find user credentials'));
    }
  }

  async getUserCredentialsByPublicId(
    publicId: UUID,
  ): Promise<Result<UserCredentials | null, Error>> {
    try {
      const user = await this.prismaService.user.findUnique({
        where: { publicId },
        select: {
          id: true,
          publicId: true,
          email: true,
          role: true,
          passwordHash: true,
        },
      });
      if (!user) {
        return ok(null);
      }
      return ok({
        id: user.id,
        publicId: user.publicId as UUID,
        email: user.email,
        role: CommonUserRole[user.role],
        passwordHash: user.passwordHash,
      });
    } catch (error) {
      this.logger.error(
        `getUserCredentialsByPublicId failed: ${(error as Error).message}`,
      );
      return err(new Error('Failed to find user credentials'));
    }
  }

  async getUserById(id: number): Promise<Result<UserIdentity | null, Error>> {
    try {
      const user = await this.prismaService.user.findUnique({
        where: { id },
        select: { publicId: true, role: true },
      });
      if (!user) {
        return ok(null);
      }
      return ok({
        // Cột public_id là @db.Uuid nên giá trị luôn đúng format UUID
        publicId: user.publicId as UUID,
        role: CommonUserRole[user.role],
      });
    } catch (error) {
      this.logger.error(`getUserById failed: ${(error as Error).message}`);
      return err(new Error('Failed to find user'));
    }
  }

  async getUserProfileByPublicId(
    publicId: UUID,
  ): Promise<Result<UserProfile | null, Error>> {
    try {
      const user = await this.prismaService.user.findUnique({
        where: { publicId },
        select: PROFILE_SELECT,
      });
      if (!user) {
        return ok(null);
      }
      return ok(toUserProfile(user));
    } catch (error) {
      this.logger.error(
        `getUserProfileByPublicId failed: ${(error as Error).message}`,
      );
      return err(new Error('Failed to find user profile'));
    }
  }

  async updateUserProfile(
    publicId: UUID,
    data: UpdateUserProfileData,
  ): Promise<Result<UserProfile | null, Error>> {
    try {
      // Field undefined bị Prisma bỏ qua, nên chỉ cột nào client gửi mới bị ghi
      const user = await this.prismaService.user.update({
        where: { publicId },
        data: { email: data.email, fullName: data.fullName },
        select: PROFILE_SELECT,
      });
      return ok(toUserProfile(user));
    } catch (error) {
      const code = (error as { code?: string }).code;
      // P2002 = email mới đã thuộc về người khác
      if (code === 'P2002') {
        return err(new UserAlreadyExistsError());
      }
      // P2025 = không còn user nào mang publicId này
      if (code === 'P2025') {
        return ok(null);
      }
      this.logger.error(
        `updateUserProfile failed: ${(error as Error).message}`,
      );
      return err(new Error('Failed to update user profile'));
    }
  }

  async updateUserAvatarUrl(
    publicId: UUID,
    avatarUrl: string,
  ): Promise<Result<boolean, Error>> {
    try {
      await this.prismaService.user.update({
        where: { publicId },
        data: { avatarUrl },
        select: { id: true },
      });
      return ok(true);
    } catch (error) {
      // P2025 = không còn user nào mang publicId này
      if ((error as { code?: string }).code === 'P2025') {
        return ok(false);
      }
      this.logger.error(
        `updateUserAvatarUrl failed: ${(error as Error).message}`,
      );
      return err(new Error('Failed to update user avatar'));
    }
  }

  async updateUserPassword(
    id: number,
    passwordHash: string,
  ): Promise<Result<void, Error>> {
    try {
      // select id để không kéo passwordHash vừa ghi ngược về
      await this.prismaService.user.update({
        where: { id },
        data: { passwordHash },
        select: { id: true },
      });
      return ok(undefined);
    } catch (error) {
      this.logger.error(
        `updateUserPassword failed: ${(error as Error).message}`,
      );
      return err(new Error('Failed to update user password'));
    }
  }
}
