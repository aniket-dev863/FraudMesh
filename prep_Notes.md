# FraudMesh — 70% Viva & Review Preparation Notes

> **Project Title**: FraudMesh: A Fault-Tolerant, Skew-Aware MapReduce Engine for Distributed Fraud-Ring Mining over Commodity Clusters  
> **Course**: BCSE414L — High Performance Computing  
> **Milestone**: 70% Implementation Review

---

## 1. Quick Demo Execution Cheat Sheet

Open **two terminals side-by-side** before the examiner arrives:

### **Terminal 1: Master Live Logs**
```bash
docker compose logs -f master
```
*(Leave this open and visible throughout the viva.)*

### **Terminal 2: Command Runner**
```bash
./scripts/runFailoverDemo.sh
```
*(Run this single script when asked to start the demonstration.)*

---

## 2. Line-by-Line Log Walkthrough: What to Say During the Demo

As the logs scroll in Terminal 1, narrate the events to the reviewers using these exact explanations:

---

### Step A: Cluster Startup & TCP Handshake
```text
[MASTER] FraudMesh master started
[MASTER] Listening on 0.0.0.0:5050
[MASTER] WORKER REGISTERED worker-287560d9
[MASTER] WORKER REGISTERED worker-f654119c
[MASTER] WORKER REGISTERED worker-ad083c27
[MASTER] WORKER REGISTERED worker-7888c8a6
```
**What to Explain:**
> *"Here, the cluster initializes using Docker Compose. FraudMesh is built on Node.js without heavyweight third-party frameworks. The master opens a raw TCP server on port 5050. As each containerized worker boots, it connects and sends a newline-delimited JSON (`NDJSON`) `REGISTER` message. The master's `WorkerRegistry` logs their hostnames and initiates heartbeat tracking."*

---

### Step B: Stage 1 — Distributed Graph Edge Mapping
```text
[MASTER] STARTING FRAUD MINING JOB: fraud-1791308078720
[MASTER] Loaded 1200 transactions from data/input/transactions.csv
[MASTER] [STAGE 1] Running Distributed Transaction Edge Mapping...
[MASTER] Assigning map-0000-attempt-1 -> worker-287560d9
[MASTER] Assigning map-0001-attempt-1 -> worker-7888c8a6
[MASTER] Assigning map-0002-attempt-1 -> worker-ad083c27
[MASTER] Assigning map-0003-attempt-1 -> worker-f654119c
```
**What to Explain:**
> *"The raw financial transactions (1,200 records) are partitioned across the 4 workers. Each worker maps transaction rows into directed graph edges ($u \to v$). Notice each task is assigned as attempt-1, decoupling logical task identity from physical execution attempts."*

---

### Step C: Worker Failure & Fault Tolerance Recovery (The Key Viva Highlight!)
```text
[MASTER] TCP connection abruptly closed for worker-287560d9
[MASTER] WORKER FAILED worker-287560d9
[MASTER] Worker worker-287560d9 declared DEAD
[MASTER] Requeueing task map-0000
[MASTER] Assigning map-0000-attempt-2 -> worker-f654119c
[MASTER] ACCEPTED result task=map-0000 attempt=map-0000-attempt-2
```
**What to Explain (Point to the screen!):**
> *"Right here, our script terminated container `worker-287560d9` with `docker stop` mid-task. The master immediately detects the failure. Notice what happens next:
> 1. Logical task `map-0000` is requeued into `TaskManager`.
> 2. It is re-scheduled as **`map-0000-attempt-2`** onto surviving `worker-f654119c`.
> 3. When `worker-f654119c` completes it, the master records `ACCEPTED result`.
> 4. FraudMesh guarantees **at-least-once task execution** with **strictly exactly-once logical result acceptance**—any late or duplicate result from a stalled worker is safely ignored."*

---

### Step D: Stage 2 — Iterative Hash-to-Min Connected Components
```text
[MASTER] [STAGE 2] Running Iterative Hash-to-Min Connected Components...
[MASTER] --- CC Round 1 ---
[MASTER] Assigning cc-map-r1-...
[MASTER] Assigning cc-reduce-r1-...
...
[MASTER] --- CC Round 3 ---
[MASTER] Connected components CONVERGED after 3 iterations
```
**What to Explain:**
> *"Connected component labeling is not done in a single monolithic step. We use the distributed **Hash-to-Min** algorithm. In each round, vertices propagate their minimum known label to their neighbors via Map, Shuffle, and Reduce. Convergence occurs when no vertex labels change (here, in 3 rounds). This partitions the graph into independent connected subgraphs."*

---

### Step E: Stage 3 — Local Tarjan SCC & Fraud Ring Detection
```text
[MASTER] [STAGE 3] Running Distributed Component SCC / Cycle Detection...
[MASTER] Assigning scc-reduce-0000-attempt-1 -> worker-ad083c27
[MASTER] Assigning scc-reduce-0001-attempt-1 -> worker-7888c8a6
[MASTER] Assigning scc-reduce-0002-attempt-1 -> worker-f654119c
[MASTER] ACCEPTED result task=scc-reduce-0002 attempt=scc-reduce-0002-attempt-1
```
**What to Explain:**
> *"A connected component is not inherently a fraud ring—money could simply flow acyclically. Therefore, each component's directed subgraph is processed by **Tarjan's Strongly Connected Components (SCC)** algorithm to find directed cycles of size $\ge 2$. Because components are independent, this is done embarrassingly parallel across reducers."*

---

### Step F: Final Job Summary & Correctness Proof
```text
========== FRAUDMESH JOB SUMMARY ==========
Job ID: fraud-1791308078720
Workers: 3
Input records: 1200

Map tasks:
  total: 4
  completed: 4
  retried: 1

Reduce tasks:
  total: 3
  completed: 3

Fault tolerance:
  workers failed: 1
  tasks re-executed: 1
  late results ignored: 0

Fraud mining:
  CC iterations: 3
  fraud rings detected: 2

Performance:
  duration: 22.70 sec
  throughput: 53 records/sec

Correctness:
  CORRECTNESS: PASS
=============================================
```
**What to Explain:**
> *"The final summary displays our verified metrics:
> - `workers failed: 1`
> - `tasks re-executed: 1`
> - `fraud rings detected: 2`
> - `CORRECTNESS: PASS` (verified by comparing the detected rings against `fraud/expectedRings.json` ground truth).
> Despite a node dying mid-execution, the engine completed successfully with zero missing or duplicate rings."*

---

## 3. Potential Viva Questions & Answers

### Q1: Why use Node.js instead of Spark / Hadoop?
> **Answer**: *"Hadoop and Spark carry heavy JVM overhead and complex cluster setups. In BCSE414L, building our own engine in Node.js demonstrates a deep, first-principles understanding of distributed systems: TCP socket framing, RPC protocol design, task scheduling, partition hashing, and fault tolerance without relying on high-level framework abstractions."*

### Q2: How does FraudMesh handle partition skew?
> **Answer**: *"Our `SkewManager` inspects partition sizes after the shuffle phase. If any partition exceeds `avgSize * SKEW_THRESHOLD` (default 2.0x), it dynamically splits the partition's records into multiple sub-chunks, scheduling them across idle workers."*

### Q3: How does Speculative Execution work?
> **Answer**: *"The `SpeculationManager` tracks the median execution duration of completed tasks of the same type. If a task exceeds `median * SPECULATION_MULTIPLIER` and an idle worker exists, a backup attempt is launched. Whichever attempt returns first is accepted; the other is ignored."*

---

## 4. Planned Future Improvements (Remaining 30% Milestone Roadmap)

When asked about the next phase / remaining 30%, highlight these planned enhancements:

1. **Master High Availability & State Checkpointing**:
   - Implement a secondary standby master using heartbeat-based leader lease or Raft consensus.
   - Periodic checkpointing of `TaskManager` state to shared storage for seamless master failover.

2. **Physical Multi-Node Cluster Orchestration**:
   - Deploy beyond a single host's Docker bridge to multi-machine LAN/commodity hardware clusters.

3. **Temporal Edge Filtering & Money Mule Windowing**:
   - Incorporate transaction timestamps ($\Delta t \le 72\text{ hours}$) into cycle detection to identify rapidly circulating money rings.

4. **Large-Scale Benchmark Scaling**:
   - Stress-test the skew-balancer and CC convergence with $100,000+$ transaction graphs.
   - Measure strong and weak scaling curves across 2, 4, 8, and 16 worker nodes.
