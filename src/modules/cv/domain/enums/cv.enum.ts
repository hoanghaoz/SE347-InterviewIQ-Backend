export enum ParseStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

// Why a parse ended in FAILED. Only reported by the parse request itself, never stored.
export enum ParseFailureReason {
  FILE_UNAVAILABLE = 'FILE_UNAVAILABLE',
  FILE_UNREADABLE = 'FILE_UNREADABLE',
  NO_TEXT = 'NO_TEXT',
  AI_FAILED = 'AI_FAILED',
}
