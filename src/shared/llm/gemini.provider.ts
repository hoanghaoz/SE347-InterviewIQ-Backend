import { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseLlmVendorProvider } from './base-llm-vendor.provider';
import { DEFAULT_GEMINI_MODEL, readLlmTimeoutMs } from './llm.constants';
import { ILlmProvider } from './llm.provider';
import type {
  LlmProviderName,
  LlmRawCompletion,
  LlmTextRequest,
} from './llm.types';

@Injectable()
export class GeminiProvider
  extends BaseLlmVendorProvider
  implements ILlmProvider
{
  protected readonly providerName: LlmProviderName = 'gemini';
  protected readonly model: string;
  protected readonly logger = new Logger(GeminiProvider.name);
  private readonly client: GoogleGenAI | null;

  constructor(config: ConfigService) {
    super();
    const apiKey = config.get<string>('GEMINI_API_KEY');
    this.model = config.get<string>('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
    this.client = apiKey
      ? new GoogleGenAI({
          apiKey,
          httpOptions: { timeout: readLlmTimeoutMs(config) },
        })
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
      throw new Error('Gemini client is not configured');
    }

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: request.prompt,
      config: {
        systemInstruction: request.systemPrompt,
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
        ...(jsonSchema
          ? {
              responseMimeType: 'application/json',
              responseJsonSchema: jsonSchema,
            }
          : {}),
      },
    });

    return {
      text: response.text ?? '',
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount,
        outputTokens: response.usageMetadata?.candidatesTokenCount,
      },
    };
  }
}
