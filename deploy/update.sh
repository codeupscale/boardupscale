#!/usr/bin/env bash
# Boardupscale — Update script (run after git pull)
set -euo pipefail
cd /opt/boardupscale
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans
docker image prune -f
echo "Update complete."
