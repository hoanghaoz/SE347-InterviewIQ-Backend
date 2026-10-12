import { Injectable } from '@nestjs/common';
import { IInterviewService } from '../interfaces/interview.service.interface';
import { err, ok, type Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import {
  CreateInterviewRequestDto,
  SubmitInterviewSessionRequestDto,
} from '../dtos/interview.request.dto';
import { IInterviewRepository } from '../../domain/repositories/interview.repo.interface';
import { ICvRepository } from '../../../cv/domain/repositories/cv.repo.interface';
import { Interview } from '../../domain/entities/interview.entity';
import { InterviewSubmissionConflictError } from '../../domain/errors/interview-domain.error';
import { IScoringService } from '../../../scoring/application/interfaces/scoring.service.interface';

@Injectable()
export class InterviewService implements IInterviewService {
  constructor(
    private readonly interviewRepo: IInterviewRepository,
    private readonly cvRepo: ICvRepository,
    private readonly scoringService: IScoringService,
  ) {}
  async submitInterviewSessionAsync(
    userPublicId: string,
    sessionPublicId: string,
    request: SubmitInterviewSessionRequestDto,
  ): Promise<Result<undefined, AppError>> {
    const [cvAuthorizeResult, sessionAuthorizeResult] = await Promise.all([
      this.cvRepo.authorizeUserCv(userPublicId, request.cvPublicId),
      this.interviewRepo.authorizeInterviewSession(
        sessionPublicId,
        userPublicId,
        request.cvPublicId,
      ),
    ]);
    if (cvAuthorizeResult.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to authorize CV'),
      );
    }
    if (!cvAuthorizeResult.value) {
      return err(
        new AppError(ErrorCode.NotFound, 'CV not found or unavailable'),
      );
    }
    if (sessionAuthorizeResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to authorize interview session',
        ),
      );
    }
    if (!sessionAuthorizeResult.value) {
      return err(
        new AppError(
          ErrorCode.NotFound,
          'Interview session not found or unavailable',
        ),
      );
    }

    const submitResult = await this.interviewRepo.submitInterviewSession(
      sessionPublicId,
      {
        totalQuestions: request.totalQuestions,
        durationSeconds: request.durationSeconds,
        submittedAt: new Date(),
      },
    );
    if (submitResult.isErr()) {
      if (submitResult.error instanceof InterviewSubmissionConflictError) {
        return err(
          new AppError(ErrorCode.Conflict, submitResult.error.message),
        );
      }
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to submit interview session',
        ),
      );
    }

    try {
      const enqueueResult = await this.scoringService.enqueueAsync(
        sessionPublicId,
        userPublicId,
      );
      if (enqueueResult.isErr()) return err(enqueueResult.error);
    } catch {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to enqueue interview scoring',
        ),
      );
    }
    return ok(undefined);
  }
  async createInterviewSessionAsync(
    userPublicId: string,
    request: CreateInterviewRequestDto,
  ): Promise<Result<string, AppError>> {
    const authorizeResult = await this.cvRepo.authorizeUserCv(
      userPublicId,
      request.cvPublicId,
    );
    if (authorizeResult.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to authorize CV'),
      );
    }
    if (!authorizeResult.value) {
      return err(
        new AppError(ErrorCode.NotFound, 'CV not found or unavailable'),
      );
    }

    const validateInterviewRequest = Interview.create({
      userId: authorizeResult.value.userId,
      cvId: authorizeResult.value.cvId,
      title: request.title,
      jobDescription: request.jobDescription ?? null,
    });

    if (validateInterviewRequest.isErr()) {
      return err(
        new AppError(
          ErrorCode.BadRequest,
          validateInterviewRequest.error.message,
        ),
      );
    }

    const newInterviewSession = validateInterviewRequest.value;
    const result =
      await this.interviewRepo.createInterviewSession(newInterviewSession);
    if (result.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to create interview',
        ),
      );
    }
    return ok(result.value);
  }
}
