# NotesApp

NotesApp is a minimalist plain-text editor with durable PostgreSQL notes,
600 ms debounced autosave, search, modification times, and a responsive sidebar. GitHub is the authoritative development repository;
[GitLab NotesApp](https://gitlab.com/cmarzian91-group/notesapp) is a downstream
mirror maintained by the existing GitHub Actions synchronization workflow.
Make changes through GitHub branches and pull requests, never by pushing to the
GitLab mirror. The synchronization workflow is unchanged by this integration.

## Shared AI Framework

[AI Framework](https://gitlab.com/cmarzian91/AI_Framework) supplies reusable role
instructions, skills, workflows, and templates. It is a separately maintained
dependency registered as a genuine Git submodule at `ai-framework/`, not copied
application source. NotesApp records its exact commit in a Git gitlink; ordinary
submodule initialization restores that revision without following newer commits.
The initial revision is `d78f32cf954250087bccad3afdf4340a0c6e3a52` from `main`.

Git and read access to both repositories are the only prerequisites for this
integration. Framework changes are outside the scope of this repository.

## Clone and initialize

```bash
git clone --recurse-submodules https://github.com/ChristianMarzianGithub/NotesApp.git
cd NotesApp
```

For an existing clone, or after switching to a commit with a different pin:

```bash
git submodule update --init --recursive
```

Inspect the recorded and checked-out revisions:

```bash
git submodule status --recursive
git ls-files --stage ai-framework
git -C ai-framework rev-parse HEAD
git -C ai-framework status --short
```

The index entry must have mode `160000`. A leading space in submodule status
means the checkout matches the recorded revision; `-` means uninitialized and
`+` means a different revision is checked out.

## Intentionally update the framework

Start a separate GitHub feature branch with a clean framework working tree.
The configured update branch is `main`; updates use checkout mode:

```bash
git submodule update --remote ai-framework
git diff --submodule=log -- ai-framework
git -C ai-framework rev-parse HEAD
```

Read the updated instructions and review the framework changes before accepting
them. Updating changes the pinned submodule revision in the working tree; it
must be reviewed and committed separately in NotesApp:

```bash
git add ai-framework
git commit -m "chore: update AI Framework revision"
```

Open a GitHub pull request. Do not push to or edit the framework. To discard an
uncommitted pin update, first ensure the submodule has no local edits, then run
`git submodule update --init --recursive ai-framework` to restore the index pin.
There is no automatic framework-update job.

## Continue development with Codex

[Root AGENTS.md](AGENTS.md) directs Codex to explicitly read the shared
[instructions](ai-framework/AGENTS.md) and [README](ai-framework/README.md), then
select and read the relevant files under `ai-framework/agents/` and
`ai-framework/skills/`. Submodule skills are not assumed to be automatically
discovered. Roles are working perspectives; they do not automatically spawn
agents. Actual delegation requires support and explicit permission.

Use the framework's established workflow and output contracts. Its templates
under `ai-framework/templates/` support durable briefs, tasks, architecture
decisions, and release checklists when appropriate. Keep NotesApp-specific
instructions in root `AGENTS.md`, documentation in `docs/`, and future local
skills in `skills/<name>/SKILL.md`; link new skills explicitly from the project
instructions. These directories need only be created when useful.

Example future prompt: “Read AGENTS.md and the relevant framework role and skill.
Define a scoped NotesApp MVP before implementation.” Build and verification commands are below and in `AGENTS.md`.


## Architecture and local scope

`backend/` is a Java 25 / Spring Boot 3.5.16 REST service with JPA, Bean Validation,
Flyway, and PostgreSQL 17. `frontend/` is React 19, TypeScript 7, Vite 8, and plain
CSS. nginx serves the production frontend and proxies `/api` to the backend.
See [product scope](docs/product-brief.md) and [architecture](docs/architecture.md).

This MVP has no authentication or authorization and is intended for one local
user. **Do not expose it publicly** without authentication, TLS, access controls,
and appropriate operational safeguards. It has no offline mode. Failed saves
retain the current draft in memory with retry; conflicts require confirmed reload.
Leaving the page with unsaved edits warns, but killing the browser can lose drafts.

## Run with Docker Compose

Prerequisite: Docker Engine with Compose v2 and Internet access for image/package
pulls. No host Java or Node is needed for the container workflow.

```bash
git submodule update --init --recursive
docker compose up --build
```

Open `http://localhost:3000` locally. Compose publishes only the frontend on
loopback; PostgreSQL and the API stay on the private Compose network. Database
and backend health checks gate startup. `WEB_PORT` overrides port 3000.
`DATABASE_PASSWORD` overrides the explicit local-only default `notesapp_dev_only`
for both services. This default is not a production credential; never reuse it.
No private tokens or credentials are committed. Do not commit `.env` files.

```bash
docker compose ps
docker compose logs backend
docker compose down
```

The named `notes-data` volume survives restarts and `down`. `down -v` destroys
notes; use it only for an intentional reset. Make backups before upgrades:

```bash
docker compose exec -T db pg_dump -U notesapp notesapp > notes-backup.sql
# Restore into an empty compatible notesapp database:
docker compose exec -T db psql -U notesapp notesapp < notes-backup.sql
```

Recovery: stop writers, preserve the volume and backup, restore into a separate
empty database first, then verify note contents before switching. Reverting code
does not undo Flyway migrations or restore deleted notes. Never edit an applied
migration; add a new migration for future changes.

## Develop outside containers

Prerequisites: Java 25 (set `JAVA_HOME`), Maven 3.9+, Node 24/npm, and PostgreSQL 17.
Create a local `notesapp` database/user (for example, run `createuser --pwprompt
notesapp` and `createdb --owner=notesapp notesapp` as a PostgreSQL administrator).
Supply the password to the backend through your shell's secure configuration. No global CORS allowance is needed: Vite proxies
`/api` to port 8080.

Backend, in one terminal:

```bash
cd backend
# Set DATABASE_PASSWORD securely before starting.
# Optional overrides: DATABASE_URL (JDBC URL), DATABASE_USER.
mvn spring-boot:run
```

Frontend, in another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173` locally. Production database defaults to
`jdbc:postgresql://localhost:5432/notesapp` with user `notesapp` and a required
`DATABASE_PASSWORD`. The health endpoint is `/actuator/health` on the API server.

## Tests and builds

Backend tests execute HTTP CRUD, PostgreSQL persistence, literal case-insensitive
search, validation, missing-resource behavior, and stale-write conflicts. They
**delete data in the configured test database**. Always use a disposable database.
The test profile defaults to `notesapp_test` on port 55432, user `notesapp`, and
local-only password `notesapp_dev_only`; production `DATABASE_*` values do not
redirect the tests. Use `TEST_DATABASE_*` only for an isolated alternative.

```bash
docker compose -f docker-compose.test.yml up -d --wait
cd backend
mvn -B verify
# Executable jar: target/notesapp-0.1.0.jar
cd ../frontend
npm ci
npm test
npm run typecheck
npm run build
```

With the full application running on port 3000, run real-browser tests:

```bash
cd frontend
npx playwright install --with-deps chromium
npm run test:e2e
```

`APP_URL` overrides the target. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select
an existing Chromium binary. Desktop and mobile tests create, autosave, reload,
search, and confirm deletion of their own notes. They write ignored screenshots
and failure traces to `frontend/test-results/`. Use a disposable instance.

Container builds can be run independently:

```bash
docker build -t notesapp-backend backend
docker build -t notesapp-frontend frontend
docker compose build
```

Managed HTTPS proxies may require optional BuildKit secrets `proxy_ca` for both
builds and `maven_settings` for Maven's proxy configuration. Supply these as local
build secrets, never committed credentials or image layers. Standard local builds
need no secrets. Containers can be deployed independently later; nginx's current
backend hostname is `backend` and must be adapted for a different platform.

## API

All timestamps are UTC ISO-8601. Notes contain `id` (UUID), `title`, `body`,
`createdAt`, `updatedAt`, and `version`. Empty title/body are allowed; the UI shows
“Untitled note.” Limits are 200 title characters and 200,000 body characters.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/v1/notes?q=text` | Full notes, newest modified first; optional literal title/body search (max 200 chars) |
| GET | `/api/v1/notes/{id}` | One note or 404 |
| POST | `/api/v1/notes` | `{ "title": "Idea", "body": "Text" }` → 201 and Location |
| PUT | `/api/v1/notes/{id}` | `{ "title": "Idea", "body": "New text", "version": 0 }` → updated note |
| DELETE | `/api/v1/notes/{id}` | 204, or 404 |

Invalid input returns 400 ProblemDetail. Stale updates return 409; reload before
retrying to avoid overwriting another editor. Database failures never count as
successful saves. The list currently includes full bodies; pagination and indexed
search are future work if measured collection sizes warrant them.

## CI and review

GitHub Actions validates backend tests with PostgreSQL, frontend tests/build, and
Compose plus desktop/mobile browser tests. The original mirror workflow remains
unchanged. `.gitlab-ci.yml` provides optional mirror-side backend/frontend checks;
its Docker job runs only when `RUN_DOCKER_BUILDS=true` on a runner configured for
TLS Docker-in-Docker. Neither pipeline deploys or changes repository settings.
Remote CI results must be checked separately from local validation.
