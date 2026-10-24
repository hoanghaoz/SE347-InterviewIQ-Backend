# LLM Provider Abstraction and Prompt Playground Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider-agnostic `ILlmProvider` layer in `src/shared/llm` (Gemini + Groq with automatic fallback, selected through NestJS DI) and an internal HTML page for trying prompts.

**Architecture:** `ILlmProvider` is an abstract class used as the DI token. `GeminiProvider` and `GroqProvider` extend a shared `BaseLlmVendorProvider` (timing, error mapping, JSON retry) and only implement the vendor SDK call. A `FallbackLlmProvider` wraps primary + secondary and is what the `ILlmProvider` token resolves to. A separate `llm-playground` module serves the HTML page and a run endpoint, gated by `ENABLE_LLM_PLAYGROUND`.

**Tech Stack:** NestJS 11, TypeScript (CommonJS output, `nodenext`), `neverthrow` (`Result`), `class-validator`, Jest 30, new deps `@google/genai` and `groq-sdk`.

**Spec:** `docs/superpowers/specs/2026-10-11-llm-provider-design.md` (read it first; this plan implements it).

## Global Constraints

- Contract is an abstract class named `ILlmProvider` in `src/shared/llm`, used as the DI token.
- Operations are `generateText` and `generateJson`. No streaming.
- Integration uses the official SDKs `@google/genai` and `groq-sdk`. No other new dependencies.
- Env vars and defaults: `LLM_PRIMARY_PROVIDER` (`gemini`), `GEMINI_API_KEY`, `GROQ_API_KEY`, `GEMINI_MODEL` (`gemini-2.5-flash`), `GROQ_MODEL` (`llama-3.3-70b-versatile`), `LLM_TIMEOUT_MS` (`30000`), `ENABLE_LLM_PLAYGROUND` (`false`).
- A missing API key never fails app startup; log a warning, and the provider returns an error only when called.
- Fallback: any primary error except `BadRequest` triggers the secondary. Both failing returns `AppError(InternalServerError, 'AI service is temporarily unavailable')`; real causes are logged, never returned.
- `generateJson` guarantees syntactically valid JSON (one retry on invalid output), not schema conformance.
- Playground routes respond `404` unless `ENABLE_LLM_PLAYGROUND=true`; no login.
- Tests never call a real AI service.
- Repo rules (`AGENTS.md`): failures use `Result<T, AppError>`; Nest exceptions only in the API layer; controllers use `toHttpException`; successful responses use `ApiSuccessResponse`; two-space Prettier style; never expose raw vendor errors.
- Git: stay on branch `feat/question-generation`; never push; never commit `CLAUDE.md`; commit subjects use `<type>(<scope>): <description>` (at least 10 characters), each commit ends with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; stage files by explicit path (never `git add -A`).
- Before finishing: `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e`.

## Review Focus

Edge cases implied by the spec that its own test list does not name; each is pinned by a test in the task shown.

1. Primary provider has no API key but the secondary does: the call must be answered by the secondary (Task 2 unconfigured test, Task 4 fallback test).
2. Model wraps JSON in markdown code fences: parsed, not rejected (Task 1 util test, Task 2 base test).
3. Empty or oversized prompt reaches the playground: rejected with `400` before any vendor call (Task 5 DTO test, Task 6 e2e test).
4. Vendor call times out or the network drops (error with no HTTP status): treated as a failure that triggers fallback, not a crash (Task 2 base test, Task 4 fallback test).
5. Model returns empty text (for example a safety block): treated as a provider failure so fallback runs, instead of returning an empty string as success (Task 2 base test).

## File Structure

```
src/shared/llm/
├── llm.types.ts                       # request/result types
├── llm.provider.ts                    # abstract class ILlmProvider
├── llm.constants.ts                   # defaults, DI lookup token, readLlmTimeoutMs
├── llm-error.mapper.ts                # vendor error -> AppError
├── llm-json.util.ts                   # parse JSON, tolerating code fences
├── base-llm-vendor.provider.ts        # shared timing/error/JSON-retry logic
├── gemini.provider.ts                 # @google/genai wrapper
├── groq.provider.ts                   # groq-sdk wrapper
├── fallback-llm.provider.ts           # primary + secondary
├── llm-provider.factory.ts            # builds the FallbackLlmProvider from config
└── llm.module.ts                      # DI wiring
src/modules/llm-playground/
├── api/llm-playground.controller.ts
├── api/llm-playground-enabled.guard.ts
├── api/llm-playground.page.ts         # HTML string
├── application/dtos/run-playground.request.dto.ts
├── application/dtos/playground-run.response.dto.ts
├── application/interfaces/llm-playground.service.interface.ts
├── application/services/llm-playground.service.ts
└── llm-playground.module.ts
test/llm-playground.e2e-spec.ts
```

Each `*.spec.ts` sits beside its source file. Files added beyond the spec's structure (`llm.constants.ts`, `llm-error.mapper.ts`, `llm-json.util.ts`, `base-llm-vendor.provider.ts`, `llm-provider.factory.ts`) are internal helpers that keep each unit small and testable.

---

### Task 1: Contract, types and shared helpers

**Files:**

- Create: `src/shared/llm/llm.types.ts`
- Create: `src/shared/llm/llm.provider.ts`
- Create: `src/shared/llm/llm.constants.ts`
- Create: `src/shared/llm/llm-error.mapper.ts`
- Create: `src/shared/llm/llm-json.util.ts`
- Test: `src/shared/llm/llm-error.mapper.spec.ts`, `src/shared/llm/llm-json.util.spec.ts`, `src/shared/llm/llm.constants.spec.ts`

**Interfaces:**

- Consumes: `AppError`, `ErrorCode` from `src/shared/common/errorCode.ts`; `Result` from `neverthrow`.
- Produces:
  - Types: `LlmProviderName = 'gemini' | 'groq'`, `LlmUsage`, `LlmTextRequest`, `LlmJsonRequest`, `LlmResultMeta`, `LlmTextResult`, `LlmJsonResult<T>`, `LlmRawCompletion`.
  - `abstract class ILlmProvider { generateText(request: LlmTextRequest): Promise<Result<LlmTextResult, AppError>>; generateJson<T>(request: LlmJsonRequest): Promise<Result<LlmJsonResult<T>, AppError>> }`.
  - Constants: `DEFAULT_GEMINI_MODEL`, `DEFAULT_GROQ_MODEL`, `DEFAULT_LLM_TIMEOUT_MS`, `LLM_PROVIDER_LOOKUP`, `type LlmProviderLookup`, `readLlmTimeoutMs(config: ConfigService): number`.
  - `mapLlmError(error: unknown): AppError`, `describeLlmError(error: unknown): string`, `LLM_UNAVAILABLE_MESSAGE`.
  - `parseJsonOutput(text: string): Result<unknown, Error>`.

- [ ] **Step 1: Record the baseline of the existing test suites**

Run: `npm test` then `npm run test:e2e`
Expected: note which suites pass or fail before any change (for example `app.e2e-spec.ts` may need a database). This is the baseline for Task 7; do not fix unrelated failures.

- [ ] **Step 2: Create the types and the contract (no behavior to test)**

`src/shared/llm/llm.types.ts`:

```ts
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
```

`src/shared/llm/llm.provider.ts`:

```ts
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
```

- [ ] **Step 3: Write the failing tests**

`src/shared/llm/llm-error.mapper.spec.ts`:

```ts
import { ErrorCode } from '../common/errorCode';
import {
  describeLlmError,
  LLM_UNAVAILABLE_MESSAGE,
  mapLlmError,
} from './llm-error.mapper';

describe('mapLlmError', () => {
  it.each([400, 422])('maps HTTP %i to BadRequest', (status) => {
    expect(mapLlmError({ status }).code).toBe(ErrorCode.BadRequest);
  });

  it('maps HTTP 429 to TooManyRequests', () => {
    expect(mapLlmError({ status: 429 }).code).toBe(ErrorCode.TooManyRequests);
  });

  it.each([401, 403, 500, 503])(
    'maps HTTP %i to InternalServerError with the generic message',
    (status) => {
      const error = mapLlmError({ status });

      expect(error.code).toBe(ErrorCode.InternalServerError);
      expect(error.message).toBe(LLM_UNAVAILABLE_MESSAGE);
    },
  );

  it('maps errors without a status (timeout, network) to InternalServerError', () => {
    const error = mapLlmError(new Error('Request timed out.'));

    expect(error.code).toBe(ErrorCode.InternalServerError);
    expect(error.message).toBe(LLM_UNAVAILABLE_MESSAGE);
  });

  it('never leaks the vendor message', () => {
    const error = mapLlmError({ status: 500, message: 'secret-key-abc bad' });

    expect(error.message).not.toContain('secret-key-abc');
  });
});

describe('describeLlmError', () => {
  it('returns the message of an Error', () => {
    expect(describeLlmError(new Error('boom'))).toBe('boom');
  });

  it('stringifies anything else', () => {
    expect(describeLlmError('plain')).toBe('plain');
  });
});
```

`src/shared/llm/llm-json.util.spec.ts`:

```ts
import { parseJsonOutput } from './llm-json.util';

const fence = '```';

describe('parseJsonOutput', () => {
  it('parses a plain JSON object', () => {
    const result = parseJsonOutput('{"a":1}');

    expect(result._unsafeUnwrap()).toEqual({ a: 1 });
  });

  it('parses a JSON array', () => {
    expect(parseJsonOutput('[1,2]')._unsafeUnwrap()).toEqual([1, 2]);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseJsonOutput('  \n{"a":1}\n ')._unsafeUnwrap()).toEqual({ a: 1 });
  });

  it('parses JSON wrapped in a json code fence', () => {
    const text = `${fence}json\n{"a":1}\n${fence}`;

    expect(parseJsonOutput(text)._unsafeUnwrap()).toEqual({ a: 1 });
  });

  it('parses JSON wrapped in a bare code fence', () => {
    const text = `${fence}\n{"a":1}\n${fence}`;

    expect(parseJsonOutput(text)._unsafeUnwrap()).toEqual({ a: 1 });
  });

  it('returns an error for text that is not JSON', () => {
    expect(parseJsonOutput('Here are your questions:').isErr()).toBe(true);
  });

  it('returns an error for an empty string', () => {
    expect(parseJsonOutput('').isErr()).toBe(true);
  });
});
```

`src/shared/llm/llm.constants.spec.ts`:

```ts
import type { ConfigService } from '@nestjs/config';
import { DEFAULT_LLM_TIMEOUT_MS, readLlmTimeoutMs } from './llm.constants';

const makeConfig = (value?: string): ConfigService =>
  ({ get: () => value }) as unknown as ConfigService;

describe('readLlmTimeoutMs', () => {
  it('returns the default when unset', () => {
    expect(readLlmTimeoutMs(makeConfig())).toBe(DEFAULT_LLM_TIMEOUT_MS);
  });

  it('returns the configured positive integer', () => {
    expect(readLlmTimeoutMs(makeConfig('5000'))).toBe(5000);
  });

  it.each(['abc', '-5', '0', '1.5', ''])(
    'falls back to the default for "%s"',
    (value) => {
      expect(readLlmTimeoutMs(makeConfig(value))).toBe(DEFAULT_LLM_TIMEOUT_MS);
    },
  );
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx jest src/shared/llm`
Expected: FAIL, `Cannot find module './llm-error.mapper'` (and the other two helpers).

- [ ] **Step 5: Write the minimal implementation**

`src/shared/llm/llm-error.mapper.ts`:

```ts
import { AppError, ErrorCode } from '../common/errorCode';

export const LLM_UNAVAILABLE_MESSAGE = 'AI service is temporarily unavailable';

function readStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

/**
 * Converts any vendor SDK failure into a user-safe AppError. The vendor's own
 * message is intentionally dropped so keys or internals never reach a response.
 */
export function mapLlmError(error: unknown): AppError {
  const status = readStatus(error);

  if (status === 400 || status === 422) {
    return new AppError(
      ErrorCode.BadRequest,
      'The AI provider rejected the request',
    );
  }

  if (status === 429) {
    return new AppError(
      ErrorCode.TooManyRequests,
      'The AI provider rate limit was reached',
    );
  }

  return new AppError(ErrorCode.InternalServerError, LLM_UNAVAILABLE_MESSAGE);
}

/** Text meant for server logs only. */
export function describeLlmError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
```

`src/shared/llm/llm-json.util.ts`:

```ts
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
```

`src/shared/llm/llm.constants.ts`:

```ts
import type { ConfigService } from '@nestjs/config';
import type { ILlmProvider } from './llm.provider';
import type { LlmProviderName } from './llm.types';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
export const DEFAULT_LLM_TIMEOUT_MS = 30_000;

/** DI token for the `{ gemini, groq }` lookup used by the playground. */
export const LLM_PROVIDER_LOOKUP = 'LLM_PROVIDER_LOOKUP';
export type LlmProviderLookup = Record<LlmProviderName, ILlmProvider>;

export function readLlmTimeoutMs(config: ConfigService): number {
  const parsed = Number(config.get<string>('LLM_TIMEOUT_MS'));
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_LLM_TIMEOUT_MS;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx jest src/shared/llm`
Expected: PASS (3 suites).

- [ ] **Step 7: Lint the touched files and commit**

```bash
npx eslint src/shared/llm --fix
git add src/shared/llm
git commit -m "feat(llm): add ILlmProvider contract and shared helpers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Base vendor provider and GeminiProvider

**Files:**

- Create: `src/shared/llm/base-llm-vendor.provider.ts`
- Create: `src/shared/llm/gemini.provider.ts`
- Modify: `package.json`, `package-lock.json` (install `@google/genai`)
- Test: `src/shared/llm/base-llm-vendor.provider.spec.ts`, `src/shared/llm/gemini.provider.spec.ts`

**Interfaces:**

- Consumes: everything produced by Task 1.
- Produces:
  - `abstract class BaseLlmVendorProvider implements ILlmProvider` with abstract members `providerName: LlmProviderName`, `model: string`, `logger: Logger`, `isConfigured(): boolean`, `completeAsync(request: LlmTextRequest, jsonSchema?: Record<string, unknown>): Promise<LlmRawCompletion>` (may throw; the base maps errors).
  - `class GeminiProvider extends BaseLlmVendorProvider implements ILlmProvider`, constructor `(config: ConfigService)`, `@Injectable()`.

- [ ] **Step 1: Install the SDK**

Run: `npm install @google/genai`
Expected: `package.json` gains `@google/genai` under `dependencies`; install succeeds.

- [ ] **Step 2: Write the failing base-class test**

`src/shared/llm/base-llm-vendor.provider.spec.ts`:

```ts
import { Logger } from '@nestjs/common';
import { ErrorCode } from '../common/errorCode';
import { BaseLlmVendorProvider } from './base-llm-vendor.provider';
import { LLM_UNAVAILABLE_MESSAGE } from './llm-error.mapper';
import type {
  LlmProviderName,
  LlmRawCompletion,
  LlmTextRequest,
} from './llm.types';

class FakeVendorProvider extends BaseLlmVendorProvider {
  protected readonly providerName: LlmProviderName = 'gemini';
  protected readonly model = 'fake-model';
  protected readonly logger = new Logger('FakeVendorProvider');

  configured = true;
  readonly completeMock = jest.fn<
    Promise<LlmRawCompletion>,
    [LlmTextRequest, Record<string, unknown> | undefined]
  >();

  protected isConfigured(): boolean {
    return this.configured;
  }

  protected completeAsync(
    request: LlmTextRequest,
    jsonSchema?: Record<string, unknown>,
  ): Promise<LlmRawCompletion> {
    return this.completeMock(request, jsonSchema);
  }
}

const fence = '```';

describe('BaseLlmVendorProvider', () => {
  let provider: FakeVendorProvider;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    provider = new FakeVendorProvider();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateText', () => {
    it('returns the text with provider metadata', async () => {
      provider.completeMock.mockResolvedValue({
        text: 'hello',
        usage: { inputTokens: 3, outputTokens: 5 },
      });

      const result = await provider.generateText({ prompt: 'hi' });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toMatchObject({
          text: 'hello',
          provider: 'gemini',
          model: 'fake-model',
          usage: { inputTokens: 3, outputTokens: 5 },
        });
        expect(result.value.latencyMs).toBeGreaterThanOrEqual(0);
      }
      expect(provider.completeMock).toHaveBeenCalledWith(
        { prompt: 'hi' },
        undefined,
      );
    });

    it('returns an error without calling the vendor when not configured', async () => {
      provider.configured = false;

      const result = await provider.generateText({ prompt: 'hi' });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(ErrorCode.InternalServerError);
      }
      expect(provider.completeMock).not.toHaveBeenCalled();
    });

    it('maps a 429 vendor error to TooManyRequests', async () => {
      provider.completeMock.mockRejectedValue({ status: 429 });

      const result = await provider.generateText({ prompt: 'hi' });

      expect(result._unsafeUnwrapErr().code).toBe(ErrorCode.TooManyRequests);
    });

    it('maps a 400 vendor error to BadRequest', async () => {
      provider.completeMock.mockRejectedValue({ status: 400 });

      const result = await provider.generateText({ prompt: 'hi' });

      expect(result._unsafeUnwrapErr().code).toBe(ErrorCode.BadRequest);
    });

    it('maps an error without a status (timeout/network) to a generic failure', async () => {
      provider.completeMock.mockRejectedValue(new Error('Request timed out.'));

      const result = await provider.generateText({ prompt: 'hi' });

      const error = result._unsafeUnwrapErr();
      expect(error.code).toBe(ErrorCode.InternalServerError);
      expect(error.message).toBe(LLM_UNAVAILABLE_MESSAGE);
    });

    it('treats an empty response as a provider failure', async () => {
      provider.completeMock.mockResolvedValue({ text: '   ' });

      const result = await provider.generateText({ prompt: 'hi' });

      expect(result._unsafeUnwrapErr().code).toBe(
        ErrorCode.InternalServerError,
      );
    });
  });

  describe('generateJson', () => {
    const schema = { type: 'object' };

    it('parses the JSON and passes the schema to the vendor', async () => {
      provider.completeMock.mockResolvedValue({ text: '{"a":1}' });

      const result = await provider.generateJson<{ a: number }>({
        prompt: 'hi',
        schema,
      });

      expect(result._unsafeUnwrap().data).toEqual({ a: 1 });
      expect(provider.completeMock).toHaveBeenCalledWith(
        { prompt: 'hi' },
        schema,
      );
    });

    it('parses JSON wrapped in a markdown code fence', async () => {
      provider.completeMock.mockResolvedValue({
        text: `${fence}json\n{"a":1}\n${fence}`,
      });

      const result = await provider.generateJson({ prompt: 'hi', schema });

      expect(result._unsafeUnwrap().data).toEqual({ a: 1 });
    });

    it('retries once when the first output is not valid JSON', async () => {
      provider.completeMock
        .mockResolvedValueOnce({ text: 'not json' })
        .mockResolvedValueOnce({ text: '{"a":2}' });

      const result = await provider.generateJson({ prompt: 'hi', schema });

      expect(result._unsafeUnwrap().data).toEqual({ a: 2 });
      expect(provider.completeMock).toHaveBeenCalledTimes(2);
    });

    it('returns an error after two invalid outputs', async () => {
      provider.completeMock.mockResolvedValue({ text: 'still not json' });

      const result = await provider.generateJson({ prompt: 'hi', schema });

      expect(result._unsafeUnwrapErr().code).toBe(
        ErrorCode.InternalServerError,
      );
      expect(provider.completeMock).toHaveBeenCalledTimes(2);
    });

    it('does not retry when the vendor call itself fails', async () => {
      provider.completeMock.mockRejectedValue({ status: 500 });

      const result = await provider.generateJson({ prompt: 'hi', schema });

      expect(result.isErr()).toBe(true);
      expect(provider.completeMock).toHaveBeenCalledTimes(1);
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest src/shared/llm/base-llm-vendor.provider.spec.ts`
Expected: FAIL, `Cannot find module './base-llm-vendor.provider'`.

- [ ] **Step 4: Implement the base class**

`src/shared/llm/base-llm-vendor.provider.ts`:

```ts
import type { Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { AppError, ErrorCode } from '../common/errorCode';
import {
  describeLlmError,
  LLM_UNAVAILABLE_MESSAGE,
  mapLlmError,
} from './llm-error.mapper';
import { parseJsonOutput } from './llm-json.util';
import { ILlmProvider } from './llm.provider';
import type {
  LlmJsonRequest,
  LlmJsonResult,
  LlmProviderName,
  LlmRawCompletion,
  LlmResultMeta,
  LlmTextRequest,
  LlmTextResult,
  LlmUsage,
} from './llm.types';

const MAX_JSON_ATTEMPTS = 2;

/**
 * Shared behavior for vendor providers: timing, error mapping, empty-output
 * detection and the JSON retry. Subclasses only perform the SDK call.
 */
export abstract class BaseLlmVendorProvider implements ILlmProvider {
  protected abstract readonly providerName: LlmProviderName;
  protected abstract readonly model: string;
  protected abstract readonly logger: Logger;

  protected abstract isConfigured(): boolean;

  /** Performs the SDK call. May throw; the base class maps the error. */
  protected abstract completeAsync(
    request: LlmTextRequest,
    jsonSchema?: Record<string, unknown>,
  ): Promise<LlmRawCompletion>;

  async generateText(
    request: LlmTextRequest,
  ): Promise<Result<LlmTextResult, AppError>> {
    const startedAt = Date.now();
    const completion = await this.tryCompleteAsync(request);

    if (completion.isErr()) {
      return err(completion.error);
    }

    if (completion.value.text.trim() === '') {
      this.logger.warn(`${this.providerName} returned an empty response`);
      return err(
        new AppError(ErrorCode.InternalServerError, LLM_UNAVAILABLE_MESSAGE),
      );
    }

    return ok({
      ...this.buildMeta(startedAt, completion.value.usage),
      text: completion.value.text,
    });
  }

  async generateJson<T>(
    request: LlmJsonRequest,
  ): Promise<Result<LlmJsonResult<T>, AppError>> {
    const startedAt = Date.now();
    const { schema, ...textRequest } = request;

    for (let attempt = 1; attempt <= MAX_JSON_ATTEMPTS; attempt++) {
      const completion = await this.tryCompleteAsync(textRequest, schema);

      if (completion.isErr()) {
        return err(completion.error);
      }

      const parsed = parseJsonOutput(completion.value.text);
      if (parsed.isOk()) {
        return ok({
          ...this.buildMeta(startedAt, completion.value.usage),
          data: parsed.value as T,
        });
      }

      this.logger.warn(
        `${this.providerName} returned invalid JSON (attempt ${attempt}/${MAX_JSON_ATTEMPTS})`,
      );
    }

    return err(
      new AppError(
        ErrorCode.InternalServerError,
        'The AI provider returned an invalid JSON response',
      ),
    );
  }

  private async tryCompleteAsync(
    request: LlmTextRequest,
    jsonSchema?: Record<string, unknown>,
  ): Promise<Result<LlmRawCompletion, AppError>> {
    if (!this.isConfigured()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          `The ${this.providerName} provider is not configured`,
        ),
      );
    }

    try {
      return ok(await this.completeAsync(request, jsonSchema));
    } catch (error) {
      this.logger.warn(
        `${this.providerName} request failed: ${describeLlmError(error)}`,
      );
      return err(mapLlmError(error));
    }
  }

  private buildMeta(startedAt: number, usage?: LlmUsage): LlmResultMeta {
    return {
      provider: this.providerName,
      model: this.model,
      latencyMs: Date.now() - startedAt,
      usage,
    };
  }
}
```

- [ ] **Step 5: Run the base-class test to verify it passes**

Run: `npx jest src/shared/llm/base-llm-vendor.provider.spec.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing Gemini test**

`src/shared/llm/gemini.provider.spec.ts`:

```ts
import { GoogleGenAI } from '@google/genai';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../common/errorCode';
import { GeminiProvider } from './gemini.provider';

jest.mock('@google/genai', () => ({ GoogleGenAI: jest.fn() }));

const googleGenAiMock = GoogleGenAI as unknown as jest.Mock;
const generateContentMock = jest.fn();

const makeConfig = (values: Record<string, string>): ConfigService =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('GeminiProvider', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    googleGenAiMock.mockReset();
    generateContentMock.mockReset();
    googleGenAiMock.mockImplementation(() => ({
      models: { generateContent: generateContentMock },
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds the client with the API key and the configured timeout', () => {
    new GeminiProvider(
      makeConfig({ GEMINI_API_KEY: 'gem-key', LLM_TIMEOUT_MS: '5000' }),
    );

    expect(googleGenAiMock).toHaveBeenCalledWith({
      apiKey: 'gem-key',
      httpOptions: { timeout: 5000 },
    });
  });

  it('sends text requests with the default model and maps text and usage', async () => {
    generateContentMock.mockResolvedValue({
      text: 'hello',
      usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 6 },
    });
    const provider = new GeminiProvider(makeConfig({ GEMINI_API_KEY: 'k' }));

    const result = await provider.generateText({
      prompt: 'hi',
      systemPrompt: 'be brief',
      temperature: 0.2,
      maxOutputTokens: 100,
    });

    expect(generateContentMock).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      contents: 'hi',
      config: {
        systemInstruction: 'be brief',
        temperature: 0.2,
        maxOutputTokens: 100,
      },
    });
    expect(result._unsafeUnwrap()).toMatchObject({
      text: 'hello',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      usage: { inputTokens: 4, outputTokens: 6 },
    });
  });

  it('uses GEMINI_MODEL when set', async () => {
    generateContentMock.mockResolvedValue({ text: 'x' });
    const provider = new GeminiProvider(
      makeConfig({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-custom' }),
    );

    const result = await provider.generateText({ prompt: 'hi' });

    expect(result._unsafeUnwrap().model).toBe('gemini-custom');
  });

  it('requests JSON output with the schema in JSON mode', async () => {
    generateContentMock.mockResolvedValue({ text: '{"a":1}' });
    const provider = new GeminiProvider(makeConfig({ GEMINI_API_KEY: 'k' }));
    const schema = { type: 'object' };

    const result = await provider.generateJson<{ a: number }>({
      prompt: 'hi',
      schema,
    });

    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
        }),
      }),
    );
    expect(result._unsafeUnwrap().data).toEqual({ a: 1 });
  });

  it('does not build a client or call the SDK without an API key', async () => {
    const provider = new GeminiProvider(makeConfig({}));

    const result = await provider.generateText({ prompt: 'hi' });

    expect(googleGenAiMock).not.toHaveBeenCalled();
    expect(generateContentMock).not.toHaveBeenCalled();
    expect(result._unsafeUnwrapErr().code).toBe(ErrorCode.InternalServerError);
  });

  it('maps an SDK rate-limit error to TooManyRequests', async () => {
    generateContentMock.mockRejectedValue({ status: 429 });
    const provider = new GeminiProvider(makeConfig({ GEMINI_API_KEY: 'k' }));

    const result = await provider.generateText({ prompt: 'hi' });

    expect(result._unsafeUnwrapErr().code).toBe(ErrorCode.TooManyRequests);
  });
});
```

- [ ] **Step 7: Run the Gemini test to verify it fails**

Run: `npx jest src/shared/llm/gemini.provider.spec.ts`
Expected: FAIL, `Cannot find module './gemini.provider'`.

- [ ] **Step 8: Implement GeminiProvider**

`src/shared/llm/gemini.provider.ts`:

```ts
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
```

- [ ] **Step 9: Run both suites to verify they pass**

Run: `npx jest src/shared/llm`
Expected: PASS (all suites so far).

- [ ] **Step 10: Lint, type-check and commit**

```bash
npx eslint src/shared/llm --fix
npx tsc --noEmit -p tsconfig.json
git add package.json package-lock.json src/shared/llm
git commit -m "feat(llm): add base vendor provider and GeminiProvider" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: GroqProvider

**Files:**

- Create: `src/shared/llm/groq.provider.ts`
- Modify: `package.json`, `package-lock.json` (install `groq-sdk`)
- Test: `src/shared/llm/groq.provider.spec.ts`

**Interfaces:**

- Consumes: `BaseLlmVendorProvider` (Task 2), `DEFAULT_GROQ_MODEL`, `readLlmTimeoutMs` (Task 1).
- Produces: `class GroqProvider extends BaseLlmVendorProvider implements ILlmProvider`, constructor `(config: ConfigService)`, `@Injectable()`.

- [ ] **Step 1: Install the SDK**

Run: `npm install groq-sdk`
Expected: `package.json` gains `groq-sdk` under `dependencies`.

- [ ] **Step 2: Write the failing test**

`src/shared/llm/groq.provider.spec.ts`:

```ts
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { ErrorCode } from '../common/errorCode';
import { GroqProvider } from './groq.provider';

jest.mock('groq-sdk', () => ({ __esModule: true, default: jest.fn() }));

const groqMock = Groq as unknown as jest.Mock;
const createMock = jest.fn();

const makeConfig = (values: Record<string, string>): ConfigService =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('GroqProvider', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    groqMock.mockReset();
    createMock.mockReset();
    groqMock.mockImplementation(() => ({
      chat: { completions: { create: createMock } },
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds the client with the API key, timeout and no SDK retries', () => {
    new GroqProvider(
      makeConfig({ GROQ_API_KEY: 'groq-key', LLM_TIMEOUT_MS: '7000' }),
    );

    expect(groqMock).toHaveBeenCalledWith({
      apiKey: 'groq-key',
      timeout: 7000,
      maxRetries: 0,
    });
  });

  it('sends text requests with system + user messages and maps text and usage', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: 'hello' } }],
      usage: { prompt_tokens: 4, completion_tokens: 6 },
    });
    const provider = new GroqProvider(makeConfig({ GROQ_API_KEY: 'k' }));

    const result = await provider.generateText({
      prompt: 'hi',
      systemPrompt: 'be brief',
      temperature: 0.2,
      maxOutputTokens: 100,
    });

    expect(createMock).toHaveBeenCalledWith({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hi' },
      ],
      temperature: 0.2,
      max_completion_tokens: 100,
    });
    expect(result._unsafeUnwrap()).toMatchObject({
      text: 'hello',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      usage: { inputTokens: 4, outputTokens: 6 },
    });
  });

  it('omits the system message when there is no system prompt', async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: 'x' } }] });
    const provider = new GroqProvider(makeConfig({ GROQ_API_KEY: 'k' }));

    await provider.generateText({ prompt: 'hi' });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'hi' }],
      }),
    );
  });

  it('uses GROQ_MODEL when set', async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: 'x' } }] });
    const provider = new GroqProvider(
      makeConfig({ GROQ_API_KEY: 'k', GROQ_MODEL: 'groq-custom' }),
    );

    const result = await provider.generateText({ prompt: 'hi' });

    expect(result._unsafeUnwrap().model).toBe('groq-custom');
  });

  it('enables JSON mode and puts the schema in the system prompt', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: '{"a":1}' } }],
    });
    const provider = new GroqProvider(makeConfig({ GROQ_API_KEY: 'k' }));
    const schema = { type: 'object' };

    const result = await provider.generateJson<{ a: number }>({
      prompt: 'hi',
      systemPrompt: 'be brief',
      schema,
    });

    const params = createMock.mock.calls[0][0] as {
      messages: { role: string; content: string }[];
      response_format: unknown;
    };
    expect(params.response_format).toEqual({ type: 'json_object' });
    expect(params.messages[0].role).toBe('system');
    expect(params.messages[0].content).toContain('be brief');
    expect(params.messages[0].content).toContain('JSON');
    expect(params.messages[0].content).toContain(JSON.stringify(schema));
    expect(result._unsafeUnwrap().data).toEqual({ a: 1 });
  });

  it('does not build a client or call the SDK without an API key', async () => {
    const provider = new GroqProvider(makeConfig({}));

    const result = await provider.generateText({ prompt: 'hi' });

    expect(groqMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
    expect(result._unsafeUnwrapErr().code).toBe(ErrorCode.InternalServerError);
  });

  it('maps an SDK rate-limit error to TooManyRequests', async () => {
    createMock.mockRejectedValue({ status: 429 });
    const provider = new GroqProvider(makeConfig({ GROQ_API_KEY: 'k' }));

    const result = await provider.generateText({ prompt: 'hi' });

    expect(result._unsafeUnwrapErr().code).toBe(ErrorCode.TooManyRequests);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest src/shared/llm/groq.provider.spec.ts`
Expected: FAIL, `Cannot find module './groq.provider'`.

- [ ] **Step 4: Implement GroqProvider**

`src/shared/llm/groq.provider.ts`:

```ts
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
export class GroqProvider extends BaseLlmVendorProvider implements ILlmProvider {
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/shared/llm`
Expected: PASS (all suites).

- [ ] **Step 6: Lint, type-check and commit**

```bash
npx eslint src/shared/llm --fix
npx tsc --noEmit -p tsconfig.json
git add package.json package-lock.json src/shared/llm
git commit -m "feat(llm): add GroqProvider" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Fallback provider, factory, LlmModule and env

**Files:**

- Create: `src/shared/llm/fallback-llm.provider.ts`
- Create: `src/shared/llm/llm-provider.factory.ts`
- Create: `src/shared/llm/llm.module.ts`
- Modify: `.env.example` (append LLM variables)
- Test: `src/shared/llm/fallback-llm.provider.spec.ts`, `src/shared/llm/llm-provider.factory.spec.ts`, `src/shared/llm/llm.module.spec.ts`

**Interfaces:**

- Consumes: `ILlmProvider`, `GeminiProvider`, `GroqProvider`, `LLM_UNAVAILABLE_MESSAGE`, `LLM_PROVIDER_LOOKUP`, `LlmProviderLookup`, `LlmProviderName`.
- Produces:
  - `class FallbackLlmProvider implements ILlmProvider`, constructor `(primary: ILlmProvider, secondary: ILlmProvider)`.
  - `resolvePrimaryProviderName(raw: string | undefined, logger: Logger): LlmProviderName`.
  - `createFallbackLlmProvider(config: ConfigService, gemini: GeminiProvider, groq: GroqProvider): ILlmProvider`.
  - `class LlmModule` exporting `ILlmProvider` and `LLM_PROVIDER_LOOKUP` (`LlmProviderLookup`).

- [ ] **Step 1: Write the failing fallback test**

`src/shared/llm/fallback-llm.provider.spec.ts`:

```ts
import { Logger } from '@nestjs/common';
import { err, ok } from 'neverthrow';
import { AppError, ErrorCode } from '../common/errorCode';
import { FallbackLlmProvider } from './fallback-llm.provider';
import { LLM_UNAVAILABLE_MESSAGE } from './llm-error.mapper';
import type { ILlmProvider } from './llm.provider';
import type { LlmJsonResult, LlmProviderName, LlmTextResult } from './llm.types';

const makeFake = () => ({ generateText: jest.fn(), generateJson: jest.fn() });

const textResult = (provider: LlmProviderName): LlmTextResult => ({
  text: `from ${provider}`,
  provider,
  model: 'm',
  latencyMs: 1,
});

describe('FallbackLlmProvider', () => {
  const primary = makeFake();
  const secondary = makeFake();
  let fallback: FallbackLlmProvider;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    primary.generateText.mockReset();
    primary.generateJson.mockReset();
    secondary.generateText.mockReset();
    secondary.generateJson.mockReset();
    fallback = new FallbackLlmProvider(
      primary as unknown as ILlmProvider,
      secondary as unknown as ILlmProvider,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the primary result without touching the secondary', async () => {
    primary.generateText.mockResolvedValue(ok(textResult('gemini')));

    const result = await fallback.generateText({ prompt: 'hi' });

    expect(result._unsafeUnwrap().provider).toBe('gemini');
    expect(secondary.generateText).not.toHaveBeenCalled();
  });

  it.each([
    ErrorCode.InternalServerError,
    ErrorCode.TooManyRequests,
  ])('falls back to the secondary when the primary fails with %s', async (code) => {
    primary.generateText.mockResolvedValue(err(new AppError(code, 'boom')));
    secondary.generateText.mockResolvedValue(ok(textResult('groq')));

    const result = await fallback.generateText({ prompt: 'hi' });

    expect(result._unsafeUnwrap().provider).toBe('groq');
    expect(secondary.generateText).toHaveBeenCalledWith({ prompt: 'hi' });
  });

  it('does not fall back on BadRequest', async () => {
    const badRequest = new AppError(ErrorCode.BadRequest, 'bad');
    primary.generateText.mockResolvedValue(err(badRequest));

    const result = await fallback.generateText({ prompt: 'hi' });

    expect(result._unsafeUnwrapErr()).toBe(badRequest);
    expect(secondary.generateText).not.toHaveBeenCalled();
  });

  it('returns a generic error without leaking causes when both fail', async () => {
    primary.generateText.mockResolvedValue(
      err(new AppError(ErrorCode.InternalServerError, 'primary-secret')),
    );
    secondary.generateText.mockResolvedValue(
      err(new AppError(ErrorCode.TooManyRequests, 'secondary-secret')),
    );

    const result = await fallback.generateText({ prompt: 'hi' });

    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe(ErrorCode.InternalServerError);
    expect(error.message).toBe(LLM_UNAVAILABLE_MESSAGE);
    expect(error.message).not.toContain('secret');
  });

  it('falls back for generateJson as well', async () => {
    const jsonResult: LlmJsonResult<{ a: number }> = {
      data: { a: 1 },
      provider: 'groq',
      model: 'm',
      latencyMs: 1,
    };
    primary.generateJson.mockResolvedValue(
      err(new AppError(ErrorCode.InternalServerError, 'boom')),
    );
    secondary.generateJson.mockResolvedValue(ok(jsonResult));

    const result = await fallback.generateJson<{ a: number }>({
      prompt: 'hi',
      schema: { type: 'object' },
    });

    expect(result._unsafeUnwrap().data).toEqual({ a: 1 });
  });
});
```

- [ ] **Step 2: Write the failing factory and module tests**

`src/shared/llm/llm-provider.factory.spec.ts`:

```ts
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ok } from 'neverthrow';
import {
  createFallbackLlmProvider,
  resolvePrimaryProviderName,
} from './llm-provider.factory';
import type { GeminiProvider } from './gemini.provider';
import type { GroqProvider } from './groq.provider';
import type { LlmProviderName, LlmTextResult } from './llm.types';

const makeConfig = (values: Record<string, string>): ConfigService =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

const makeFake = (provider: LlmProviderName) => ({
  generateText: jest.fn().mockResolvedValue(
    ok({
      text: 'x',
      provider,
      model: 'm',
      latencyMs: 1,
    } satisfies LlmTextResult),
  ),
  generateJson: jest.fn(),
});

describe('resolvePrimaryProviderName', () => {
  let warn: jest.SpyInstance;
  const logger = new Logger('test');

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('defaults to gemini without warning when unset', () => {
    expect(resolvePrimaryProviderName(undefined, logger)).toBe('gemini');
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['gemini', 'gemini'],
    ['groq', 'groq'],
    [' GROQ ', 'groq'],
    ['Gemini', 'gemini'],
  ])('accepts "%s"', (raw, expected) => {
    expect(resolvePrimaryProviderName(raw, logger)).toBe(expected);
  });

  it('falls back to gemini and warns for an unknown value', () => {
    expect(resolvePrimaryProviderName('openai', logger)).toBe('gemini');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('openai'));
  });
});

describe('createFallbackLlmProvider', () => {
  const gemini = makeFake('gemini');
  const groq = makeFake('groq');
  const asProviders = () =>
    [gemini as unknown as GeminiProvider, groq as unknown as GroqProvider] as const;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    gemini.generateText.mockClear();
    groq.generateText.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses gemini first by default', async () => {
    const [g, q] = asProviders();
    const provider = createFallbackLlmProvider(
      makeConfig({ GEMINI_API_KEY: 'a', GROQ_API_KEY: 'b' }),
      g,
      q,
    );

    await provider.generateText({ prompt: 'hi' });

    expect(gemini.generateText).toHaveBeenCalledTimes(1);
    expect(groq.generateText).not.toHaveBeenCalled();
  });

  it('uses groq first when LLM_PRIMARY_PROVIDER=groq', async () => {
    const [g, q] = asProviders();
    const provider = createFallbackLlmProvider(
      makeConfig({
        LLM_PRIMARY_PROVIDER: 'groq',
        GEMINI_API_KEY: 'a',
        GROQ_API_KEY: 'b',
      }),
      g,
      q,
    );

    await provider.generateText({ prompt: 'hi' });

    expect(groq.generateText).toHaveBeenCalledTimes(1);
    expect(gemini.generateText).not.toHaveBeenCalled();
  });

  it('warns about each missing API key', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const [g, q] = asProviders();

    createFallbackLlmProvider(makeConfig({}), g, q);

    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(messages.some((m) => m.includes('GEMINI_API_KEY'))).toBe(true);
    expect(messages.some((m) => m.includes('GROQ_API_KEY'))).toBe(true);
  });

  it('does not warn when both keys are set', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const [g, q] = asProviders();

    createFallbackLlmProvider(
      makeConfig({ GEMINI_API_KEY: 'a', GROQ_API_KEY: 'b' }),
      g,
      q,
    );

    expect(warn).not.toHaveBeenCalled();
  });
});
```

`src/shared/llm/llm.module.spec.ts`:

```ts
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { FallbackLlmProvider } from './fallback-llm.provider';
import { GeminiProvider } from './gemini.provider';
import { GroqProvider } from './groq.provider';
import { LLM_PROVIDER_LOOKUP, type LlmProviderLookup } from './llm.constants';
import { LlmModule } from './llm.module';
import { ILlmProvider } from './llm.provider';

describe('LlmModule', () => {
  it('binds ILlmProvider to the fallback provider and exposes the lookup', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q' })],
        }),
        LlmModule,
      ],
    }).compile();

    const provider = moduleRef.get(ILlmProvider);
    const lookup = moduleRef.get<LlmProviderLookup>(LLM_PROVIDER_LOOKUP);

    expect(provider).toBeInstanceOf(FallbackLlmProvider);
    expect(lookup.gemini).toBeInstanceOf(GeminiProvider);
    expect(lookup.groq).toBeInstanceOf(GroqProvider);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx jest src/shared/llm/fallback-llm.provider.spec.ts src/shared/llm/llm-provider.factory.spec.ts src/shared/llm/llm.module.spec.ts`
Expected: FAIL, missing modules `./fallback-llm.provider`, `./llm-provider.factory`, `./llm.module`.

- [ ] **Step 4: Implement FallbackLlmProvider**

`src/shared/llm/fallback-llm.provider.ts`:

```ts
import { Logger } from '@nestjs/common';
import { err, Result } from 'neverthrow';
import { AppError, ErrorCode } from '../common/errorCode';
import { LLM_UNAVAILABLE_MESSAGE } from './llm-error.mapper';
import { ILlmProvider } from './llm.provider';
import type {
  LlmJsonRequest,
  LlmJsonResult,
  LlmTextRequest,
  LlmTextResult,
} from './llm.types';

/**
 * Tries the primary provider and, on any failure except BadRequest (which no
 * other vendor can fix), tries the secondary one.
 */
export class FallbackLlmProvider implements ILlmProvider {
  private readonly logger = new Logger(FallbackLlmProvider.name);

  constructor(
    private readonly primary: ILlmProvider,
    private readonly secondary: ILlmProvider,
  ) {}

  generateText(
    request: LlmTextRequest,
  ): Promise<Result<LlmTextResult, AppError>> {
    return this.runWithFallbackAsync((provider) =>
      provider.generateText(request),
    );
  }

  generateJson<T>(
    request: LlmJsonRequest,
  ): Promise<Result<LlmJsonResult<T>, AppError>> {
    return this.runWithFallbackAsync((provider) =>
      provider.generateJson<T>(request),
    );
  }

  private async runWithFallbackAsync<T>(
    operation: (provider: ILlmProvider) => Promise<Result<T, AppError>>,
  ): Promise<Result<T, AppError>> {
    const primaryResult = await operation(this.primary);

    if (
      primaryResult.isOk() ||
      primaryResult.error.code === ErrorCode.BadRequest
    ) {
      return primaryResult;
    }

    this.logger.warn(
      `Primary LLM provider failed (${primaryResult.error.code}); trying the secondary provider`,
    );

    const secondaryResult = await operation(this.secondary);
    if (secondaryResult.isOk()) {
      return secondaryResult;
    }

    this.logger.error(
      `Both LLM providers failed (primary: ${primaryResult.error.code}, secondary: ${secondaryResult.error.code})`,
    );
    return err(
      new AppError(ErrorCode.InternalServerError, LLM_UNAVAILABLE_MESSAGE),
    );
  }
}
```

- [ ] **Step 5: Implement the factory and the module**

`src/shared/llm/llm-provider.factory.ts`:

```ts
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { FallbackLlmProvider } from './fallback-llm.provider';
import type { GeminiProvider } from './gemini.provider';
import type { GroqProvider } from './groq.provider';
import type { ILlmProvider } from './llm.provider';
import type { LlmProviderName } from './llm.types';

export function resolvePrimaryProviderName(
  raw: string | undefined,
  logger: Logger,
): LlmProviderName {
  const value = raw?.trim().toLowerCase();

  if (value === 'gemini' || value === 'groq') {
    return value;
  }

  if (value) {
    logger.warn(
      `Unknown LLM_PRIMARY_PROVIDER "${raw}"; falling back to "gemini"`,
    );
  }
  return 'gemini';
}

/** Builds the provider bound to the `ILlmProvider` DI token. */
export function createFallbackLlmProvider(
  config: ConfigService,
  gemini: GeminiProvider,
  groq: GroqProvider,
): ILlmProvider {
  const logger = new Logger('LlmModule');

  if (!config.get<string>('GEMINI_API_KEY')) {
    logger.warn('GEMINI_API_KEY is not set; Gemini calls will fail');
  }
  if (!config.get<string>('GROQ_API_KEY')) {
    logger.warn('GROQ_API_KEY is not set; Groq calls will fail');
  }

  const primaryName = resolvePrimaryProviderName(
    config.get<string>('LLM_PRIMARY_PROVIDER'),
    logger,
  );

  return primaryName === 'gemini'
    ? new FallbackLlmProvider(gemini, groq)
    : new FallbackLlmProvider(groq, gemini);
}
```

`src/shared/llm/llm.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiProvider } from './gemini.provider';
import { GroqProvider } from './groq.provider';
import { LLM_PROVIDER_LOOKUP, type LlmProviderLookup } from './llm.constants';
import { ILlmProvider } from './llm.provider';
import { createFallbackLlmProvider } from './llm-provider.factory';

@Module({
  providers: [
    GeminiProvider,
    GroqProvider,
    {
      provide: ILlmProvider,
      useFactory: createFallbackLlmProvider,
      inject: [ConfigService, GeminiProvider, GroqProvider],
    },
    {
      provide: LLM_PROVIDER_LOOKUP,
      useFactory: (
        gemini: GeminiProvider,
        groq: GroqProvider,
      ): LlmProviderLookup => ({ gemini, groq }),
      inject: [GeminiProvider, GroqProvider],
    },
  ],
  exports: [ILlmProvider, LLM_PROVIDER_LOOKUP],
})
export class LlmModule {}
```

- [ ] **Step 6: Document the environment variables**

Append to the end of `.env.example`:

```
# LLM providers (question generation / scoring). Never commit real keys.
LLM_PRIMARY_PROVIDER=gemini
GEMINI_API_KEY=
GROQ_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GROQ_MODEL=llama-3.3-70b-versatile
LLM_TIMEOUT_MS=30000
# Internal prompt playground (dev only). Costs real AI quota when enabled.
ENABLE_LLM_PLAYGROUND=false
```

- [ ] **Step 7: Run all LLM tests to verify they pass**

Run: `npx jest src/shared/llm`
Expected: PASS (all suites).

- [ ] **Step 8: Lint, type-check and commit**

```bash
npx eslint src/shared/llm --fix
npx tsc --noEmit -p tsconfig.json
git add src/shared/llm .env.example
git commit -m "feat(llm): add fallback provider, factory and LlmModule" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Playground application layer (DTOs, service, guard)

**Files:**

- Create: `src/modules/llm-playground/application/dtos/run-playground.request.dto.ts`
- Create: `src/modules/llm-playground/application/dtos/playground-run.response.dto.ts`
- Create: `src/modules/llm-playground/application/interfaces/llm-playground.service.interface.ts`
- Create: `src/modules/llm-playground/application/services/llm-playground.service.ts`
- Create: `src/modules/llm-playground/api/llm-playground-enabled.guard.ts`
- Test: `run-playground.request.dto.spec.ts` (beside the DTO), `llm-playground.service.spec.ts`, `llm-playground-enabled.guard.spec.ts`

**Interfaces:**

- Consumes: `ILlmProvider`, `LLM_PROVIDER_LOOKUP`, `LlmProviderLookup`, `LlmProviderName`, `LlmUsage` from `src/shared/llm`.
- Produces:
  - `enum PlaygroundMode { TEXT = 'text', JSON = 'json' }`, `enum PlaygroundProvider { DEFAULT = 'default', GEMINI = 'gemini', GROQ = 'groq' }`.
  - `class RunPlaygroundRequestDto { mode; provider; prompt; systemPrompt?; schema?; temperature? }`.
  - `class PlaygroundRunResponseDto { output: string; provider: LlmProviderName; model: string; latencyMs: number; usage?: LlmUsage }`.
  - `abstract class ILlmPlaygroundService { runAsync(request: RunPlaygroundRequestDto): Promise<Result<PlaygroundRunResponseDto, AppError>> }`.
  - `class LlmPlaygroundService`, constructor `(defaultProvider: ILlmProvider, @Inject(LLM_PROVIDER_LOOKUP) providers: LlmProviderLookup)`.
  - `class LlmPlaygroundEnabledGuard implements CanActivate`, constructor `(config: ConfigService)`.

- [ ] **Step 1: Write the failing DTO test**

`src/modules/llm-playground/application/dtos/run-playground.request.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RunPlaygroundRequestDto } from './run-playground.request.dto';

const build = (overrides: Record<string, unknown> = {}) =>
  plainToInstance(RunPlaygroundRequestDto, {
    mode: 'text',
    provider: 'default',
    prompt: 'hello',
    ...overrides,
  });

describe('RunPlaygroundRequestDto', () => {
  it('accepts a minimal valid body', async () => {
    expect(await validate(build())).toHaveLength(0);
  });

  it('accepts every optional field', async () => {
    const dto = build({
      mode: 'json',
      provider: 'groq',
      systemPrompt: 'be brief',
      schema: '{"type":"object"}',
      temperature: 0.7,
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an empty prompt', async () => {
    expect(await validate(build({ prompt: '' }))).not.toHaveLength(0);
  });

  it('rejects a prompt over 8000 characters', async () => {
    const errors = await validate(build({ prompt: 'a'.repeat(8001) }));

    expect(errors.map((e) => e.property)).toContain('prompt');
  });

  it('rejects a system prompt over 4000 characters', async () => {
    const errors = await validate(build({ systemPrompt: 'a'.repeat(4001) }));

    expect(errors.map((e) => e.property)).toContain('systemPrompt');
  });

  it('rejects a schema over 8000 characters', async () => {
    const errors = await validate(build({ schema: 'a'.repeat(8001) }));

    expect(errors.map((e) => e.property)).toContain('schema');
  });

  it('rejects an unknown provider', async () => {
    expect(await validate(build({ provider: 'openai' }))).not.toHaveLength(0);
  });

  it('rejects an unknown mode', async () => {
    expect(await validate(build({ mode: 'stream' }))).not.toHaveLength(0);
  });

  it('rejects a temperature above 2', async () => {
    expect(await validate(build({ temperature: 2.5 }))).not.toHaveLength(0);
  });
});
```

- [ ] **Step 2: Write the failing service and guard tests**

`src/modules/llm-playground/application/services/llm-playground.service.spec.ts`:

```ts
import { err, ok } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import type { ILlmProvider } from '../../../../shared/llm/llm.provider';
import type { LlmProviderLookup } from '../../../../shared/llm/llm.constants';
import {
  PlaygroundMode,
  PlaygroundProvider,
  RunPlaygroundRequestDto,
} from '../dtos/run-playground.request.dto';
import { LlmPlaygroundService } from './llm-playground.service';

const makeFake = () => ({ generateText: jest.fn(), generateJson: jest.fn() });

const buildRequest = (
  overrides: Partial<RunPlaygroundRequestDto> = {},
): RunPlaygroundRequestDto =>
  Object.assign(new RunPlaygroundRequestDto(), {
    mode: PlaygroundMode.TEXT,
    provider: PlaygroundProvider.DEFAULT,
    prompt: 'hello',
    ...overrides,
  });

describe('LlmPlaygroundService', () => {
  const defaultProvider = makeFake();
  const gemini = makeFake();
  const groq = makeFake();
  const service = new LlmPlaygroundService(
    defaultProvider as unknown as ILlmProvider,
    {
      gemini: gemini as unknown as ILlmProvider,
      groq: groq as unknown as ILlmProvider,
    } satisfies LlmProviderLookup,
  );

  beforeEach(() => {
    [defaultProvider, gemini, groq].forEach((fake) => {
      fake.generateText.mockReset();
      fake.generateJson.mockReset();
    });
  });

  it('runs text mode on the default provider and maps the result', async () => {
    defaultProvider.generateText.mockResolvedValue(
      ok({
        text: 'hi there',
        provider: 'gemini',
        model: 'm',
        latencyMs: 12,
        usage: { inputTokens: 1, outputTokens: 2 },
      }),
    );

    const result = await service.runAsync(
      buildRequest({ systemPrompt: 'sys', temperature: 0.5 }),
    );

    expect(defaultProvider.generateText).toHaveBeenCalledWith({
      prompt: 'hello',
      systemPrompt: 'sys',
      temperature: 0.5,
    });
    expect(result._unsafeUnwrap()).toEqual({
      output: 'hi there',
      provider: 'gemini',
      model: 'm',
      latencyMs: 12,
      usage: { inputTokens: 1, outputTokens: 2 },
    });
  });

  it('uses the selected vendor instead of the default', async () => {
    groq.generateText.mockResolvedValue(
      ok({ text: 'g', provider: 'groq', model: 'm', latencyMs: 1 }),
    );

    await service.runAsync(buildRequest({ provider: PlaygroundProvider.GROQ }));

    expect(groq.generateText).toHaveBeenCalledTimes(1);
    expect(defaultProvider.generateText).not.toHaveBeenCalled();
    expect(gemini.generateText).not.toHaveBeenCalled();
  });

  it('runs JSON mode with the parsed schema and pretty-prints the data', async () => {
    gemini.generateJson.mockResolvedValue(
      ok({ data: { a: 1 }, provider: 'gemini', model: 'm', latencyMs: 1 }),
    );

    const result = await service.runAsync(
      buildRequest({
        mode: PlaygroundMode.JSON,
        provider: PlaygroundProvider.GEMINI,
        schema: '{"type":"object"}',
      }),
    );

    expect(gemini.generateJson).toHaveBeenCalledWith(
      expect.objectContaining({ schema: { type: 'object' } }),
    );
    expect(result._unsafeUnwrap().output).toBe(
      JSON.stringify({ a: 1 }, null, 2),
    );
  });

  it.each([
    ['is missing', undefined],
    ['is blank', '   '],
    ['is not valid JSON', '{not json'],
    ['is a JSON array', '[1,2]'],
    ['is a JSON string', '"text"'],
  ])('returns BadRequest in JSON mode when the schema %s', async (_label, schema) => {
    const result = await service.runAsync(
      buildRequest({ mode: PlaygroundMode.JSON, schema }),
    );

    expect(result._unsafeUnwrapErr().code).toBe(ErrorCode.BadRequest);
    expect(defaultProvider.generateJson).not.toHaveBeenCalled();
  });

  it('passes a vendor failure through unchanged', async () => {
    const failure = new AppError(ErrorCode.InternalServerError, 'down');
    defaultProvider.generateText.mockResolvedValue(err(failure));

    const result = await service.runAsync(buildRequest());

    expect(result._unsafeUnwrapErr()).toBe(failure);
  });
});
```

`src/modules/llm-playground/api/llm-playground-enabled.guard.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { LlmPlaygroundEnabledGuard } from './llm-playground-enabled.guard';

const makeGuard = (value?: string) =>
  new LlmPlaygroundEnabledGuard({
    get: () => value,
  } as unknown as ConfigService);

describe('LlmPlaygroundEnabledGuard', () => {
  it('allows the request when ENABLE_LLM_PLAYGROUND is "true"', () => {
    expect(makeGuard('true').canActivate()).toBe(true);
  });

  it.each([undefined, 'false', '1', 'TRUE', ''])(
    'responds 404 when ENABLE_LLM_PLAYGROUND is %p',
    (value) => {
      expect(() => makeGuard(value).canActivate()).toThrow(NotFoundException);
    },
  );
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx jest src/modules/llm-playground`
Expected: FAIL, missing modules (DTO, service, guard).

- [ ] **Step 4: Implement the DTOs**

`src/modules/llm-playground/application/dtos/run-playground.request.dto.ts`:

```ts
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export enum PlaygroundMode {
  TEXT = 'text',
  JSON = 'json',
}

export enum PlaygroundProvider {
  DEFAULT = 'default',
  GEMINI = 'gemini',
  GROQ = 'groq',
}

export class RunPlaygroundRequestDto {
  @IsEnum(PlaygroundMode)
  mode!: PlaygroundMode;

  @IsEnum(PlaygroundProvider)
  provider!: PlaygroundProvider;

  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  systemPrompt?: string;

  /** JSON Schema as a JSON string. Required when `mode` is `json`. */
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  schema?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;
}
```

`src/modules/llm-playground/application/dtos/playground-run.response.dto.ts`:

```ts
import type { LlmProviderName, LlmUsage } from '../../../../shared/llm/llm.types';

export class PlaygroundRunResponseDto {
  /** Text, or pretty-printed JSON in JSON mode. */
  output!: string;
  /** The vendor that actually answered (shows when fallback ran). */
  provider!: LlmProviderName;
  model!: string;
  latencyMs!: number;
  usage?: LlmUsage;
}
```

`src/modules/llm-playground/application/interfaces/llm-playground.service.interface.ts`:

```ts
import type { Result } from 'neverthrow';
import type { AppError } from '../../../../shared/common/errorCode';
import type { PlaygroundRunResponseDto } from '../dtos/playground-run.response.dto';
import type { RunPlaygroundRequestDto } from '../dtos/run-playground.request.dto';

export abstract class ILlmPlaygroundService {
  abstract runAsync(
    request: RunPlaygroundRequestDto,
  ): Promise<Result<PlaygroundRunResponseDto, AppError>>;
}
```

- [ ] **Step 5: Implement the service and the guard**

`src/modules/llm-playground/application/services/llm-playground.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import {
  LLM_PROVIDER_LOOKUP,
  type LlmProviderLookup,
} from '../../../../shared/llm/llm.constants';
import { ILlmProvider } from '../../../../shared/llm/llm.provider';
import type { LlmResultMeta } from '../../../../shared/llm/llm.types';
import type { PlaygroundRunResponseDto } from '../dtos/playground-run.response.dto';
import {
  PlaygroundMode,
  PlaygroundProvider,
  RunPlaygroundRequestDto,
} from '../dtos/run-playground.request.dto';
import { ILlmPlaygroundService } from '../interfaces/llm-playground.service.interface';

@Injectable()
export class LlmPlaygroundService implements ILlmPlaygroundService {
  constructor(
    private readonly defaultProvider: ILlmProvider,
    @Inject(LLM_PROVIDER_LOOKUP)
    private readonly providers: LlmProviderLookup,
  ) {}

  async runAsync(
    request: RunPlaygroundRequestDto,
  ): Promise<Result<PlaygroundRunResponseDto, AppError>> {
    const provider = this.pickProvider(request.provider);
    const base = {
      prompt: request.prompt,
      systemPrompt: request.systemPrompt,
      temperature: request.temperature,
    };

    if (request.mode === PlaygroundMode.TEXT) {
      const result = await provider.generateText(base);
      return result.map((value) => this.toResponse(value, value.text));
    }

    const schema = this.parseSchema(request.schema);
    if (schema.isErr()) {
      return err(schema.error);
    }

    const result = await provider.generateJson<unknown>({
      ...base,
      schema: schema.value,
    });
    return result.map((value) =>
      this.toResponse(value, JSON.stringify(value.data, null, 2)),
    );
  }

  private pickProvider(selected: PlaygroundProvider): ILlmProvider {
    switch (selected) {
      case PlaygroundProvider.GEMINI:
        return this.providers.gemini;
      case PlaygroundProvider.GROQ:
        return this.providers.groq;
      default:
        return this.defaultProvider;
    }
  }

  private parseSchema(
    raw: string | undefined,
  ): Result<Record<string, unknown>, AppError> {
    if (raw === undefined || raw.trim() === '') {
      return err(
        new AppError(
          ErrorCode.BadRequest,
          'A JSON schema is required in JSON mode',
        ),
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return err(
        new AppError(ErrorCode.BadRequest, 'The schema is not valid JSON'),
      );
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return err(
        new AppError(ErrorCode.BadRequest, 'The schema must be a JSON object'),
      );
    }

    return ok(parsed as Record<string, unknown>);
  }

  private toResponse(
    meta: LlmResultMeta,
    output: string,
  ): PlaygroundRunResponseDto {
    return {
      output,
      provider: meta.provider,
      model: meta.model,
      latencyMs: meta.latencyMs,
      usage: meta.usage,
    };
  }
}
```

`src/modules/llm-playground/api/llm-playground-enabled.guard.ts`:

```ts
import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Hides the playground (responds 404) unless ENABLE_LLM_PLAYGROUND=true, so a
 * deployed server does not expose a route that spends AI quota.
 */
@Injectable()
export class LlmPlaygroundEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (this.config.get<string>('ENABLE_LLM_PLAYGROUND') !== 'true') {
      throw new NotFoundException();
    }
    return true;
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx jest src/modules/llm-playground`
Expected: PASS (3 suites).

- [ ] **Step 7: Lint, type-check and commit**

```bash
npx eslint src/modules/llm-playground --fix
npx tsc --noEmit -p tsconfig.json
git add src/modules/llm-playground
git commit -m "feat(llm-playground): add playground service, DTOs and guard" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Playground controller, HTML page, module wiring and e2e

**Files:**

- Create: `src/modules/llm-playground/api/llm-playground.page.ts`
- Create: `src/modules/llm-playground/api/llm-playground.controller.ts`
- Create: `src/modules/llm-playground/llm-playground.module.ts`
- Modify: `src/app.module.ts` (import `LlmPlaygroundModule`)
- Test: `test/llm-playground.e2e-spec.ts`

**Interfaces:**

- Consumes: `ILlmPlaygroundService`, `LlmPlaygroundService`, `LlmPlaygroundEnabledGuard`, DTOs (Task 5); `LlmModule`, `ILlmProvider`, `LLM_PROVIDER_LOOKUP` (Task 4); `toHttpException`, `ApiSuccessResponse`.
- Produces: `LlmPlaygroundController` with `GET /api/internal/llm-playground` (HTML) and `POST /api/internal/llm-playground/run`; `LLM_PLAYGROUND_HTML: string`; `LlmPlaygroundModule`.

- [ ] **Step 1: Write the failing e2e test**

`test/llm-playground.e2e-spec.ts`:

```ts
import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { err, ok } from 'neverthrow';
import request from 'supertest';
import type { App } from 'supertest/types';
import { LlmPlaygroundController } from '../src/modules/llm-playground/api/llm-playground.controller';
import { LlmPlaygroundEnabledGuard } from '../src/modules/llm-playground/api/llm-playground-enabled.guard';
import { ILlmPlaygroundService } from '../src/modules/llm-playground/application/interfaces/llm-playground.service.interface';
import { LlmPlaygroundService } from '../src/modules/llm-playground/application/services/llm-playground.service';
import { AllExceptionsFilter } from '../src/shared/common/exceptions.filter';
import { AppError, ErrorCode } from '../src/shared/common/errorCode';
import { mapValidationErrors } from '../src/shared/common/validation-error.mapper';
import { LLM_PROVIDER_LOOKUP } from '../src/shared/llm/llm.constants';
import { ILlmProvider } from '../src/shared/llm/llm.provider';

describe('LlmPlaygroundController (e2e)', () => {
  let app: INestApplication<App> | undefined;
  const generateText = jest.fn();
  const generateJson = jest.fn();
  const fakeProvider = { generateText, generateJson } as unknown as ILlmProvider;
  const route = '/api/internal/llm-playground';

  async function createApp(enabled: boolean): Promise<INestApplication<App>> {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ ENABLE_LLM_PLAYGROUND: enabled ? 'true' : 'false' })],
        }),
      ],
      controllers: [LlmPlaygroundController],
      providers: [
        LlmPlaygroundEnabledGuard,
        { provide: ILlmPlaygroundService, useClass: LlmPlaygroundService },
        { provide: ILlmProvider, useValue: fakeProvider },
        {
          provide: LLM_PROVIDER_LOOKUP,
          useValue: { gemini: fakeProvider, groq: fakeProvider },
        },
      ],
    }).compile();

    const nestApp = moduleRef.createNestApplication<INestApplication<App>>();
    nestApp.useGlobalFilters(new AllExceptionsFilter());
    nestApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        exceptionFactory: (errors) =>
          new BadRequestException({
            code: ErrorCode.BadRequest,
            message: 'Request validation failed',
            errors: mapValidationErrors(errors),
          }),
      }),
    );
    await nestApp.init();
    return nestApp;
  }

  beforeEach(() => {
    generateText.mockReset();
    generateJson.mockReset();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  describe('when the playground is disabled', () => {
    beforeEach(async () => {
      app = await createApp(false);
    });

    it('GET responds 404', async () => {
      await request(app!.getHttpServer()).get(route).expect(404);
    });

    it('POST responds 404 even for an invalid body and never calls a vendor', async () => {
      await request(app!.getHttpServer())
        .post(`${route}/run`)
        .send({})
        .expect(404);

      expect(generateText).not.toHaveBeenCalled();
    });
  });

  describe('when the playground is enabled', () => {
    beforeEach(async () => {
      app = await createApp(true);
    });

    it('GET serves the HTML page', async () => {
      const response = await request(app!.getHttpServer())
        .get(route)
        .expect(200)
        .expect('Content-Type', /text\/html/);

      expect(response.text).toContain('<title>LLM Prompt Playground</title>');
      expect(response.text).toContain('/api/internal/llm-playground/run');
    });

    it('POST runs a text prompt and wraps the result in ApiSuccessResponse', async () => {
      generateText.mockResolvedValue(
        ok({ text: 'hi there', provider: 'groq', model: 'm', latencyMs: 9 }),
      );

      const response = await request(app!.getHttpServer())
        .post(`${route}/run`)
        .send({ mode: 'text', provider: 'default', prompt: 'hello' })
        .expect(200);

      expect(response.body).toMatchObject({
        statusCode: 200,
        success: true,
        data: { output: 'hi there', provider: 'groq', model: 'm' },
      });
    });

    it('POST rejects an empty prompt with 400 before any vendor call', async () => {
      await request(app!.getHttpServer())
        .post(`${route}/run`)
        .send({ mode: 'text', provider: 'default', prompt: '' })
        .expect(400);

      expect(generateText).not.toHaveBeenCalled();
    });

    it('POST rejects an oversized prompt with 400 before any vendor call', async () => {
      await request(app!.getHttpServer())
        .post(`${route}/run`)
        .send({ mode: 'text', provider: 'default', prompt: 'a'.repeat(8001) })
        .expect(400);

      expect(generateText).not.toHaveBeenCalled();
    });

    it('POST in JSON mode without a schema responds 400', async () => {
      await request(app!.getHttpServer())
        .post(`${route}/run`)
        .send({ mode: 'json', provider: 'default', prompt: 'hello' })
        .expect(400);

      expect(generateJson).not.toHaveBeenCalled();
    });

    it('POST maps a vendor failure to the error envelope without leaking causes', async () => {
      generateText.mockResolvedValue(
        err(
          new AppError(
            ErrorCode.InternalServerError,
            'AI service is temporarily unavailable',
          ),
        ),
      );

      const response = await request(app!.getHttpServer())
        .post(`${route}/run`)
        .send({ mode: 'text', provider: 'default', prompt: 'hello' })
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'AI service is temporarily unavailable',
      });
    });
  });
});
```

- [ ] **Step 2: Run the e2e test to verify it fails**

Run: `npx jest --config ./test/jest-e2e.json test/llm-playground.e2e-spec.ts`
Expected: FAIL, `Cannot find module '../src/modules/llm-playground/api/llm-playground.controller'`.

- [ ] **Step 3: Create the HTML page**

`src/modules/llm-playground/api/llm-playground.page.ts` (the page's JavaScript deliberately uses no backticks, `${` or backslash escapes, because the whole page lives inside a template literal):

```ts
export const LLM_PLAYGROUND_HTML = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>LLM Prompt Playground</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #f5f6f8; color: #1b1f24; }
  main { max-width: 960px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 22px; margin: 8px 0 12px; }
  .warn { background: #fff4ce; border: 1px solid #e5c75b; padding: 8px 12px; border-radius: 6px; font-size: 14px; }
  label { display: block; font-weight: 600; margin: 12px 0 4px; }
  textarea, select, input { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #c5cad1; border-radius: 6px; font: inherit; }
  textarea { min-height: 110px; font-family: ui-monospace, monospace; }
  .row { display: flex; gap: 12px; flex-wrap: wrap; }
  .row > div { flex: 1; min-width: 180px; }
  button { margin-top: 16px; padding: 10px 18px; border: 0; border-radius: 6px; background: #2457d6; color: #fff; font: inherit; cursor: pointer; }
  button:disabled { opacity: 0.6; cursor: wait; }
  .results { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; margin-top: 16px; }
  .card { background: #fff; border: 1px solid #d9dde3; border-radius: 8px; padding: 12px; }
  .meta { font-size: 13px; color: #4a5260; margin: 4px 0 8px; }
  pre { white-space: pre-wrap; word-break: break-word; margin: 0; }
  .error { color: #b3261e; }
  [hidden] { display: none; }
</style>
</head>
<body>
<main>
  <h1>LLM Prompt Playground</h1>
  <div class="warn">Internal tool. Every run spends real AI quota. Enabled only while ENABLE_LLM_PLAYGROUND=true.</div>

  <div class="row">
    <div>
      <label for="mode">Mode</label>
      <select id="mode">
        <option value="text">Text</option>
        <option value="json">JSON</option>
      </select>
    </div>
    <div>
      <label for="provider">Provider</label>
      <select id="provider">
        <option value="default">Default (primary + fallback)</option>
        <option value="gemini">Gemini</option>
        <option value="groq">Groq</option>
        <option value="both">Compare Gemini and Groq</option>
      </select>
    </div>
    <div>
      <label for="temperature">Temperature (0 - 2, optional)</label>
      <input id="temperature" type="number" min="0" max="2" step="0.1" />
    </div>
  </div>

  <label for="system">System prompt (optional)</label>
  <textarea id="system"></textarea>

  <label for="prompt">Prompt</label>
  <textarea id="prompt" placeholder="Viết 3 câu hỏi phỏng vấn Java cho fresher"></textarea>

  <div id="schemaWrap" hidden>
    <label for="schema">JSON Schema</label>
    <textarea id="schema">{"type":"object","properties":{"questions":{"type":"array","items":{"type":"string"}}},"required":["questions"]}</textarea>
  </div>

  <button id="run" type="button">Run</button>
  <div class="results" id="results"></div>
</main>
<script>
  var modeEl = document.getElementById('mode');
  var providerEl = document.getElementById('provider');
  var runEl = document.getElementById('run');
  var resultsEl = document.getElementById('results');
  var RUN_URL = '/api/internal/llm-playground/run';

  modeEl.addEventListener('change', function () {
    document.getElementById('schemaWrap').hidden = modeEl.value !== 'json';
  });

  function errorMessage(json, status) {
    if (json && Array.isArray(json.errors) && json.errors.length > 0) {
      return json.errors.map(function (e) { return e.field + ': ' + e.messages.join(', '); }).join('; ');
    }
    return (json && json.message) || ('HTTP ' + status);
  }

  async function runOnce(provider) {
    var body = { mode: modeEl.value, provider: provider, prompt: document.getElementById('prompt').value };
    var system = document.getElementById('system').value;
    if (system) { body.systemPrompt = system; }
    if (modeEl.value === 'json') { body.schema = document.getElementById('schema').value; }
    var temperature = document.getElementById('temperature').value;
    if (temperature !== '') { body.temperature = Number(temperature); }

    var response = await fetch(RUN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var json = await response.json().catch(function () { return null; });
    if (!response.ok) { throw new Error(errorMessage(json, response.status)); }
    return json.data;
  }

  function renderCard(title, data, errorText) {
    var card = document.createElement('div');
    card.className = 'card';
    var heading = document.createElement('strong');
    heading.textContent = title;
    var meta = document.createElement('div');
    meta.className = 'meta';
    var output = document.createElement('pre');
    if (errorText) {
      output.className = 'error';
      output.textContent = errorText;
    } else {
      var tokens = data.usage ? ' | tokens in/out: ' + data.usage.inputTokens + '/' + data.usage.outputTokens : '';
      meta.textContent = 'answered by: ' + data.provider + ' | model: ' + data.model + ' | ' + data.latencyMs + ' ms' + tokens;
      output.textContent = data.output;
    }
    card.appendChild(heading);
    card.appendChild(meta);
    card.appendChild(output);
    resultsEl.appendChild(card);
  }

  runEl.addEventListener('click', async function () {
    var choice = providerEl.value;
    var targets = choice === 'both' ? ['gemini', 'groq'] : [choice];
    runEl.disabled = true;
    resultsEl.textContent = '';
    var settled = await Promise.allSettled(targets.map(runOnce));
    settled.forEach(function (outcome, index) {
      if (outcome.status === 'fulfilled') {
        renderCard(targets[index], outcome.value, null);
      } else {
        renderCard(targets[index], null, outcome.reason.message);
      }
    });
    runEl.disabled = false;
  });
</script>
</body>
</html>
`;
```

- [ ] **Step 4: Create the controller and the module**

`src/modules/llm-playground/api/llm-playground.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { toHttpException } from '../../../shared/common/app-error.mapper';
import { ApiSuccessResponse } from '../../../shared/response/apiResponse';
import { PlaygroundRunResponseDto } from '../application/dtos/playground-run.response.dto';
import { RunPlaygroundRequestDto } from '../application/dtos/run-playground.request.dto';
import { ILlmPlaygroundService } from '../application/interfaces/llm-playground.service.interface';
import { LlmPlaygroundEnabledGuard } from './llm-playground-enabled.guard';
import { LLM_PLAYGROUND_HTML } from './llm-playground.page';

@ApiTags('llm-playground')
@Controller('api/internal/llm-playground')
@UseGuards(LlmPlaygroundEnabledGuard)
export class LlmPlaygroundController {
  constructor(private readonly playgroundService: ILlmPlaygroundService) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Internal prompt playground page (dev only)' })
  getPage(): string {
    return LLM_PLAYGROUND_HTML;
  }

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run a prompt against an LLM provider (dev only)' })
  async run(
    @Body() request: RunPlaygroundRequestDto,
  ): Promise<ApiSuccessResponse<PlaygroundRunResponseDto>> {
    const result = await this.playgroundService.runAsync(request);

    return result.match(
      (data) =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          data,
          'Prompt executed successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }
}
```

`src/modules/llm-playground/llm-playground.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { LlmModule } from '../../shared/llm/llm.module';
import { LlmPlaygroundController } from './api/llm-playground.controller';
import { LlmPlaygroundEnabledGuard } from './api/llm-playground-enabled.guard';
import { ILlmPlaygroundService } from './application/interfaces/llm-playground.service.interface';
import { LlmPlaygroundService } from './application/services/llm-playground.service';

@Module({
  imports: [LlmModule],
  controllers: [LlmPlaygroundController],
  providers: [
    LlmPlaygroundEnabledGuard,
    { provide: ILlmPlaygroundService, useClass: LlmPlaygroundService },
  ],
})
export class LlmPlaygroundModule {}
```

- [ ] **Step 5: Register the module in the app**

Modify `src/app.module.ts`: add the import line after the `ScoringModule` import and add `LlmPlaygroundModule` to the `imports` array after `ScoringModule`.

```ts
import { LlmPlaygroundModule } from './modules/llm-playground/llm-playground.module';
```

```ts
    ScoringModule,
    LlmPlaygroundModule,
  ],
```

- [ ] **Step 6: Run the e2e test to verify it passes**

Run: `npx jest --config ./test/jest-e2e.json test/llm-playground.e2e-spec.ts`
Expected: PASS (8 tests).

- [ ] **Step 7: Lint, build and commit**

```bash
npx eslint src/modules/llm-playground src/app.module.ts test/llm-playground.e2e-spec.ts --fix
npm run build
git add src/modules/llm-playground src/app.module.ts test/llm-playground.e2e-spec.ts
git commit -m "feat(llm-playground): add playground page, endpoint and module" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Full verification and manual smoke test

**Files:** none created (verification only; fix anything that fails in the task that owns it).

- [ ] **Step 1: Run the full quality gate**

Run: `npm run lint` then `npm run build` then `npm test` then `npm run test:e2e`
Expected: all pass. Compare e2e against the baseline from Task 1 Step 1: any suite that already failed before this work (for example one needing a database) is unrelated; report it, do not fix it.

- [ ] **Step 2: Confirm the lint run touched nothing unrelated**

Run: `git status --short`
Expected: clean working tree (everything already committed). If `npm run lint` auto-fixed files outside `src/shared/llm`, `src/modules/llm-playground`, `src/app.module.ts`, `test/llm-playground.e2e-spec.ts`, revert those unrelated edits with `git checkout -- <file>`.

- [ ] **Step 3: Manual smoke test of the real providers (needs real API keys, optional)**

1. Put real `GEMINI_API_KEY` and `GROQ_API_KEY` in your local `.env` (never commit it) and set `ENABLE_LLM_PLAYGROUND=true`.
2. Run `npm run start:dev` and open `http://localhost:3000/api/internal/llm-playground`.
3. Check, in order: Text mode on Gemini; Text mode on Groq; JSON mode on each with the pre-filled schema; "Compare Gemini and Groq".
4. Fallback check: set `GEMINI_API_KEY` to an invalid value, keep `LLM_PRIMARY_PROVIDER=gemini`, restart, run with provider "Default". Expected: the card shows `answered by: groq`.
5. Set `ENABLE_LLM_PLAYGROUND=false`, restart. Expected: the page URL returns 404.

- [ ] **Step 4: Report**

State which commands were run and their results (including any pre-existing failures), whether the smoke test was done, and that nothing was pushed.
