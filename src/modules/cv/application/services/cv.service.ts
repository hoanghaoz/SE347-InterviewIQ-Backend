import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import { Cv, MAX_CVS_PER_USER } from '../../domain/entities/cv.entity';
import { ParseFailureReason } from '../../domain/enums/cv.enum';
import {
  MIN_CV_TEXT_LENGTH,
  normalizeCvText,
} from '../../domain/parsing/cv-text';
import { normalizeParsedData } from '../../domain/parsing/parsed-data.normalizer';
import {
  CvFileAlreadySavedError,
  CvLimitReachedError,
  ICvManagementRepository,
} from '../../domain/repositories/cv-management.repo.interface';
import {
  CreateCvRequestDto,
  UpdateParsedDataRequestDto,
} from '../dtos/cv.request.dto';
import {
  CvParseResponseDto,
  CvResponseDto,
  CvSignedParamsResponseDto,
  CvSummaryResponseDto,
} from '../dtos/cv.response.dto';
import {
  CvStoredFile,
  ICvFileStorage,
} from '../interfaces/cv-file-storage.interface';
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

const FAILURE_REASON_BY_STEP: Record<ParseStep, ParseFailureReason> = {
  download: ParseFailureReason.FILE_UNAVAILABLE,
  extract: ParseFailureReason.FILE_UNREADABLE,
  text: ParseFailureReason.NO_TEXT,
  parse: ParseFailureReason.AI_FAILED,
};

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
    // 1. The file must be ours, exist in the storage and be a PDF.
    const uploaded = await this.readUploadedFileAsync(userPublicId, request);
    if (uploaded.isErr()) {
      return err(uploaded.error);
    }
    const file = uploaded.value;

    // 2. JWT `sub` (UUID) -> internal user id.
    const userIdResult = await this.cvRepo.getUserIdByPublicId(userPublicId);
    if (userIdResult.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to create CV'),
      );
    }
    if (userIdResult.value === null) {
      return err(new AppError(ErrorCode.Unauthorized, 'User no longer exists'));
    }

    // 3. Business rules live in the entity (name, size limit, PENDING...).
    const cvResult = Cv.create({
      userId: userIdResult.value,
      fileName: request.fileName,
      fileUrl: file.url,
      cloudinaryPublicId: request.cloudinaryPublicId,
      fileSize: file.bytes,
    });
    if (cvResult.isErr()) {
      await this.discardUploadedFileAsync(request.cloudinaryPublicId);
      return err(new AppError(ErrorCode.BadRequest, cvResult.error.message));
    }

    // 4. Save and return the stored CV (now with publicId and timestamps).
    const saved = await this.cvRepo.createCv(cvResult.value, MAX_CVS_PER_USER);
    if (saved.isErr() && saved.error instanceof CvFileAlreadySavedError) {
      // Same upload submitted twice (e.g. double click): the file belongs to a CV, keep it.
      return err(
        new AppError(ErrorCode.Conflict, 'This file has already been saved'),
      );
    }
    if (saved.isErr() && saved.error instanceof CvLimitReachedError) {
      await this.discardUploadedFileAsync(request.cloudinaryPublicId);
      return err(
        new AppError(
          ErrorCode.TooManyRequests,
          `You can keep at most ${MAX_CVS_PER_USER} CVs. Delete one before uploading another`,
        ),
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
  ): Promise<Result<CvParseResponseDto, AppError>> {
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

    const failureReason = outcome.isErr()
      ? FAILURE_REASON_BY_STEP[outcome.error.step]
      : null;

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

    return ok({ ...toCvResponse(saved.value), failureReason });
  }

  async replaceCvFileAsync(
    userPublicId: string,
    cvPublicId: string,
    request: CreateCvRequestDto,
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
    const current = found.value;
    const staleBefore = new Date(Date.now() - PARSE_STALE_AFTER_MS);
    if (current.isBeingParsed(staleBefore)) {
      return err(
        new AppError(ErrorCode.Conflict, 'This CV is being parsed, try again'),
      );
    }

    const uploaded = await this.readUploadedFileAsync(userPublicId, request);
    if (uploaded.isErr()) {
      return err(uploaded.error);
    }

    const replaced = current.replaceFile({
      fileName: request.fileName,
      fileUrl: uploaded.value.url,
      cloudinaryPublicId: request.cloudinaryPublicId,
      fileSize: uploaded.value.bytes,
    });
    if (replaced.isErr()) {
      await this.discardUploadedFileAsync(request.cloudinaryPublicId);
      return err(new AppError(ErrorCode.BadRequest, replaced.error.message));
    }

    const saved = await this.cvRepo.replaceFile(
      replaced.value,
      current.cloudinaryPublicId,
      staleBefore,
    );
    if (saved.isErr() && saved.error instanceof CvFileAlreadySavedError) {
      return err(
        new AppError(ErrorCode.Conflict, 'This file has already been saved'),
      );
    }
    if (saved.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to replace the CV'),
      );
    }
    if (saved.value === null) {
      return err(
        new AppError(
          ErrorCode.Conflict,
          'This CV is being parsed or was just changed, try again',
        ),
      );
    }

    // The old file is not referenced any more. Failing to remove it only leaves garbage.
    if (current.cloudinaryPublicId !== request.cloudinaryPublicId) {
      await this.discardUploadedFileAsync(current.cloudinaryPublicId);
    }

    return ok(toCvResponse(saved.value));
  }

  async deleteCvAsync(
    userPublicId: string,
    cvPublicId: string,
  ): Promise<Result<void, AppError>> {
    const found = await this.cvRepo.getCvByPublicId(userPublicId, cvPublicId);
    if (found.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to load CV'),
      );
    }
    if (!found.value) {
      return err(new AppError(ErrorCode.NotFound, 'CV not found'));
    }
    if (
      found.value.isBeingParsed(new Date(Date.now() - PARSE_STALE_AFTER_MS))
    ) {
      return err(
        new AppError(ErrorCode.Conflict, 'This CV is being parsed, try again'),
      );
    }

    // File first: if the storage fails the CV row stays, so the user can retry.
    // The other order could lose the row and leave a file nobody can find again.
    const removedFile = await this.fileStorage.deleteFile(
      found.value.cloudinaryPublicId,
    );
    if (removedFile.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to delete the CV file',
        ),
      );
    }

    const deleted = await this.cvRepo.deleteCv(userPublicId, cvPublicId);
    if (deleted.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to delete the CV'),
      );
    }

    return ok(undefined);
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

  // Shared by create and replace: the file must sit under this user's prefix, exist in
  // the storage and be a PDF. Size and name are checked by the entity afterwards.
  private async readUploadedFileAsync(
    userPublicId: string,
    request: CreateCvRequestDto,
  ): Promise<Result<CvStoredFile, AppError>> {
    // Blocks claiming someone else's upload.
    if (!request.cloudinaryPublicId.startsWith(userFilePrefix(userPublicId))) {
      return err(new AppError(ErrorCode.BadRequest, 'Invalid uploaded file'));
    }

    // Ask the storage what was really uploaded; never trust client size/URL.
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
      await this.discardUploadedFileAsync(request.cloudinaryPublicId);
      return err(
        new AppError(ErrorCode.BadRequest, 'Only PDF files are allowed'),
      );
    }

    return ok(file);
  }

  // A rejected upload is already in the storage but no CV will ever point to it, so it
  // would stay there for ever. Call this only when the file itself is invalid, never
  // for a duplicate: a duplicate file already belongs to another CV.
  private async discardUploadedFileAsync(
    cloudinaryPublicId: string,
  ): Promise<void> {
    const removed = await this.fileStorage.deleteFile(cloudinaryPublicId);
    if (removed.isErr()) {
      this.logger.warn(
        `Could not remove file ${cloudinaryPublicId}: ${removed.error.message}`,
      );
    }
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
