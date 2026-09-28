import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { ScoringJobData } from '../dtos/scoring.request.dto';
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
}
