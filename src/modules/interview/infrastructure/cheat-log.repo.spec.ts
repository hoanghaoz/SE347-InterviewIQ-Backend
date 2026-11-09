import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { CommonCheatEventType } from '../domain/enums/interview-enum';
import { CommonSessionStatus } from '../domain/enums/interview-enum';
import { CheatLogRepository } from './cheat-log.repo';

jest.mock('../../../shared/infrastructure/database/prisma.service', () => ({
  PrismaService: class {},
}));

describe('CheatLogRepository', () => {
  const findFirst = jest.fn();
  const create = jest.fn();
  const findMany = jest.fn();
  const groupBy = jest.fn();
  const repository = new CheatLogRepository({
    interviewSession: { findFirst },
    cheatLog: { create, findMany, groupBy },
  } as unknown as PrismaService);
  const row = {
    publicId: 'log-id',
    eventType: 'TAB_SWITCH',
    description: 'left the tab',
    occurredAt: new Date('2026-11-09T10:05:00Z'),
    createdAt: new Date('2026-11-09T10:05:01Z'),
  };

  beforeEach(() => jest.resetAllMocks());

  describe('getSessionForCheatLog', () => {
    it('looks the session up by public id and owner together', async () => {
      findFirst.mockResolvedValue({
        id: 7,
        status: 'IN_PROGRESS',
        startedAt: new Date('2026-11-09T10:00:00Z'),
        submittedAt: null,
      });

      const result = await repository.getSessionForCheatLog('user', 'session');

      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { publicId: 'session', user: { publicId: 'user' } },
        }),
      );
      expect(result._unsafeUnwrap()).toEqual({
        sessionId: 7,
        status: CommonSessionStatus.IN_PROGRESS,
        startedAt: new Date('2026-11-09T10:00:00Z'),
        submittedAt: null,
      });
    });

    it('returns ok(null) when there is no matching session', async () => {
      findFirst.mockResolvedValue(null);

      const result = await repository.getSessionForCheatLog('user', 'session');

      expect(result._unsafeUnwrap()).toBeNull();
    });

    it('hides database errors behind a generic message', async () => {
      findFirst.mockRejectedValue(new Error('connection refused at 10.0.0.1'));

      const result = await repository.getSessionForCheatLog('user', 'session');

      expect(result._unsafeUnwrapErr().message).toBe(
        'Failed to get the interview session.',
      );
    });
  });

  describe('createCheatLog', () => {
    it('stores the event and maps it back to the domain', async () => {
      create.mockResolvedValue(row);

      const result = await repository.createCheatLog(7, {
        eventType: CommonCheatEventType.TAB_SWITCH,
        description: 'left the tab',
        occurredAt: row.occurredAt,
      });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            sessionId: 7,
            eventType: 'TAB_SWITCH',
            description: 'left the tab',
            occurredAt: row.occurredAt,
          },
        }),
      );
      expect(result._unsafeUnwrap()).toEqual({
        ...row,
        eventType: CommonCheatEventType.TAB_SWITCH,
      });
    });

    it('returns an error when the insert fails', async () => {
      create.mockRejectedValue(new Error('insert failed'));

      const result = await repository.createCheatLog(7, {
        eventType: CommonCheatEventType.FACE_MISSING,
        description: null,
        occurredAt: new Date(),
      });

      expect(result._unsafeUnwrapErr().message).toBe(
        'Failed to create the cheat log.',
      );
    });
  });

  describe('getCheatLogs', () => {
    it('orders logs by occurredAt then id', async () => {
      findMany.mockResolvedValue([row]);

      const result = await repository.getCheatLogs(7);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId: 7 },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        }),
      );
      expect(result._unsafeUnwrap()).toHaveLength(1);
    });
  });

  describe('countCheatLogsByType', () => {
    it('always returns every event type, using 0 for missing ones', async () => {
      groupBy.mockResolvedValue([
        { eventType: 'TAB_SWITCH', _count: { _all: 2 } },
        { eventType: 'WINDOW_BLUR', _count: { _all: 1 } },
      ]);

      const result = await repository.countCheatLogsByType(7);

      expect(result._unsafeUnwrap()).toEqual({
        TAB_SWITCH: 2,
        WINDOW_BLUR: 1,
        FACE_MISSING: 0,
        MULTIPLE_FACES: 0,
      });
    });

    it('returns all zeros when the session has no logs', async () => {
      groupBy.mockResolvedValue([]);

      const result = await repository.countCheatLogsByType(7);

      expect(Object.values(result._unsafeUnwrap())).toEqual([0, 0, 0, 0]);
    });
  });
});
