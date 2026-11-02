# Interview question generation design

Date: 2026-10-31. Owner: Hiếu (Luồng 2). Sprint 3 task: "[Module Sinh câu hỏi] Sinh bộ câu hỏi phỏng vấn".

## Goal

After a session is created with a CV and an optional job description (JD), the user calls an API that asks the LLM for N interview questions based on the parsed CV and the JD, stores them in `questions`, and can regenerate them while the session is still `CREATED`. The API is in `docs/api-contract-question-generation.md`. The UI lives in the frontend repository.

## Decisions

- New module `src/modules/question-generation`, layered `api / application / domain / infrastructure`. No change to other modules.
- The CV must already be parsed. If `cvs.parsed_data` is null (or the session has no CV) the API returns 409. There is no fallback to `raw_text` or to the JD alone, because `raw_text` is filled together with `parsed_data` by the same parse step.
- Work targets `main`, which does not have CV parsing yet (it is on `origin/feat/cv-parse`). The module relies only on the shared `CvParsedData` type, so it works unchanged once parsing is merged. Until then the endpoint answers 409 against real data; tests seed `parsed_data` directly.
- Regeneration replaces the whole set. It is allowed only while the session status is `CREATED`.
- Defaults: questions in Vietnamese, `count` 3 to 10 (default 5), JD optional.

## Architecture

```
POST .../questions/generate -> QuestionGenerationController
  -> IQuestionGenerationService.generateAsync
       1. IQuestionGenerationRepository.getGenerationContextAsync(sessionPublicId, userPublicId)
       2. checks: exists (404), status CREATED (409), parsedData present (409)
       3. IQuestionGenerator.generateAsync({ parsedData, jobDescription, count })
       4. IQuestionGenerationRepository.replaceQuestionsAsync(sessionId, questions)
GET  .../questions          -> IQuestionGenerationService.getQuestionsAsync
```

- `IQuestionGenerationRepository` (domain contract, Prisma implementation in infrastructure). The context query joins `interview_sessions` and `cvs` itself. `ICvRepository.authorizeUserCv` is not reused: it needs the CV public id, the session only stores `cv_id`, and that contract is shared with other tracks.
- `IQuestionGenerator` (application contract) is implemented by `LlmQuestionGenerator`, which uses `ILlmProvider.generateJson`, `QuestionPromptBuilder` and `QuestionSetValidator`.
- `replaceQuestionsAsync` runs in one transaction: re-check `status = CREATED`, `deleteMany` for the session, `createMany` the new set. The existing `unique(session_id, order_index)` constraint stays satisfied because old rows are deleted first. No migration.

## Prompt and validation

- System prompt: act as an interviewer; produce exactly N questions; mix `domain` values; difficulty ascends from `EASY` to `HARD`; each question is self-contained and not yes/no; do not invent facts absent from the CV and JD; write in Vietnamese.
- CV and JD are user supplied. They go inside delimited blocks and the prompt states the blocks are data, not instructions.
- Only `summary`, `skills`, `experiences` and `projects` of the CV are sent, plus the JD when present.
- JSON schema: `{ questions: [{ content, domain, difficulty }] }` with enums and `minItems = maxItems = N`.
- `QuestionSetValidator` checks: exactly N items, trimmed `content` of 1 to 500 characters, valid enums, no duplicate `content` (case-insensitive). It assigns `orderIndex` 1..N.
- Invalid output is retried once. A second failure returns 500 with a generic message; model output is never returned to the client.

## Timeout and errors

- Each vendor already has a 30 second timeout (`LLM_TIMEOUT_MS`), and fallback can double it. The generator adds an overall cap `QUESTION_GENERATION_TIMEOUT_MS` (default 45000).
- Retry only on invalid format, not on LLM errors or timeouts.
- Expected failures are `Result<T, AppError>`; the controller converts them with `toHttpException`.

## Testing

- Unit: service branches, validator, prompt builder, generator (retry once, overall timeout), repository (transaction, status re-check).
- E2E (`test/question-generation.e2e-spec.ts`): seeded `parsed_data`, mocked `ILlmProvider`; success, regenerate replaces, 404, 409 (started session), 409 (no parsed CV), GET.
- Verification: `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e`.

## Out of scope

Question bank, regenerating a single question (Sprint 4), rate limiting of AI endpoints (security task, Sprint 6), frontend UI.
