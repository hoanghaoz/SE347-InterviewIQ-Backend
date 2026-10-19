import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PgBoss } from 'pg-boss';
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
  private readonly retryLimit: number;
  private readonly retryDelay: number;
  private readonly expireInSeconds: number;

  constructor(
    @Inject(PG_BOSS_TOKEN) private readonly boss: PgBoss,
    @Optional() private readonly configService?: ConfigService,
  ) {
    this.retryLimit =
      Number(
        this.configService?.get<number | string>('SCORING_JOB_RETRY_LIMIT', 3),
      ) || 3;
    this.retryDelay =
      Number(
        this.configService?.get<number | string>('SCORING_JOB_RETRY_DELAY', 30),
      ) || 30;
    this.expireInSeconds =
      Number(
        this.configService?.get<number | string>(
          'SCORING_JOB_EXPIRE_SECONDS',
          300,
        ),
      ) || 300;
  }

  async enqueue(data: ScoringJobData): Promise<string | null> {
    return this.boss.send(SCORING_QUEUE_NAME, data, {
      singletonKey: data.sessionId,
      retryLimit: this.retryLimit,
      retryDelay: this.retryDelay,
      retryBackoff: true,
      expireInSeconds: this.expireInSeconds,
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
