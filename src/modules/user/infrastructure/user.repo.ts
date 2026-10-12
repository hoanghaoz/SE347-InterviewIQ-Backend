import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import {
  CreateUserData,
  IUserRepository,
  UserAlreadyExistsError,
} from '../domain/repositories/user.repo.interface';

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
      // P2002 = Prisma's unique constraint violation (here: email).
      if ((error as { code?: string }).code === 'P2002') {
        return err(new UserAlreadyExistsError());
      }
      this.logger.error(`createUser failed: ${(error as Error).message}`);
      return err(new Error('Failed to create user'));
    }
  }
}
