# LLM Provider Abstraction and Prompt Playground — Design

Date: 2026-10-11
Branch: `feat/question-generation`
Status: awaiting review

## 1. Goal

Create a provider-agnostic LLM layer in `src/shared/llm` so business modules (question generation, scoring) depend only on the abstract class `ILlmProvider`. `GeminiProvider` and `GroqProvider` implement it. The active provider is chosen through NestJS DI and environment configuration, so switching vendors never touches business logic. An internal HTML page lets developers try prompts against the providers.

### Confirmed decisions

| Topic | Decision |
|---|---|
| Contract operations | `generateText` and `generateJson`. No streaming. |
| Provider selection | `LLM_PRIMARY_PROVIDER` in `.env`, plus automatic fallback to the other provider when the primary fails (demo resilience). |
| Playground | HTML page served by the backend. Enabled only by `ENABLE_LLM_PLAYGROUND=true`; no login required. |
| Provider integration | Official SDKs: `@google/genai` (Gemini) and `groq-sdk` (Groq). |
| Contract name | `ILlmProvider` (repo convention: abstract contracts use an `I` prefix). |

### Out of scope

Streaming; question-generation prompts and logic; wiring the scoring worker (its `ILlmProvider` comment is used by a later task); database changes; authentication on the playground.

## 2. Structure

```
src/shared/llm/
├── llm.provider.ts            # abstract class ILlmProvider
├── llm.types.ts               # request/response types
├── gemini.provider.ts         # wraps @google/genai
├── groq.provider.ts           # wraps groq-sdk
├── fallback-llm.provider.ts   # implements ILlmProvider; wraps primary + secondary
└── llm.module.ts              # DI wiring

src/modules/llm-playground/
├── api/                       # controller, enabled-guard, HTML page
├── application/               # service interface, service, DTOs
└── llm-playground.module.ts
```

Dependencies point inward as in `docs/backend-architecture.md`. The playground controller calls an application service; the service depends on contracts.

## 3. Contract

```ts
export abstract class ILlmProvider {
  abstract generateText(
    request: LlmTextRequest,
  ): Promise<Result<LlmTextResult, AppError>>;

  abstract generateJson<T>(
    request: LlmJsonRequest,
  ): Promise<Result<LlmJsonResult<T>, AppError>>;
}
```

- `LlmTextRequest`: `prompt`, `systemPrompt?`, `temperature?`, `maxOutputTokens?`.
- `LlmJsonRequest`: the same fields plus `schema` (JSON Schema describing the wanted shape).
- Results carry the payload (`text` or `data`) plus `provider`, `model`, `latencyMs`, and `usage` (`inputTokens`, `outputTokens`) when the vendor reports it. `provider` names the vendor that actually answered, which makes fallback visible.
- Failures are returned as `err(new AppError(...))`; the layer never throws Nest exceptions.

### JSON guarantees

- Guaranteed: syntactically valid JSON. If the model returns invalid JSON, the provider retries once, then returns an error.
- Not guaranteed: conformance to every field of the schema. The schema is passed to the model (native JSON mode where supported). Callers validate the shape with `class-validator`, like any other DTO. No JSON-schema validation library is added.

## 4. Configuration and DI

New variables in `.env.example` (no real values):

| Variable | Meaning | Default |
|---|---|---|
| `LLM_PRIMARY_PROVIDER` | `gemini` or `groq` | `gemini` |
| `GEMINI_API_KEY`, `GROQ_API_KEY` | API keys | empty |
| `GEMINI_MODEL` | Gemini model | `gemini-2.5-flash` |
| `GROQ_MODEL` | Groq model | `llama-3.3-70b-versatile` |
| `LLM_TIMEOUT_MS` | per-call timeout | `30000` |
| `ENABLE_LLM_PLAYGROUND` | enable the playground | `false` |

`LlmModule` provides `GeminiProvider` and `GroqProvider`, and binds the token with a factory:

```ts
{
  provide: ILlmProvider,
  useFactory: (config, gemini, groq) =>
    new FallbackLlmProvider(primary, secondary), // ordered by LLM_PRIMARY_PROVIDER
  inject: [ConfigService, GeminiProvider, GroqProvider],
}
```

The module exports `ILlmProvider` and a lookup `{ gemini, groq }` that only the playground uses to target a specific vendor. Business modules import `LlmModule` and inject `ILlmProvider`.

### Missing API keys

The app never fails at startup because of a missing key (CI and e2e run without keys). It logs a warning at startup. A provider without a key returns an error when called. With a key for only one vendor, that vendor runs without fallback.

## 5. Fallback behavior

`FallbackLlmProvider` calls the primary. If the primary returns an error other than `BadRequest` (quota, timeout, network, 5xx), it calls the secondary. `BadRequest` is not retried elsewhere because another vendor cannot fix an invalid request. If both fail, it returns `AppError(InternalServerError, 'AI service is temporarily unavailable')`. The real causes are logged through `Logger` and never exposed in responses, per `docs/api-response-convention.md`.

## 6. Prompt playground

- `GET /api/internal/llm-playground` returns a single static HTML page (vanilla JS). Controls: prompt, system prompt, mode (Text / JSON, with a schema box), provider (Default / Gemini / Groq / Compare both). "Compare both" calls both vendors and shows results side by side.
- `POST /api/internal/llm-playground/run` takes a validated DTO (`class-validator`, prompt length capped to protect quota) and returns `ApiSuccessResponse` containing output, provider, model, latency, and usage.
- A guard checks `ENABLE_LLM_PLAYGROUND`; when disabled, both routes respond `404`.
- The HTML lives in a `.ts` file as a string so no `nest-cli.json` asset configuration is needed.
- The page shows a notice that every run consumes real AI quota.

## 7. Testing

Jest, with no real AI calls. Unit specs sit beside the source.

- `FallbackLlmProvider`: primary succeeds; primary fails then secondary answers; `BadRequest` is not retried; both fail returns the generic error without leaking causes.
- `GeminiProvider` / `GroqProvider` (SDK mocked): text success; valid JSON; invalid JSON retried once then error; quota and timeout mapping; missing key.
- `LlmModule` factory picks the primary from `LLM_PRIMARY_PROVIDER`.
- Playground: guard returns 404 when disabled; service behavior; e2e (`*.e2e-spec.ts`) confirms 404 by default and a working run with `ILlmProvider` overridden by a fake.

Because `app.module.ts` changes, `npm run lint`, `npm run build`, `npm test`, and `npm run test:e2e` must all pass.

## 8. Review focus (edge cases to cover)

1. Primary provider has no key but secondary does: fallback answers; the result's `provider` shows the secondary.
2. The model wraps JSON in markdown code fences: parsed correctly, or retried once.
3. Empty prompt or oversized prompt: rejected by validation before any vendor call.
4. Provider call exceeds `LLM_TIMEOUT_MS`: treated as a failure that triggers fallback.
5. `LLM_PRIMARY_PROVIDER` set to an unknown value: falls back to `gemini` with a logged warning rather than crashing.

## 9. Dependencies and risks

- Adds `@google/genai` and `groq-sdk` (installed only after spec and plan approval).
- The contract's `provider` and `model` fields let scoring fill `scoringModel` later without changing the interface.
