import { Injectable } from '@nestjs/common';
import { IInterviewService } from '../interfaces/interview.service.interface';
import { err, ok, type Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import { instruments } from '../../../../shared/telemetry/metrics';
import { withResultSpan } from '../../../../shared/telemetry/telemetry';
import {
  CreateInterviewRequestDto,
  SubmitInterviewSessionRequestDto,
} from '../dtos/interview.request.dto';
import {
  InterviewSessionResponse,
  StartInterviewSessionResponseDto,
  SubmitInterviewSessionResponseDto,
} from '../dtos/interview.response.dto';
import { IInterviewRepository } from '../../domain/repositories/interview.repo.interface';
import { ICvRepository } from '../../../cv/domain/repositories/cv.repo.interface';
import { Interview } from '../../domain/entities/interview.entity';
import {
  InterviewStartConflictError,
  InterviewSubmissionConflictError,
} from '../../domain/errors/interview-domain.error';
import { IScoringService } from '../../../scoring/application/interfaces/scoring.service.interface';
import {
  PageResult,
  PaginationRequest,
} from '../../../../shared/common/pagination';
import { CommonSessionStatus } from '../../domain/enums/interview-enum';

@Injectable()
export class InterviewService implements IInterviewService {
  constructor(
    private readonly interviewRepo: IInterviewRepository,
    private readonly cvRepo: ICvRepository,
    private readonly scoringService: IScoringService,
  ) {}
  async getInterviewSessionAsync(
    userPublicId: string,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<InterviewSessionResponse>, AppError>> {
    const result = await this.interviewRepo.getInterviewSessions(
      userPublicId,
      pagination,
    );
    if (result.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to retrieve interview sessions',
        ),
      );
    }
    const page = result.value;
    return ok({
      ...page,
      items: page.items.map((session) => ({
        ...session,
        createdAt: session.createdAt.toISOString(),
      })),
    });
  }

  startInterviewSessionAsync(
    userPublicId: string,
    sessionPublicId: string,
  ): Promise<Result<StartInterviewSessionResponseDto, AppError>> {
    return withResultSpan(
      'interview.start',
      { 'session.id': sessionPublicId },
      async () => {
        const result = await this.startInterviewSessionInternalAsync(
          userPublicId,
          sessionPublicId,
        );
        if (result.isOk()) instruments().interviewSessionStarted.add(1);
        return result;
      },
    );
  }

  private async startInterviewSessionInternalAsync(
    userPublicId: string,
    sessionPublicId: string,
  ): Promise<Result<StartInterviewSessionResponseDto, AppError>> {
    const authorizeResult = await this.interviewRepo.authorizeInterviewSession(
      sessionPublicId,
      userPublicId,
    );
    if (authorizeResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to authorize interview session',
        ),
      );
    }
    const session = authorizeResult.value;
    if (!session) {
      return err(
        new AppError(
          ErrorCode.NotFound,
          'Interview session not found or unavailable',
        ),
      );
    }
    if (session.status !== CommonSessionStatus.CREATED) {
      return err(
        new AppError(
          ErrorCode.Conflict,
          'Interview session cannot be started in its current state',
        ),
      );
    }
    const startedAt = new Date();
    const result = await this.interviewRepo.startInterviewSession(
      session.userId,
      session.sessionId,
      startedAt,
    );
    if (result.isErr()) {
      if (result.error instanceof InterviewStartConflictError) {
        return err(new AppError(ErrorCode.Conflict, result.error.message));
      }
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to start interview session',
        ),
      );
    }
    return ok({
      sessionPublicId,
      status: CommonSessionStatus.IN_PROGRESS,
      startedAt: startedAt.toISOString(),
    });
  }

  submitInterviewSessionAsync(
    userPublicId: string,
    sessionPublicId: string,
    request: SubmitInterviewSessionRequestDto,
  ): Promise<Result<SubmitInterviewSessionResponseDto, AppError>> {
    return withResultSpan(
      'interview.submit',
      { 'session.id': sessionPublicId },
      () =>
        this.submitInterviewSessionInternalAsync(
          userPublicId,
          sessionPublicId,
          request,
        ),
    );
  }

  private async submitInterviewSessionInternalAsync(
    userPublicId: string,
    sessionPublicId: string,
    request: SubmitInterviewSessionRequestDto,
  ): Promise<Result<SubmitInterviewSessionResponseDto, AppError>> {
    const [cvAuthorizeResult, sessionAuthorizeResult] = await Promise.all([
      this.cvRepo.authorizeUserCv(userPublicId, request.cvPublicId),
      this.interviewRepo.authorizeInterviewSession(
        sessionPublicId,
        userPublicId,
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
    if (sessionAuthorizeResult.value.cvId !== cvAuthorizeResult.value.cvId) {
      return err(
        new AppError(
          ErrorCode.BadRequest,
          'CV does not belong to this interview session',
        ),
      );
    }

    if (
      sessionAuthorizeResult.value.status !== CommonSessionStatus.IN_PROGRESS
    ) {
      return err(
        new AppError(
          ErrorCode.BadRequest,
          `Cannot submit the session with status ${sessionAuthorizeResult.value.status} `,
        ),
      );
    }
    const submitResult = await this.interviewRepo.submitInterviewSession(
      sessionPublicId,
      {
        cvSnapshot: cvAuthorizeResult.value.snapshot,
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

    // The session is already SUBMITTED here; a failed enqueue leaves it unscored.
    instruments().interviewSessionSubmitted.add(1);
    try {
      const enqueueResult = await this.scoringService.enqueueAsync(
        sessionPublicId,
        userPublicId,
      );
      if (enqueueResult.isErr()) {
        instruments().interviewSubmitEnqueueFailed.add(1, {
          error_code: enqueueResult.error.code,
        });
        return err(enqueueResult.error);
      }
      return ok({
        sessionPublicId,
        jobId: enqueueResult.value.jobId,
        status: enqueueResult.value.status,
      });
    } catch {
      instruments().interviewSubmitEnqueueFailed.add(1, {
        error_code: ErrorCode.InternalServerError,
      });
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to enqueue interview scoring',
        ),
      );
    }
  }
  createInterviewSessionAsync(
    userPublicId: string,
    request: CreateInterviewRequestDto,
  ): Promise<Result<string, AppError>> {
    return withResultSpan('interview.create', {}, async () => {
      const result = await this.createInterviewSessionInternalAsync(
        userPublicId,
        request,
      );
      if (result.isOk()) instruments().interviewSessionCreated.add(1);
      return result;
    });
  }

  private async createInterviewSessionInternalAsync(
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
