#!/usr/bin/env bash
# Manual deployment only. Do not run as a CI build step.
set -euo pipefail
PROJECT_ID=${PROJECT_ID:-lexical-lock-472810-g9}
REGION=${REGION:-europe-west1}
REPOSITORY=${REPOSITORY:-cloud-run-source-deploy}
: "${IMAGE_TAG:?Set IMAGE_TAG to the successful Cloud Build BUILD_ID}"
: "${CLOUD_SQL_CONNECTION_NAME:?Set project:region:instance for an existing PostgreSQL instance}"
: "${DATABASE_SECRET_VERSION:?Set a numeric Secret Manager version}"
DATABASE_NAME=${DATABASE_NAME:-notesapp}
DATABASE_USER=${DATABASE_USER:-notesapp}
DATABASE_SECRET=${DATABASE_SECRET:-notesapp-db-password}
BACKEND_ACCOUNT=${BACKEND_ACCOUNT:-notesapp-backend@${PROJECT_ID}.iam.gserviceaccount.com}
FRONTEND_ACCOUNT=${FRONTEND_ACCOUNT:-notesapp-frontend@${PROJECT_ID}.iam.gserviceaccount.com}
BACKEND_SERVICE=${BACKEND_SERVICE:-noteappbackendapi}
FRONTEND_SERVICE=${FRONTEND_SERVICE:-notesapp-web}
[[ "$DATABASE_SECRET_VERSION" =~ ^[0-9]+$ ]] || { echo 'Use a numeric secret version, not latest.' >&2; exit 1; }
# Values enter a gcloud comma-delimited list; reject delimiter injection.
for value in "$CLOUD_SQL_CONNECTION_NAME" "$DATABASE_NAME" "$DATABASE_USER"; do
  [[ "$value" != *[,=]* ]] || { echo 'Database identifiers cannot contain comma or equals.' >&2; exit 1; }
done
IMAGE_ROOT="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}"
DB_ENV="SPRING_PROFILES_ACTIVE=cloudrun,CLOUD_SQL_CONNECTION_NAME=${CLOUD_SQL_CONNECTION_NAME},DATABASE_NAME=${DATABASE_NAME},DATABASE_USER=${DATABASE_USER},JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=70.0"
DB_SECRET="DATABASE_PASSWORD=${DATABASE_SECRET}:${DATABASE_SECRET_VERSION}"
common=(--project "$PROJECT_ID" --region "$REGION")
# A separate job migrates and exits before either service is rolled forward.
gcloud run jobs deploy notesapp-migrate "${common[@]}" \
  --image "${IMAGE_ROOT}/notesapp-backend:${IMAGE_TAG}" --service-account "$BACKEND_ACCOUNT" \
  --args=--migrate-only --set-env-vars "$DB_ENV" --set-secrets "$DB_SECRET" \
  --max-retries 0 --task-timeout 5m --memory 512Mi
gcloud run jobs execute notesapp-migrate "${common[@]}" --wait
gcloud run deploy "$BACKEND_SERVICE" "${common[@]}" \
  --image "${IMAGE_ROOT}/notesapp-backend:${IMAGE_TAG}" --service-account "$BACKEND_ACCOUNT" \
  --port 8080 --invoker-iam-check --no-allow-unauthenticated --set-env-vars "$DB_ENV" --set-secrets "$DB_SECRET" \
  --memory 512Mi --cpu 1 --min-instances 0 --max-instances 3 --concurrency 40 --timeout 60
BACKEND_URL=$(gcloud run services describe "$BACKEND_SERVICE" "${common[@]}" --format='value(status.url)')
gcloud run services add-iam-policy-binding "$BACKEND_SERVICE" "${common[@]}" \
  --member "serviceAccount:${FRONTEND_ACCOUNT}" --role roles/run.invoker
gcloud run deploy "$FRONTEND_SERVICE" "${common[@]}" \
  --image "${IMAGE_ROOT}/notesapp-frontend:${IMAGE_TAG}" --service-account "$FRONTEND_ACCOUNT" \
  --port 8080 --invoker-iam-check --no-allow-unauthenticated \
  --set-env-vars "BACKEND_URL=${BACKEND_URL},BACKEND_AUTH_MODE=metadata" \
  --memory 256Mi --cpu 1 --min-instances 0 --max-instances 3 --concurrency 40 --timeout 60
