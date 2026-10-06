#!/usr/bin/env bash
JOB_TYPE=${1:-fraud}

# Check if running outside container
if [ -f /.dockerenv ]; then
  node scripts/submitJob.js "$JOB_TYPE" "$2" "$3"
else
  # Running from host machine
  MASTER_RUNNING=$(docker ps --filter "name=fraudmesh-master" --format "{{.Names}}")
  if [ -n "$MASTER_RUNNING" ]; then
    node scripts/submitJob.js "$JOB_TYPE" "$2" "$3"
  else
    echo "[RUN JOB] Master container not detected, running local node process..."
    node master/main.js "$JOB_TYPE" "$2" "$3"
  fi
fi
