import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import { Cv } from '../../domain/entities/cv.entity';
import {
  MIN_CV_TEXT_LENGTH,
  normalizeCvText,
} from '../../domain/parsing/cv-text';
import { normalizeParsedData } from '../../domain/parsing/parsed-data.normalizer';
import {
  CvFileAlreadySavedError,
  ICvManagementRepository,
} from '../../domain/repositories/cv-management.repo.interface';
import {
  CreateCvRequestDto,
  UpdateParsedDataRequestDto,
} from '../dtos/cv.request.dto';
import {
  CvResponseDto,
  CvSignedParamsResponseDto,
  CvSummaryResponseDto,
} from '../dtos/cv.response.dto';
import { ICvFileStorage } from '../interfaces/cv-file-storage.interface';
import { ICvParser } from '../interfaces/cv-parser.interface';
import { ICvTextExtractor } from '../interfaces/cv-text-extractor.interface';
import { ICvService } from '../interfaces/cv.service.interface';

// Every user uploads under their own prefix, so ownership can be checked from the id alone.
function userFilePrefix(userPublicId: string): string {
  return `cvs/${userPublicId}/`;
}

// A parse that stays PROCESSING longer than this crashed; it may be started again.
const PARSE_STALE_AFTER_MS = 3 * 60 * 1000;

type ParseStep = 'download' | 'extract' | 'text' | 'parse';
type ParseFailure = { step: ParseStep; message: string };
type ParseSuccess = Parameters<Cv['completeParsing']>[0];

@Injectable()
export class CvService implements ICvService {
  private readonly logger = new Logger(CvService.name);

  constructor(
    private readonly cvRepo: ICvManagementRepository,
    private readonly fileStorage: ICvFileStorage,
    private readonly textExtractor: ICvTextExtractor,
    private readonly cvParser: ICvParser,
  ) {}

  createSignedParamsAsync(
    userPublicId: string,
  ): Promise<Result<CvSignedParamsResponseDto, AppError>> {
    const cloudinaryPublicId = `${userFilePrefix(userPublicId)}${randomUUID()}`;
    const signed = this.fileStorage.createSignedUpload(cloudinaryPublicId);

    if (signed.isErr()) {
      return Promise.resolve(
        err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to prepare the upload',
          ),
        ),
      );
    }

    return Promise.resolve(ok(signed.value));
  }

  async createCvAsync(
    userPublicId: string,
    request: CreateCvRequestDto,
  ): Promise<Result<CvResponseDto, AppError>> {
    // 1. The file must sit under this user's prefix: blocks claiming someone else's upload.
    if (!request.cloudinaryPublicId.startsWith(userFilePrefix(userPublicId))) {
      return err(new AppError(ErrorCode.BadRequest, 'Invalid uploaded file'));
    }

    // 2. Ask the storage what was really uploaded; never trust client size/URL.
    const fileResult = await this.fileStorage.getFile(
      request.cloudinaryPublicId,
    );
    if (fileResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to read the uploaded file',
        ),
      );
    }
    const file = fileResult.value;
    if (!file) {
      return err(
        new AppError(ErrorCode.BadRequest, 'Uploaded file was not found'),
      );
    }
    if (file.format !== 'pdf') {
      return err(
        new AppError(ErrorCode.BadRequest, 'Only PDF files are allowed'),
      );
    }

    // 3. JWT `sub` (UUID) -> internal user id.
    const userIdResult = await this.cvRepo.getUserIdByPublicId(userPublicId);
    if (userIdResult.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to create CV'),
      );
    }
    if (userIdResult.value === null) {
      return err(new AppError(ErrorCode.Unauthorized, 'User no longer exists'));
    }

    // 4. Business rules live in the entity (name, size limit, PENDING...).
    // TODO (Sprint 5): per-user upload limit (open point #3).
    const cvResult = Cv.create({
      userId: userIdResult.value,
      fileName: request.fileName,
      fileUrl: file.url,
      cloudinaryPublicId: request.cloudinaryPublicId,
      fileSize: file.bytes,
    });
    if (cvResult.isErr()) {
      return err(new AppError(ErrorCode.BadRequest, cvResult.error.message));
    }

    // 5. Save and return the stored CV (now with publicId and timestamps).
    const saved = await this.cvRepo.createCv(cvResult.value);
    if (saved.isErr() && saved.error instanceof CvFileAlreadySavedError) {
      // Same upload submitted twice (e.g. double click).
      return err(
        new AppError(ErrorCode.Conflict, 'This file has already been saved'),
      );
    }
    if (saved.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to create CV'),
      );
    }

    return ok(toCvResponse(saved.value));
  }

  async getCvsAsync(
    userPublicId: string,
  ): Promise<Result<CvSummaryResponseDto[], AppError>> {
    const result = await this.cvRepo.getCvsByUser(userPublicId);
    if (result.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to load CVs'),
      );
    }

    return ok(result.value.map(toCvSummary));
  }

  async getCvAsync(
    userPublicId: string,
    cvPublicId: string,
  ): Promise<Result<CvResponseDto, AppError>> {
    const result = await this.cvRepo.getCvByPublicId(userPublicId, cvPublicId);
    if (result.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to load CV'),
      );
    }
    // Missing and "belongs to someone else" look the same: 404, never 403.
    if (!result.value) {
      return err(new AppError(ErrorCode.NotFound, 'CV not found'));
    }

    return ok(toCvResponse(result.value));
  }

  async parseCvAsync(
    userPublicId: string,
    cvPublicId: string,
  ): Promise<Result<CvResponseDto, AppError>> {
    const started = await this.cvRepo.tryStartParse(
      userPublicId,
      cvPublicId,
      new Date(Date.now() - PARSE_STALE_AFTER_MS),
    );
    if (started.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to start parsing'),
      );
    }
    if (started.value.status === 'not_found') {
      return err(new AppError(ErrorCode.NotFound, 'CV not found'));
    }
    if (started.value.status === 'not_parsable') {
      return err(
        new AppError(
          ErrorCode.Conflict,
          'This CV is already parsed or is being parsed',
        ),
      );
    }

    const cv = started.value.cv;
    const outcome = await this.runParsePipelineAsync(cv);
    if (outcome.isErr()) {
      this.logger.warn(
        `Parsing CV ${cvPublicId} failed at step "${outcome.error.step}": ${outcome.error.message}`,
      );
    }

    const finished = outcome.isOk()
      ? cv.completeParsing(outcome.value)
      : cv.failParsing();
    const saved = await this.cvRepo.saveParseResult(finished);
    if (saved.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to save the parse result',
        ),
      );
    }

    return ok(toCvResponse(saved.value));
  }

  async updateParsedDataAsync(
    userPublicId: string,
    cvPublicId: string,
    request: UpdateParsedDataRequestDto,
  ): Promise<Result<CvResponseDto, AppError>> {
    const found = await this.cvRepo.getCvByPublicId(userPublicId, cvPublicId);
    if (found.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to load CV'),
      );
    }
    if (!found.value) {
      return err(new AppError(ErrorCode.NotFound, 'CV not found'));
    }
    if (!found.value.canEditParsedData()) {
      return err(
        new AppError(ErrorCode.Conflict, 'Only a parsed CV can be edited'),
      );
    }

    const normalized = normalizeParsedData(request);
    if (normalized.isErr()) {
      return err(new AppError(ErrorCode.BadRequest, normalized.error.message));
    }

    const saved = await this.cvRepo.saveParsedData(
      found.value.withParsedData(normalized.value),
    );
    if (saved.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to save the CV'),
      );
    }

    return ok(toCvResponse(saved.value));
  }

  private async runParsePipelineAsync(
    cv: Cv,
  ): Promise<Result<ParseSuccess, ParseFailure>> {
    try {
      const file = await this.fileStorage.downloadFile(cv.cloudinaryPublicId);
      if (file.isErr()) {
        return err({ step: 'download', message: file.error.message });
      }
      if (file.value === null) {
        return err({ step: 'download', message: 'File not found in storage' });
      }

      const extracted = await this.textExtractor.extractTextAsync(file.value);
      if (extracted.isErr()) {
        return err({ step: 'extract', message: extracted.error.message });
      }

      const rawText = normalizeCvText(extracted.value);
      if (rawText.length < MIN_CV_TEXT_LENGTH) {
        return err({
          step: 'text',
          message: 'The PDF has no readable text (maybe a scanned image)',
        });
      }

      const parsed = await this.cvParser.parseAsync(rawText);
      if (parsed.isErr()) {
        return err({ step: 'parse', message: parsed.error.message });
      }

      return ok({
        rawText,
        parsedData: parsed.value.parsedData,
        parserVersion: parsed.value.parserVersion,
      });
    } catch (error) {
      return err({
        step: 'parse',
        message: error instanceof Error ? error.message : 'Unexpected error',
      });
    }
  }
}

// Only saved CVs reach these mappers, so group A fields are always present.
function toCvResponse(cv: Cv): CvResponseDto {
  return {
    publicId: cv.publicId!,
    fileName: cv.fileName,
    fileUrl: cv.fileUrl,
    fileSize: cv.fileSize,
    parseStatus: cv.parseStatus,
    parsedData: cv.parsedData,
    isActive: cv.isActive,
    createdAt: cv.createdAt!.toISOString(),
    updatedAt: cv.updatedAt!.toISOString(),
  };
}

function toCvSummary(cv: Cv): CvSummaryResponseDto {
  return {
    publicId: cv.publicId!,
    fileName: cv.fileName,
    fileSize: cv.fileSize,
    parseStatus: cv.parseStatus,
    isActive: cv.isActive,
    createdAt: cv.createdAt!.toISOString(),
  };
}
