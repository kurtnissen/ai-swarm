#!/bin/bash
# AI Swarm v3.0.0 - Start Script
cd "$(dirname "${BASH_SOURCE[0]}")"

# Load current proxy mode
set -a
source .env 2>/dev/null || true
set +a
PROXY_MODE=${PROXY_MODE:-local}
if [ "$PROXY_MODE" = "local" ]; then
    docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --remove-orphans
else
    docker compose -f docker-compose.yml -f docker-compose.${PROXY_MODE}.yml up -d --remove-orphans
fi

# Fix volume permissions
echo "Ensuring volume permissions..."
docker exec -u root ai-swarm-worker-1 bash -c 'chown -R worker:worker /home/workers_root /home/shared_oauth 2>/dev/null' || true

echo ""
echo "AI Swarm started with ${PROXY_MODE} proxy mode."
echo "Portal: ${NEXTAUTH_URL:-http://localhost:3000}"
