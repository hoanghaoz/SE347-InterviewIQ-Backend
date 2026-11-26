# CI and Docker Workflow Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the image as `interviewiq-api`, run e2e tests in CI and report image vulnerabilities.

**Architecture:** `backend_ci.yml` gains an e2e step, which already gates the `docker` job. `docker_ci.yml` builds and loads the image, scans it, then pushes from the same builder cache.

**Tech Stack:** GitHub Actions, Docker Buildx, Trivy, actionlint.

**Spec:** `docs/superpowers/specs/2026-11-25-ci-docker-upgrade-design.md`

## Global Constraints

- Image: `${{ secrets.DOCKERHUB_USERNAME }}/interviewiq-api`.
- Pull requests build and scan only; login and push need `inputs.publish` and a push to `refs/heads/main`.
- The scan reports HIGH and CRITICAL and never fails the workflow.
- `aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25` (v0.36.0), Trivy `v0.76.2`.
- actionlint `1.7.12`, installer taken from commit `914e7df21a07ef503a81201c76d2b11c789d3fca`.
- Secrets stay `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`.
- One commit per task, no `Co-Authored-By` line.

## Review Focus

CI YAML has no unit tests; each line is checked by actionlint, by reading the PR run log, or after merge.

- Pull request run: no Docker Hub login and no push (PR log).
- Trivy cannot download its database: the job stays green (`continue-on-error: true`).
- e2e on a runner without `.env`: passes; the step must come before the Compose step writes `.env`.
- Token cannot create the new repository: the first push on `main` fails; only visible after merge.
- Push step publishes the scanned build: both build steps use the same context, file and builder.

---

### Task 1: Backend checks

**Files:** Modify `.github/workflows/backend_ci.yml`

- [ ] Add step `Run e2e test` running `npm run test:e2e -- --ci --runInBand` directly after `Run test`.
- [ ] In `Action lint`, load `download-actionlint.bash` from the pinned commit and pass `1.7.12`.
- [ ] Rename `POSTGRES_DB=fitwork_ci` to `POSTGRES_DB=interviewiq_ci`.
- [ ] Run actionlint 1.7.12 with the workflow's flags. Expected: exit 0.
- [ ] Commit `ci(backend): run e2e tests and pin actionlint`.

### Task 2: Image name

**Files:** Modify `.github/workflows/docker_ci.yml`

- [ ] Set `images:` in `Docker Meta` to `${{ secrets.DOCKERHUB_USERNAME }}/interviewiq-api`.
- [ ] Run actionlint. Expected: exit 0.
- [ ] Commit `ci(docker): publish image as interviewiq-api`.

### Task 3: Image scan

**Files:** Modify `.github/workflows/docker_ci.yml`

- [ ] Replace `Build and push` with three steps:
  1. `Build image`: `docker/build-push-action@v6`, `load: true`, `tags: interviewiq-api:scan`, GHA `cache-from` and `cache-to`.
  2. `Scan image`: pinned `trivy-action`, `continue-on-error: true`, `image-ref: interviewiq-api:scan`, `version: v0.76.2`, `scanners: vuln`, `severity: HIGH,CRITICAL`, `format: table`, `exit-code: '0'`.
  3. `Push image`: the existing publish condition as `if:`, `push: true`, metadata tags and labels, GHA `cache-from`.
- [ ] Run actionlint. Expected: exit 0.
- [ ] Commit `ci(docker): scan image with trivy before push`.

### Task 4: Docs

**Files:** Modify `docs/github-workflows.md`, `docs/code-workflow.md`, `CLAUDE.md`

- [ ] Describe the e2e step, pinned actionlint, new image name and scan; remove every claim that CI skips e2e.
- [ ] `git grep -n 'fitwork-be-nestjs-api' -- .github docs/*.md` prints nothing.
- [ ] Commit `docs(ci): describe e2e step, image scan and new image name`.
