export type LlmProviderName = 'gemini' | 'groq';

export interface LlmUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface LlmTextRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface LlmJsonRequest extends LlmTextRequest {
  /** JSON Schema describing the shape the model must return. */
  schema: Record<string, unknown>;
}

export interface LlmResultMeta {
  /** The vendor that actually answered (visible when fallback ran). */
  provider: LlmProviderName;
  model: string;
  latencyMs: number;
  usage?: LlmUsage;
}

export interface LlmTextResult extends LlmResultMeta {
  text: string;
}

export interface LlmJsonResult<T> extends LlmResultMeta {
  data: T;
}

/** What a vendor SDK call yields before metadata is attached. */
export interface LlmRawCompletion {
  text: string;
  usage?: LlmUsage;
}
