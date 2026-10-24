import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConstructorOptions, PgBoss } from 'pg-boss';

export const PG_BOSS_TOKEN = 'PG_BOSS_INSTANCE';

export const PgBossProvider: Provider = {
  provide: PG_BOSS_TOKEN,
  useFactory: async (configService: ConfigService): Promise<PgBoss> => {
    const connectionString = configService.get<string>('DATABASE_URL');
    if (!connectionString) {
      throw new Error('DATABASE_URL is not defined in configuration');
    }

    const rawPoolSize = configService.get<number | string>(
      'DATABASE_POOL_SIZE',
      10,
    );
    const poolSize = Number(rawPoolSize) || 10;

    const boss = new PgBoss({
      connectionString,
      schema: 'pgboss',
      archiveCompletedJobsEvery: '1 day',
      archiveFailedJobsEvery: '1 day',
      deleteArchivedJobsEvery: '7 days',
      max: poolSize,
    } as ConstructorOptions);

    const logger = new Logger('PgBoss');
    boss.on('error', (error: Error) => logger.error(error.message));

    await boss.start();
    return boss;
  },
  inject: [ConfigService],
};
