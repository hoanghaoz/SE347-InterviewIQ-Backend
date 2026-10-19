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
      // Dọn dẹp archive tự động, tránh đầy ổ đĩa
      archiveCompletedJobsEvery: '1 day',
      archiveFailedJobsEvery: '1 day',
      deleteArchivedJobsEvery: '7 days',
      // Giám sát sức khỏe connection
      max: poolSize,
    } as ConstructorOptions);
    // Không có listener 'error' thì EventEmitter sẽ throw và làm sập cả process
    const logger = new Logger('PgBoss');
    boss.on('error', (error: Error) => logger.error(error.message));

    await boss.start();
    return boss;
  },
  inject: [ConfigService],
};
