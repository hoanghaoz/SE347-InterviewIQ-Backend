import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import {
  AuthorizeUserCvResult,
  ICvRepository,
} from '../domain/repositories/cv.repo.interface';
import {
  CvFileAlreadySavedError,
  ICvManagementRepository,
  StartParseOutcome,
} from '../domain/repositories/cv-management.repo.interface';
import { Cv } from '../domain/entities/cv.entity';
import { CvParsedData } from '../domain/types/cv-parsed-data.type';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { Prisma } from '../../../../generated/prisma/client';
import { ParseStatus } from '../../../../generated/prisma/enums';
import { mapCvToDomain, mapParseStatusToPrisma } from './cv.mapper';

@Injectable()
export class CvRepository implements ICvRepository, ICvManagementRepository {
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
          // Same cast as cv.mapper.ts: the parser validates the shape before saving.
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

  async getUserIdByPublicId(
    userPublicId: string,
  ): Promise<Result<number | null, Error>> {
    try {
      const user = await this.prismaService.user.findUnique({
        where: { publicId: userPublicId },
        select: { id: true },
      });
      return ok(user?.id ?? null);
    } catch (error) {
      this.logger.error(`getUserIdByPublicId failed: ${error}`);
      return err(new Error('Failed to find user.'));
    }
  }

  async createCv(cv: Cv): Promise<Result<Cv, Error>> {
    try {
      const row = await this.prismaService.cv.create({
        data: {
          userId: cv.userId,
          fileName: cv.fileName,
          fileUrl: cv.fileUrl,
          cloudinaryPublicId: cv.cloudinaryPublicId,
          fileSize: cv.fileSize,
          rawText: cv.rawText,
          parseStatus: mapParseStatusToPrisma(cv.parseStatus),
          parserVersion: cv.parserVersion,
          isActive: cv.isActive,
          // parsedData omitted: a new CV has none, and the column defaults to NULL.
        },
      });
      return ok(mapCvToDomain(row));
    } catch (error) {
      // P2002 = Prisma's unique constraint violation (here: cloudinary_public_id).
      if ((error as { code?: string }).code === 'P2002') {
        return err(new CvFileAlreadySavedError());
      }
      this.logger.error(`createCv failed: ${error}`);
      return err(new Error('Failed to create CV.'));
    }
  }

  async getCvsByUser(userPublicId: string): Promise<Result<Cv[], Error>> {
    try {
      const rows = await this.prismaService.cv.findMany({
        where: { user: { publicId: userPublicId } },
        orderBy: { createdAt: 'desc' },
      });
      return ok(rows.map(mapCvToDomain));
    } catch (error) {
      this.logger.error(`getCvsByUser failed: ${error}`);
      return err(new Error('Failed to load CVs.'));
    }
  }

  async getCvByPublicId(
    userPublicId: string,
    cvPublicId: string,
  ): Promise<Result<Cv | null, Error>> {
    try {
      // The owner filter is part of the query: no row for another user's CV.
      const row = await this.prismaService.cv.findFirst({
        where: {
          publicId: cvPublicId,
          user: { publicId: userPublicId },
        },
      });
      return ok(row ? mapCvToDomain(row) : null);
    } catch (error) {
      this.logger.error(`getCvByPublicId failed: ${error}`);
      return err(new Error('Failed to load CV.'));
    }
  }

  async tryStartParse(
    userPublicId: string,
    cvPublicId: string,
    staleBefore: Date,
  ): Promise<Result<StartParseOutcome, Error>> {
    try {
      const owner = {
        publicId: cvPublicId,
        user: { publicId: userPublicId },
      };
      // One UPDATE decides who wins: only a row still PENDING/FAILED (or a stale
      // PROCESSING) matches, so a second request gets count 0.
      const claimed = await this.prismaService.cv.updateMany({
        where: {
          ...owner,
          OR: [
            { parseStatus: { in: [ParseStatus.PENDING, ParseStatus.FAILED] } },
            {
              parseStatus: ParseStatus.PROCESSING,
              updatedAt: { lt: staleBefore },
            },
          ],
        },
        data: { parseStatus: ParseStatus.PROCESSING },
      });

      const row = await this.prismaService.cv.findFirst({ where: owner });
      if (!row) {
        return ok({ status: 'not_found' });
      }
      if (claimed.count === 0) {
        return ok({ status: 'not_parsable' });
      }
      return ok({ status: 'started', cv: mapCvToDomain(row) });
    } catch (error) {
      this.logger.error(`tryStartParse failed: ${error}`);
      return err(new Error('Failed to start parsing.'));
    }
  }

  async saveParseResult(cv: Cv): Promise<Result<Cv, Error>> {
    try {
      const row = await this.prismaService.cv.update({
        where: { publicId: cv.publicId },
        data: {
          parseStatus: mapParseStatusToPrisma(cv.parseStatus),
          rawText: cv.rawText,
          parsedData: toJsonInput(cv.parsedData),
          parserVersion: cv.parserVersion,
        },
      });
      return ok(mapCvToDomain(row));
    } catch (error) {
      this.logger.error(`saveParseResult failed: ${error}`);
      return err(new Error('Failed to save the parse result.'));
    }
  }

  async saveParsedData(cv: Cv): Promise<Result<Cv, Error>> {
    try {
      const row = await this.prismaService.cv.update({
        where: { publicId: cv.publicId },
        data: { parsedData: toJsonInput(cv.parsedData) },
      });
      return ok(mapCvToDomain(row));
    } catch (error) {
      this.logger.error(`saveParsedData failed: ${error}`);
      return err(new Error('Failed to save the parsed data.'));
    }
  }
}

// A JSONB column needs Prisma.DbNull to store SQL NULL; a plain null is rejected.
function toJsonInput(
  parsedData: CvParsedData | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return parsedData === null ? Prisma.DbNull : parsedData;
}
