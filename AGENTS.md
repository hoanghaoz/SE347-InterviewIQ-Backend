# Repository Guidelines

## Project Structure & Module Organization

This NestJS backend follows feature-based Clean Architecture. Place features in `src/modules/<feature>/`, divided into `api/`, `application/`, `domain/`, and `infrastructure/`. Shared utilities live in `src/shared/`; Prisma files are under `prisma/`. Unit tests sit beside source files as `*.spec.ts`; end-to-end tests live in `test/`. Read `docs/backend-architecture.md` and `docs/backend-code-style.md` before adding a module.

Dependencies must point inward: API to application to domain. Infrastructure implements domain contracts. Controllers and application services must not access Prisma directly.

## Build, Test, and Development Commands

- `npm ci`: install locked dependencies using Node.js 24.
- `npm run doctor`: verify Docker and environment variables.
- `npx prisma generate`: generate the Prisma client after setup or schema changes.
- `npm run start:dev`: run the API with watch mode; Swagger is at `/docs`.
- `npm run build`: compile the NestJS application.
- `npm run lint`: lint and fix supported issues; inspect the diff afterward.
- `npm run format`: format TypeScript with Prettier.
- `npm test`, `npm run test:e2e`, `npm run test:cov`: run test suites.
- `npm run scaffold -- interview-session`: generate a feature skeleton.

## Coding Style & Naming Conventions

Use TypeScript, two-space indentation, and Prettier defaults. Keep controllers thin and return explicit DTOs. Use `Result<T, AppError>` for expected failures; throw Nest HTTP exceptions only in the API layer. Async service methods end in `Async`; repository methods use PascalCase (`GetUserByEmail`); abstract contracts use an `I` prefix (`IUserRepository`). Use kebab-case for module directories and camelCase for Prisma fields. Validate external input with `class-validator`.

## Testing Guidelines

Jest is the test framework. Name unit tests `<subject>.spec.ts` and e2e tests `*.e2e-spec.ts`. Add focused tests for new behavior and regressions. Shared auth, error handling, database, or bootstrap changes require unit and e2e verification. No fixed coverage threshold is documented.

## Commit & Pull Request Guidelines

History uses Conventional Commit types such as `feat`, `fix`, and `docs`. Follow `<type>(<scope>): <short-description>`, for example `feat(interview-room): add room creation`. Use branches like `feat/interview-room`; never push directly to `main`.

Keep pull requests focused. Include purpose, linked issue, API or migration impact, and commands run. Add screenshots for relevant Swagger or UI changes. Review diffs for secrets and unrelated edits; wait for CI and required reviews.

## Security & Configuration

Copy `.env.example` to `.env`; never commit credentials or production data. Review generated migration SQL and provide a rollback/data-migration plan for destructive schema changes.
