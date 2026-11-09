import {
  CHEAT_LOG_CLOCK_SKEW_MS,
  CHEAT_LOG_LATE_WINDOW_MS,
} from '../constants/cheat-log.constants';
import { CommonSessionStatus } from '../enums/interview-enum';
import { CheatLogRejectionReason } from '../errors/cheat-log.error';
import {
  checkCheatLogAcceptance,
  type CheatLogAcceptanceInput,
} from './cheat-log.policy';

const startedAt = new Date('2026-11-09T10:00:00.000Z');
const submittedAt = new Date('2026-11-09T10:30:00.000Z');
const at = (base: Date, offsetMs: number) =>
  new Date(base.getTime() + offsetMs);

function input(
  overrides: Partial<CheatLogAcceptanceInput> = {},
): CheatLogAcceptanceInput {
  return {
    status: CommonSessionStatus.IN_PROGRESS,
    startedAt,
    submittedAt: null,
    occurredAt: at(startedAt, 60_000),
    now: at(startedAt, 61_000),
    ...overrides,
  };
}

function reasonOf(i: CheatLogAcceptanceInput) {
  const result = checkCheatLogAcceptance(i);
  return result.isErr() ? result.error.reason : null;
}

describe('checkCheatLogAcceptance', () => {
  describe('IN_PROGRESS', () => {
    it('accepts an event inside the session', () => {
      expect(checkCheatLogAcceptance(input()).isOk()).toBe(true);
    });

    it('accepts an event slightly before startedAt (clock skew)', () => {
      const occurredAt = at(startedAt, -CHEAT_LOG_CLOCK_SKEW_MS);
      expect(checkCheatLogAcceptance(input({ occurredAt })).isOk()).toBe(true);
    });

    it('rejects an event before startedAt beyond the skew', () => {
      const occurredAt = at(startedAt, -CHEAT_LOG_CLOCK_SKEW_MS - 1);
      expect(reasonOf(input({ occurredAt }))).toBe(
        CheatLogRejectionReason.OCCURRED_OUT_OF_RANGE,
      );
    });

    it('accepts an event slightly in the future (clock skew)', () => {
      const now = at(startedAt, 120_000);
      const occurredAt = at(now, CHEAT_LOG_CLOCK_SKEW_MS);
      expect(checkCheatLogAcceptance(input({ now, occurredAt })).isOk()).toBe(
        true,
      );
    });

    it('rejects an event in the future beyond the skew', () => {
      const now = at(startedAt, 120_000);
      const occurredAt = at(now, CHEAT_LOG_CLOCK_SKEW_MS + 1);
      expect(reasonOf(input({ now, occurredAt }))).toBe(
        CheatLogRejectionReason.OCCURRED_OUT_OF_RANGE,
      );
    });

    it('rejects when startedAt is missing', () => {
      expect(reasonOf(input({ startedAt: null }))).toBe(
        CheatLogRejectionReason.NOT_STARTED,
      );
    });
  });

  describe.each([CommonSessionStatus.CREATED, CommonSessionStatus.CANCELLED])(
    '%s',
    (status) => {
      it('rejects as not started', () => {
        expect(reasonOf(input({ status }))).toBe(
          CheatLogRejectionReason.NOT_STARTED,
        );
      });
    },
  );

  describe.each([
    CommonSessionStatus.SUBMITTED,
    CommonSessionStatus.SCORING,
    CommonSessionStatus.COMPLETED,
    CommonSessionStatus.FAILED,
  ])('%s (late events)', (status) => {
    const submitted = (overrides: Partial<CheatLogAcceptanceInput> = {}) =>
      input({
        status,
        submittedAt,
        occurredAt: at(submittedAt, -5_000),
        now: at(submittedAt, 10_000),
        ...overrides,
      });

    it('accepts a late event that happened before submission', () => {
      expect(checkCheatLogAcceptance(submitted()).isOk()).toBe(true);
    });

    it('accepts a request exactly at the late window boundary', () => {
      const now = at(submittedAt, CHEAT_LOG_LATE_WINDOW_MS);
      expect(checkCheatLogAcceptance(submitted({ now })).isOk()).toBe(true);
    });

    it('rejects a request after the late window', () => {
      const now = at(submittedAt, CHEAT_LOG_LATE_WINDOW_MS + 1);
      expect(reasonOf(submitted({ now }))).toBe(
        CheatLogRejectionReason.WINDOW_CLOSED,
      );
    });

    it('rejects an event that happened after submission beyond the skew', () => {
      const occurredAt = at(submittedAt, CHEAT_LOG_CLOCK_SKEW_MS + 1);
      expect(reasonOf(submitted({ occurredAt }))).toBe(
        CheatLogRejectionReason.OCCURRED_OUT_OF_RANGE,
      );
    });

    it('rejects an event that happened before startedAt beyond the skew', () => {
      const occurredAt = at(startedAt, -CHEAT_LOG_CLOCK_SKEW_MS - 1);
      expect(reasonOf(submitted({ occurredAt }))).toBe(
        CheatLogRejectionReason.OCCURRED_OUT_OF_RANGE,
      );
    });

    it('closes the window when submittedAt is missing', () => {
      expect(reasonOf(submitted({ submittedAt: null }))).toBe(
        CheatLogRejectionReason.WINDOW_CLOSED,
      );
    });
  });
});
