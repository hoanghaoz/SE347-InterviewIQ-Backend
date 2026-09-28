import { Inject, Injectable } from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import { ScoringJobData } from '../../application/dtos/scoring.request.dto';
import { IScoringQueue } from '../../application/interfaces/scoring.queue.interface';
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
}
