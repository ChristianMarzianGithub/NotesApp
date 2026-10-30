# NotesApp development instructions

## Repository and scope

GitHub `ChristianMarzianGithub/NotesApp` is the authoritative development repository.
GitLab `cmarzian91-group/notesapp` is its downstream mirror. Preserve
`.github/workflows/sync-gitlab.yml` and its synchronization behavior. Do not push
directly to the GitLab mirror or modify the shared framework repository.

## Stack and scope

NotesApp is a local, single-user plain-text notes MVP: Java 25, Spring Boot
3.5.16, Maven, Spring Web/Data JPA/Validation, PostgreSQL 17, Flyway, React 19,
TypeScript 7 and Vite 8. No authentication: never expose it publicly without
appropriate access controls. See `docs/product-brief.md` and
`docs/architecture.md` for acceptance criteria and boundaries.

Use the existing isolated checkout; do not create a Git worktree unless explicitly
requested. Develop on a feature branch and use GitHub pull requests; never
merge automatically. Preserve the GitHub-to-GitLab synchronization workflow.

## Load the shared framework explicitly

Before development tasks, initialize the pinned dependency if necessary:

```bash
git submodule update --init --recursive
```

Read and follow [ai-framework/AGENTS.md](ai-framework/AGENTS.md) and
[ai-framework/README.md](ai-framework/README.md). If unavailable, resolve submodule
access before proceeding with framework-dependent work. Do not copy its files
into this repository. Framework paths resolve from `ai-framework/`, not NotesApp's
root. Its repository-authority instructions apply to the framework itself;
NotesApp changes belong on GitHub.

Codex must explicitly locate and read the relevant role and skill; skills inside
the submodule are not assumed to be automatically discovered:

| Task | Role | Skill |
| --- | --- | --- |
| Product requirements | `ai-framework/agents/product.md` | `ai-framework/skills/product-discovery/SKILL.md` |
| Consequential design | `ai-framework/agents/architect.md` | `ai-framework/skills/architecture-design/SKILL.md` |
| Implementation or fixes | `ai-framework/agents/engineer.md` | `ai-framework/skills/implementation/SKILL.md` |
| Review | `ai-framework/agents/reviewer.md` | `ai-framework/skills/code-review/SKILL.md` |
| Release readiness | `ai-framework/agents/operations.md` | `ai-framework/skills/release-readiness/SKILL.md` |

Use only relevant stages. Follow each selected skill's workflow and output
contract, and read its instructions before acting. Use roles as working
perspectives, not automatically running subagents. Delegate only when supported
and explicitly permitted. Label review performed by the same assistant as
self-review. Use templates in `ai-framework/templates/` when useful for durable
product briefs, tasks, architecture decisions, and release checklists.

## Project conventions and verification

Keep NotesApp-specific instructions here, durable project documentation under
`docs/`, and any future project-specific skills under `skills/<name>/SKILL.md`.
Explicitly link and read those skills when added. Do not duplicate existing
framework roles or skills. Do not edit files inside `ai-framework/`; dependency
updates must be intentional, reviewed, and committed separately.

Inspect existing content and the working tree before edits. Preserve unrelated
changes and keep credentials out of files and logs. Follow the shared workflow:
define acceptance criteria, inspect and select skills, implement and document,
verify, review as appropriate, and report evidence and limitations.

## Build and test

Use Java 25 and Maven 3.9+, Node 24 and npm, and Docker Compose v2. From the root:

```bash
docker compose up --build -d --wait
docker compose -f docker-compose.test.yml up -d --wait
cd backend && mvn -B verify
cd ../frontend && npm ci && npm test && npm run build
npx playwright install chromium
npm run test:e2e
```

The backend tests delete test data; they default to the isolated `notesapp_test`
database on port 55432. Never use a database containing real notes. Override only
with `TEST_DATABASE_URL`, `TEST_DATABASE_USER`, and `TEST_DATABASE_PASSWORD`.
Frontend tests use Vitest/Testing Library; browser tests exercise the real Compose
stack on port 3000. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` selects an installed
Chromium when browser downloads are unavailable. Production schema changes must
use new Flyway migrations; Hibernate only validates. API changes use DTOs,
validated limits, UTC timestamps, and optimistic-lock versions. Keep browser
saves serialized and preserve drafts on failures. Maintain accessible labels,
keyboard controls, and narrow-screen behavior. Do not introduce rich text or
extra services without a concrete requirement.

For framework integrity, run from the repository root:

```bash
git diff --check
git submodule status --recursive
git ls-files --stage ai-framework
git -C ai-framework status --short
git diff HEAD -- .github/workflows/sync-gitlab.yml
```

Expect a mode `160000` gitlink, a clean submodule at the recorded revision, and
no synchronization-workflow changes. Check documentation links and inspect the
complete diff. Keep the actual setup and validation commands current as the application evolves.

## Cloud Run configuration

Read `docs/cloud-run.md` before deployment changes. `cloudbuild.yaml` builds images
only with explicit BuildKit and per-component contexts. The Cloud Run frontend
uses `frontend/Dockerfile.cloudrun` and `server.mjs`; local Compose retains nginx.
Run `npm run test:gateway` from frontend and
`python3 -m unittest discover -s scripts/tests -v` from root for deployment changes.
Do not execute `scripts/deploy-cloud-run.sh` as a validation command: it mutates
Google Cloud resources and requires explicit deployment authorization. Never
make the shared-notes MVP publicly invocable. Keep credentials in Secret Manager
and backend identity tokens server-side.
