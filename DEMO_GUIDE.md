# FraudMesh — 70% Review Live Demonstration Guide

This guide provides the exact script to present and defend the 70% project milestone during the viva and evaluation.

---

## 1. Setup & Cluster Launch

### Step 1: Start the Cluster
Run the demo automated startup script or launch manually:
```bash
docker compose up --build -d --scale worker=4
```

### Step 2: Show Worker Registration
Inspect the master container logs:
```bash
docker compose logs master
```
**Expected Output:**
```text
[MASTER] FraudMesh master started
[MASTER] Listening on 0.0.0.0:5050
[MASTER] WORKER REGISTERED worker-xxxx
[MASTER] WORKER REGISTERED worker-yyyy
[MASTER] WORKER REGISTERED worker-zzzz
[MASTER] WORKER REGISTERED worker-wwww
```

**Viva Talking Point:**
> *"The engine uses pure Node.js TCP sockets with a newline-delimited JSON protocol. As each worker container starts, it registers with the master, and the master's `WorkerRegistry` records its heartbeat timestamp."*

---

## 2. WordCount Verification (Generic MapReduce Engine)

To demonstrate that the engine is generic and workload-agnostic:
```bash
MASTER_PORT=5050 node scripts/submitJob.js wordcount
```
**Expected Output:**
```text
[MASTER] Starting WordCount Job: wc-...
[MASTER] Assigning map-0000-attempt-1 -> worker-1
[MASTER] ACCEPTED result task=map-0000 attempt=map-0000-attempt-1
[MASTER] Assigning reduce-0000-attempt-1 -> worker-2
[MASTER] ACCEPTED result task=reduce-0000 attempt=reduce-0000-attempt-1
[MASTER] WordCount Job Completed in 0.05s
```

---

## 3. Fraud-Ring Mining Workload

### Step 1: Generate Dataset
```bash
node fraud/generateDataset.js --rows 1000 --seed 42
```
This produces:
- `data/input/transactions.csv` (1000 transactions with legitimate flows and embedded cyclic rings)
- `fraud/expectedRings.json` (Ground truth containing embedded fraud rings)

### Step 2: Run Fraud Mining
```bash
MASTER_PORT=5050 node scripts/submitJob.js fraud
```

**Expected Console Stages:**
1. **Stage 1 (Map):** Distributed graph edge extraction.
2. **Stage 2 (CC):** Iterative rounds of Hash-to-Min connected component labeling until convergence (typically 3 iterations).
3. **Stage 3 (Reduce):** Tarjan's SCC algorithm executed per connected component subgraph.
4. **Summary & Verification:**
```text
========== FRAUDMESH JOB SUMMARY ==========
Job ID: fraud-...
Workers: 4
Input records: 1000
Map tasks: completed 4
Reduce tasks: completed 3
CC iterations: 3
fraud rings detected: 2
Correctness: CORRECTNESS: PASS
=============================================
```

Verify output file:
```bash
cat data/output/detected_rings.json
```

---

## 4. Fault Tolerance & Worker Failure Demonstration

### Step 1: Start Job
```bash
MASTER_PORT=5050 node scripts/submitJob.js fraud
```

### Step 2: Terminate Worker Mid-Run
In a second terminal window, immediately execute:
```bash
./scripts/injectFailure.sh worker-2
```
(or `./scripts/injectFailure.sh --random`)

### Step 3: Observe Failure Handling in Master Logs
```bash
docker compose logs -f master
```
**Expected Output:**
```text
[MASTER] HEARTBEAT TIMEOUT worker-2
[MASTER] WORKER FAILED worker-2
[MASTER] Worker worker-2 declared DEAD
[MASTER] Requeueing task map-0002
[MASTER] Assigning map-0002-attempt-2 -> worker-3
[MASTER] ACCEPTED result task=map-0002 attempt=map-0002-attempt-2
...
Correctness: CORRECTNESS: PASS
```

**Viva Talking Point:**
> *"When a worker container is stopped, it stops sending heartbeats. The master's `FailureDetector` observes 3 missed heartbeats, marks the worker DEAD, and invokes `TaskManager.handleWorkerFailure()`. Any uncompleted task is requeued and reassigned as attempt-2 on a surviving worker. The engine guarantees exactly-once logical result acceptance, discarding any late duplicate results."*

---

## 5. Automated Tests & Benchmarks

Run unit and integration tests:
```bash
npm test
```

Run comparative benchmarks:
```bash
node benchmarks/runBenchmark.js
```
