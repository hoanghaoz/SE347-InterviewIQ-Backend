import type { Result } from 'neverthrow';
import type {
  CommonCheatEventType,
  CommonSessionStatus,
} from '../enums/interview-enum';

// Chỉ những gì policy cần để quyết định nhận hay từ chối một cheat log.
export type CheatLogSessionData = {
  readonly sessionId: number;
  readonly status: CommonSessionStatus;
  readonly startedAt: Date | null;
  readonly submittedAt: Date | null;
};

export type CreateCheatLogData = {
  readonly eventType: CommonCheatEventType;
  readonly description: string | null;
  readonly occurredAt: Date;
  // Do client sinh để gửi lại an toàn: cùng id trong một buổi chỉ ghi một lần.
  readonly clientEventId: string | null;
};

export type SavedCheatLog = {
  readonly publicId: string;
  readonly eventType: CommonCheatEventType;
  readonly description: string | null;
  readonly occurredAt: Date;
  readonly createdAt: Date;
};

// isDuplicate = true khi clientEventId đã được ghi trước đó: `log` là bản ghi cũ.
export type CreatedCheatLog = {
  readonly log: SavedCheatLog;
  readonly isDuplicate: boolean;
};

// Luôn có đủ mọi loại sự kiện, loại chưa xảy ra có giá trị 0.
export type CheatEventCounts = Record<CommonCheatEventType, number>;

export abstract class ICheatLogRepository {
  // ok(null) khi không có buổi phỏng vấn nào vừa mang publicId này vừa thuộc
  // user này: "không tồn tại" và "của người khác" dùng chung một kết quả.
  abstract getSessionForCheatLog(
    userPublicId: string,
    sessionPublicId: string,
  ): Promise<Result<CheatLogSessionData | null, Error>>;

  // ok(null) khi buổi này chưa ghi sự kiện nào với clientEventId đó.
  abstract findCheatLogByClientEventId(
    sessionId: number,
    clientEventId: string,
  ): Promise<Result<SavedCheatLog | null, Error>>;

  // Chống ghi trùng khi hai request cùng clientEventId chạy song song: bên
  // thua trả lại bản ghi của bên thắng với isDuplicate = true.
  abstract createCheatLog(
    sessionId: number,
    data: CreateCheatLogData,
  ): Promise<Result<CreatedCheatLog, Error>>;

  // Sắp theo occurredAt tăng dần, rồi theo id.
  abstract getCheatLogs(
    sessionId: number,
  ): Promise<Result<SavedCheatLog[], Error>>;

  abstract countCheatLogsByType(
    sessionId: number,
  ): Promise<Result<CheatEventCounts, Error>>;
}
