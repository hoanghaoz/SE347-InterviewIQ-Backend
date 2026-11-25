import type {
  ImprovementItem,
  StrengthItem,
} from '../../scoring/domain/entities/scoring-job.entity';

// Các cột Json (strengths, improvements, weaknesses, recommendations) không có
// kiểu khi Prisma trả về. Chỉ giữ phần tử đúng shape và copy tường minh từng
// field, để một bản ghi hỏng không làm vỡ response và key lạ trong Json không
// lọt ra ngoài.
type TitledRecord = Record<string, unknown> & {
  title: string;
  description: string;
};

type FeedbackRecord = TitledRecord & { category: string };

function isTitledRecord(value: unknown): value is TitledRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.title === 'string' && typeof record.description === 'string'
  );
}

function isFeedbackRecord(value: unknown): value is FeedbackRecord {
  return (
    isTitledRecord(value) &&
    typeof (value as Record<string, unknown>).category === 'string'
  );
}

// { category, title, description }: strengths của summary, strengths và
// weaknesses của insight.
export function toFeedbackItems(value: unknown): StrengthItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isFeedbackRecord).map((item) => ({
    category: item.category,
    title: item.title,
    description: item.description,
  }));
}

export function toImprovements(value: unknown): ImprovementItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isFeedbackRecord).map((item) => ({
    category: item.category,
    title: item.title,
    description: item.description,
    ...(typeof item.suggestion === 'string'
      ? { suggestion: item.suggestion }
      : {}),
  }));
}

// { title, description }: recommendations của insight.
export function toRecommendations(
  value: unknown,
): { title: string; description: string }[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isTitledRecord).map((item) => ({
    title: item.title,
    description: item.description,
  }));
}
