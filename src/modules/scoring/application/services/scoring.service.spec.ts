import { CommonUserRole } from '../../../../shared/common/commonEnum';
import { ErrorCode } from '../../../../shared/common/errorCode';
import {
  IScoringQueue,
  ScoringJobInfo,
} from '../interfaces/scoring.queue.interface';
import { ScoringJobStatus } from '../../domain/enums/scoring-enum';
import { ScoringService } from './scoring.service';

describe('ScoringService', () => {
  const enqueueMock = jest.fn<
    ReturnType<IScoringQueue['enqueue']>,
    Parameters<IScoringQueue['enqueue']>
  >();
  const getJobMock = jest.fn<
    ReturnType<IScoringQueue['getJob']>,
    Parameters<IScoringQueue['getJob']>
  >();

  const scoringQueue: IScoringQueue = {
    enqueue: enqueueMock,
    getJob: getJobMock,
  };

  const service = new ScoringService(scoringQueue);

  const mockSessionId = '11111111-1111-4111-8111-111111111111';
  const mockUserId = '22222222-2222-4222-8222-222222222222';
  const mockOtherUserId = '33333333-3333-4333-8333-333333333333';
  const mockJobId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  beforeEach(() => {
    enqueueMock.mockReset();
    getJobMock.mockReset();
  });

  describe('enqueueAsync', () => {
    it('should enqueue job and return jobId with QUEUED status', async () => {
      enqueueMock.mockResolvedValue(mockJobId);

      const result = await service.enqueueAsync(mockSessionId, mockUserId);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({
          jobId: mockJobId,
          status: 'QUEUED',
        });
      }

      expect(enqueueMock).toHaveBeenCalledTimes(1);
      const callArgs = enqueueMock.mock.calls[0][0];
      expect(callArgs.sessionId).toBe(mockSessionId);
      expect(callArgs.userId).toBe(mockUserId);
      expect(callArgs.enqueuedAt).toBeDefined();
    });

    it('should return Conflict when singletonKey blocks duplicate session', async () => {
      enqueueMock.mockResolvedValue(null);

      const result = await service.enqueueAsync(mockSessionId, mockUserId);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ErrorCode.Conflict);
        expect(result.error.message).toBe(
          'A scoring job for this session is already queued',
        );
      }
    });
  });

  describe('getJobStatusAsync', () => {
    const mockCreatedDate = new Date('2026-09-29T10:00:00.000Z');
    const mockCompletedDate = new Date('2026-09-29T10:02:30.000Z');

    const createMockJobInfo = (
      overrides?: Partial<ScoringJobInfo>,
    ): ScoringJobInfo => ({
      id: mockJobId,
      data: {
        sessionId: mockSessionId,
        userId: mockUserId,
        enqueuedAt: mockCreatedDate.toISOString(),
      },
      status: ScoringJobStatus.COMPLETED,
      createdOn: mockCreatedDate,
      completedOn: mockCompletedDate,
      ...overrides,
    });

    it('should return job status when job exists and belongs to requesting user', async () => {
      getJobMock.mockResolvedValue(createMockJobInfo());

      const result = await service.getJobStatusAsync(
        mockJobId,
        mockUserId,
        CommonUserRole.USER,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({
          jobId: mockJobId,
          sessionId: mockSessionId,
          status: ScoringJobStatus.COMPLETED,
          createdAt: mockCreatedDate.toISOString(),
          completedAt: mockCompletedDate.toISOString(),
        });
      }
      expect(getJobMock).toHaveBeenCalledWith(mockJobId);
    });

    it('should return job status for ADMIN even if job belongs to another user', async () => {
      getJobMock.mockResolvedValue(createMockJobInfo());

      const result = await service.getJobStatusAsync(
        mockJobId,
        mockOtherUserId,
        CommonUserRole.ADMIN,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.jobId).toBe(mockJobId);
        expect(result.value.sessionId).toBe(mockSessionId);
      }
    });

    it('should return NotFound when job does not exist in queue', async () => {
      getJobMock.mockResolvedValue(null);

      const result = await service.getJobStatusAsync(
        mockJobId,
        mockUserId,
        CommonUserRole.USER,
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ErrorCode.NotFound);
        expect(result.error.message).toContain(mockJobId);
      }
    });

    it('should return Forbidden when job belongs to another user and requester is not ADMIN', async () => {
      getJobMock.mockResolvedValue(createMockJobInfo());

      const result = await service.getJobStatusAsync(
        mockJobId,
        mockOtherUserId,
        CommonUserRole.USER,
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ErrorCode.Forbidden);
        expect(result.error.message).toBe(
          'You are not authorized to view this scoring job',
        );
      }
    });

    it('should correctly handle in-progress job with null completedAt', async () => {
      getJobMock.mockResolvedValue(
        createMockJobInfo({
          status: ScoringJobStatus.PROCESSING,
          completedOn: null,
        }),
      );

      const result = await service.getJobStatusAsync(
        mockJobId,
        mockUserId,
        CommonUserRole.USER,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.status).toBe(ScoringJobStatus.PROCESSING);
        expect(result.value.completedAt).toBeNull();
      }
    });
  });
});
