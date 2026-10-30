# Cloud Run deployment

This is a manual deployment guide for project `lexical-lock-472810-g9`, region
`europe-west1`. Nothing in CI automatically deploys. Creating Cloud SQL, building
images, and running services incur Google Cloud charges. Review resource sizes
and billing before running the commands below. No cloud resources were created
while preparing this configuration.

## Fix the repository build

The generated Cloud Run trigger originally looked for `/Dockerfile`; this is a
monorepo with separate components. A later log correctly used context `backend`
and `backend/Dockerfile`, but used the legacy Docker builder. Our Dockerfiles
contain `RUN --mount` instructions, which require BuildKit.

In Cloud Build, edit the repository trigger to use **Cloud Build configuration
file → repository → `/cloudbuild.yaml`**. This file explicitly enables BuildKit,
builds from the correct contexts, and pushes two images with immutable build-ID
tags. It does not attempt an initial `latest` cache pull, nor deploy a service.
Disable/replace the generated auto-deploy trigger if using this manual flow;
otherwise it continues to deploy the old configuration on pushes. Do not keep
both triggers deploying the same service. Repository connection and trigger
changes are user actions, not performed by this PR.

| Component | Dockerfile | Context |
| --- | --- | --- |
| API | `backend/Dockerfile` | `backend/` |
| Cloud frontend | `frontend/Dockerfile.cloudrun` | `frontend/` |
| Local Compose frontend | `frontend/Dockerfile` | `frontend/` |

The Cloud Run frontend differs from local nginx: a small Node gateway serves the
built React assets and forwards `/api` to the backend's HTTPS URL. It obtains a
short-lived, audience-bound ID token from the Cloud Run metadata service using
its runtime service account. Tokens never go to the browser or logs. Backend
responses and save errors are preserved; identity failures fail closed. No
service account keys are needed. Both containers bind `0.0.0.0:$PORT` (8080 by
default). The original local Compose setup remains available.

## Architecture decision

Decision: use two private Cloud Run services and Cloud SQL. A public backend
would expose the shared notes API; nginx alone cannot obtain runtime identity
tokens. The Cloud Run-only Node gateway uses built-in HTTP/file APIs and metadata
identity, avoiding a new client dependency or a long-lived token/credential.
Combining everything into a multi-container service was considered but would
change the requested independent service deployment. This approach retains the
local nginx path and has no new persistence boundary. Revisit before public or
multi-user access: IAM gates invocation but does not isolate notes per user.
There are no measured capacity or availability guarantees; validate cold starts,
database connections, IAM, and backup restoration in the actual project.

## One-time prerequisites

Use a current authenticated gcloud CLI with access to this project. These commands
change Google Cloud resources; review and run them yourself when ready.

```bash
export PROJECT_ID=lexical-lock-472810-g9
export REGION=europe-west1
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com \
  --project="$PROJECT_ID"
```

Use the existing `cloud-run-source-deploy` Docker repository in `europe-west1`
shown in your build logs. If absent, create it first with Artifact Registry.
The build trigger's service account needs Artifact Registry Writer on that
repository and Logs Writer when using Cloud Logging. Select its identity
explicitly when configuring the trigger; do not assume a particular default
Cloud Build account. Submodule initialization is unnecessary for the container
builds: AI Framework is development guidance, not application source.

Create two dedicated runtime service accounts (skip creation if already present):

```bash
gcloud iam service-accounts create notesapp-backend --project="$PROJECT_ID"
gcloud iam service-accounts create notesapp-frontend --project="$PROJECT_ID"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:notesapp-backend@$PROJECT_ID.iam.gserviceaccount.com" \
  --role=roles/cloudsql.client
```

Create a PostgreSQL 17 Cloud SQL instance in the same region, with a `notesapp`
database and SQL user. Choose capacity and availability to fit your budget;
enable backups and point-in-time recovery. This guide uses the Java connector
with a public-IP instance: it authenticates using IAM and encrypts the database
connection without an authorized-network allowlist. Do not open the database to
`0.0.0.0/0`. Private-IP-only instances instead need VPC egress and an adjusted
connector `ipTypes` setting; that topology is not configured here.

Store the SQL user's password securely in Secret Manager as
`notesapp-db-password`. Use the Console's secure secret entry rather than
putting the value in shell history or a checked-in file. Grant the backend
account Secret Accessor **on that secret only**:

```bash
gcloud secrets add-iam-policy-binding notesapp-db-password --project="$PROJECT_ID" \
  --member="serviceAccount:notesapp-backend@$PROJECT_ID.iam.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor
```

The person deploying needs permission to deploy Cloud Run services/jobs, act as
both runtime service accounts, execute the migration job, and grant the frontend
account backend invocation access. The build account only builds/pushes images;
it does not need runtime database-secret access. Do not grant public (`allUsers`
or `allAuthenticatedUsers`) invocation access to either service.

## Build both images

After the PR is merged, run the configured build trigger or submit manually from
the repository root:

```bash
gcloud builds submit . --config=cloudbuild.yaml --project="$PROJECT_ID" --region="$REGION"
```

Record the successful Cloud Build ID. Image references are:

```text
europe-west1-docker.pkg.dev/lexical-lock-472810-g9/cloud-run-source-deploy/notesapp-backend:BUILD_ID
europe-west1-docker.pkg.dev/lexical-lock-472810-g9/cloud-run-source-deploy/notesapp-frontend:BUILD_ID
```

`_REGION` and `_REPOSITORY` are trigger substitutions if different destinations
are needed. Builds do not run PostgreSQL tests; GitHub CI remains the test gate.
Check CI before manually deploying. Never use a build that failed its checks.

## Migrate and deploy privately

Back up an existing database before applying migrations. Set non-secret values:

```bash
export IMAGE_TAG=REPLACE_WITH_SUCCESSFUL_BUILD_ID
export CLOUD_SQL_CONNECTION_NAME=lexical-lock-472810-g9:europe-west1:REPLACE_WITH_INSTANCE_NAME
export DATABASE_SECRET_VERSION=1  # Use the actual numeric version, not latest.
export BACKEND_SERVICE=noteappbackendapi
export FRONTEND_SERVICE=notesapp-web
bash scripts/deploy-cloud-run.sh
```

The helper:

1. Creates/updates and executes `notesapp-migrate`, using the backend image with
   `--migrate-only`. Flyway runs, resources close, and the job exits. A failure
   prevents service deployment. The backend still validates/migrates on startup
   as a safety net; future migrations must remain compatible with live revisions.
2. Deploys the backend using the `cloudrun` Spring profile, Cloud SQL connector,
   database secret binding, and backend runtime account.
3. Grants backend invocation to the frontend runtime account, then deploys the
   frontend with the exact backend service URL and metadata authentication.

Both services explicitly enable IAM invocation checks and reject unauthenticated
invocation. Audit existing service/project bindings to ensure no broad
`allAuthenticatedUsers` grant already permits unintended users. The helper defaults to your existing
`noteappbackendapi` service and a new `notesapp-web` frontend; override names if
needed. Do not run it against an unrelated existing service. Initial limits are
zero minimum / three maximum instances, and five database connections per API
instance. These are starting limits, not measured capacity guarantees. Cloud SQL
has ongoing costs even when Cloud Run scales to zero. Database/secret names,
service-account emails, region, and image repository can be overridden using
the variables at the top of the helper. No password is passed on the command line.

## Access and smoke test

There is no per-user application authentication: all permitted frontend users
share the same notes. Grant only intended users Cloud Run Invoker on the frontend.
For example, grant your own account frontend access (replace the email):

```bash
gcloud run services add-iam-policy-binding notesapp-web --project="$PROJECT_ID" --region="$REGION" \
  --member="user:YOUR_EMAIL" --role=roles/run.invoker
```

For your authenticated account, use the gcloud local proxy for browser access:

```bash
gcloud run services proxy notesapp-web --project="$PROJECT_ID" --region="$REGION" --port=8085
```

Open `http://localhost:8085` locally while that command runs. A bare Cloud Run URL
without authentication should be rejected. The proxy authenticates the browser's
requests to the frontend; the frontend authenticates separately to the backend.
If the backend rejects calls, check its runtime IAM binding and that BACKEND_URL
is the canonical URL from `gcloud run services describe ... --format=value(status.url)`.
Do not solve access failures by making either service public.

Create, edit, wait for Saved, reload, search, and confirm deletion. Inspect Cloud
Run logs for API/database failures and Cloud SQL metrics for connection pressure.
The gateway's `/health` tests its process only; complete readiness requires a
successful API/database request. Actual Cloud SQL/IAM connectivity must be tested
in your project; local tests cannot establish it.

## Recovery and validation

Before rollout, record each service's current ready revision and make a database
backup. If a new revision fails, route traffic back to the previous known-good
revision with `gcloud run services update-traffic SERVICE --to-revisions=REVISION=100
--project=... --region=...`. Never assume code rollback reverses Flyway schema or
deleted data. Stop rollout and use a reviewed forward migration or restore to a
separate Cloud SQL instance before switching connections. Automated restoration
and production HA are not configured by this PR.

Local checks for this deployment change:

```bash
node --test frontend/server.test.mjs
python3 -m unittest discover -s scripts/tests -v
bash -n scripts/deploy-cloud-run.sh
cd backend && mvn -B verify
cd ../frontend && npm ci && npm test && npm run test:gateway && npm run build
```

The Python tests use a fake `gcloud`; they do not contact Google Cloud. To exercise
the gateway locally against the Compose API, run
`docker compose -f docker-compose.yml -f docker-compose.cloudrun-test.yml up --build -d --wait`
and then run `npm run test:e2e` from `frontend/`. The override uses
`BACKEND_URL=http://backend:8080` and explicit `BACKEND_AUTH_MODE=none`. This is
a local test harness, not a manifest to upload to Cloud Run. This bypass is only for local validation; the deployment
helper always selects metadata authentication.

References: [Cloud Build config](https://cloud.google.com/build/docs/build-config-file-schema),
[service-to-service authentication](https://cloud.google.com/run/docs/authenticating/service-to-service),
[Cloud SQL Java connector](https://github.com/GoogleCloudPlatform/cloud-sql-jdbc-socket-factory),
[Cloud Run local proxy](https://cloud.google.com/sdk/gcloud/reference/run/services/proxy).

## PR verification (30 October 2026)

Local verification passed: 6 PostgreSQL-backed API tests, 8 editor interaction
tests, 7 gateway HTTP/identity tests, 2 deployment-helper tests with fake gcloud,
production frontend build/typecheck, backend package, and both deployment image
builds. Migration-only mode completed and exited without an HTTP server. The
Cloud Run images reached healthy status with a disposable local database, and
all 4 desktop/mobile CRUD and long-note browser tests passed through the gateway.
YAML parsing, shell syntax, build-context/BuildKit checks, local documentation
links, and unchanged framework/sync-workflow checks passed. Review was self-review
against main `bd0d92dc01bb9024cfdc59b791e8af11851c2fef`.

Actual Cloud Build execution, gcloud deployment, Cloud SQL connector connectivity,
metadata-issued token verification by Cloud Run IAM, and production backup
restoration were not executed. These remain deployment acceptance checks in your
project. No cloud resources, IAM policies, triggers, or deployments were changed.
