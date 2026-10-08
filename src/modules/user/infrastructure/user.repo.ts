import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';

@Injectable()
export class UserRepository {
  private readonly logger = new Logger(UserRepository.name);
  constructor(private readonly prismaService: PrismaService) {}
  async findUserByPublicId(
    userPublicId: string,
  ): Promise<Result<{ id: number; publicId: string } | null, Error>> {
    try {
      const user = await this.prismaService.user.findUnique({
        where: { publicId: userPublicId },
      });

      if (!user) {
        return ok(null);
      }

      return ok({ id: user.id, publicId: user.publicId });
    } catch (error) {
      this.logger.error(
        'Error occurred while finding user by public ID',
        error,
      );
      return err(new Error('Failed to find user'));
    }
  }
}
