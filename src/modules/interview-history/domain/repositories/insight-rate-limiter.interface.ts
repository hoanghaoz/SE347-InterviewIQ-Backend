import type { Result } from 'neverthrow';

export abstract class IInsightRateLimiter {
  // Ghi nhận một lần tạo nhận xét của user. ok(false) khi đã vượt giới hạn
  // trong cửa sổ hiện tại; lần bị từ chối vẫn được đếm.
  abstract tryAcquire(userPublicId: string): Promise<Result<boolean, Error>>;
}
