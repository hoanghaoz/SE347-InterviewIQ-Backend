import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { CommonUserRole } from '../../../../shared/common/commonEnum';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import { ScoringJobData } from '../dtos/scoring.request.dto';
import { ScoringJobStatusResponseDto } from '../dtos/scoring.response.dto';
import { IScoringQueue } from '../interfaces/scoring.queue.interface';
import {
  EnqueueResult,
  IScoringService,
} from '../interfaces/scoring.service.interface';

@Injectable()
export class ScoringService implements IScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(private readonly scoringQueue: IScoringQueue) {}

  async enqueueAsync(
    sessionId: string,
    userId: string,
  ): Promise<Result<EnqueueResult, AppError>> {
    const jobData: ScoringJobData = {
      sessionId,
      userId,
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
}
