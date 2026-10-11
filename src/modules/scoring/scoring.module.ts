import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PgBoss } from 'pg-boss';
import { JwtAuthGuard } from '../../shared/common/jwt.guard';
import { RolesGuard } from '../../shared/decorators/roles.guard';
import { ScoringController } from './api/scoring.controller';
import { IScoringQueue } from './application/interfaces/scoring.queue.interface';
import { IScoringService } from './application/interfaces/scoring.service.interface';
import { ScoringService } from './application/services/scoring.service';
import {
  PG_BOSS_TOKEN,
  PgBossProvider,
} from './infrastructure/queue/pg-boss.provider';
import { ScoringQueueService } from './infrastructure/queue/scoring-queue.service';
import { ScoringWorkerService } from './infrastructure/queue/scoring-worker.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [ScoringController],
  providers: [
    JwtAuthGuard,
    RolesGuard,
    PgBossProvider,
    {
      provide: IScoringQueue,
      useClass: ScoringQueueService,
    },
    {
      provide: IScoringService,
      useClass: ScoringService,
    },
    ScoringWorkerService,
  ],
  exports: [IScoringService],
})
export class ScoringModule implements OnModuleDestroy {
  constructor(@Inject(PG_BOSS_TOKEN) private readonly boss: PgBoss) {}

  async onModuleDestroy(): Promise<void> {
    await this.boss.stop({ graceful: true, timeout: 30_000 });
  }
}
