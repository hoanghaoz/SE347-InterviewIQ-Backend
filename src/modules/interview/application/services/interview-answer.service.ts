import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { err, ok, type Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import {
  INTERVIEW_VIDEO_FORMATS,
  MAX_INTERVIEW_VIDEO_BYTES,
} from '../../domain/constants/interview-answer.constants';
import { CommonSessionStatus } from '../../domain/enums/interview-enum';
import {
  InterviewAnswerConflictError,
  InterviewAnswerUnavailableError,
} from '../../domain/errors/interview-answer.error';
import { IInterviewAnswerRepository } from '../../domain/repositories/interview-answer.repo.interface';
import { SaveInterviewAnswerRequestDto } from '../dtos/interview-answer.request.dto';
import {
  InterviewAnswerResponseDto,
  InterviewVideoSignedParamsResponseDto,
} from '../dtos/interview-answer.response.dto';
import { IInterviewAnswerService } from '../interfaces/interview-answer.service.interface';
import {
  IInterviewVideoStorage,
  type UploadedInterviewVideo,
} from '../interfaces/interview-video-storage.interface';

function videoPrefix(
  userPublicId: string,
  sessionPublicId: string,
  questionPublicId: string,
): string {
  return `interview-answers/${userPublicId}/${sessionPublicId}/${questionPublicId}/`;
}

function isValidVideo(video: UploadedInterviewVideo): boolean {
  try {
    return (
      INTERVIEW_VIDEO_FORMATS.some((format) => format === video.format) &&
      Number.isInteger(video.bytes) &&
      video.bytes > 0 &&
      video.bytes <= MAX_INTERVIEW_VIDEO_BYTES &&
      Number.isFinite(video.durationSeconds) &&
      video.durationSeconds > 0 &&
      Math.ceil(video.durationSeconds) <= 2_147_483_647 &&
      Number.isInteger(video.width) &&
      video.width > 0 &&
      Number.isInteger(video.height) &&
      video.height > 0 &&
      video.url.length <= 500 &&
      new URL(video.url).protocol === 'https:'
    );
  } catch {
    return false;
  }
}

@Injectable()
export class InterviewAnswerService implements IInterviewAnswerService {
  constructor(
    private readonly answerRepo: IInterviewAnswerRepository,
    private readonly videoStorage: IInterviewVideoStorage,
  ) {}

  async createSignedParamsAsync(
    userPublicId: string,
    sessionPublicId: string,
    questionPublicId: string,
  ): Promise<Result<InterviewVideoSignedParamsResponseDto, AppError>> {
    const authorization = await this.authorizeQuestionAsync(
      userPublicId,
      sessionPublicId,
      questionPublicId,
    );
    if (authorization.isErr()) return err(authorization.error);
    const publicId = `${videoPrefix(userPublicId, sessionPublicId, questionPublicId)}${randomUUID()}`;
    const signed = this.videoStorage.createSignedUpload(publicId);
    if (signed.isErr())
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to prepare video upload',
        ),
      );
    return ok(signed.value);
  }

  async saveAnswerAsync(
    userPublicId: string,
    sessionPublicId: string,
    questionPublicId: string,
    request: SaveInterviewAnswerRequestDto,
  ): Promise<Result<InterviewAnswerResponseDto, AppError>> {
    const authorization = await this.authorizeQuestionAsync(
      userPublicId,
      sessionPublicId,
      questionPublicId,
    );
    if (authorization.isErr()) return err(authorization.error);
    const prefix = videoPrefix(userPublicId, sessionPublicId, questionPublicId);
    if (
      !request.cloudinaryPublicId.startsWith(prefix) ||
      !isUUID(request.cloudinaryPublicId.slice(prefix.length), '4')
    ) {
      return err(new AppError(ErrorCode.BadRequest, 'Invalid uploaded video'));
    }
    const videoResult = await this.videoStorage.getVideo(
      request.cloudinaryPublicId,
    );
    if (videoResult.isErr())
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to verify uploaded video',
        ),
      );
    if (!videoResult.value)
      return err(
        new AppError(ErrorCode.BadRequest, 'Uploaded video was not found'),
      );
    const video = videoResult.value;
    if (!isValidVideo(video))
      return err(
        new AppError(
          ErrorCode.BadRequest,
          'A valid MP4 or WebM video up to 100 MiB is required',
        ),
      );
    const saved = await this.answerRepo.saveAnswer({
      userPublicId,
      sessionPublicId,
      questionPublicId,
      videoUrl: video.url,
      transcript: request.transcript,
      durationSeconds: Math.ceil(video.durationSeconds),
    });
    if (saved.isErr()) {
      if (saved.error instanceof InterviewAnswerConflictError)
        return err(new AppError(ErrorCode.Conflict, saved.error.message));
      if (saved.error instanceof InterviewAnswerUnavailableError)
        return err(new AppError(ErrorCode.NotFound, saved.error.message));
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to save interview answer',
        ),
      );
    }
    return ok({
      publicId: saved.value.publicId,
      questionPublicId,
      videoUrl: saved.value.videoUrl,
      transcript: saved.value.transcript,
      durationSeconds: saved.value.durationSeconds,
      createdAt: saved.value.createdAt.toISOString(),
      updatedAt: saved.value.updatedAt.toISOString(),
    });
  }

  private async authorizeQuestionAsync(
    userPublicId: string,
    sessionPublicId: string,
    questionPublicId: string,
  ): Promise<Result<undefined, AppError>> {
    const question = await this.answerRepo.getQuestionForUser(
      userPublicId,
      sessionPublicId,
      questionPublicId,
    );
    if (question.isErr())
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to authorize interview question',
        ),
      );
    if (!question.value)
      return err(
        new AppError(
          ErrorCode.NotFound,
          'Interview question not found or unavailable',
        ),
      );
    if (
      question.value.status !== CommonSessionStatus.CREATED &&
      question.value.status !== CommonSessionStatus.IN_PROGRESS
    ) {
      return err(
        new AppError(
          ErrorCode.Conflict,
          'Answers cannot be changed in the current session state',
        ),
      );
    }
    return ok(undefined);
  }
}
