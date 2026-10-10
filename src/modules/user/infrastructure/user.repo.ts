import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { IUserRepository } from '../domain/repositories/user.repo.interface';

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
      this.logger.error('Error occurred while finding user by email', error);
      return err(new Error('Failed to find user'));
    }
  }
}
