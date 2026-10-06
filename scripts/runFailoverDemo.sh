#!/usr/bin/env bash
set -e

echo "==========================================================="
echo "   FRAUDMESH AUTOMATED PREDICTED FAILOVER DEMO"
echo "==========================================================="

# 1. Clean and generate dataset
rm -rf data/output/*
mkdir -p data/input data/output
node fraud/generateDataset.js --rows 1200 --seed 42

# 2. Start 4-worker cluster
docker compose down --remove-orphans
docker compose up --build -d --scale worker=4

echo "Waiting 6 seconds for workers to register..."
sleep 6

# Pick target worker container to kill
TARGET_WORKER=$(docker ps --filter "name=worker" --format "{{.Names}}" | grep -v master | head -n 1)

echo ""
echo "==========================================================="
echo " TARGET WORKER TO BE KILLED: $TARGET_WORKER"
echo " (In your other terminal, run: docker compose logs -f master)"
echo "==========================================================="
echo ""

# 3. Start fraud job in background
MASTER_PORT=5050 node scripts/submitJob.js fraud &
JOB_PID=$!

# 4. Wait for job to start executing tasks
echo "[DEMO] Job running... Waiting 2 seconds before killing worker..."
sleep 2

# 5. Automatically kill the target worker mid-flight
echo ""
echo ">>> [DEMO KILL TRIGGER] KILLING $TARGET_WORKER NOW! <<<"
docker stop -t 0 "$TARGET_WORKER"
echo ">>> $TARGET_WORKER terminated! Master will detect heartbeat timeout & reassign task."
echo ""

# 6. Wait for job to finish recovering
wait $JOB_PID

echo ""
echo "==========================================================="
echo " [DEMO COMPLETE] Master recovered and completed successfully!"
echo " Detected rings in data/output/detected_rings.json:"
cat data/output/detected_rings.json
echo ""
echo "==========================================================="
