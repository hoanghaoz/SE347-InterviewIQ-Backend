import type { Result } from 'neverthrow';
import type { AppError } from '../common/errorCode';
import type {
  LlmJsonRequest,
  LlmJsonResult,
  LlmTextRequest,
  LlmTextResult,
} from './llm.types';

/**
 * Provider-agnostic LLM contract. Business modules inject this abstract class
 * and never import a vendor provider directly.
 */
export abstract class ILlmProvider {
  abstract generateText(
    request: LlmTextRequest,
  ): Promise<Result<LlmTextResult, AppError>>;

  abstract generateJson<T>(
    request: LlmJsonRequest,
  ): Promise<Result<LlmJsonResult<T>, AppError>>;
}
