export enum CommonSessionStatus {
  CREATED = 'CREATED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  SCORING = 'SCORING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

// Giống enum Prisma `CheatEventType`; domain không import generated/prisma.
export enum CommonCheatEventType {
  TAB_SWITCH = 'TAB_SWITCH',
  WINDOW_BLUR = 'WINDOW_BLUR',
  FACE_MISSING = 'FACE_MISSING',
  MULTIPLE_FACES = 'MULTIPLE_FACES',
}
