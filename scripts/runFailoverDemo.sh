#!/usr/bin/env bash
set -e

echo "==========================================================="
echo "   FRAUDMESH PREDICTED FAILOVER & RECOVERY DEMO"
echo "==========================================================="

# 1. Clean output
rm -rf data/output/*
mkdir -p data/input data/output
node fraud/generateDataset.js --rows 1200 --seed 42

# 2. Restart cluster with workers having 1500ms task pacing
echo "[CLUSTER] Launching 1 Master + 4 Workers..."
docker compose down --remove-orphans
docker compose up --build -d --scale worker=4

echo "Waiting 6 seconds for workers to connect and register..."
sleep 6

TARGET_CONTAINER=$(docker ps --filter "name=worker" --format "{{.Names}}" | grep -v master | head -n 1)

echo ""
echo "==========================================================="
echo " TARGET CONTAINER TO KILL: $TARGET_CONTAINER"
echo " WATCH YOUR OTHER TERMINAL FOR LIVE MASTER LOGS:"
echo "   docker compose logs -f master"
echo "==========================================================="
echo ""

# 3. Launch job in background
MASTER_PORT=5050 node scripts/submitJob.js fraud &
JOB_PID=$!

# 4. Wait 1 second so tasks are actively assigned and running on workers
sleep 1

echo ""
echo ">>> [TRIGGERING KILL] STOPPING $TARGET_CONTAINER MID-TASK! <<<"
docker stop -t 0 "$TARGET_CONTAINER"
echo ">>> $TARGET_CONTAINER killed! Watch master terminal for:"
echo "    - [MASTER] TCP connection abruptly closed / WORKER FAILED"
echo "    - [MASTER] Requeueing task ..."
echo "    - [MASTER] Assigning ...-attempt-2 -> surviving worker"
echo "    - [MASTER] ACCEPTED result ..."
echo ""

# 5. Wait for the master to recover and finish the job
wait $JOB_PID

echo ""
echo "==========================================================="
echo " FAILOVER DEMO COMPLETED SUCCESSFULLY!"
echo " Final Detected Fraud Rings in data/output/detected_rings.json:"
cat data/output/detected_rings.json
echo ""
echo "==========================================================="
