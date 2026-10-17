import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBoss } from 'pg-boss';

export const PG_BOSS_TOKEN = 'PG_BOSS_INSTANCE';

export const PgBossProvider: Provider = {
  provide: PG_BOSS_TOKEN,
  useFactory: async (configService: ConfigService): Promise<PgBoss> => {
    const connectionString = configService.get<string>('DATABASE_URL');
    if (!connectionString) {
      throw new Error('DATABASE_URL is not defined in configuration');
    }

    const boss = new PgBoss({
      connectionString,
      schema: 'pgboss',
    });
    // Không có listener 'error' thì EventEmitter sẽ throw và làm sập cả process
    const logger = new Logger('PgBoss');
    boss.on('error', (error: Error) => logger.error(error.message));

    await boss.start();
    return boss;
  },
  inject: [ConfigService],
};
