import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import { IScoringQueue } from './application/interfaces/scoring.queue.interface';
import { IScoringService } from './application/interfaces/scoring.service.interface';
import { ScoringService } from './application/services/scoring.service';
import {
  PG_BOSS_TOKEN,
  PgBossProvider,
} from './infrastructure/queue/pg-boss.provider';
import { ScoringQueueService } from './infrastructure/queue/scoring-queue.service';

@Module({
  providers: [
    PgBossProvider,
    {
      provide: IScoringQueue,
      useClass: ScoringQueueService,
    },
    {
      provide: IScoringService,
      useClass: ScoringService,
    },
  ],
  exports: [IScoringService],
})
export class ScoringModule implements OnModuleDestroy {
  constructor(@Inject(PG_BOSS_TOKEN) private readonly boss: PgBoss) {}

  async onModuleDestroy(): Promise<void> {
    await this.boss.stop({ graceful: true, timeout: 30_000 });
  }
}
