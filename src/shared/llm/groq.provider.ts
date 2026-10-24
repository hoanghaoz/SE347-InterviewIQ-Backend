import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { BaseLlmVendorProvider } from './base-llm-vendor.provider';
import { DEFAULT_GROQ_MODEL, readLlmTimeoutMs } from './llm.constants';
import { ILlmProvider } from './llm.provider';
import type {
  LlmProviderName,
  LlmRawCompletion,
  LlmTextRequest,
} from './llm.types';

/**
 * Groq's JSON mode only guarantees syntactically valid JSON and requires the
 * word "JSON" in the prompt, so the schema is described in the system prompt.
 */
function buildJsonSystemPrompt(
  systemPrompt: string | undefined,
  schema: Record<string, unknown>,
): string {
  const instruction = `Respond with a single JSON object that conforms to this JSON Schema, and nothing else:\n${JSON.stringify(schema)}`;
  return systemPrompt ? `${systemPrompt}\n\n${instruction}` : instruction;
}

@Injectable()
export class GroqProvider
  extends BaseLlmVendorProvider
  implements ILlmProvider
{
  protected readonly providerName: LlmProviderName = 'groq';
  protected readonly model: string;
  protected readonly logger = new Logger(GroqProvider.name);
  private readonly client: Groq | null;

  constructor(config: ConfigService) {
    super();
    const apiKey = config.get<string>('GROQ_API_KEY');
    this.model = config.get<string>('GROQ_MODEL') || DEFAULT_GROQ_MODEL;
    // maxRetries is 0 so a failing vendor hands over to the fallback quickly.
    this.client = apiKey
      ? new Groq({ apiKey, timeout: readLlmTimeoutMs(config), maxRetries: 0 })
      : null;
  }

  protected isConfigured(): boolean {
    return this.client !== null;
  }

  protected async completeAsync(
    request: LlmTextRequest,
    jsonSchema?: Record<string, unknown>,
  ): Promise<LlmRawCompletion> {
    if (this.client === null) {
      throw new Error('Groq client is not configured');
    }

    const systemPrompt = jsonSchema
      ? buildJsonSystemPrompt(request.systemPrompt, jsonSchema)
      : request.systemPrompt;

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        ...(systemPrompt
          ? [{ role: 'system' as const, content: systemPrompt }]
          : []),
        { role: 'user' as const, content: request.prompt },
      ],
      temperature: request.temperature,
      max_completion_tokens: request.maxOutputTokens,
      ...(jsonSchema
        ? { response_format: { type: 'json_object' as const } }
        : {}),
    });

    return {
      text: response.choices[0]?.message?.content ?? '',
      usage: {
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
      },
    };
  }
}
