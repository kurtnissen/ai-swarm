#!/bin/bash
# AI Swarm v3.0.0 - Stop Script
cd "$(dirname "${BASH_SOURCE[0]}")"

# Load current proxy mode
set -a
source .env 2>/dev/null || true
set +a
PROXY_MODE=${PROXY_MODE:-local}

if [ "$PROXY_MODE" = "local" ]; then
    docker compose -f docker-compose.yml -f docker-compose.local.yml down
else
    docker compose -f docker-compose.yml -f docker-compose.${PROXY_MODE}.yml down
fi
echo "AI Swarm stopped."
