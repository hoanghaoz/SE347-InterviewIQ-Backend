export const ALLOWED_EMOTION_LABELS = [
  'neutral',
  'happy',
  'surprised',
  'sad',
  'angry',
  'fearful',
  'disgusted',
] as const;

export type EmotionLabel = (typeof ALLOWED_EMOTION_LABELS)[number];

const ALLOWED_EMOTION_SET = new Set<string>(ALLOWED_EMOTION_LABELS);

export interface EmotionSummary {
  readonly dominant: string;
  readonly distribution: Readonly<Record<string, number>>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalizes raw emotion_summary JSONB from client analysis according to §4.6 Database Spec.
 * Strips unknown top-level keys (such as wordsPerMinute per §10 Decision #5) and invalid distribution entries.
 */
export function normalizeEmotionSummary(raw: unknown): EmotionSummary | null {
  if (!isPlainObject(raw)) {
    return null;
  }

  if (typeof raw.dominant !== 'string') {
    return null;
  }

  const dominant = raw.dominant.replaceAll('\u0000', '').trim().toLowerCase();
  if (!dominant || !ALLOWED_EMOTION_SET.has(dominant)) {
    return null;
  }

  if (!isPlainObject(raw.distribution)) {
    return null;
  }

  const distribution: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw.distribution)) {
    const normalizedKey = key.replaceAll('\u0000', '').trim().toLowerCase();
    if (!ALLOWED_EMOTION_SET.has(normalizedKey)) {
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }
    const clamped = Math.min(1, Math.max(0, value));
    distribution[normalizedKey] = Number(clamped.toFixed(4));
  }

  if (Object.keys(distribution).length === 0) {
    return null;
  }

  return {
    dominant,
    distribution,
  };
}

