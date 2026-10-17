import { err, ok } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import {
  ICvRepository,
  type AuthorizeUserCvResult,
} from '../../../cv/domain/repositories/cv.repo.interface';
import { Interview } from '../../domain/entities/interview.entity';
import { IInterviewRepository } from '../../domain/repositories/interview.repo.interface';
import { InterviewService } from './interview.service';
import { IScoringService } from '../../../scoring/application/interfaces/scoring.service.interface';
import { CommonSessionStatus } from '../../domain/enums/interview-enum';
import { PageResult } from '../../../../shared/common/pagination';
import {
  InterviewStartConflictError,
  InterviewSubmissionConflictError,
} from '../../domain/errors/interview-domain.error';

describe('InterviewService', () => {
  const authorizeUserCv = jest.fn<
    ReturnType<ICvRepository['authorizeUserCv']>,
    Parameters<ICvRepository['authorizeUserCv']>
  >();
  const createInterviewSession = jest.fn<
    ReturnType<IInterviewRepository['createInterviewSession']>,
    Parameters<IInterviewRepository['createInterviewSession']>
  >();
  const authorizeInterviewSession = jest.fn<
    ReturnType<IInterviewRepository['authorizeInterviewSession']>,
    Parameters<IInterviewRepository['authorizeInterviewSession']>
  >();
  const submitInterviewSession = jest.fn<
    ReturnType<IInterviewRepository['submitInterviewSession']>,
    Parameters<IInterviewRepository['submitInterviewSession']>
  >();
  const getInterviewSessions = jest.fn();
  const startInterviewSession = jest.fn();
  const enqueueAsync = jest.fn<
    ReturnType<IScoringService['enqueueAsync']>,
    Parameters<IScoringService['enqueueAsync']>
  >();
  const getJobStatusAsync = jest.fn();
  const service = new InterviewService(
    {
      createInterviewSession,
      authorizeInterviewSession,
      submitInterviewSession,
      getInterviewSessions,
      startInterviewSession,
    },
    { authorizeUserCv },
    { enqueueAsync, getJobStatusAsync },
  );
  const cvPublicId = '00000000-0000-4000-8000-000000000002';
  const authorizedCv: AuthorizeUserCvResult = {
    userId: 1,
    cvId: 2,
    snapshot: {
      sourceCvPublicId: cvPublicId,
      fileName: 'cv.pdf',
      fileUrl: 'https://example.com/cv.pdf',
      fileSize: 1024,
      rawText: null,
      parsedData: null,
      parserVersion: null,
    },
  };

  beforeEach(() => {
    authorizeUserCv.mockReset();
    createInterviewSession.mockReset();
    authorizeInterviewSession.mockReset();
    submitInterviewSession.mockReset();
    enqueueAsync.mockReset();
    getInterviewSessions.mockReset();
    startInterviewSession.mockReset();
  });

  it('creates an interview with the authorized internal IDs', async () => {
    authorizeUserCv.mockResolvedValue(ok(authorizedCv));
    createInterviewSession.mockResolvedValue(ok('session-public-id'));

    const result = await service.createInterviewSessionAsync('user-public-id', {
      cvPublicId,
      title: 'Backend interview',
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) throw result.error;
    expect(result.value).toBe('session-public-id');
    expect(createInterviewSession).toHaveBeenCalledWith(expect.any(Interview));
    const interview = createInterviewSession.mock.calls[0][0];
    expect(interview.userId).toBe(1);
    expect(interview.cvId).toBe(2);
    expect(interview.jobDescription).toBeNull();
  });

  it('maps domain validation errors to a specific bad request', async () => {
    authorizeUserCv.mockResolvedValue(ok(authorizedCv));

    const result = await service.createInterviewSessionAsync('user-public-id', {
      cvPublicId,
      title: 'x'.repeat(256),
      jobDescription: null,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error('Expected validation error');
    expect(result.error.code).toBe(ErrorCode.BadRequest);
    expect(result.error.message).toBe(
      'Interview title must not exceed 255 characters.',
    );
    expect(createInterviewSession).not.toHaveBeenCalled();
  });

  it('returns a safe error when CV authorization fails', async () => {
    authorizeUserCv.mockResolvedValue(err(new Error('database secret')));

    const result = await service.createInterviewSessionAsync('user-public-id', {
      cvPublicId,
      title: 'Backend interview',
      jobDescription: null,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error('Expected authorization error');
    expect(result.error.code).toBe(ErrorCode.InternalServerError);
    expect(result.error.message).toBe('Failed to authorize CV');
    expect(createInterviewSession).not.toHaveBeenCalled();
  });

  describe('getInterviewSessionAsync', () => {
    it('returns owner pagination, public IDs, nullable fields and ISO dates', async () => {
      getInterviewSessions.mockResolvedValue(
        ok(
          new PageResult(
            [
              {
                sessionPublicId: 'session',
                cvPublicId: null,
                title: 'Backend',
                status: CommonSessionStatus.CREATED,
                totalQuestion: 5,
                jobDescription: null,
                createdAt: new Date('2026-10-13T08:00:00.000Z'),
              },
            ],
            25,
            2,
            2,
            20,
          ),
        ),
      );
      const result = await service.getInterviewSessionAsync('user', {
        pageNumber: 2,
        pageSize: 20,
      });
      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({
        items: [
          {
            sessionPublicId: 'session',
            cvPublicId: null,
            title: 'Backend',
            status: 'CREATED',
            totalQuestion: 5,
            jobDescription: null,
            createdAt: '2026-10-13T08:00:00.000Z',
          },
        ],
        totalPages: 2,
        currentPage: 2,
        pageNumber: 2,
        pageSize: 20,
        hasPrevious: true,
        hasNext: false,
      });
      expect(getInterviewSessions).toHaveBeenCalledWith('user', {
        pageNumber: 2,
        pageSize: 20,
      });
    });

    it('returns an empty out-of-range page', async () => {
      getInterviewSessions.mockResolvedValue(
        ok(new PageResult([], 0, 3, 3, 20)),
      );
      const result = await service.getInterviewSessionAsync('user', {
        pageNumber: 3,
        pageSize: 20,
      });
      if (result.isErr()) throw result.error;
      expect(result.value.items).toEqual([]);
      expect(result.value.currentPage).toBe(3);
    });

    it('sanitizes repository errors', async () => {
      getInterviewSessions.mockResolvedValue(err(new Error('database secret')));
      const result = await service.getInterviewSessionAsync('user', {
        pageNumber: 1,
        pageSize: 20,
      });
      if (result.isOk()) throw new Error('Expected list error');
      expect(result.error.code).toBe(ErrorCode.InternalServerError);
      expect(result.error.message).not.toContain('database secret');
    });
  });

  describe('startInterviewSessionAsync', () => {
    const startedAt = new Date('2026-10-13T08:00:00.000Z');
    const start = () => service.startInterviewSessionAsync('user', 'session');
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(startedAt);
      authorizeInterviewSession.mockResolvedValue(
        ok({
          sessionId: 3,
          userId: 1,
          cvId: null,
          status: CommonSessionStatus.CREATED,
        }),
      );
      startInterviewSession.mockResolvedValue(ok(undefined));
    });
    afterEach(() => jest.useRealTimers());

    it('starts an owned session without a CV and returns the saved timestamp', async () => {
      const result = await start();
      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({
        sessionPublicId: 'session',
        status: 'IN_PROGRESS',
        startedAt: '2026-10-13T08:00:00.000Z',
      });
      expect(authorizeInterviewSession).toHaveBeenCalledWith('session', 'user');
      expect(startInterviewSession).toHaveBeenCalledWith(1, 3, startedAt);
      expect(authorizeUserCv).not.toHaveBeenCalled();
      expect(enqueueAsync).not.toHaveBeenCalled();
    });

    it('returns 404 for a missing session or another owner', async () => {
      authorizeInterviewSession.mockResolvedValue(ok(null));
      const result = await start();
      if (result.isOk()) throw new Error('Expected unavailable session');
      expect(result.error.code).toBe(ErrorCode.NotFound);
      expect(startInterviewSession).not.toHaveBeenCalled();
    });

    it('sanitizes authorization failures without updating', async () => {
      authorizeInterviewSession.mockResolvedValue(
        err(new Error('database secret')),
      );
      const result = await start();
      if (result.isOk()) throw new Error('Expected authorization error');
      expect(result.error.code).toBe(ErrorCode.InternalServerError);
      expect(result.error.message).not.toContain('database secret');
      expect(startInterviewSession).not.toHaveBeenCalled();
    });

    it.each([
      CommonSessionStatus.IN_PROGRESS,
      CommonSessionStatus.SUBMITTED,
      CommonSessionStatus.SCORING,
      CommonSessionStatus.COMPLETED,
      CommonSessionStatus.FAILED,
      CommonSessionStatus.CANCELLED,
    ])('rejects %s without updating', async (status) => {
      authorizeInterviewSession.mockResolvedValue(
        ok({ sessionId: 3, userId: 1, cvId: 2, status }),
      );
      const result = await start();
      if (result.isOk()) throw new Error('Expected start conflict');
      expect(result.error.code).toBe(ErrorCode.Conflict);
      expect(startInterviewSession).not.toHaveBeenCalled();
    });

    it('returns conflict when an authorized CREATED session loses the update race', async () => {
      startInterviewSession.mockResolvedValue(
        err(new InterviewStartConflictError()),
      );
      const result = await start();
      if (result.isOk()) throw new Error('Expected start conflict');
      expect(result.error.code).toBe(ErrorCode.Conflict);
      expect(startInterviewSession).toHaveBeenCalledTimes(1);
    });

    it('sanitizes update failures', async () => {
      startInterviewSession.mockResolvedValue(
        err(new Error('database secret')),
      );
      const result = await start();
      if (result.isOk()) throw new Error('Expected update error');
      expect(result.error.code).toBe(ErrorCode.InternalServerError);
      expect(result.error.message).not.toContain('database secret');
    });
  });

  describe('submitInterviewSessionAsync', () => {
    const userPublicId = '00000000-0000-4000-8000-000000000001';
    const sessionPublicId = '00000000-0000-4000-8000-000000000003';
    const request = { cvPublicId, totalQuestions: 7, durationSeconds: 120 };
    const submittedAt = new Date('2026-10-12T10:00:00.000Z');
    const submit = () =>
      service.submitInterviewSessionAsync(
        userPublicId,
        sessionPublicId,
        request,
      );

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(submittedAt);
      authorizeUserCv.mockResolvedValue(ok(authorizedCv));
      authorizeInterviewSession.mockResolvedValue(
        ok({
          sessionId: 3,
          userId: 1,
          cvId: 2,
          status: CommonSessionStatus.CREATED,
        }),
      );
      submitInterviewSession.mockResolvedValue(ok(undefined));
      enqueueAsync.mockResolvedValue(ok({ jobId: 'job-id', status: 'QUEUED' }));
    });

    afterEach(() => jest.useRealTimers());

    it.each(['cv', 'session'])(
      'sanitizes %s authorization failures',
      async (source) => {
        if (source === 'cv') {
          authorizeUserCv.mockResolvedValue(err(new Error('database secret')));
        } else {
          authorizeInterviewSession.mockResolvedValue(
            err(new Error('database secret')),
          );
        }
        const result = await submit();
        expect(result.isErr()).toBe(true);
        if (result.isOk()) throw new Error('Expected authorization error');
        expect(result.error.code).toBe(ErrorCode.InternalServerError);
        expect(result.error.message).not.toContain('database secret');
        expect(submitInterviewSession).not.toHaveBeenCalled();
        expect(enqueueAsync).not.toHaveBeenCalled();
      },
    );

    it('returns not found for an unavailable CV', async () => {
      authorizeUserCv.mockResolvedValue(ok(null));
      const result = await submit();
      expect(result.isErr()).toBe(true);
      if (result.isOk()) throw new Error('Expected unavailable CV');
      expect(result.error.code).toBe(ErrorCode.NotFound);
      expect(submitInterviewSession).not.toHaveBeenCalled();
      expect(enqueueAsync).not.toHaveBeenCalled();
    });

    it('returns not found for a missing, unauthorized, or mismatched session', async () => {
      authorizeInterviewSession.mockResolvedValue(ok(null));
      const result = await submit();
      expect(result.isErr()).toBe(true);
      if (result.isOk()) throw new Error('Expected unavailable session');
      expect(result.error.code).toBe(ErrorCode.NotFound);
      expect(submitInterviewSession).not.toHaveBeenCalled();
      expect(enqueueAsync).not.toHaveBeenCalled();
    });

    it('does not enqueue when saving fails', async () => {
      submitInterviewSession.mockResolvedValue(
        err(new Error('database secret')),
      );
      const result = await submit();
      expect(result.isErr()).toBe(true);
      if (result.isOk()) throw new Error('Expected persistence error');
      expect(result.error.code).toBe(ErrorCode.InternalServerError);
      expect(result.error.message).not.toContain('database secret');
      expect(enqueueAsync).not.toHaveBeenCalled();
    });

    it('maps an ineligible state to conflict without enqueueing', async () => {
      submitInterviewSession.mockResolvedValue(
        err(new InterviewSubmissionConflictError()),
      );
      const result = await submit();
      expect(result.isErr()).toBe(true);
      if (result.isOk()) throw new Error('Expected submission conflict');
      expect(result.error.code).toBe(ErrorCode.Conflict);
      expect(enqueueAsync).not.toHaveBeenCalled();
    });

    it('authorizes public IDs, saves metrics, CV snapshot and time, then enqueues with public IDs', async () => {
      const result = await submit();
      expect(result.isOk()).toBe(true);
      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({
        sessionPublicId,
        jobId: 'job-id',
        status: 'QUEUED',
      });
      expect(authorizeUserCv).toHaveBeenCalledWith(userPublicId, cvPublicId);
      expect(authorizeInterviewSession).toHaveBeenCalledWith(
        sessionPublicId,
        userPublicId,
        cvPublicId,
      );
      expect(submitInterviewSession).toHaveBeenCalledWith(sessionPublicId, {
        totalQuestions: 7,
        durationSeconds: 120,
        submittedAt,
        cvSnapshot: authorizedCv.snapshot,
      });
      expect(enqueueAsync).toHaveBeenCalledWith(sessionPublicId, userPublicId);
    });

    it('returns the job ID supplied by scoring', async () => {
      enqueueAsync.mockResolvedValue(
        ok({
          jobId: '00000000-0000-4000-8000-000000000004',
          status: 'QUEUED',
        }),
      );
      const result = await submit();
      expect(result.isOk()).toBe(true);
      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({
        sessionPublicId,
        jobId: '00000000-0000-4000-8000-000000000004',
        status: 'QUEUED',
      });
    });

    it('waits for persistence to finish before enqueueing', async () => {
      let finishSave!: (
        value: Awaited<
          ReturnType<IInterviewRepository['submitInterviewSession']>
        >,
      ) => void;
      submitInterviewSession.mockReturnValue(
        new Promise((resolve) => {
          finishSave = resolve;
        }),
      );
      const pending = submit();
      await Promise.resolve();
      await Promise.resolve();
      expect(submitInterviewSession).toHaveBeenCalledTimes(1);
      expect(enqueueAsync).not.toHaveBeenCalled();
      finishSave(ok(undefined));
      expect((await pending).isOk()).toBe(true);
      expect(enqueueAsync).toHaveBeenCalledTimes(1);
    });

    it.each([ErrorCode.Conflict, ErrorCode.InternalServerError])(
      'propagates scoring %s results',
      async (code) => {
        const scoringError = new AppError(code, 'Scoring unavailable');
        enqueueAsync.mockResolvedValue(err(scoringError));
        const result = await submit();
        expect(result.isErr()).toBe(true);
        if (result.isOk()) throw new Error('Expected scoring error');
        expect(result.error).toBe(scoringError);
        expect(submitInterviewSession).toHaveBeenCalledTimes(1);
      },
    );

    it('sanitizes unexpected queue exceptions and permits another submission attempt', async () => {
      enqueueAsync.mockRejectedValueOnce(new Error('queue credentials'));
      const result = await submit();
      expect(result.isErr()).toBe(true);
      if (result.isOk()) throw new Error('Expected queue error');
      expect(result.error.code).toBe(ErrorCode.InternalServerError);
      expect(result.error.message).not.toContain('queue credentials');
      jest.setSystemTime(new Date('2026-10-12T10:01:00.000Z'));
      expect((await submit()).isOk()).toBe(true);
      expect(submitInterviewSession).toHaveBeenCalledTimes(2);
      expect(submitInterviewSession.mock.calls[1][1].submittedAt).toEqual(
        new Date('2026-10-12T10:01:00.000Z'),
      );
    });
  });
});
