export enum CheatLogRejectionReason {
  // Buổi phỏng vấn chưa bắt đầu hoặc đã bị hủy
  NOT_STARTED = 'NOT_STARTED',
  // Đã nộp bài quá lâu, không nhận log đến trễ nữa
  WINDOW_CLOSED = 'WINDOW_CLOSED',
  // occurredAt nằm ngoài khoảng thời gian làm bài
  OCCURRED_OUT_OF_RANGE = 'OCCURRED_OUT_OF_RANGE',
}

const REJECTION_MESSAGES: Record<CheatLogRejectionReason, string> = {
  [CheatLogRejectionReason.NOT_STARTED]: 'Interview session is not in progress',
  [CheatLogRejectionReason.WINDOW_CLOSED]: 'Cheat log window has closed',
  [CheatLogRejectionReason.OCCURRED_OUT_OF_RANGE]:
    'occurredAt is outside the interview session time range',
};

export class CheatLogRejectedError extends Error {
  constructor(readonly reason: CheatLogRejectionReason) {
    super(REJECTION_MESSAGES[reason]);
  }
}
