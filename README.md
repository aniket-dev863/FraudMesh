# FraudMesh — Fault-Tolerant, Skew-Aware MapReduce Engine for Distributed Fraud-Ring Mining

> **BCSE414L High Performance Computing — 70% Implementation Review**

FraudMesh is a custom, lightweight MapReduce-style distributed processing engine designed to execute over commodity container clusters without heavy external dependencies. It solves real-world financial fraud ring detection by identifying cyclic money flows across dense transaction graphs using distributed connected components and Tarjan's Strongly Connected Component (SCC) algorithm.

---

## 1. System Architecture

```text
                               ┌─────────────────────────┐
                               │     FRAUDMESH MASTER    │
                               │                         │
                               │  Worker Registry        │
                               │  Task Scheduler         │
                               │  Heartbeat Detector     │
                               │  Shuffle Manager        │
                               │  Skew Manager           │
                               │  Speculation Manager    │
                               └────────────┬────────────┘
                                            │ TCP / NDJSON
                 ┌──────────────────────────┼──────────────────────────┐
                 │                          │                          │
          ┌──────▼──────┐            ┌──────▼──────┐            ┌──────▼──────┐
          │  WORKER 1   │            │  WORKER 2   │            │  WORKER N   │
          │             │            │             │            │             │
          │ Executor    │            │ Executor    │            │ Executor    │
          └─────────────┘            └─────────────┘            └─────────────┘
                                  Shared Volume /data
                                 (Input CSV & Output)
```

### Core Architecture Components
1. **Master Node (`master/Master.js`)**:
   - Manages worker lifecycle, dynamic task queues, and stage synchronizations.
   - Accepts logical results **strictly exactly-once** while executing tasks **at-least-once**.
2. **Workers (`worker/Worker.js`)**:
   - Connect via TCP using Line-Delimited JSON (`NDJSON`).
   - Send heartbeats every 2 seconds (`HEARTBEAT_INTERVAL_MS=2000`).
   - Execute Map and Reduce stages via pluggable `TaskExecutor`.
3. **Failure Detector (`master/FailureDetector.js`)**:
   - Tracks worker liveness. If a worker misses 3 heartbeats (threshold 6s), it is declared `DEAD`.
   - Requeues uncompleted tasks and reschedules them to healthy workers.
4. **Skew Manager (`master/SkewManager.js`)**:
   - Monitors post-shuffle partition distributions. If any partition exceeds `avgSize * SKEW_THRESHOLD`, it splits the work into sub-chunks.
5. **Speculation Manager (`master/SpeculationManager.js`)**:
   - Identifies straggling tasks where execution time exceeds `median_duration * SPECULATION_MULTIPLIER` and assigns a backup attempt to an idle worker.

---

## 2. Fraud Mining Algorithm

The workload models transactions as a directed graph $G = (V, E)$:

```text
Transaction CSV ──> Map: Emit Edges ──> Distributed Hash-to-Min CC ──> Local Tarjan SCC ──> Fraud Rings
```

1. **Transaction Edge Mapping (`fraud/mapper.js`)**: Maps account transactions into directed graph edges.
2. **Distributed Hash-to-Min Connected Components (`fraud/connectedComponents.js`)**:
   - Iterative rounds of MapReduce propagate minimum vertex identifiers until convergence.
   - Partitions the transaction universe into independent connected subgraphs.
3. **Strongly Connected Components (`fraud/scc.js` & `fraud/reducer.js`)**:
   - Executes Tarjan's SCC algorithm on component subgraphs.
   - Identifies cyclic account clusters of size $\ge 2$ as confirmed fraud rings.

---

## 3. Quick Start & Execution

### Prerequisites
- Node.js 20+ LTS
- Docker & Docker Compose

### Running the Test Suite
All unit, protocol, fault tolerance, and algorithm tests run using Node's built-in test runner:
```bash
npm test
```

### Launching the Cluster
```bash
docker compose up --build -d --scale worker=4
```

Verify cluster logs:
```bash
docker compose logs master
```

### Running Fraud Mining Job
```bash
MASTER_PORT=5050 node scripts/submitJob.js fraud
```

### Demonstrating Fault Tolerance
1. Start the fraud job.
2. In a second terminal, terminate a worker container:
```bash
./scripts/injectFailure.sh worker-2
```
3. Observe master terminal:
   - `[MASTER] HEARTBEAT TIMEOUT worker-2`
   - `[MASTER] WORKER FAILED worker-2`
   - `[MASTER] Requeueing task ...`
   - `[MASTER] Assigning ... -> worker-3`
   - `[MASTER] ACCEPTED result ...`
   - Final summary prints `CORRECTNESS: PASS`.

---

## 4. Benchmark Execution
Run the automated multi-configuration benchmark suite:
```bash
node benchmarks/runBenchmark.js
```
Results will be output to `benchmarks/results/results.csv`.
