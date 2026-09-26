import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import {
  AuthorizeUserCvResult,
  ICvRepository,
} from '../domain/repositories/cv.repo.interface';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { ParseStatus } from 'generated/prisma/enums';

@Injectable()
export class CvRepository implements ICvRepository {
  private readonly logger = new Logger(CvRepository.name);
  constructor(private readonly prismaService: PrismaService) {}
  async authorizeUserCv(
    userPublicId: string,
    cvPublicId: string,
  ): Promise<Result<AuthorizeUserCvResult | null, Error>> {
    try {
      const authorize = await this.prismaService.cv.findUnique({
        where: {
          publicId: cvPublicId,
          user: {
            publicId: userPublicId,
          },
          isActive: true,
          parseStatus: ParseStatus.COMPLETED,
        },
        select: {
          id: true,
          userId: true,
        },
      });
      if (!authorize) {
        return ok(null);
      }
      return ok({
        cvId: authorize.id,
        userId: authorize.userId,
      });
    } catch (error) {
      this.logger.error(
        `Failed in CV repository method authorizeUserCv ${error}`,
      );
      return err(new Error('Failed to authorize user cv.'));
    }
  }
}
