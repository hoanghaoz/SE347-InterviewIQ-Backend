import { err, ok, type Result } from 'neverthrow';
import {
  CHEAT_LOG_CLOCK_SKEW_MS,
  CHEAT_LOG_LATE_WINDOW_MS,
} from '../constants/cheat-log.constants';
import { CommonSessionStatus } from '../enums/interview-enum';
import {
  CheatLogRejectedError,
  CheatLogRejectionReason,
} from '../errors/cheat-log.error';

export type CheatLogAcceptanceInput = {
  readonly status: CommonSessionStatus;
  readonly startedAt: Date | null;
  readonly submittedAt: Date | null;
  readonly occurredAt: Date;
  readonly now: Date;
};

// Các trạng thái sau khi đã nộp bài: vẫn nhận log đến trễ trong cửa sổ cho phép.
const SUBMITTED_STATUSES: ReadonlySet<CommonSessionStatus> = new Set([
  CommonSessionStatus.SUBMITTED,
  CommonSessionStatus.SCORING,
  CommonSessionStatus.COMPLETED,
  CommonSessionStatus.FAILED,
]);

/**
 * Quyết định có nhận một cheat log hay không. Chỉ ghi nhận, không bao giờ đổi
 * trạng thái buổi phỏng vấn.
 */
export function checkCheatLogAcceptance(
  input: CheatLogAcceptanceInput,
): Result<void, CheatLogRejectedError> {
  const { status, startedAt, submittedAt, occurredAt, now } = input;

  if (status === CommonSessionStatus.IN_PROGRESS) {
    if (startedAt === null) {
      return reject(CheatLogRejectionReason.NOT_STARTED);
    }
    return isWithin(occurredAt, startedAt, now)
      ? ok(undefined)
      : reject(CheatLogRejectionReason.OCCURRED_OUT_OF_RANGE);
  }

  if (SUBMITTED_STATUSES.has(status)) {
    if (
      startedAt === null ||
      submittedAt === null ||
      now.getTime() > submittedAt.getTime() + CHEAT_LOG_LATE_WINDOW_MS
    ) {
      return reject(CheatLogRejectionReason.WINDOW_CLOSED);
    }
    return isWithin(occurredAt, startedAt, submittedAt)
      ? ok(undefined)
      : reject(CheatLogRejectionReason.OCCURRED_OUT_OF_RANGE);
  }

  // CREATED, CANCELLED
  return reject(CheatLogRejectionReason.NOT_STARTED);
}

function isWithin(value: Date, from: Date, to: Date): boolean {
  const time = value.getTime();
  return (
    time >= from.getTime() - CHEAT_LOG_CLOCK_SKEW_MS &&
    time <= to.getTime() + CHEAT_LOG_CLOCK_SKEW_MS
  );
}

function reject(
  reason: CheatLogRejectionReason,
): Result<void, CheatLogRejectedError> {
  return err(new CheatLogRejectedError(reason));
}
