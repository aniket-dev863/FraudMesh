# FraudMesh — Coding Agent Build Prompt
## 70% Review-Ready Implementation — JavaScript/Node.js

You are a coding agent working inside the FraudMesh repository.

Your task is to build the **70% implementation milestone** of:

> **FraudMesh — A Fault-Tolerant, Skew-Aware MapReduce Engine for Distributed Fraud-Ring Mining over Commodity Clusters**

This is a **BCSE414L High Performance Computing project**. The project has already been designed and defended in a project review, so preserve the core architecture and algorithmic choices. The implementation must be **JavaScript/Node.js based**, not Python based.

The source project review defines a master-worker MapReduce engine, heartbeat-based failure detection, task re-execution, speculative execution, skew-aware reducer rebalancing, and a fraud-ring workload based on distributed connected components followed by SCC/cycle detection. fileciteturn0file0L88-L124

---

# 1. PRIMARY OBJECTIVE

Build enough of FraudMesh that I can walk into the **70% project review with a running system**, start the cluster, run a real fraud-ring-mining job, deliberately kill a worker during execution, show the master recovering the task, and show the final fraud-ring output.

The reviewer should be able to see:

```text
Docker Cluster
     ↓
Master + Multiple Workers
     ↓
MapReduce Job
     ↓
Fraud Transaction Graph
     ↓
Connected Components
     ↓
SCC / Cycle Detection
     ↓
Fraud Rings
```

and then observe:

```text
Worker Failure
     ↓
Heartbeat Timeout
     ↓
Worker Marked DEAD
     ↓
Task Reassigned
     ↓
Job Continues
     ↓
Correct Final Output
```

The 70% milestone must be **actually executable and demonstrable**, not a collection of partially written modules.

Do not claim a feature is verified unless you actually run it.

---

# 2. IMPORTANT IMPLEMENTATION PRIORITIES

Prioritize in this order:

```text
1. Correctness
2. Live demonstrability
3. Fault tolerance
4. Clear architecture
5. Fraud-ring workload
6. Skew-aware balancing
7. Speculative execution
8. Benchmarking
9. Documentation polish
```

Keep the code simple enough to explain line-by-line during a viva.

Do not over-engineer the system.

Do not introduce a web application, REST API, React frontend, authentication, database, Kubernetes, Kafka, Spark, Hadoop, Ray, Dask, or other unrelated technologies.

---

# 3. MANDATORY TECHNOLOGY STACK

Use:

### Runtime

- Node.js 20+ LTS
- Modern JavaScript
- ES Modules
- `npm`

Use:

```json
{
  "type": "module"
}
```

### Communication

Use Node.js built-in:

```text
net
```

for TCP communication.

Use **newline-delimited JSON (NDJSON)** messages.

Do not use Python.

Do not introduce gRPC unless there is an unavoidable technical reason.

### Containers

- Docker
- Docker Compose

Containers represent commodity cluster nodes.

### Data

- CSV input
- JSON internal messages/results
- JSON ground-truth file

### Benchmarking

Use Node.js for benchmark execution.

For plotting, use a simple JavaScript-compatible approach. Prefer generating CSV plus a lightweight plot only if a suitable dependency can be justified. Do not introduce a large analytics stack just for plotting.

---

# 4. ARCHITECTURE

Preserve a clear master-worker architecture.

```text
                         ┌───────────────────────┐
                         │        MASTER         │
                         │                       │
                         │ Worker Registry       │
                         │ Task Scheduler        │
                         │ Failure Detector      │
                         │ Task Manager          │
                         │ Shuffle Manager       │
                         │ Speculation Manager   │
                         │ Skew Manager          │
                         └───────────┬───────────┘
                                     │
                                  TCP/JSON
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
        ┌─────▼─────┐          ┌─────▼─────┐          ┌─────▼─────┐
        │  WORKER 1 │          │  WORKER 2 │          │  WORKER N │
        │            │          │            │          │            │
        │ Executor   │          │ Executor   │          │ Executor   │
        └────────────┘          └────────────┘          └────────────┘

                    Shared Docker Data Volume
                         │              │
                       input           output
```

The master is responsible for:

- worker registration
- worker liveness
- task scheduling
- task reassignment
- MapReduce orchestration
- result acceptance
- speculative execution
- skew inspection
- final job aggregation

Workers are responsible for:

- registration
- heartbeats
- receiving tasks
- executing tasks
- reporting progress
- returning results

This preserves the architecture specified in the project review. fileciteturn0file0L90-L96

---

# 5. REQUIRED REPOSITORY STRUCTURE

Create a clean structure similar to:

```text
fraudmesh/
│
├── master/
│   ├── main.js
│   ├── Master.js
│   ├── Scheduler.js
│   ├── WorkerRegistry.js
│   ├── FailureDetector.js
│   ├── TaskManager.js
│   ├── ShuffleManager.js
│   ├── SpeculationManager.js
│   └── SkewManager.js
│
├── worker/
│   ├── main.js
│   ├── Worker.js
│   └── TaskExecutor.js
│
├── common/
│   ├── protocol.js
│   ├── models.js
│   ├── mapreduce.js
│   ├── framing.js
│   ├── config.js
│   └── logger.js
│
├── fraud/
│   ├── mapper.js
│   ├── reducer.js
│   ├── connectedComponents.js
│   ├── scc.js
│   ├── graph.js
│   ├── generateDataset.js
│   └── expectedRings.json
│
├── scripts/
│   ├── injectFailure.sh
│   ├── runDemo.sh
│   ├── runJob.sh
│   └── cleanup.sh
│
├── benchmarks/
│   ├── runBenchmark.js
│   └── results/
│
├── tests/
│   ├── protocol.test.js
│   ├── mapreduce.test.js
│   ├── faultTolerance.test.js
│   ├── speculation.test.js
│   ├── skew.test.js
│   ├── connectedComponents.test.js
│   ├── scc.test.js
│   └── fraudDetection.test.js
│
├── data/
│   ├── input/
│   └── output/
│
├── docker-compose.yml
├── Dockerfile.master
├── Dockerfile.worker
├── package.json
├── package-lock.json
├── .gitignore
├── README.md
├── DEMO_GUIDE.md
└── PROGRESS_REPORT.md
```

You may change filenames when useful, but do not collapse the entire project into one or two giant files.

Separate:

```text
framework
master
worker
fraud workload
scripts
tests
benchmarks
documentation
```

---

# 6. PHASE 1 — NODE.JS CLUSTER SKELETON

First build the cluster.

`docker-compose.yml` must support:

```bash
docker compose up --build --scale worker=4
```

The architecture must be:

```text
master
worker × N
```

All containers must communicate over the same Docker network.

Workers must resolve the master through the Compose service name:

```text
master:5000
```

or a configured equivalent.

When the cluster starts, the master should print:

```text
[MASTER] FraudMesh master started
[MASTER] Listening on 0.0.0.0:5000
```

and workers should print:

```text
[WORKER worker-1] Starting
[WORKER worker-1] Registered with master
```

The master must visibly report registrations:

```text
[MASTER] WORKER REGISTERED worker-1
[MASTER] WORKER REGISTERED worker-2
[MASTER] WORKER REGISTERED worker-3
[MASTER] WORKER REGISTERED worker-4
```

### Worker IDs

Workers must have stable IDs derived from the container hostname or explicitly configured environment variables.

Do not assign random IDs on every heartbeat/reconnect.

### Phase 1 verification

Actually run:

```bash
docker compose down
docker compose up --build --scale worker=4
```

Verify all four workers register.

Do not continue while cluster networking is broken.

---

# 7. PHASE 2 — EXPLICIT TCP MESSAGE PROTOCOL

Implement `common/protocol.js`.

Use NDJSON:

```text
JSON_OBJECT + "\n"
```

Each message must contain:

```text
type
workerId
jobId
taskId
attemptId
payload
```

where the fields are relevant.

Required message types:

```text
REGISTER
REGISTER_ACK
HEARTBEAT
TASK_ASSIGN
TASK_PROGRESS
TASK_RESULT
TASK_FAILED
TASK_CANCEL
JOB_START
JOB_COMPLETE
JOB_FAILED
```

Example:

```json
{
  "type": "TASK_ASSIGN",
  "workerId": "worker-2",
  "jobId": "job-001",
  "taskId": "map-0004",
  "attemptId": "map-0004-attempt-1",
  "payload": {
    "taskType": "MAP"
  }
}
```

### TCP framing

Do not assume a TCP packet corresponds to a whole JSON message.

Implement buffering:

```text
socket data
    ↓
buffer
    ↓
split on "\n"
    ↓
JSON.parse(each complete line)
```

Handle partial messages safely.

### Error handling

Malformed messages must not crash the master.

Log the error and continue serving other workers.

---

# 8. PHASE 3 — GENERIC MAPREDUCE ENGINE

Implement a workload-agnostic MapReduce framework.

The framework must accept pluggable functions:

```javascript
mapFn(record)
reduceFn(key, values)
```

The fraud logic must not be hardcoded into the generic MapReduce engine.

The logical pipeline is:

```text
Input
 ↓
Split
 ↓
Map
 ↓
Shuffle
 ↓
Group
 ↓
Reduce
 ↓
Final Result
```

This follows the project's specified generic MapReduce layer. fileciteturn0file1L75-L88

---

# 9. TASK MODEL

Represent logical tasks explicitly.

A task should contain:

```text
jobId
taskId
taskType
inputPartition
status
attempts
assignedWorker
acceptedAttemptId
createdAt
startedAt
finishedAt
```

Task statuses:

```text
PENDING
RUNNING
SUCCEEDED
FAILED
REQUEUED
SPECULATIVE
CANCELLED
```

Keep task identity separate from attempt identity.

Example:

```text
Logical task:
map-0007

Attempt 1:
map-0007-attempt-1

Attempt 2:
map-0007-attempt-2
```

This distinction is essential for fault tolerance.

---

# 10. PHASE 4 — WORD COUNT PROOF

Before introducing the fraud workload, prove the generic engine using a tiny word-count job.

Example input:

```text
hello hello world
hello world
```

Expected:

```text
hello = 3
world = 2
```

Run this distributed across several workers.

The purpose is to establish:

```text
cluster works
+
task scheduling works
+
Map works
+
shuffle works
+
Reduce works
```

before introducing graph logic.

---

# 11. PHASE 5 — HEARTBEATS AND FAILURE DETECTION

Workers must send:

```text
HEARTBEAT
```

approximately every:

```text
2 seconds
```

Make configurable:

```text
HEARTBEAT_INTERVAL_MS=2000
HEARTBEAT_MISSES_ALLOWED=3
```

The master stores:

```text
workerId
lastHeartbeat
status
currentTasks
```

States:

```text
ALIVE
BUSY
DEAD
```

A worker is dead when it misses the configured heartbeat threshold.

Log clearly:

```text
[MASTER] HEARTBEAT TIMEOUT worker-2
[MASTER] WORKER FAILED worker-2
```

The project review specifically requires heartbeat-based failure detection and configurable missed-heartbeat logic. fileciteturn0file0L105-L111

---

# 12. PHASE 6 — TASK RE-EXECUTION

When a worker dies:

1. Find all tasks assigned to that worker.
2. Find tasks that do not yet have an accepted result.
3. Mark those task attempts as failed/lost.
4. Requeue the logical task.
5. Schedule a new attempt on a healthy worker.
6. Preserve the original logical `taskId`.
7. Create a new `attemptId`.

Log:

```text
[MASTER] Worker worker-2 declared DEAD
[MASTER] Requeueing task map-0004
[MASTER] Assigning map-0004-attempt-2 -> worker-3
```

---

# 13. EXACTLY-ONCE LOGICAL RESULT ACCEPTANCE

The engine should provide:

```text
at-least-once task execution
+
exactly-once logical result acceptance
```

Do NOT claim that each computation is executed exactly once.

A task may execute multiple times due to:

- worker failure
- delayed communication
- speculative execution

But only one attempt may become the accepted logical result.

Maintain state like:

```javascript
acceptedAttempts.set(taskId, attemptId);
```

When a result arrives:

### First valid result

Accept it.

### Late result

Ignore it.

### Duplicate result

Ignore it.

### Result from obsolete attempt

Ignore it.

Print:

```text
[MASTER] ACCEPTED result task=map-0004 attempt=map-0004-attempt-2
```

or:

```text
[MASTER] IGNORED LATE RESULT task=map-0004 attempt=map-0004-attempt-1
```

The final output must not contain duplicate records because of retries.

---

# 14. CRITICAL REVIEW DEMO — WORKER FAILURE

This is the most important part of the 70% review.

The demo must work like this:

```bash
docker compose up --build --scale worker=4
```

Then:

```bash
./scripts/runJob.sh fraud
```

While the job is executing:

```bash
./scripts/injectFailure.sh worker-2
```

The reviewer should see:

```text
worker-2 alive
      ↓
worker-2 stops sending heartbeats
      ↓
heartbeat timeout
      ↓
worker-2 DEAD
      ↓
task requeued
      ↓
task assigned to worker-3
      ↓
task completes
      ↓
fraud job completes
```

The output after the failure must match the output from a failure-free run.

Do not fake the failure through an internal flag.

Actually terminate the worker container.

This is explicitly the project's most important fault-tolerance demonstration. fileciteturn0file1L91-L110

---

# 15. PHASE 7 — SYNTHETIC TRANSACTION DATASET

Do not depend on downloading a dataset for the review demo.

Implement:

```text
fraud/generateDataset.js
```

Generate:

```csv
sender_account,receiver_account,amount,timestamp
```

Include:

- many legitimate transactions
- a small number of embedded fraud rings
- deliberately skewed account activity
- deterministic random seed
- no accidental large population of cycles

Example ring:

```text
A -> B
B -> C
C -> A
```

Another:

```text
D -> E
E -> F
F -> G
G -> D
```

Generate enough legitimate acyclic transactions around these rings to make the workload meaningful.

Support:

```bash
node fraud/generateDataset.js --rows 5000 --seed 42
```

or an equivalent CLI.

---

# 16. GROUND TRUTH

Generate:

```text
fraud/expectedRings.json
```

Example:

```json
{
  "rings": [
    ["A", "B", "C"],
    ["D", "E", "F", "G"]
  ]
}
```

Normalize ring ordering before comparing results.

The correctness checker must identify:

```text
missing rings
extra rings
duplicate rings
```

and only print:

```text
CORRECTNESS: PASS
```

when the actual output matches the generated ground truth.

Never hardcode PASS.

---

# 17. PHASE 8 — FRAUD MAP FUNCTION

Implement:

```text
fraud/mapper.js
```

For every transaction emit graph-edge information.

Conceptually:

```javascript
{
  key: senderAccount,
  value: {
    receiver: receiverAccount,
    amount,
    timestamp
  }
}
```

The exact representation can change if necessary, but the graph relationship must remain available.

The source project defines transaction records as graph edges during Map processing. fileciteturn0file0L97-L104

---

# 18. PHASE 9 — FRAUD DETECTION ALGORITHM

Do not replace the defended algorithm.

The required sequence is:

```text
TRANSACTION EDGES
       ↓
DISTRIBUTED CONNECTED COMPONENTS
       ↓
COMPONENT SUBGRAPHS
       ↓
LOCAL SCC
       ↓
FRAUD-RING CANDIDATES
```

The source implementation plan explicitly requires:

1. Hash-to-Min style distributed connected-component labeling.
2. Local SCC detection using Tarjan or an equivalent SCC algorithm. fileciteturn0file1L150-L166

Do not replace this with a machine-learning model or an unrelated graph-clustering method.

---

# 19. HASH-TO-MIN CONNECTED COMPONENTS

Implement connected components using iterative minimum-label propagation.

Initial state:

```text
label(A) = A
label(B) = B
label(C) = C
```

Each iteration:

```text
label(v) =
min(
  current label(v),
  labels of neighbors
)
```

Repeat until no labels change.

Example:

```text
A-B-C

A:A
B:B
C:C

→

A:A
B:A
C:B

→

A:A
B:A
C:A

→ CONVERGED
```

Expose:

```text
ccIterations
converged
```

---

# 20. CONNECTED COMPONENTS MUST BE ITERATIVE

Do not falsely describe connected components as one Reduce call.

Represent each round explicitly:

```text
ROUND 1
Map → Shuffle → Reduce
       ↓
ROUND 2
Map → Shuffle → Reduce
       ↓
ROUND N
       ↓
Convergence
```

Set:

```text
MAX_CC_ITERATIONS=100
```

If convergence does not occur within the limit:

```text
JOB FAILED: connected components did not converge
```

Do not silently continue and claim success.

---

# 21. SCC / TARNJAN STAGE

After connected-component convergence:

1. Gather edges belonging to each connected component.
2. Construct that component's directed graph.
3. Run Tarjan's SCC algorithm or an equivalent SCC implementation.
4. Identify SCCs with size >= 2.
5. Treat those SCCs as fraud-ring candidates.

Example:

```text
A -> B
B -> C
C -> A
C -> D
D -> E
```

must produce:

```text
[A, B, C]
```

as the cyclic SCC.

Do not treat an arbitrary connected component as a fraud ring.

Important:

```text
Connected Component != Fraud Ring
```

---

# 22. FRAUD REDUCER

Implement:

```text
fraud/reducer.js
```

and keep graph algorithms in separate modules.

Recommended:

```text
fraud/reducer.js
fraud/connectedComponents.js
fraud/scc.js
fraud/graph.js
```

Final output should be machine-readable:

```json
[
  {
    "ringId": "ring-001",
    "accounts": ["A", "B", "C"],
    "ringSize": 3
  }
]
```

Normalize output before correctness comparison.

---

# 23. PHASE 10 — SKEW-AWARE REDUCER BALANCING

Implement genuine skew detection.

After shuffle/grouping, calculate partition sizes.

Example:

```text
P0 = 1000
P1 = 950
P2 = 900
P3 = 4200
```

Calculate:

```text
averagePartitionSize
```

and detect skew with:

```text
partitionSize > averagePartitionSize * SKEW_THRESHOLD
```

Default:

```text
SKEW_THRESHOLD=2
```

When triggered, split oversized remaining reducer work into multiple reducer tasks.

Example:

```text
P3
 ├── chunk-0
 ├── chunk-1
 ├── chunk-2
 └── chunk-3
```

Every decision must be logged.

Example:

```text
[MASTER] SKEW DETECTED partition=3 size=4200 average=1016
[MASTER] REBALANCING partition=3 chunks=4
[MASTER] reducer-3-chunk-0 -> worker-1
[MASTER] reducer-3-chunk-1 -> worker-2
[MASTER] reducer-3-chunk-2 -> worker-3
[MASTER] reducer-3-chunk-3 -> worker-4
```

### Correctness rule

Never split graph data in a way that invalidates the connected-component/SCC algorithm.

If a particular unit must remain atomic for correctness, preserve it as an atomic reduce unit and document the limitation.

The system must not sacrifice fraud-detection correctness just to produce a balancing log.

The source methodology explicitly requires runtime detection of oversized partitions and dynamic redistribution of remaining work. fileciteturn0file0L119-L124

---

# 24. PHASE 11 — SPECULATIVE EXECUTION

Implement straggler detection.

Track task duration.

For each task type calculate the median observed successful completion time.

If:

```text
elapsed > median × SPECULATION_MULTIPLIER
```

start one backup attempt on an idle healthy worker.

Default:

```text
SPECULATION_MULTIPLIER=2
```

Example log:

```text
[MASTER] STRAGGLER DETECTED task=map-0008 elapsed=6.2s median=2.1s
[MASTER] SPECULATIVE ATTEMPT task=map-0008 attempt=2 worker=worker-4
```

Whichever accepted attempt returns first wins.

The other attempt must be ignored/cancelled.

Maximum two attempts unless explicitly configured.

The project's design specifically calls for speculative execution based on execution time relative to completed tasks. fileciteturn0file1L112-L124

---

# 25. ARTIFICIAL WORKER SLOWDOWN

Implement:

```text
WORKER_SLOWDOWN_MS
```

For example:

```bash
WORKER_SLOWDOWN_MS=8000
```

Only selected workers should receive the slowdown.

Do not slow every worker when demonstrating speculation.

A worker receiving this configuration should deliberately delay task execution.

The demo should show:

```text
slow worker
   ↓
straggler detection
   ↓
speculative attempt
   ↓
backup finishes
   ↓
backup accepted
   ↓
slow attempt ignored
```

---

# 26. FAILURE INJECTION TOOL

Implement:

```text
scripts/injectFailure.sh
```

Support:

```bash
./scripts/injectFailure.sh worker-2
```

and optionally:

```bash
./scripts/injectFailure.sh --random
```

The implementation should use Docker to terminate an actual worker container.

Do not merely alter an internal worker state variable.

---

# 27. DEMO-FIRST DATA SIZE

Do not immediately create a massive dataset.

The first goal is a fast, deterministic review demo.

Provide at least two dataset sizes:

```text
demo
benchmark
```

Suggested behavior:

```text
demo:
small enough to finish quickly and leave visible time for the reviewer to kill a worker

benchmark:
large enough to expose partition imbalance and task-duration differences
```

The demo dataset must intentionally leave enough execution time for the failure injection to happen.

A job that completes before the reviewer can kill a worker is not acceptable as the primary demo.

Use controlled task delays or sufficient partition count where needed, but do not fake system behavior.

---

# 28. DEMO MODE

Create an explicit demo mode.

Example:

```bash
./scripts/runDemo.sh
```

It should:

1. clean previous outputs,
2. generate deterministic demo data,
3. start/rebuild the cluster if required,
4. verify workers registered,
5. start the fraud job,
6. print the worker/container names,
7. print the exact command for failure injection,
8. keep the job running long enough for the live interaction,
9. show recovery,
10. show final fraud rings,
11. show correctness.

Print something like:

```text
=========================================
 FRAUDMESH 70% REVIEW DEMO
=========================================

Cluster:
  master
  worker-1
  worker-2
  worker-3
  worker-4

Fraud job started.

To demonstrate fault tolerance, run:

  ./scripts/injectFailure.sh worker-2

Watch the master terminal for:

  HEARTBEAT TIMEOUT
  WORKER FAILED
  TASK REQUEUED
  TASK REASSIGNED
  TASK COMPLETED

=========================================
```

Do not force the reviewer to remember undocumented commands.

---

# 29. FINAL JOB SUMMARY

Every completed job should print:

```text
========== FRAUDMESH JOB SUMMARY ==========

Job ID: ...
Workers: ...
Input records: ...

Map tasks:
  total: ...
  completed: ...
  retried: ...

Reduce tasks:
  total: ...
  completed: ...

Fault tolerance:
  workers failed: ...
  tasks re-executed: ...
  late results ignored: ...

Speculation:
  speculative attempts: ...

Skew:
  skewed partitions: ...
  rebalances: ...

Fraud mining:
  CC iterations: ...
  fraud rings detected: ...

Performance:
  duration: ... sec
  throughput: ... records/sec

Correctness:
  PASS / FAIL

=============================================
```

Only display values that are actually measured.

---

# 30. CONFIGURATION

Centralize configuration in `common/config.js`.

Support environment variables:

```text
MASTER_HOST=master
MASTER_PORT=5000

HEARTBEAT_INTERVAL_MS=2000
HEARTBEAT_MISSES_ALLOWED=3

SPECULATION_ENABLED=true
SPECULATION_MULTIPLIER=2

SKEW_ENABLED=true
SKEW_THRESHOLD=2

MAX_CC_ITERATIONS=100

WORKER_SLOWDOWN_MS=0

LOG_LEVEL=info
```

Use sensible defaults.

The cluster should work without manually setting every variable.

---

# 31. TESTING

Use Node.js's built-in test framework:

```text
node:test
```

and:

```text
node:assert
```

Write tests for:

### Protocol

- serialization
- deserialization
- malformed messages
- framing

### MapReduce

- Map
- Shuffle
- Reduce
- task lifecycle

### Fault tolerance

- heartbeat timeout
- worker death
- task requeue
- retry
- duplicate result suppression
- late result suppression

### Speculation

- straggler detection
- backup launch
- first-result-wins behavior

### Skew

- skew detection
- partition splitting
- rebalancing decision

### Graph algorithms

- connected components
- convergence
- SCC
- cyclic vs acyclic graph

### Fraud detection

- known rings detected
- no unexpected rings in the deterministic demo dataset
- correctness against `expectedRings.json`

Run:

```bash
npm test
```

before considering the milestone complete.

---

# 32. BENCHMARK SUPPORT

The 70% review does not require a production-grade benchmark suite, but the implementation must leave enough measurement infrastructure to demonstrate that the major mechanisms are real.

Implement:

```text
benchmarks/runBenchmark.js
```

with at least:

### Baseline

```text
fault tolerance = OFF
speculation = OFF
skew awareness = OFF
```

### Fault tolerance

```text
0%
10%
30%
```

where practical.

### Skew

```text
skew OFF
skew ON
```

### Speculation

```text
speculation OFF
speculation ON
```

with a slow worker.

### Strong scaling

```text
2 workers
4 workers
```

and optionally more when the host allows.

Save:

```text
benchmarks/results/results.csv
```

with measured fields such as:

```text
experiment
workers
datasetRows
failureRate
durationMs
throughput
correctness
tasksReexecuted
speculativeAttempts
rebalances
ccIterations
maxPartitionSize
avgPartitionSize
```

Do not fabricate missing metrics.

---

# 33. REVIEW ARTIFACTS

Create documentation specifically for a **70% project review**, not just generic README documentation.

## README.md

Explain:

- what FraudMesh is,
- architecture,
- technology stack,
- how to install,
- how to run the cluster,
- how to generate data,
- how to run the fraud job,
- how fault tolerance works,
- how skew handling works,
- how speculative execution works,
- how to run tests,
- how to run benchmarks.

## DEMO_GUIDE.md

Write a live presentation script.

Example:

```text
1. Start cluster.
2. Show four workers registering.
3. Explain the MapReduce pipeline.
4. Start fraud job.
5. Kill worker-2.
6. Show heartbeat timeout.
7. Show task reassignment.
8. Show job completion.
9. Show detected fraud rings.
10. Run correctness check.
11. Demonstrate skew event.
12. Demonstrate speculative execution.
```

For every command, state what the reviewer should expect to see.

## PROGRESS_REPORT.md

Maintain:

```text
Implemented
Verified
Not Yet Verified
Known Limitations
Next 30%
```

Never say:

```text
Fault tolerance works
```

unless you have actually executed a worker-kill test.

Use evidence-oriented wording:

```text
Implemented:
Heartbeat detection and task re-execution.

Verified:
Killed worker-2 during a running job and observed successful task reassignment.

Not Yet Verified:
30% randomized failure benchmark.
```

The source project explicitly requires documentation to distinguish implemented features from features actually verified through execution. fileciteturn0file1L211-L216

---

# 34. WHAT TO SHOW DURING THE 70% REVIEW

The implementation should make this sequence easy:

## Part A — Architecture

Show:

```text
Master
  ├── Worker Registry
  ├── Scheduler
  ├── Failure Detector
  ├── Shuffle
  ├── Speculation
  └── Skew Manager

Workers
```

## Part B — Distributed execution

Run the job and show:

```text
MAP task -> worker
MAP task -> worker
MAP task -> worker
REDUCE task -> worker
```

## Part C — Fault tolerance

Kill a worker.

Show:

```text
HEARTBEAT TIMEOUT
WORKER DEAD
TASK REQUEUED
TASK REASSIGNED
RESULT ACCEPTED
```

## Part D — Fraud workload

Show:

```text
transaction CSV
   ↓
graph edges
   ↓
connected components
   ↓
SCC
   ↓
fraud rings
```

## Part E — Advanced features

Show:

```text
SKEW DETECTED
REBALANCING...
```

and:

```text
STRAGGLER DETECTED
SPECULATIVE ATTEMPT
```

## Part F — Evidence

Show:

```text
CORRECTNESS: PASS
```

and measured benchmark information.

---

# 35. EXPLICITLY OUT OF SCOPE FOR THE 70% REVIEW

Do NOT implement:

- master failover
- standby master
- master checkpointing
- multi-physical-machine deployment
- web dashboard
- REST API
- React frontend
- cloud deployment
- Kubernetes
- Kafka
- Neo4j integration
- ML fraud classifier
- authentication
- user management

Master failover is explicitly a documented future/remaining item in the project design. fileciteturn0file0L105-L118

Docker Compose on one host is sufficient for this milestone. The source review also explicitly excludes a GUI/web dashboard from the 70% scope. fileciteturn0file1L221-L230

---

# 36. GIT DISCIPLINE

Work in phases.

After each meaningful phase:

```bash
git add .
git commit -m "phase X: <description>"
```

Use commits such as:

```text
phase 1: add node cluster skeleton
phase 2: add tcp json protocol
phase 3: implement generic mapreduce
phase 4: add word count verification
phase 5: add heartbeat failure detection
phase 6: add task reexecution
phase 7: add fraud dataset and mapper
phase 8: add connected components and scc
phase 9: add skew aware balancing
phase 10: add speculative execution
phase 11: add failure injection and demo mode
phase 12: add review benchmarks and documentation
```

Do not dump the entire project into one commit.

---

# 37. BUILD EXECUTION RULE

Follow this workflow strictly:

```text
INSPECT
  ↓
IMPLEMENT ONE PHASE
  ↓
RUN TESTS
  ↓
RUN REAL COMMANDS
  ↓
INSPECT LOGS / OUTPUT
  ↓
FIX ISSUES
  ↓
UPDATE PROGRESS_REPORT.md
  ↓
COMMIT
  ↓
NEXT PHASE
```

Do not proceed to later phases with an obviously broken earlier phase.

If something fails, diagnose and fix it before continuing.

---

# 38. DEFINITION OF DONE — 70% REVIEW MILESTONE

The milestone is complete when all of these are true:

### Cluster

```bash
docker compose up --build --scale worker=4
```

starts successfully.

### Worker registration

Four workers register and send heartbeats.

### MapReduce

A distributed word-count job completes correctly.

### Fault tolerance

A worker can actually be killed during a running job.

The master detects it and reassigns its unfinished task.

### Duplicate safety

A late/duplicate task result cannot corrupt final output.

### Fraud workload

The synthetic dataset contains known rings and the engine detects them.

### Graph algorithm

Connected components use iterative Hash-to-Min style propagation.

SCC detection uses Tarjan or an equivalent SCC algorithm.

### Skew awareness

A sufficiently skewed workload triggers real partition-size detection and rebalancing.

### Speculation

A deliberately slowed worker triggers a real backup task attempt.

### Demo

`./scripts/runDemo.sh` or an equivalent documented flow makes the review possible without undocumented steps.

### Tests

```bash
npm test
```

passes.

### Documentation

`README.md`, `DEMO_GUIDE.md`, and `PROGRESS_REPORT.md` clearly describe the current implementation and verification state.

### Honesty

No benchmark, correctness, or fault-tolerance claim is presented as verified unless it was actually executed.

---

# 39. FINAL VIVA POSITIONING

The resulting implementation should make the following explanation true:

> FraudMesh is a custom MapReduce-style distributed processing engine implemented in Node.js. A master schedules Map and Reduce tasks across Dockerized workers. Workers send periodic heartbeats, allowing the master to detect worker failures and re-execute unfinished tasks. Logical task results are accepted exactly once so retries and speculative attempts do not duplicate output. The workload is transaction-graph mining: distributed Hash-to-Min connected components narrow the graph into connected subgraphs, after which local SCC detection identifies cyclic fraud-ring candidates. The engine also includes skew-aware reducer rebalancing and speculative execution for straggler mitigation.

Do not optimize for having many files.

Optimize for having a **small number of clearly working mechanisms that can be demonstrated live in the 70% review**.

Build the system, execute the tests and demos, and update the progress documentation based only on what was actually observed.
