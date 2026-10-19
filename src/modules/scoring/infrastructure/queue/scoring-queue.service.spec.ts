jest.mock('pg-boss', () => ({
  __esModule: true,
  PgBoss: jest.fn(),
  default: jest.fn(),
}));

import { ConfigService } from '@nestjs/config';
import type { PgBoss } from 'pg-boss';
import { ScoringJobData } from '../../application/dtos/scoring.request.dto';
import { ScoringJobStatus } from '../../domain/enums/scoring-enum';
import {
  SCORING_QUEUE_NAME,
  ScoringQueueService,
} from './scoring-queue.service';

describe('ScoringQueueService', () => {
  let mockBoss: { send: jest.Mock; getJobById: jest.Mock };
  let mockConfigService: { get: jest.Mock };

  const mockJobData: ScoringJobData = {
    sessionId: 'session-uuid-1',
    userId: 'user-uuid-1',
    enqueuedAt: '2026-10-19T10:00:00.000Z',
  };

  beforeEach(() => {
    mockBoss = {
      send: jest.fn(),
      getJobById: jest.fn(),
    };
    mockConfigService = {
      get: jest.fn(),
    };
  });

  describe('enqueue', () => {
    it('should enqueue with default parameters when ConfigService is omitted', async () => {
      mockBoss.send.mockResolvedValue('job-123');
      const service = new ScoringQueueService(mockBoss as unknown as PgBoss);

      const jobId = await service.enqueue(mockJobData);

      expect(jobId).toBe('job-123');
      expect(mockBoss.send).toHaveBeenCalledWith(
        SCORING_QUEUE_NAME,
        mockJobData,
        {
          singletonKey: mockJobData.sessionId,
          retryLimit: 3,
          retryDelay: 30,
          retryBackoff: true,
          expireInSeconds: 300,
        },
      );
    });

    it('should read custom retry limit, retry delay, and expire parameters from ConfigService', async () => {
      mockConfigService.get.mockImplementation(
        (key: string, defaultValue?: unknown) => {
          if (key === 'SCORING_JOB_RETRY_LIMIT') return '5';
          if (key === 'SCORING_JOB_RETRY_DELAY') return '60';
          if (key === 'SCORING_JOB_EXPIRE_SECONDS') return '600';
          return defaultValue;
        },
      );
      mockBoss.send.mockResolvedValue('job-custom');

      const service = new ScoringQueueService(
        mockBoss as unknown as PgBoss,
        mockConfigService as unknown as ConfigService,
      );

      const jobId = await service.enqueue(mockJobData);

      expect(jobId).toBe('job-custom');
      expect(mockBoss.send).toHaveBeenCalledWith(
        SCORING_QUEUE_NAME,
        mockJobData,
        {
          singletonKey: mockJobData.sessionId,
          retryLimit: 5,
          retryDelay: 60,
          retryBackoff: true,
          expireInSeconds: 600,
        },
      );
    });
  });

  describe('getJob', () => {
    it('should return mapped job info with correct status', async () => {
      const fixedCreatedOn = new Date('2026-10-19T10:00:00Z');
      const fixedCompletedOn = new Date('2026-10-19T10:02:00Z');

      mockBoss.getJobById.mockResolvedValue({
        id: 'job-123',
        data: mockJobData,
        state: 'completed',
        createdOn: fixedCreatedOn,
        completedOn: fixedCompletedOn,
      });

      const service = new ScoringQueueService(mockBoss as unknown as PgBoss);
      const result = await service.getJob('job-123');

      expect(result).toEqual({
        id: 'job-123',
        data: mockJobData,
        status: ScoringJobStatus.COMPLETED,
        createdOn: fixedCreatedOn,
        completedOn: fixedCompletedOn,
      });
      expect(mockBoss.getJobById).toHaveBeenCalledWith(
        SCORING_QUEUE_NAME,
        'job-123',
      );
    });

    it('should return null when job is not found', async () => {
      mockBoss.getJobById.mockResolvedValue(null);

      const service = new ScoringQueueService(mockBoss as unknown as PgBoss);
      const result = await service.getJob('unknown-job');

      expect(result).toBeNull();
    });

    it('should map active and retry states to PROCESSING', async () => {
      const service = new ScoringQueueService(mockBoss as unknown as PgBoss);

      mockBoss.getJobById.mockResolvedValueOnce({
        id: 'job-1',
        data: mockJobData,
        state: 'active',
        createdOn: new Date(),
        completedOn: null,
      });
      const activeResult = await service.getJob('job-1');
      expect(activeResult?.status).toBe(ScoringJobStatus.PROCESSING);

      mockBoss.getJobById.mockResolvedValueOnce({
        id: 'job-2',
        data: mockJobData,
        state: 'retry',
        createdOn: new Date(),
        completedOn: null,
      });
      const retryResult = await service.getJob('job-2');
      expect(retryResult?.status).toBe(ScoringJobStatus.PROCESSING);
    });

    it('should map created state to QUEUED and failed/cancelled to FAILED', async () => {
      const service = new ScoringQueueService(mockBoss as unknown as PgBoss);

      mockBoss.getJobById.mockResolvedValueOnce({
        id: 'job-created',
        data: mockJobData,
        state: 'created',
        createdOn: new Date(),
        completedOn: null,
      });
      const createdResult = await service.getJob('job-created');
      expect(createdResult?.status).toBe(ScoringJobStatus.QUEUED);

      mockBoss.getJobById.mockResolvedValueOnce({
        id: 'job-failed',
        data: mockJobData,
        state: 'failed',
        createdOn: new Date(),
        completedOn: null,
      });
      const failedResult = await service.getJob('job-failed');
      expect(failedResult?.status).toBe(ScoringJobStatus.FAILED);
    });
  });
});
