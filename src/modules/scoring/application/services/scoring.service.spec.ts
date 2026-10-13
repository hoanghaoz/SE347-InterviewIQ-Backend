import { ok, err } from 'neverthrow';
import { SessionStatus } from '../../../../../generated/prisma/enums';
import { CommonUserRole } from '../../../../shared/common/commonEnum';
import { ErrorCode } from '../../../../shared/common/errorCode';
import {
  IScoringQueue,
  ScoringJobInfo,
} from '../interfaces/scoring.queue.interface';
import { ScoringJobStatus } from '../../domain/enums/scoring-enum';
import {
  InterviewSummary,
  Score,
  ScoringResult,
} from '../../domain/entities/scoring-job.entity';
import { IScoringRepository } from '../../domain/repositories/scoring.repo.interface';
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

  const findSessionForScoringMock = jest.fn<
    ReturnType<IScoringRepository['findSessionForScoring']>,
    Parameters<IScoringRepository['findSessionForScoring']>
  >();
  const updateSessionStatusMock = jest.fn<
    ReturnType<IScoringRepository['updateSessionStatus']>,
    Parameters<IScoringRepository['updateSessionStatus']>
  >();
  const saveScoringResultMock = jest.fn<
    ReturnType<IScoringRepository['saveScoringResult']>,
    Parameters<IScoringRepository['saveScoringResult']>
  >();
  const findSessionResultMock = jest.fn<
    ReturnType<IScoringRepository['findSessionResult']>,
    Parameters<IScoringRepository['findSessionResult']>
  >();
  const getSessionOwnerUserIdMock = jest.fn<
    ReturnType<IScoringRepository['getSessionOwnerUserId']>,
    Parameters<IScoringRepository['getSessionOwnerUserId']>
  >();

  const scoringRepo: IScoringRepository = {
    findSessionForScoring: findSessionForScoringMock,
    updateSessionStatus: updateSessionStatusMock,
    saveScoringResult: saveScoringResultMock,
    findSessionResult: findSessionResultMock,
    getSessionOwnerUserId: getSessionOwnerUserIdMock,
  };

  const service = new ScoringService(scoringQueue, scoringRepo);

  const mockSessionId = '11111111-1111-4111-8111-111111111111';
  const mockUserId = '22222222-2222-4222-8222-222222222222';
  const mockOtherUserId = '33333333-3333-4333-8333-333333333333';
  const mockJobId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  beforeEach(() => {
    enqueueMock.mockReset();
    getJobMock.mockReset();
    findSessionForScoringMock.mockReset();
    updateSessionStatusMock.mockReset();
    saveScoringResultMock.mockReset();
    findSessionResultMock.mockReset();
    getSessionOwnerUserIdMock.mockReset();
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

      expect(enqueueMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: mockSessionId,
          userId: mockUserId,
        }),
      );
    });

    it('should return Conflict error when job is already queued (null jobId)', async () => {
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

    it('should return BadRequest error when sessionId is empty', async () => {
      const result = await service.enqueueAsync('   ', mockUserId);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ErrorCode.BadRequest);
        expect(result.error.message).toContain(
          'sessionId must be a non-empty string',
        );
      }
      expect(enqueueMock).not.toHaveBeenCalled();
    });

    it('should return BadRequest error when userId is empty', async () => {
      const result = await service.enqueueAsync(mockSessionId, '');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ErrorCode.BadRequest);
        expect(result.error.message).toContain(
          'userId must be a non-empty string',
        );
      }
      expect(enqueueMock).not.toHaveBeenCalled();
    });
  });

  describe('getJobStatusAsync', () => {
    const createMockJobInfo = (
      overrides?: Partial<ScoringJobInfo>,
    ): ScoringJobInfo => ({
      id: mockJobId,
      data: {
        sessionId: mockSessionId,
        userId: mockUserId,
        enqueuedAt: '2026-09-29T10:00:00.000Z',
      },
      status: ScoringJobStatus.COMPLETED,
      createdOn: new Date('2026-09-29T10:00:00.000Z'),
      completedOn: new Date('2026-09-29T10:02:30.000Z'),
      ...overrides,
    });

    it('should return job status when job exists and belongs to user', async () => {
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
          createdAt: '2026-09-29T10:00:00.000Z',
          completedAt: '2026-09-29T10:02:30.000Z',
        });
      }
    });

    it('should allow ADMIN to view job belonging to another user', async () => {
      getJobMock.mockResolvedValue(createMockJobInfo());

      const result = await service.getJobStatusAsync(
        mockJobId,
        mockOtherUserId,
        CommonUserRole.ADMIN,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.jobId).toBe(mockJobId);
      }
    });

    it('should return NotFound when job does not exist', async () => {
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

  describe('getSessionResultAsync', () => {
    const fixedDate = new Date('2026-09-23T10:02:30.000Z');

    const mockScore = Score.getScore({
      id: 1,
      publicId: 'score-uuid-1',
      sessionId: 1,
      contentScore: 8.0,
      relevanceScore: 7.5,
      confidenceScore: 6.5,
      overallScore: 7.4,
      scoredAt: fixedDate,
      createdAt: fixedDate,
    });

    const mockSummary = InterviewSummary.getSummary({
      id: 2,
      publicId: 'summary-uuid-2',
      sessionId: 1,
      overallFeedback: 'Ứng viên có kiến thức tốt.',
      strengths: [
        {
          category: 'TECHNICAL_KNOWLEDGE',
          title: 'Backend',
          description: 'Good DI',
        },
      ],
      improvements: [
        {
          category: 'COMMUNICATION',
          title: 'Directness',
          description: 'Concise answers',
          suggestion: 'STAR method',
        },
      ],
      scoringModel: 'gemini-2.5-flash',
      promptVersion: 'v1.0',
      generatedAt: fixedDate,
      createdAt: fixedDate,
    });

    const mockScoringResult = new ScoringResult(
      mockScore,
      mockSummary,
      mockSessionId,
    );

    it('should return session result when session is COMPLETED and belongs to user', async () => {
      getSessionOwnerUserIdMock.mockResolvedValue(
        ok({
          userId: 10,
          ownerPublicId: mockUserId,
          sessionStatus: SessionStatus.COMPLETED,
        }),
      );
      findSessionResultMock.mockResolvedValue(ok(mockScoringResult));

      const result = await service.getSessionResultAsync(
        mockSessionId,
        mockUserId,
        CommonUserRole.USER,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.sessionId).toBe(mockSessionId);
        expect(result.value.scores.overallScore).toBe(7.4);
        expect(result.value.scores.publicId).toBe('score-uuid-1');
        expect(result.value.summary.publicId).toBe('summary-uuid-2');
        expect(result.value.summary.overallFeedback).toBe(
          'Ứng viên có kiến thức tốt.',
        );
      }
    });

    it('should allow ADMIN to view session result of another user', async () => {
      getSessionOwnerUserIdMock.mockResolvedValue(
        ok({
          userId: 10,
          ownerPublicId: mockUserId,
          sessionStatus: SessionStatus.COMPLETED,
        }),
      );
      findSessionResultMock.mockResolvedValue(ok(mockScoringResult));

      const result = await service.getSessionResultAsync(
        mockSessionId,
        mockOtherUserId,
        CommonUserRole.ADMIN,
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.sessionId).toBe(mockSessionId);
      }
    });

    it('should return NotFound when session does not exist', async () => {
      getSessionOwnerUserIdMock.mockResolvedValue(ok(null));

      const result = await service.getSessionResultAsync(
        mockSessionId,
        mockUserId,
        CommonUserRole.USER,
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ErrorCode.NotFound);
        expect(result.error.message).toContain(mockSessionId);
      }
    });

    it('should return Forbidden when session belongs to another user and requester is not ADMIN', async () => {
      getSessionOwnerUserIdMock.mockResolvedValue(
        ok({
          userId: 10,
          ownerPublicId: mockUserId,
          sessionStatus: SessionStatus.COMPLETED,
        }),
      );

      const result = await service.getSessionResultAsync(
        mockSessionId,
        mockOtherUserId,
        CommonUserRole.USER,
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ErrorCode.Forbidden);
        expect(result.error.message).toBe(
          'You are not authorized to view the result of this session',
        );
      }
    });

    it('should return BadRequest when session is not in COMPLETED status', async () => {
      getSessionOwnerUserIdMock.mockResolvedValue(
        ok({
          userId: 10,
          ownerPublicId: mockUserId,
          sessionStatus: SessionStatus.SCORING,
        }),
      );

      const result = await service.getSessionResultAsync(
        mockSessionId,
        mockUserId,
        CommonUserRole.USER,
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ErrorCode.BadRequest);
        expect(result.error.message).toContain('SCORING');
      }
    });

    it('should return NotFound when session is COMPLETED but scoring result is missing', async () => {
      getSessionOwnerUserIdMock.mockResolvedValue(
        ok({
          userId: 10,
          ownerPublicId: mockUserId,
          sessionStatus: SessionStatus.COMPLETED,
        }),
      );
      findSessionResultMock.mockResolvedValue(ok(null));

      const result = await service.getSessionResultAsync(
        mockSessionId,
        mockUserId,
        CommonUserRole.USER,
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ErrorCode.NotFound);
      }
    });

    it('should return InternalServerError when database error occurs during session lookup', async () => {
      getSessionOwnerUserIdMock.mockResolvedValue(err(new Error('DB failure')));

      const result = await service.getSessionResultAsync(
        mockSessionId,
        mockUserId,
        CommonUserRole.USER,
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ErrorCode.InternalServerError);
      }
    });
  });
});
