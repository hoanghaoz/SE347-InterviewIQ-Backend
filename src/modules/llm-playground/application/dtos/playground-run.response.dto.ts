import type {
  LlmProviderName,
  LlmUsage,
} from '../../../../shared/llm/llm.types';

export class PlaygroundRunResponseDto {
  /** Text, or pretty-printed JSON in JSON mode. */
  output!: string;
  /** The vendor that actually answered (shows when fallback ran). */
  provider!: LlmProviderName;
  model!: string;
  latencyMs!: number;
  usage?: LlmUsage;
}
