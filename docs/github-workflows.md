# GitHub Actions Workflows

This document describes the workflows currently configured in
[`.github/workflows`](../.github/workflows).
Run local commands from the repository root.

## Workflow Overview

| Workflow         | File                                                    | Trigger                                             | Purpose                                                   |
| ---------------- | ------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| Backend CI       | [`backend_ci.yml`](../.github/workflows/backend_ci.yml) | Pull requests targeting `main` and pushes to `main` | Validate the backend and decide whether to run Docker CI. |
| Docker CI & Push | [`docker_ci.yml`](../.github/workflows/docker_ci.yml)   | Reusable workflow invoked through `workflow_call`   | Build the image and optionally publish it to Docker Hub.  |

Neither workflow defines `workflow_dispatch`, a schedule, or a release trigger.
The backend workflow does not run on pushes to feature branches or pull requests
targeting `develop`.

## Backend CI

The workflow requests `contents: read` and `pull-requests: read` permissions. It
sets `HUSKY=0` to disable Git hooks during CI dependency installation.

Concurrency groups use the pull request number when available, otherwise the Git
ref. A newer run for the same pull request cancels the running older run. Push
runs do not enable cancellation of an in-progress run.

### Jobs and Dependencies

| Job ID          | Display name       | Runner            | Timeout               | Dependencies                                |
| --------------- | ------------------ | ----------------- | --------------------- | ------------------------------------------- |
| `detect-change` | Scan Docker inputs | `ubuntu-latest`   | 5 minutes             | None                                        |
| `ci`            | Backend checks     | `ubuntu-latest`   | 15 minutes            | None                                        |
| `docker`        | Docker             | Reusable workflow | Build job: 20 minutes | Both `ci` and `detect-change` must succeed. |

Change detection and backend checks can run independently. Backend checks run on
every matching event, including documentation-only changes. Change detection
controls the Docker job for pull requests; it does not skip backend checks.

### Change Detection

The `detect-change` job checks out the source and uses `dorny/paths-filter@v3`.
The filter result `backend_code` is exposed as `backend_changed` and matches:

```text
src/**
scripts/**
prisma/**
prisma.config.ts
package.json
package-lock.json
tsconfig*.json
nest-cli.json
Dockerfile
.dockerignore
.github/workflows/backend_ci.yml
.github/workflows/docker_ci.yml
monitoring/**
```

Changes limited to `docs/**`, `README.md`, or `test/**` do not match this filter.
For such a pull request, backend checks still run but Docker CI is skipped. Any
successful push run on `main` invokes Docker CI regardless of the filter result.

### Backend Check Sequence

The `ci` job executes these steps in order:

1. Check out the source with `actions/checkout@v4`.
2. Set up Node.js 24 with `actions/setup-node@v6` and npm caching.
3. Print the Node.js and npm versions.
4. Install locked dependencies with `npm ci`.
5. Validate the Prisma schema with `npx prisma validate`.
6. Generate the Prisma client with `npx prisma generate`.
7. Run ESLint without automatic fixes using `npm run lint:check`.
8. Download and run `actionlint` to validate GitHub Actions workflows. Errors are
   formatted as GitHub annotations; ShellCheck diagnostic `SC2016` is ignored.
9. Run unit tests with `npm test -- --ci --runInBand`.
10. Compile the application with `npm run build`.
11. Validate Compose configuration with `docker compose -f compose.yml config --quiet`.

For Compose validation, the runner creates a temporary `.env` containing CI-only
values for `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `REDIS_PASSWORD`,
and `REDIS_PORT`. This step validates configuration without starting services.
The file is excluded from the Docker build context by `.dockerignore`.

The active backend checks do not start PostgreSQL or Redis, apply migrations,
seed a database, run e2e tests, run performance tests, or enforce a coverage
threshold. Prisma validation and generation use the configuration in
[`prisma.config.ts`](../prisma.config.ts); they do not verify database connectivity.

### Disabled Integration Job

The `integration` job is commented out. Its planned sequence includes a
`pgvector/pgvector:pg15` service, separate seed and performance databases,
migration deployment, `npm run test:seed -- --ci`, and
`npm run test:perf -- --ci`.

These steps provide no current CI coverage. The workflow comment instructs
maintainers to re-enable the job when the seed/performance test suites exist and
restore `integration` in the Docker job's `needs` list.

## Docker CI & Push

The reusable workflow requests `contents: read`. Its `build-and-push` job runs on
`ubuntu-latest` with a 20-minute timeout.

### Invocation and Publication Rules

| Event in Backend CI                                   | Docker job                | Publish input | Result                                   |
| ----------------------------------------------------- | ------------------------- | ------------- | ---------------------------------------- |
| Pull request to `main` with matching Docker inputs    | Runs after checks succeed | `false`       | Build only; no Docker Hub login or push. |
| Pull request to `main` without matching Docker inputs | Skipped                   | Not passed    | Backend checks only.                     |
| Push to `main`                                        | Runs after checks succeed | `true`        | Build and publish to Docker Hub.         |

The reusable workflow requires a boolean `publish` input. Login, image metadata
generation, and pushing additionally require that the original event is a push
and its ref is `refs/heads/main`. Setting `publish: true` on another event does
not satisfy those publication conditions.

### Build and Image Tags

The Docker job checks out the source and initializes Buildx with
`docker/setup-buildx-action@v3`. When publication is enabled, it logs into Docker
Hub with `docker/login-action@v3` and compares `GITHUB_SHA` with the current remote
`main` head using `git ls-remote`.

Image metadata is generated with `docker/metadata-action@v5` for:

```text
<DOCKERHUB_USERNAME>/fitwork-be-nestjs-api
```

Publication uses two tag rules:

- A commit tag generated by `type=sha,format=long`.
- `latest`, enabled only when the remote `main` head matches the run's commit at
  the head-check step.

If `main` has already advanced at that check, the older run can still publish its
commit tag but does not generate `latest`. The comparison occurs before the
build; it is not an atomic check at push time.

`docker/build-push-action@v6` builds from context `.` using
[`Dockerfile`](../Dockerfile). It receives the generated tags and labels, and
uses GitHub Actions cache with `cache-from: type=gha` and
`cache-to: type=gha,mode=max`. No explicit platform list is configured.

The Dockerfile uses Node.js 24 Alpine stages to install dependencies, generate
Prisma, compile the application, and remove development dependencies. The final
image runs as the `node` user, exposes port 3000, and starts the compiled API with
OpenTelemetry instrumentation.

Image publication does not deploy the application, start Compose services, or
apply database migrations. Those operations require a separate deployment flow.

### Required Publication Secrets

Configure these repository Actions secrets before publishing:

| Secret               | Purpose                                                              |
| -------------------- | -------------------------------------------------------------------- |
| `DOCKERHUB_USERNAME` | Docker Hub login username and image namespace.                       |
| `DOCKERHUB_TOKEN`    | Docker Hub access token authorized to push to the target repository. |

The reusable workflow declares both secrets optional because build-only pull
request runs do not use them. Successful publication requires usable values;
the parent workflow explicitly forwards these two secrets. No Cloudinary,
application database, or JWT secret is referenced by the active workflows.

## Local Verification

Use Node.js 24 and run the backend checks before opening a pull request:

```bash
npm ci
npx prisma validate
npx prisma generate
npm run lint:check
npm test -- --ci --runInBand
npm run build
```

With a local `.env` configured for Compose, validate configuration and build
without publishing:

```bash
docker compose -f compose.yml config --quiet
docker build -t interviewiq-backend:local .
```

If `actionlint` is installed locally, reproduce the workflow lint check with:

```bash
actionlint -color -ignore 'SC2016:'
```

Run `npm run test:e2e` locally when the change requires endpoint verification;
the active CI workflow does not run that suite.

## Troubleshooting and Maintenance

| Symptom                                         | What to check                                                                                         |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| No Backend CI run                               | Confirm the event is a push to `main` or a pull request targeting `main`. There is no manual trigger. |
| Docker job skipped on a pull request            | Check the filter paths and whether both prerequisite jobs succeeded.                                  |
| Backend checks fail                             | Open the failed step in Actions and reproduce its command using Node.js 24.                           |
| Compose validation fails                        | Check `.env` requirements and interpolation in `compose.yml`. CI creates its own temporary file.      |
| Workflow lint fails                             | Inspect the actionlint annotations, including file, line, and column.                                 |
| Docker login or push fails                      | Check both Docker Hub secrets and token permissions for the configured image repository.              |
| Commit image published without `latest`         | Check whether remote `main` had advanced when the head-check step ran.                                |
| Expected e2e or integration results are missing | E2e is not invoked, and the integration job is commented out. Run the relevant suite locally.         |

When editing workflow triggers, filter paths, jobs, image naming, or publication
conditions, update this document and the CI summary in
[`code-workflow.md`](./code-workflow.md).
