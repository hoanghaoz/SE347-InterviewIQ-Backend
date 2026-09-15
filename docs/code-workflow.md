# Backend Code Workflow

This document defines the standard development workflow for the backend. Run
all commands from the repository root.

## Engineering Baseline

- Use Node.js 24, matching the version used by CI.
- Use `npm ci` for a reproducible install from `package-lock.json`.
- Never commit `.env`, credentials, access keys, or production data.
- Do not push directly to `main`. All changes go through a reviewed pull
  request.
- Keep each branch and pull request focused on one feature, fix, or maintenance
  task.

## First-Time Setup

### 1. Install prerequisites

Install Node.js 24, npm, Docker, and access to a PostgreSQL instance. Docker
must be running because the environment doctor verifies the Docker daemon.

Confirm the local toolchain:

```bash
node --version
npm --version
docker info
```

### 2. Install dependencies

```bash
npm ci
```

Use `npm install` only when intentionally adding, removing, or updating a
dependency. Commit both `package.json` and `package-lock.json` when the
dependency graph changes.

### 3. Configure the environment

```bash
cp .env.example .env
```

Populate `.env` with local or approved development credentials. The doctor
requires these variables:

| Variable                       | Purpose                                  |
| ------------------------------ | ---------------------------------------- |
| `DATABASE_URL`                 | Application PostgreSQL connection string |
| `JWT_SECRET`                   | JWT signing secret                       |
| `S3_BUCKET_NAME`               | Object storage bucket                    |
| `CLOUDFLARE_ACCESS_KEY_ID`     | Object storage access key ID             |
| `CLOUDFLARE_SECRET_ACCESS_KEY` | Object storage secret access key         |
| `S3_API_ENDPOINT`              | S3-compatible API endpoint               |

Set `DIRECT_URL` when migrations need a direct database connection. Do not use
production secrets in a local environment or include secret values in logs,
issues, commits, or pull requests.

### 4. Validate the workstation

```bash
npm run doctor
```

The command exits with a non-zero status when `.env` is missing, Docker is not
available, or a required variable is empty. Resolve every failure before
starting the application.

### 5. Generate the Prisma client and verify the build

```bash
npx prisma generate
npm run build
npm run start:dev
```

The API starts at `http://localhost:3000`; Swagger is available at
`http://localhost:3000/docs`.

## Starting a Change

Start from an up-to-date `main` branch and use the branch naming rules in
[`naming-convention.md`](./naming-convention.md).

```bash
git switch main
git pull --ff-only origin main
git switch -c <type>/<module-name>
```

Before coding:

- Read the ticket and write down acceptance criteria.
- Identify API, domain, persistence, migration, authorization, and observability
  impact.
- Confirm whether the change needs backward compatibility or a rollout plan.
- Keep unrelated refactors out of the branch.

## Creating a Feature Module

Generate the standard module structure with a kebab-case name:

```bash
npm run scaffold -- <module-name>
```

Example:

```bash
npm run scaffold -- interview-session
```

The generator creates the module under `src/modules/<module-name>` and attempts
to register it in `src/app.module.ts`. Review all generated files and the
`AppModule` diff before continuing. If automatic registration cannot be done
safely, the CLI prints the exact manual steps and leaves `AppModule` unchanged.

Generated files are intentionally minimal. Complete the implementation in this
order:

1. Define domain entities, invariants, errors, and repository contracts.
2. Define request/response DTOs and application service contracts.
3. Implement application services and infrastructure repositories.
4. Implement controllers, validation, authorization, and module providers.
5. Add or update the Prisma schema and tests.

Follow [`backend-architecture.md`](./backend-architecture.md),
[`backend-code-style.md`](./backend-code-style.md), and
[`naming-convention.md`](./naming-convention.md). Do not treat generated code as
production-ready until its contracts, providers, validation, errors, and tests
are complete.

## Database Changes

For an intentional schema change, create a named development migration:

```bash
npx prisma format
npx prisma migrate dev --name <descriptive-migration-name>
npx prisma generate
```

Review the generated SQL before committing it. A migration must be forward-safe
for existing data; destructive or irreversible changes require an explicit data
migration and rollback plan. Never edit an already-applied shared migration.

## Local Quality Gates

Run the checks that match the change. Before opening a pull request, the default
full verification is:

```bash
npm run format
npm run lint
npm run test
npm run test:e2e
npm run build
```

At minimum:

| Change                                | Required verification                                             |
| ------------------------------------- | ----------------------------------------------------------------- |
| Documentation only                    | Review links, commands, and rendered Markdown                     |
| Narrow behavior change                | Targeted tests, lint, and build                                   |
| Shared/auth/database/bootstrap change | Unit tests, end-to-end tests, lint, and build                     |
| Dependency change                     | Clean install with `npm ci`, tests, lint, build, and audit review |

Lint currently uses `--fix`; inspect the resulting diff before committing. Git
hooks run lint on pre-commit, build on pre-push, and commitlint on commit
messages. Hooks are safeguards, not substitutes for running the full checks.

## Commit and Pull Request

Use the format documented in
[`conventional-commit.md`](./conventional-commit.md):

```text
<type>(<scope>): <short-description>
```

Before opening a pull request:

1. Rebase or merge the latest target branch according to team policy and
   resolve conflicts locally.
2. Review the complete diff for secrets, generated noise, debug logging, and
   unrelated changes.
3. Confirm migrations and API contract changes are documented.
4. Record the verification commands and results in the pull request.
5. Request the owners defined by `.github/CODEOWNERS` and wait for CI and
   required reviews.

The current CI workflow runs `npm ci`, Prisma generation, lint, and build on
pushes and pull requests targeting `develop` or `main`. Run tests locally until
they are also enforced by CI.

## Troubleshooting

| Symptom                              | Resolution                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `npm run doctor` reports `.env file` | Create `.env` from `.env.example`.                                                  |
| Docker check fails                   | Start Docker and confirm `docker info` succeeds.                                    |
| Environment variable check fails     | Add every reported key to `.env` with an approved non-empty value.                  |
| Prisma client module cannot be found | Run `npx prisma generate`.                                                          |
| Scaffold says the module exists      | Choose a new name or modify the existing module; do not overwrite it.               |
| Scaffold cannot register the module  | Follow the printed import and `AppModule.imports` instructions, then run the build. |
| Install differs from CI              | Remove the cause of lockfile drift and run `npm ci` using Node.js 24.               |

Do not use `npm audit fix --force` as a routine repair: it may introduce breaking
upgrades. Triage audit findings, determine whether the vulnerable path is used
in production, and update dependencies through a reviewed change.
