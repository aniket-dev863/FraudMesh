# FraudMesh — Current-State Audit (Part 1)

This document provides the read-only audit of the repository state as required by Review 3.

---

## 1. Phase Status Table

| Phase | Scope | Status | Evidence |
|---|---|---|---|
| **Phase 1** | Skeleton + Docker Compose cluster, worker registration | **Done** | `docker-compose.yml`, `Dockerfile.master`, `Dockerfile.worker`, `master/WorkerRegistry.js`, `worker/Worker.js`. Verified via `./scripts/runDemo.sh` where 4 worker containers (`fraudmesh-worker-1..4`) registered via TCP with master (`[MASTER] WORKER REGISTERED worker-...`). |
| **Phase 2** | Generic MapReduce task runner (pluggable map/reduce fns) | **Done** | `master/Scheduler.js`, `master/TaskManager.js`, `master/ShuffleManager.js`, `worker/TaskExecutor.js`. Verified in `tests/mapreduce.test.js` (WordCount map/reduce tested and passed: 3/3 tests pass). |
| **Phase 3** | Fault tolerance: heartbeats, re-execution, idempotent results | **Done** | `master/FailureDetector.js` (heartbeat threshold 6s), `master/TaskManager.js` (exactly-once logical acceptance, task retry tracking). Verified in `tests/faultTolerance.test.js` (2/2 tests pass) and verified worker kill mid-flight in git commit `6654621`. |
| **Phase 4** | Speculative execution for stragglers | **Done** | `master/SpeculationManager.js` (tracks task durations, triggers backup attempts when elapsed > median * SPECULATION_MULTIPLIER). Verified in `tests/speculation.test.js` (pass) and `benchmarks/runBenchmark.js` (Speculation experiment). |
| **Phase 5** | Skew-aware rebalancing | **Done** | `master/SkewManager.js` (inspects partition sizes against average * SKEW_THRESHOLD and subdivides into sub-chunks). Verified in `tests/skew.test.js` (pass). |
| **Phase 6** | Fraud-ring workload (Hash-to-Min connected components, then Tarjan SCC) | **Done** | `fraud/mapper.js`, `fraud/connectedComponents.js`, `fraud/scc.js`, `fraud/reducer.js`. Verified in `tests/connectedComponents.test.js`, `tests/scc.test.js`, `tests/fraudDetection.test.js`, and `benchmarks/runBenchmark.js` with `CORRECTNESS: PASS`. |
| **Phase 7** | Fault-injection tooling | **Done** | `scripts/injectFailure.sh`, `scripts/runFailoverDemo.sh`. Supports graceful or random SIGTERM killing of worker containers. |
| **Phase 8** | Benchmark harness | **Done** | `benchmarks/runBenchmark.js` executes 4 configurations (Baseline, Fault Tolerance, Skew, Speculation) across 2,000 transactions, generating `benchmarks/results/results.csv`. |
| **Phase 9** | Demo script and documentation | **Done** | `scripts/runDemo.sh`, `DEMO_GUIDE.md`, `README.md`, `PROGRESS_REPORT.md`, `prep_Notes.md`. Verified running `./scripts/runDemo.sh` which executes end-to-end and outputs detected rings. |

---

## 2. Review 3 Architecture Questions

### Question 1: Where is Hash-to-Min implemented, and what are the signatures of its map and reduce functions?
- **Implementation Location**:
  - `fraud/connectedComponents.js` (lines 17-48)
  - Orchestration: `master/Master.js:runFraudMining` (lines 358-435)
  - Execution wrapper: `worker/TaskExecutor.js:_executeFraudCC` (lines 66-90)
- **Function Signatures**:
  - `ccMap(record)`:
    - **Input**: `record` = `{ node: string, label: string, neighbors: string[] }`
    - **Output**: Array of `{ key: string, value: string }` emitting `(node, label)` and `(neighbor, label)` for each neighbor in `record.neighbors`.
  - `ccReduce(key, values, currentLabels)`:
    - **Input**:
      - `key`: `string` (node ID)
      - `values`: `string[]` (candidate labels received from mappers)
      - `currentLabels`: `Map<string, string>` (optional mapping of current node labels)
    - **Output**: `{ node: string, label: string, changed: boolean }` where `label` is `min(values)`.

### Question 2: Is each connected-components round run as a separate distributed MapReduce job through the master, or as an in-process loop? Where is the round loop and its convergence check?
- **Execution Model**: The round loop is orchestrated on the master as an async loop in `master/Master.js:runFraudMining` (lines 368-428: `while (ccIteration < this.maxCcIterations && !ccConverged)`). Within each iteration of this loop, the master constructs tasks and executes **two separate distributed MapReduce stages** across connected workers via TCP:
  1. `await this.runStage(ccMapTasks, stageDelayMs)`
  2. `await this.runStage(ccReduceTasks, stageDelayMs)`
- **Convergence Check**: Located at `master/Master.js` lines 416-427:
  ```javascript
  let anyChanged = false;
  for (const res of ccReduceResults.values()) {
    if (res.anyChanged) anyChanged = true;
    for (const item of (res.updatedNodes || [])) {
      labels.set(item.node, item.label);
    }
  }
  if (!anyChanged) {
    ccConverged = true;
    console.log(`[MASTER] Connected components CONVERGED after ${ccIteration} iterations`);
  }
  ```

### Question 3: How is graph state carried between rounds (shared-volume files, master memory, other)?
- Graph state is held and carried in **master memory** (`master/Master.js:runFraudMining`):
  - Adjacency list: `nodeNeighbors` (`Map<string, Set<string>>`, lines 343-356)
  - Component labels: `labels` (`Map<string, string>`, line 360)
- In each round, the master reads from its in-memory maps, chunks them into input partitions sent over TCP to workers in task payloads, and receives updated labels back over TCP to update the in-memory `labels` map. No disk or shared-volume files are used between rounds.

### Question 4: What type are node/account IDs, and how is "min" computed? Flag any string-comparison pitfall (for example `"10" < "9"`).
- Node/account IDs are **strings** (e.g. `'ACC_RING1_A'`, `'ACC_0001'`).
- In `fraud/connectedComponents.js:ccReduce`:
  ```javascript
  let minLabel = values[0];
  for (const val of values) {
    if (String(val).localeCompare(String(minLabel)) < 0) {
      minLabel = val;
    }
  }
  ```
- **Pitfall**: `localeCompare` performs standard lexicographical comparison. When account IDs are numeric strings without fixed-width padding, `"10".localeCompare("9") < 0` is `true` because `'1'` < `'9'`. Part 2 must implement an explicit `order_key(node, mode, seed)` to handle natural ordering (numeric-aware) and seeded-random ordering properly.

### Question 5: Is shuffle volume measured anywhere today? If so, how and where is it logged?
- **No**. Shuffle volume is not measured anywhere today. `master/ShuffleManager.js:shuffleAndGroup` groups key-value pairs by key and partitions them across reducers, but intermediate byte sizes and element counts are not tracked or logged.

### Question 6: Which test framework is used, and how many tests exist and pass right now?
- **Test Framework**: Node.js built-in test runner (`node:test` executed via `node --test tests/*.test.js`).
- **Test Count**: **16 tests** across 8 test suites (`tests/fraudDetection.test.js`, `tests/connectedComponents.test.js`, `tests/scc.test.js`, `tests/mapreduce.test.js`, `tests/protocol.test.js`, `tests/speculation.test.js`, `tests/skew.test.js`, `tests/faultTolerance.test.js`).
- **Pass Status**: **16 pass, 0 fail, 0 cancelled, 0 skipped** (duration ~108ms).

### Question 7: Can the full pipeline (generate data -> connected components -> Tarjan SCC -> rings) run end to end today? Show the command and its output.
- **Yes**. It runs successfully either on Docker via `./scripts/runDemo.sh` or through the benchmark suite via `node benchmarks/runBenchmark.js`.
- **Command**:
  ```bash
  node benchmarks/runBenchmark.js
  ```
- **Output**:
  ```text
  [MASTER] =========================================
  [MASTER] STARTING FRAUD MINING JOB: fraud-1793261570731
  [MASTER] =========================================
  [MASTER] Loaded 2000 transactions from data/input/benchmark_data.csv
  [MASTER] [STAGE 1] Running Distributed Transaction Edge Mapping...
  [MASTER] [STAGE 2] Running Iterative Hash-to-Min Connected Components...
  [MASTER] --- CC Round 1 ---
  [MASTER] --- CC Round 2 ---
  [MASTER] --- CC Round 3 ---
  [MASTER] Connected components CONVERGED after 3 iterations
  [MASTER] [STAGE 3] Running Distributed Component SCC / Cycle Detection...
  
  ========== FRAUDMESH JOB SUMMARY ==========
  Job ID: fraud-1793261570731
  Workers: 4
  Input records: 2000
  Map tasks: total: 4, completed: 4
  Reduce tasks: total: 3, completed: 3
  Fraud mining:
    CC iterations: 3
    fraud rings detected: 2
  Performance:
    duration: 0.05 sec
    throughput: 42553 records/sec
  Correctness:
    CORRECTNESS: PASS
  =============================================
  ```

### Question 8: List any place where the code diverges from the design in this document.
1. **Hash-to-Min Formulation**:
   - Rastogi et al. (ICDE 2013) defines Hash-to-Min operating on dynamic cluster sets $C_v$:
     - Map emits $(m, C_v)$ where $m = \min(C_v)$, and $(u, \{m\})$ for every $u \in C_v \setminus \{m\}$.
     - Reduce unions all received sets: $C_v' = \bigcup S_v$.
   - The repository currently implements Pegasus-style label propagation (Hash-Min), where each node holds only a single label and the master maintains the static neighbor graph in memory.
2. **Hash-Greater-to-Min**: Currently absent; needs to be added next to Hash-to-Min.
3. **Ordering Logic**: IDs currently compared via `localeCompare` without support for deterministic seeded random orders.
4. **Instrumentation**: Missing intermediate element and byte measurements in shuffle.
5. **Convergence Extraction**: Components currently formed by grouping master memory edge lists by converged min-labels, rather than extracting from $C_m$ where $m = \min(C_m)$.

---

## 3. Blockers

- **Blockers for Part 2**: **None**.
  Phase 2 (Generic MapReduce engine) and Phase 6 (Fraud-ring pipeline) are fully functional and verified. The codebase cleanly isolates MapReduce stages, permitting the implementation of the strategy pattern, Hash-Greater-to-Min, randomized orderings, in-process and cluster runners, and metric instrumentation.
