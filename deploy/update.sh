#!/usr/bin/env bash
# Boardupscale — Manual update script
# Images are now built by GitHub Actions and pushed to GHCR.
# This script pulls the latest images and restarts services.
# Usage: bash deploy/update.sh [image-tag]   (tag defaults to "main")
set -euo pipefail
cd /opt/boardupscale

IMAGE_TAG="${1:-main}"
export IMAGE_TAG

git pull origin main
docker compose -f docker-compose.prod.yml pull api web worker
docker compose -f docker-compose.prod.yml up -d --remove-orphans
docker image prune -f
echo "Update complete (tag: $IMAGE_TAG)."
