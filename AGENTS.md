# Repository Guidelines

## Project Structure & Module Organization

Features live in `src/modules/<feature>/`, divided into `api/`, `application/`, `domain/`, and `infrastructure/`. Shared utilities live in `src/shared/`; Prisma files are under `prisma/`. Unit tests sit beside source files; e2e tests live in `test/`. Read `docs/backend-architecture.md` before adding a module.

Dependencies must point inward: API to application to domain. Infrastructure implements domain contracts. Controllers and application services must not access Prisma directly.

## Build, Test, and Development Commands

- `npm ci`: install locked dependencies with Node.js 24.
- `npm run doctor`: verify the local environment.
- `npx prisma generate`: regenerate the Prisma client.
- `npm run start:dev`: run the API with watch mode; Swagger is at `/docs`.
- `npm run build`: compile the NestJS application.
- `npm run lint` / `npm run format`: lint and format TypeScript; inspect fixes.
- `npm test`, `npm run test:e2e`, `npm run test:cov`: run test suites.

## Coding Style & Naming Conventions

Use TypeScript, two-space indentation, and Prettier defaults. Keep controllers thin. Use `Result<T, AppError>` for expected failures; throw Nest exceptions only in the API layer. Async service methods end in `Async`; repository methods use PascalCase (`GetUserByEmail`); abstract contracts use an `I` prefix. Use kebab-case module directories and validate inputs with `class-validator`.

## API Response Contract

All successful endpoints must return `ApiSuccessResponse<T>` from `src/shared/response/apiResponse.ts`, for example `new ApiSuccessResponse(HttpStatus.OK, dto, 'Room retrieved successfully')`. Do not handcraft response envelopes.

Services return `Result<T, AppError>`. Controllers convert failures with `toHttpException(error)`; they must not create `ApiErrorResponse` directly. `AllExceptionsFilter` owns the final error shape: `statusCode`, `success`, `code`, `message`, optional `errors`, `path`, and `timestamp`. Validation details use `{ field, messages }`. Never expose rejected values, database errors, stack traces, or internal exception messages.

## Testing Guidelines

Use Jest. Name unit tests `<subject>.spec.ts` and e2e tests `*.e2e-spec.ts`. Add focused regression tests. Shared auth, error, database, or bootstrap changes require unit and e2e verification.

## Commit & Pull Request Guidelines

Follow `<type>(<scope>): <description>`, for example `feat(interview-room): add room creation`. Use branches like `feat/interview-room`; never push directly to `main`.

Keep PRs focused. Include purpose, linked issue, API or migration impact, and verification commands. Review for secrets and unrelated edits; wait for CI and reviews.

## Security & Configuration

Copy `.env.example` to `.env`; never commit credentials or production data. Review generated migration SQL and provide a rollback/data-migration plan for destructive schema changes.
