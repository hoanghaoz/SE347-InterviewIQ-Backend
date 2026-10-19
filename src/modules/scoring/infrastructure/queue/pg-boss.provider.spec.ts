import { ConfigService } from '@nestjs/config';
import { PgBoss } from 'pg-boss';
import { PgBossProvider } from './pg-boss.provider';

const mockOn = jest.fn();
const mockStart = jest.fn().mockResolvedValue(undefined);

jest.mock('pg-boss', () => {
  return {
    PgBoss: jest.fn().mockImplementation((options: unknown) => ({
      options,
      on: mockOn,
      start: mockStart,
    })),
  };
});

describe('PgBossProvider', () => {
  let mockConfigService: { get: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfigService = {
      get: jest.fn(),
    };
  });

  it('should instantiate and start PgBoss with production options and default pool size', async () => {
    mockConfigService.get.mockImplementation(
      (key: string, defaultValue?: unknown) => {
        if (key === 'DATABASE_URL') {
          return 'postgresql://test:test@localhost:5432/test';
        }
        if (key === 'DATABASE_POOL_SIZE') {
          return defaultValue;
        }
        return defaultValue;
      },
    );

    const factory = (
      PgBossProvider as unknown as {
        useFactory: (config: ConfigService) => Promise<PgBoss>;
      }
    ).useFactory;
    await factory(mockConfigService as unknown as ConfigService);

    expect(PgBoss).toHaveBeenCalledWith({
      connectionString: 'postgresql://test:test@localhost:5432/test',
      schema: 'pgboss',
      archiveCompletedJobsEvery: '1 day',
      archiveFailedJobsEvery: '1 day',
      deleteArchivedJobsEvery: '7 days',
      max: 10,
    });
    expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
    expect(mockStart).toHaveBeenCalled();
  });

  it('should respect custom DATABASE_POOL_SIZE when configured', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'DATABASE_URL') {
        return 'postgresql://test:test@localhost:5432/test';
      }
      if (key === 'DATABASE_POOL_SIZE') {
        return '25';
      }
      return undefined;
    });

    const factory = (
      PgBossProvider as unknown as {
        useFactory: (config: ConfigService) => Promise<PgBoss>;
      }
    ).useFactory;
    await factory(mockConfigService as unknown as ConfigService);

    expect(PgBoss).toHaveBeenCalledWith(
      expect.objectContaining({
        max: 25,
      }),
    );
  });

  it('should throw error when DATABASE_URL is not defined', async () => {
    mockConfigService.get.mockReturnValue(undefined);

    const factory = (
      PgBossProvider as unknown as {
        useFactory: (config: ConfigService) => Promise<PgBoss>;
      }
    ).useFactory;
    await expect(
      factory(mockConfigService as unknown as ConfigService),
    ).rejects.toThrow('DATABASE_URL is not defined in configuration');
  });
});
