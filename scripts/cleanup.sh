#!/usr/bin/env bash
echo "[CLEANUP] Stopping Docker Compose containers..."
docker compose down --remove-orphans
rm -rf data/output/*
echo "[CLEANUP] Done."
