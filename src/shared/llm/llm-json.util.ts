import { err, ok, Result } from 'neverthrow';

const CODE_FENCE_PATTERN = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;

/** Parses model output as JSON, tolerating a surrounding markdown code fence. */
export function parseJsonOutput(text: string): Result<unknown, Error> {
  const trimmed = text.trim();
  const fenced = CODE_FENCE_PATTERN.exec(trimmed);
  const candidate = fenced ? fenced[1] : trimmed;

  try {
    const parsed: unknown = JSON.parse(candidate);
    return ok(parsed);
  } catch {
    return err(new Error('Model output is not valid JSON'));
  }
}
