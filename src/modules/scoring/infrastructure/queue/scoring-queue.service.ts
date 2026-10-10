import { Inject, Injectable } from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import { ScoringJobData } from '../../application/dtos/scoring.request.dto';
import {
  IScoringQueue,
  ScoringJobInfo,
} from '../../application/interfaces/scoring.queue.interface';
import { ScoringJobStatus } from '../../domain/enums/scoring-enum';
import { PG_BOSS_TOKEN } from './pg-boss.provider';

export const SCORING_QUEUE_NAME = 'scoring-jobs';

@Injectable()
export class ScoringQueueService implements IScoringQueue {
  constructor(@Inject(PG_BOSS_TOKEN) private readonly boss: PgBoss) {}

  async enqueue(data: ScoringJobData): Promise<string | null> {
    return this.boss.send(SCORING_QUEUE_NAME, data, {
      singletonKey: data.sessionId,
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
    });
  }

  async getJob(jobId: string): Promise<ScoringJobInfo | null> {
    const job = await this.boss.getJobById<ScoringJobData>(
      SCORING_QUEUE_NAME,
      jobId,
    );
    if (!job) {
      return null;
    }

    return {
      id: job.id,
      data: job.data,
      status: this.mapPgBossStateToScoringStatus(job.state),
      createdOn: job.createdOn,
      completedOn: job.completedOn,
    };
  }

  private mapPgBossStateToScoringStatus(state: string): ScoringJobStatus {
    switch (state) {
      case 'created':
        return ScoringJobStatus.QUEUED;
      case 'active':
      case 'retry':
        return ScoringJobStatus.PROCESSING;
      case 'completed':
        return ScoringJobStatus.COMPLETED;
      case 'failed':
      case 'cancelled':
      default:
        return ScoringJobStatus.FAILED;
    }
  }
}
