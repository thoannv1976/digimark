#!/usr/bin/env bash
# Deploy DIGIMARK Arena: API → Cloud Run (arena-api), web → Firebase Hosting, Firestore rules.
#   PROJECT_ID=<gcp-project> SITE_ID=<hosting-site> bash scripts/deploy.sh
# Requires: gcloud + firebase CLI logged in, node 22, apps/web/.env.production (copy apps/web/.env.example).
# One-time setup per project: enable run, cloudbuild, artifactregistry, firestore APIs; create the Firestore
# database (FIRESTORE_DATABASE, default "(default)") in asia-southeast1; Artifact Registry repo "arena";
# service account arena-api@ with roles/datastore.user; TTL policy on rooms.expireAt (see README).
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-asia-southeast1}"
SITE_ID="${SITE_ID:-${PROJECT_ID}}"
DB="${FIRESTORE_DATABASE:-(default)}"
TAG="$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/arena/arena-api:${TAG}"
RUNTIME_SA="arena-api@${PROJECT_ID}.iam.gserviceaccount.com"

[[ -f apps/web/.env.production ]] || { echo "Missing apps/web/.env.production" >&2; exit 1; }

echo "==> Tests"
npm ci --no-audit --no-fund
npm run test:unit

echo "==> Building API image ${IMAGE}"
gcloud builds submit --project "${PROJECT_ID}" --config infrastructure/cloudbuild.api.yaml --substitutions "_IMAGE=${IMAGE}" .

echo "==> Deploying Cloud Run service arena-api"
gcloud run deploy arena-api --project "${PROJECT_ID}" --region "${REGION}" --image "${IMAGE}" \
  --service-account "${RUNTIME_SA}" --allow-unauthenticated \
  --memory 512Mi --cpu 1 --concurrency 80 --timeout 60 \
  --min-instances "${MIN_INSTANCES:-0}" --max-instances "${MAX_INSTANCES:-5}" \
  --set-env-vars "NODE_ENV=production,GCP_PROJECT_ID=${PROJECT_ID},FIRESTORE_DATABASE=${DB}"

echo "==> Building web"
npm run build --workspace @arena/web

echo "==> Firestore rules + Hosting (${SITE_ID})"
firebase deploy --project "${PROJECT_ID}" --only "firestore:rules,hosting" --non-interactive
