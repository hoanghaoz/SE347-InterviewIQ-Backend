import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { SessionStatus } from '../../../../../generated/prisma/enums';
import { CommonUserRole } from '../../../../shared/common/commonEnum';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import { ScoringJobData } from '../dtos/scoring.request.dto';
import {
  ScoringJobStatusResponseDto,
  SessionResultResponseDto,
} from '../dtos/scoring.response.dto';
import { IScoringQueue } from '../interfaces/scoring.queue.interface';
import {
  EnqueueResult,
  IScoringService,
} from '../interfaces/scoring.service.interface';
import { IScoringRepository } from '../../domain/repositories/scoring.repo.interface';
import { mapToSessionResultDto } from '../../infrastructure/scoring-mapper';

@Injectable()
export class ScoringService implements IScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    private readonly scoringQueue: IScoringQueue,
    private readonly scoringRepo: IScoringRepository,
  ) {}

  async enqueueAsync(
    sessionId: string,
    userId: string,
  ): Promise<Result<EnqueueResult, AppError>> {
    if (!sessionId || !sessionId.trim()) {
      return err(
        new AppError(
          ErrorCode.BadRequest,
          'sessionId must be a non-empty string',
        ),
      );
    }

    if (!userId || !userId.trim()) {
      return err(
        new AppError(ErrorCode.BadRequest, 'userId must be a non-empty string'),
      );
    }

    const jobData: ScoringJobData = {
      sessionId: sessionId.trim(),
      userId: userId.trim(),
      enqueuedAt: new Date().toISOString(),
    };

    const jobId = await this.scoringQueue.enqueue(jobData);
    if (!jobId) {
      return err(
        new AppError(
          ErrorCode.Conflict,
          'A scoring job for this session is already queued',
        ),
      );
    }

    this.logger.log(`Scoring job enqueued: ${jobId} for session ${sessionId}`);

    return ok({ jobId, status: 'QUEUED' });
  }

  async getJobStatusAsync(
    jobId: string,
    userId: string,
    userRole?: string,
  ): Promise<Result<ScoringJobStatusResponseDto, AppError>> {
    const job = await this.scoringQueue.getJob(jobId);
    if (!job) {
      return err(
        new AppError(
          ErrorCode.NotFound,
          `Scoring job with id '${jobId}' not found`,
        ),
      );
    }

    if (userRole !== CommonUserRole.ADMIN && job.data.userId !== userId) {
      return err(
        new AppError(
          ErrorCode.Forbidden,
          'You are not authorized to view this scoring job',
        ),
      );
    }

    return ok({
      jobId: job.id,
      sessionId: job.data.sessionId,
      status: job.status,
      createdAt: job.createdOn.toISOString(),
      completedAt: job.completedOn ? job.completedOn.toISOString() : null,
    });
  }

  async getSessionResultAsync(
    sessionId: string,
    userId: string,
    userRole?: string,
  ): Promise<Result<SessionResultResponseDto, AppError>> {
    const ownerResult = await this.scoringRepo.getSessionOwnerUserId(sessionId);
    if (ownerResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to retrieve session information',
        ),
      );
    }

    const sessionInfo = ownerResult.value;
    if (!sessionInfo) {
      return err(
        new AppError(
          ErrorCode.NotFound,
          `Interview session with id '${sessionId}' not found`,
        ),
      );
    }

    if (
      userRole !== CommonUserRole.ADMIN &&
      sessionInfo.ownerPublicId !== userId
    ) {
      return err(
        new AppError(
          ErrorCode.Forbidden,
          'You are not authorized to view the result of this session',
        ),
      );
    }

    if (sessionInfo.sessionStatus !== SessionStatus.COMPLETED) {
      return err(
        new AppError(
          ErrorCode.BadRequest,
          `Session scoring is not completed (current status: ${sessionInfo.sessionStatus})`,
        ),
      );
    }

    const result = await this.scoringRepo.findSessionResult(sessionId);
    if (result.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to retrieve scoring result',
        ),
      );
    }

    const scoringResult = result.value;
    if (!scoringResult) {
      return err(
        new AppError(
          ErrorCode.NotFound,
          `Scoring result for session '${sessionId}' not found`,
        ),
      );
    }

    const dto = mapToSessionResultDto(
      sessionId,
      scoringResult.score,
      scoringResult.summary,
    );

    return ok(dto);
  }
}
