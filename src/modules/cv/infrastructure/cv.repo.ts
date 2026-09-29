import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import {
  AuthorizeUserCvResult,
  ICvRepository,
} from '../domain/repositories/cv.repo.interface';
import { CvParsedData } from '../domain/types/cv-parsed-data.type';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import { ParseStatus } from 'generated/prisma/enums';

@Injectable()
export class CvRepository implements ICvRepository {
  private readonly logger = new Logger(CvRepository.name);
  constructor(private readonly prismaService: PrismaService) {}
  // Used by the interview module (Luồng 3). Returns the ids plus a snapshot of the
  // CV for interview_sessions.cv_snapshot. Change it only together with Hạ.
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
          publicId: true,
          fileName: true,
          fileUrl: true,
          fileSize: true,
          rawText: true,
          parsedData: true,
          parserVersion: true,
        },
      });
      if (!authorize) {
        return ok(null);
      }
      return ok({
        cvId: authorize.id,
        userId: authorize.userId,
        snapshot: {
          sourceCvPublicId: authorize.publicId,
          fileName: authorize.fileName,
          fileUrl: authorize.fileUrl,
          fileSize: authorize.fileSize,
          rawText: authorize.rawText,
          // The parser validates the shape before saving (Sprint 3).
          parsedData: authorize.parsedData as CvParsedData | null,
          parserVersion: authorize.parserVersion,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed in CV repository method authorizeUserCv ${error}`,
      );
      return err(new Error('Failed to authorize user cv.'));
    }
  }
}
