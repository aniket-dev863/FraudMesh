#!/usr/bin/env bash
set -e

TARGET=$1

if [ -z "$TARGET" ]; then
  echo "Usage: ./scripts/injectFailure.sh <worker-id-or-container-name> | --random"
  exit 1
fi

if [ "$TARGET" = "--random" ]; then
  WORKER_CONTAINER=$(docker ps --filter "name=fraudmesh-worker" --format "{{.Names}}" | shuf -n 1)
  if [ -z "$WORKER_CONTAINER" ]; then
    WORKER_CONTAINER=$(docker ps --filter "name=worker" --format "{{.Names}}" | grep -v master | shuf -n 1)
  fi
else
  # Check if container exists by exact name or substring
  WORKER_CONTAINER=$(docker ps --filter "name=$TARGET" --format "{{.Names}}" | head -n 1)
fi

if [ -z "$WORKER_CONTAINER" ]; then
  echo "[FAILURE INJECTOR] Error: No running container found matching '$TARGET'"
  docker ps
  exit 1
fi

echo "[FAILURE INJECTOR] Terminating worker container: $WORKER_CONTAINER"
docker stop -t 0 "$WORKER_CONTAINER"
echo "[FAILURE INJECTOR] Successfully stopped $WORKER_CONTAINER."
echo "[FAILURE INJECTOR] Observe master logs for HEARTBEAT TIMEOUT and TASK REQUEUED events."
