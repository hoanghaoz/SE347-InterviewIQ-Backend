import { err, ok } from 'neverthrow';
import { ErrorCode } from '../../../../shared/common/errorCode';
import {
  CommonCheatEventType,
  CommonSessionStatus,
} from '../../domain/enums/interview-enum';
import { ICheatLogRepository } from '../../domain/repositories/cheat-log.repo.interface';
import { CheatLogService } from './cheat-log.service';

describe('CheatLogService', () => {
  const getSessionForCheatLog = jest.fn<
    ReturnType<ICheatLogRepository['getSessionForCheatLog']>,
    Parameters<ICheatLogRepository['getSessionForCheatLog']>
  >();
  const createCheatLog = jest.fn<
    ReturnType<ICheatLogRepository['createCheatLog']>,
    Parameters<ICheatLogRepository['createCheatLog']>
  >();
  const getCheatLogs = jest.fn<
    ReturnType<ICheatLogRepository['getCheatLogs']>,
    Parameters<ICheatLogRepository['getCheatLogs']>
  >();
  const countCheatLogsByType = jest.fn<
    ReturnType<ICheatLogRepository['countCheatLogsByType']>,
    Parameters<ICheatLogRepository['countCheatLogsByType']>
  >();
  const service = new CheatLogService({
    getSessionForCheatLog,
    createCheatLog,
    getCheatLogs,
    countCheatLogsByType,
  });

  const now = new Date('2026-11-09T10:10:00.000Z');
  const startedAt = new Date('2026-11-09T10:00:00.000Z');
  const inProgress = {
    sessionId: 7,
    status: CommonSessionStatus.IN_PROGRESS,
    startedAt,
    submittedAt: null,
  };
  const request = {
    eventType: CommonCheatEventType.TAB_SWITCH,
    occurredAt: '2026-11-09T10:05:00.000Z',
    description: 'Switched tab',
  };
  const saved = {
    publicId: 'log-id',
    eventType: CommonCheatEventType.TAB_SWITCH,
    description: 'Switched tab',
    occurredAt: new Date(request.occurredAt),
    createdAt: new Date('2026-11-09T10:05:01.000Z'),
  };
  const counts = {
    [CommonCheatEventType.TAB_SWITCH]: 2,
    [CommonCheatEventType.WINDOW_BLUR]: 1,
    [CommonCheatEventType.FACE_MISSING]: 0,
    [CommonCheatEventType.MULTIPLE_FACES]: 0,
  };
  const record = () =>
    service.recordCheatEventAsync('user', 'session', request);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(now);
    getSessionForCheatLog.mockResolvedValue(ok(inProgress));
    createCheatLog.mockResolvedValue(ok(saved));
    countCheatLogsByType.mockResolvedValue(ok(counts));
    getCheatLogs.mockResolvedValue(ok([saved]));
  });

  afterEach(() => jest.useRealTimers());

  describe('recordCheatEventAsync', () => {
    it('records the event and returns the log with every count', async () => {
      const result = await record();

      expect(createCheatLog).toHaveBeenCalledWith(7, {
        eventType: CommonCheatEventType.TAB_SWITCH,
        description: 'Switched tab',
        occurredAt: new Date(request.occurredAt),
      });
      expect(result._unsafeUnwrap()).toEqual({
        log: {
          id: 'log-id',
          eventType: 'TAB_SWITCH',
          description: 'Switched tab',
          occurredAt: '2026-11-09T10:05:00.000Z',
          createdAt: '2026-11-09T10:05:01.000Z',
        },
        summary: { totalCount: 3, countsByType: counts },
      });
    });

    it('stores a null description when none is sent', async () => {
      await service.recordCheatEventAsync('user', 'session', {
        eventType: request.eventType,
        occurredAt: request.occurredAt,
      });

      expect(createCheatLog).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ description: null }),
      );
    });

    it('returns 404 when the session is missing or not the user’s', async () => {
      getSessionForCheatLog.mockResolvedValue(ok(null));

      const result = await record();

      expect(result._unsafeUnwrapErr().code).toBe(ErrorCode.NotFound);
      expect(createCheatLog).not.toHaveBeenCalled();
    });

    it.each([CommonSessionStatus.CREATED, CommonSessionStatus.CANCELLED])(
      'returns 409 for a %s session',
      async (status) => {
        getSessionForCheatLog.mockResolvedValue(
          ok({ ...inProgress, status, startedAt: null }),
        );

        const result = await record();

        expect(result._unsafeUnwrapErr().code).toBe(ErrorCode.Conflict);
        expect(createCheatLog).not.toHaveBeenCalled();
      },
    );

    it('returns 400 when occurredAt is outside the session time range', async () => {
      const result = await service.recordCheatEventAsync('user', 'session', {
        ...request,
        occurredAt: '2026-11-09T09:00:00.000Z',
      });

      expect(result._unsafeUnwrapErr().code).toBe(ErrorCode.BadRequest);
      expect(createCheatLog).not.toHaveBeenCalled();
    });

    it('accepts a late event within the window after submission', async () => {
      const submittedAt = new Date('2026-11-09T10:08:00.000Z');
      getSessionForCheatLog.mockResolvedValue(
        ok({
          ...inProgress,
          status: CommonSessionStatus.SCORING,
          submittedAt,
        }),
      );

      const result = await record();

      expect(result.isOk()).toBe(true);
    });

    it('returns 409 once the late window has closed', async () => {
      getSessionForCheatLog.mockResolvedValue(
        ok({
          ...inProgress,
          status: CommonSessionStatus.COMPLETED,
          submittedAt: new Date('2026-11-09T10:01:00.000Z'),
        }),
      );

      const result = await record();

      const error = result._unsafeUnwrapErr();
      expect(error.code).toBe(ErrorCode.Conflict);
      expect(error.message).toBe('Cheat log window has closed');
    });

    it.each([
      [
        'looking up the session',
        () => getSessionForCheatLog.mockResolvedValue(err(new Error('leaked'))),
      ],
      [
        'creating the log',
        () => createCheatLog.mockResolvedValue(err(new Error('leaked'))),
      ],
      [
        'counting the logs',
        () => countCheatLogsByType.mockResolvedValue(err(new Error('leaked'))),
      ],
    ])('returns a generic 500 when %s fails', async (_label, fail) => {
      fail();

      const result = await record();

      const error = result._unsafeUnwrapErr();
      expect(error.code).toBe(ErrorCode.InternalServerError);
      expect(error.message).not.toContain('leaked');
    });
  });

  describe('getCheatLogsAsync', () => {
    it('returns the logs and the summary', async () => {
      const result = await service.getCheatLogsAsync('user', 'session');

      const body = result._unsafeUnwrap();
      expect(body.logs).toHaveLength(1);
      expect(body.summary).toEqual({ totalCount: 3, countsByType: counts });
    });

    it('works for a submitted session', async () => {
      getSessionForCheatLog.mockResolvedValue(
        ok({ ...inProgress, status: CommonSessionStatus.COMPLETED }),
      );

      const result = await service.getCheatLogsAsync('user', 'session');

      expect(result.isOk()).toBe(true);
    });

    it('returns 404 when the session is missing or not the user’s', async () => {
      getSessionForCheatLog.mockResolvedValue(ok(null));

      const result = await service.getCheatLogsAsync('user', 'session');

      expect(result._unsafeUnwrapErr().code).toBe(ErrorCode.NotFound);
    });

    it('returns a generic 500 when reading the logs fails', async () => {
      getCheatLogs.mockResolvedValue(err(new Error('boom')));

      const result = await service.getCheatLogsAsync('user', 'session');

      expect(result._unsafeUnwrapErr().code).toBe(
        ErrorCode.InternalServerError,
      );
    });
  });
});
