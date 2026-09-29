import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import { Cv } from '../../domain/entities/cv.entity';
import {
  CvFileAlreadySavedError,
  ICvManagementRepository,
} from '../../domain/repositories/cv-management.repo.interface';
import { CreateCvRequestDto } from '../dtos/cv.request.dto';
import {
  CvResponseDto,
  CvSignedParamsResponseDto,
  CvSummaryResponseDto,
} from '../dtos/cv.response.dto';
import { ICvFileStorage } from '../interfaces/cv-file-storage.interface';
import { ICvService } from '../interfaces/cv.service.interface';

// Every user uploads under their own prefix, so ownership can be checked from the id alone.
function userFilePrefix(userPublicId: string): string {
  return `cvs/${userPublicId}/`;
}

@Injectable()
export class CvService implements ICvService {
  constructor(
    private readonly cvRepo: ICvManagementRepository,
    private readonly fileStorage: ICvFileStorage,
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
