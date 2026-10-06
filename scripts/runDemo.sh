#!/usr/bin/env bash
set -e

echo "========================================="
echo " FRAUDMESH 70% REVIEW DEMO"
echo "========================================="

echo "[1/4] Cleaning previous output..."
rm -rf data/output/*
mkdir -p data/input data/output

echo "[2/4] Generating deterministic demo transaction dataset..."
node fraud/generateDataset.js --rows 1200 --seed 42

echo "[3/4] Starting / rebuilding cluster with 4 workers..."
docker compose down --remove-orphans
docker compose up --build -d --scale worker=4

echo "Waiting 6 seconds for workers to register..."
sleep 6

echo ""
echo "Cluster status:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "Fraud job starting in background..."
echo "To demonstrate fault tolerance during execution, open a separate terminal and run:"
echo ""
echo "  ./scripts/injectFailure.sh worker-2"
echo "  (or: ./scripts/injectFailure.sh --random)"
echo ""
echo "Watch the logs for:"
echo "  HEARTBEAT TIMEOUT"
echo "  WORKER FAILED"
echo "  TASK REQUEUED"
echo "  TASK REASSIGNED"
echo "  ACCEPTED result"
echo "========================================="

node scripts/submitJob.js fraud

echo ""
echo "[DEMO COMPLETE] Detected rings in data/output/detected_rings.json:"
cat data/output/detected_rings.json
echo ""
