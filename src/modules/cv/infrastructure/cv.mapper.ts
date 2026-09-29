import type { Cv as CvRow } from 'generated/prisma/client';
import { ParseStatus as PrismaParseStatus } from 'generated/prisma/enums';
import { Cv } from '../domain/entities/cv.entity';
import { ParseStatus } from '../domain/enums/cv.enum';
import { CvParsedData } from '../domain/types/cv-parsed-data.type';

// Record<...> forces a mapping for every enum value: a new status fails the build here.
const parseStatusToPrisma: Record<ParseStatus, PrismaParseStatus> = {
  [ParseStatus.PENDING]: PrismaParseStatus.PENDING,
  [ParseStatus.PROCESSING]: PrismaParseStatus.PROCESSING,
  [ParseStatus.COMPLETED]: PrismaParseStatus.COMPLETED,
  [ParseStatus.FAILED]: PrismaParseStatus.FAILED,
};

const parseStatusToDomain: Record<PrismaParseStatus, ParseStatus> = {
  [PrismaParseStatus.PENDING]: ParseStatus.PENDING,
  [PrismaParseStatus.PROCESSING]: ParseStatus.PROCESSING,
  [PrismaParseStatus.COMPLETED]: ParseStatus.COMPLETED,
  [PrismaParseStatus.FAILED]: ParseStatus.FAILED,
};

export function mapParseStatusToPrisma(status: ParseStatus): PrismaParseStatus {
  return parseStatusToPrisma[status];
}

// DB row -> domain entity (rehydrate, no validation).
export function mapCvToDomain(row: CvRow): Cv {
  return Cv.getCv({
    id: row.id,
    publicId: row.publicId,
    userId: row.userId,
    fileName: row.fileName,
    fileUrl: row.fileUrl,
    cloudinaryPublicId: row.cloudinaryPublicId,
    fileSize: row.fileSize,
    rawText: row.rawText,
    // JSONB comes back untyped. Safe to cast: only the parser writes this column,
    // and it validates the shape before saving (Sprint 3).
    parsedData: row.parsedData as CvParsedData | null,
    parseStatus: parseStatusToDomain[row.parseStatus],
    parserVersion: row.parserVersion,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
