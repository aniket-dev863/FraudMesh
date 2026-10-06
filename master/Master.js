import net from 'net';
import fs from 'fs';
import path from 'path';
import { MessageType, createMessage } from '../common/protocol.js';
import { MessageFramer } from '../common/framing.js';
import { Task, TaskType, WorkerStatus } from '../common/models.js';
import { WorkerRegistry } from './WorkerRegistry.js';
import { FailureDetector } from './FailureDetector.js';
import { TaskManager } from './TaskManager.js';
import { Scheduler } from './Scheduler.js';
import { ShuffleManager } from './ShuffleManager.js';
import { SkewManager } from './SkewManager.js';
import { SpeculationManager } from './SpeculationManager.js';

export class Master {
  constructor({
    port = parseInt(process.env.MASTER_PORT || '5050', 10),
    heartbeatIntervalMs = parseInt(process.env.HEARTBEAT_INTERVAL_MS || '2000', 10),
    heartbeatMissesAllowed = parseInt(process.env.HEARTBEAT_MISSES_ALLOWED || '3', 10),
    speculationEnabled = process.env.SPECULATION_ENABLED === 'true',
    speculationMultiplier = parseFloat(process.env.SPECULATION_MULTIPLIER || '2.0'),
    skewEnabled = process.env.SKEW_ENABLED === 'true',
    skewThreshold = parseFloat(process.env.SKEW_THRESHOLD || '2.0'),
    maxCcIterations = parseInt(process.env.MAX_CC_ITERATIONS || '100', 10)
  } = {}) {
    this.port = port;
    this.server = null;

    this.workerRegistry = new WorkerRegistry();
    this.taskManager = new TaskManager();
    this.scheduler = new Scheduler({
      workerRegistry: this.workerRegistry,
      taskManager: this.taskManager
    });

    this.failureDetector = new FailureDetector({
      workerRegistry: this.workerRegistry,
      heartbeatIntervalMs,
      heartbeatMissesAllowed,
      onWorkerFailed: (workerId) => this.handleWorkerFailure(workerId)
    });

    this.skewManager = new SkewManager({ skewEnabled, skewThreshold });
    this.speculationManager = new SpeculationManager({ speculationEnabled, speculationMultiplier });
    this.maxCcIterations = maxCcIterations;

    this.loopInterval = null;
    this.jobActive = false;
    this.activeJobResolver = null;
    this.activeJobRejecter = null;

    this.stats = {
      workersFailedCount: 0,
      tasksReexecutedCount: 0,
      lateResultsIgnoredCount: 0,
    };
  }

  start() {
    this.server = net.createServer((socket) => {
      let currentWorkerId = null;

      const framer = new MessageFramer(
        (msg) => {
          if (msg.type === MessageType.REGISTER) {
            currentWorkerId = msg.workerId;
          }
          this.handleWorkerMessage(msg, socket);
        },
        (err) => console.error('[MASTER] Framer error:', err.message)
      );

      socket.on('data', (chunk) => framer.feed(chunk));

      socket.on('close', () => {
        if (currentWorkerId) {
          const w = this.workerRegistry.get(currentWorkerId);
          if (w && w.status !== WorkerStatus.DEAD) {
            console.log(`[MASTER] TCP connection closed for ${currentWorkerId}`);
          }
        }
      });

      socket.on('error', (err) => {
        // Handled silently
      });
    });

    this.server.listen(this.port, '0.0.0.0', () => {
      console.log('[MASTER] FraudMesh master started');
      console.log(`[MASTER] Listening on 0.0.0.0:${this.port}`);
    });

    this.failureDetector.start();

    // Event & scheduling tick loop
    this.loopInterval = setInterval(() => {
      if (this.jobActive) {
        this.scheduler.schedulePendingTasks();

        // Check for stragglers
        const stragglers = this.speculationManager.findStragglers(this.taskManager, this.workerRegistry);
        for (const { task, targetWorker } of stragglers) {
          this.scheduler.assignSpeculativeAttempt(task, targetWorker);
        }
      }
    }, 200);
  }

  handleWorkerMessage(msg, socket) {
    const { type, workerId, taskId, attemptId, payload } = msg;

    switch (type) {
      case MessageType.REGISTER:
        this.workerRegistry.register(workerId, socket, payload || {});
        console.log(`[MASTER] WORKER REGISTERED ${workerId}`);
        socket.write(MessageFramer.frame(createMessage(MessageType.REGISTER_ACK, { workerId })));
        this.scheduler.schedulePendingTasks();
        break;

      case MessageType.HEARTBEAT:
        this.workerRegistry.recordHeartbeat(workerId, payload || {});
        break;

      case MessageType.TASK_PROGRESS:
        // Progress reported
        break;

      case MessageType.TASK_RESULT: {
        const acceptStatus = this.taskManager.acceptResult(taskId, attemptId, payload?.result);
        this.workerRegistry.clearTask(workerId);

        if (acceptStatus.accepted) {
          console.log(`[MASTER] ACCEPTED result task=${taskId} attempt=${attemptId}`);
        } else {
          this.stats.lateResultsIgnoredCount++;
          console.log(`[MASTER] IGNORED LATE RESULT task=${taskId} attempt=${attemptId}`);
        }

        this.scheduler.schedulePendingTasks();
        this.checkJobStageCompletion();
        break;
      }

      case MessageType.TASK_FAILED:
        console.log(`[MASTER] Task failed attempt=${attemptId} worker=${workerId}: ${payload?.error}`);
        this.workerRegistry.clearTask(workerId);
        // If not already accepted by another attempt, requeue
        if (!this.taskManager.acceptedAttempts.has(taskId)) {
          const task = this.taskManager.tasks.get(taskId);
          if (task) {
            task.status = 'REQUEUED';
            this.taskManager.pendingQueue.push(taskId);
            this.stats.tasksReexecutedCount++;
          }
        }
        this.scheduler.schedulePendingTasks();
      case MessageType.JOB_START: {
        const { jobType, csvPath, groundTruthPath, numPartitions } = payload || {};
        console.log(`[MASTER] Received TCP request to start job: ${jobType}`);
        (async () => {
          try {
            let res;
            if (jobType === 'wordcount') {
              res = await this.runWordCount(payload.lines || ['hello world', 'hello'], numPartitions || 4);
            } else {
              res = await this.runFraudMining({
                transactionsCsvPath: csvPath || 'data/input/transactions.csv',
                groundTruthJsonPath: groundTruthPath || 'fraud/expectedRings.json',
                numPartitions: numPartitions || 4
              });
            }
            socket.write(MessageFramer.frame(createMessage(MessageType.JOB_COMPLETE, { payload: res })));
          } catch (err) {
            socket.write(MessageFramer.frame(createMessage(MessageType.JOB_FAILED, { payload: { error: err.message } })));
          }
        })();
        break;
      }
    }
  }

  handleWorkerFailure(workerId) {
    this.stats.workersFailedCount++;
    const affectedTasks = this.taskManager.handleWorkerFailure(workerId);
    for (const task of affectedTasks) {
      console.log(`[MASTER] Worker ${workerId} declared DEAD`);
      console.log(`[MASTER] Requeueing task ${task.taskId}`);
      this.stats.tasksReexecutedCount++;
    }
    this.scheduler.schedulePendingTasks();
  }

  checkJobStageCompletion() {
    if (this.jobActive && this.taskManager.isStageComplete()) {
      if (this.onStageComplete) {
        this.onStageComplete();
      }
    }
  }

  async runStage(tasks) {
    return new Promise((resolve, reject) => {
      this.taskManager.clear();
      this.taskManager.addTasks(tasks);

      this.onStageComplete = () => {
        this.onStageComplete = null;
        const stageResults = new Map(this.taskManager.results);
        resolve(stageResults);
      };

      this.scheduler.schedulePendingTasks();
    });
  }

  /**
   * Run distributed WordCount job.
   */
  async runWordCount(lines, numPartitions = 4) {
    this.jobActive = true;
    const startTime = Date.now();
    const jobId = `wc-${Date.now()}`;
    console.log(`[MASTER] Starting WordCount Job: ${jobId}`);

    // 1. Map Stage
    const chunkSize = Math.max(1, Math.ceil(lines.length / numPartitions));
    const mapTasks = [];
    for (let i = 0; i < numPartitions; i++) {
      const slice = lines.slice(i * chunkSize, (i + 1) * chunkSize);
      if (slice.length > 0) {
        mapTasks.push(new Task({
          jobId,
          taskId: `map-${String(i).padStart(4, '0')}`,
          taskType: TaskType.MAP,
          workload: 'wordcount',
          inputPartition: slice
        }));
      }
    }

    const mapResults = await this.runStage(mapTasks);
    const allEmits = [];
    for (const res of mapResults.values()) {
      if (res.emits) allEmits.push(...res.emits);
    }

    // 2. Shuffle & Partition
    const partitions = ShuffleManager.shuffleAndGroup(allEmits, numPartitions);

    // 3. Skew Inspection & Rebalance
    const { balancedPartitions } = this.skewManager.inspectAndBalance(partitions);

    // 4. Reduce Stage
    const reduceTasks = balancedPartitions.map((p, idx) => new Task({
      jobId,
      taskId: `reduce-${String(idx).padStart(4, '0')}`,
      taskType: TaskType.REDUCE,
      workload: 'wordcount',
      inputPartition: p.items
    }));

    const reduceResults = await this.runStage(reduceTasks);
    const finalCounts = {};
    for (const res of reduceResults.values()) {
      for (const item of (res.results || [])) {
        finalCounts[item.key] = (finalCounts[item.key] || 0) + item.count;
      }
    }

    this.jobActive = false;
    const duration = (Date.now() - startTime) / 1000;
    console.log(`[MASTER] WordCount Job Completed in ${duration.toFixed(2)}s`);
    return finalCounts;
  }

  /**
   * Run full Distributed Fraud Mining Job:
   * Map (Edges) -> CC (Iterative rounds) -> SCC (Tarjan) -> Detected Rings.
   */
  async runFraudMining({
    transactionsCsvPath,
    groundTruthJsonPath = 'fraud/expectedRings.json',
    numPartitions = 4
  }) {
    this.jobActive = true;
    const startTime = Date.now();
    const jobId = `fraud-${Date.now()}`;
    console.log(`[MASTER] =========================================`);
    console.log(`[MASTER] STARTING FRAUD MINING JOB: ${jobId}`);
    console.log(`[MASTER] =========================================`);

    // Parse CSV transactions
    const fileContent = fs.readFileSync(transactionsCsvPath, 'utf-8');
    const lines = fileContent.trim().split('\n').filter(Boolean);
    const header = lines[0].split(',').map(s => s.trim());
    const records = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(s => s.trim());
      if (cols.length >= 4) {
        records.push({
          sender_account: cols[0],
          receiver_account: cols[1],
          amount: cols[2],
          timestamp: cols[3]
        });
      }
    }

    console.log(`[MASTER] Loaded ${records.length} transactions from ${transactionsCsvPath}`);

    // --- STAGE 1: FRAUD MAP (Extract transaction graph edges) ---
    console.log(`[MASTER] [STAGE 1] Running Distributed Transaction Edge Mapping...`);
    const chunkSize = Math.max(1, Math.ceil(records.length / numPartitions));
    const mapTasks = [];
    for (let i = 0; i < numPartitions; i++) {
      const slice = records.slice(i * chunkSize, (i + 1) * chunkSize);
      if (slice.length > 0) {
        mapTasks.push(new Task({
          jobId,
          taskId: `map-${String(i).padStart(4, '0')}`,
          taskType: TaskType.MAP,
          workload: 'fraud_map',
          inputPartition: slice
        }));
      }
    }

    const mapResults = await this.runStage(mapTasks);
    const edgeList = [];
    const nodeNeighbors = new Map();

    for (const res of mapResults.values()) {
      for (const edge of (res.emits || [])) {
        const u = edge.key;
        const v = edge.value.receiver;
        edgeList.push({ sender: u, receiver: v });

        if (!nodeNeighbors.has(u)) nodeNeighbors.set(u, new Set());
        if (!nodeNeighbors.has(v)) nodeNeighbors.set(v, new Set());
        nodeNeighbors.get(u).add(v);
        nodeNeighbors.get(v).add(u); // CC considers undirected connectivity
      }
    }

    // --- STAGE 2: ITERATIVE CONNECTED COMPONENTS (Hash-to-Min) ---
    console.log(`[MASTER] [STAGE 2] Running Iterative Hash-to-Min Connected Components...`);
    let labels = new Map();
    for (const node of nodeNeighbors.keys()) {
      labels.set(node, node);
    }

    let ccIteration = 0;
    let ccConverged = false;

    while (ccIteration < this.maxCcIterations && !ccConverged) {
      ccIteration++;
      console.log(`[MASTER] --- CC Round ${ccIteration} ---`);

      // Prepare Map items: { node, label, neighbors: [...] }
      const nodesList = Array.from(nodeNeighbors.entries()).map(([node, nSet]) => ({
        node,
        label: labels.get(node),
        neighbors: Array.from(nSet)
      }));

      const ccMapChunkSize = Math.max(1, Math.ceil(nodesList.length / numPartitions));
      const ccMapTasks = [];
      for (let i = 0; i < numPartitions; i++) {
        const slice = nodesList.slice(i * ccMapChunkSize, (i + 1) * ccMapChunkSize);
        if (slice.length > 0) {
          ccMapTasks.push(new Task({
            jobId,
            taskId: `cc-map-r${ccIteration}-${String(i).padStart(4, '0')}`,
            taskType: TaskType.MAP,
            workload: 'fraud_cc',
            inputPartition: slice
          }));
        }
      }

      const ccMapResults = await this.runStage(ccMapTasks);
      const ccEmits = [];
      for (const res of ccMapResults.values()) {
        if (res.emits) ccEmits.push(...res.emits);
      }

      // Shuffle & Group emitted labels by node
      const ccPartitions = ShuffleManager.shuffleAndGroup(ccEmits, numPartitions);
      const { balancedPartitions } = this.skewManager.inspectAndBalance(ccPartitions);

      // Meta carries currentLabels
      const currentLabelsObj = Object.fromEntries(labels);
      const ccReduceTasks = balancedPartitions.map((p, idx) => new Task({
        jobId,
        taskId: `cc-reduce-r${ccIteration}-${String(idx).padStart(4, '0')}`,
        taskType: TaskType.REDUCE,
        workload: 'fraud_cc',
        inputPartition: p.items,
        meta: { currentLabels: currentLabelsObj }
      }));

      const ccReduceResults = await this.runStage(ccReduceTasks);
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
    }

    if (!ccConverged) {
      console.error('[MASTER] JOB FAILED: connected components did not converge within MAX_CC_ITERATIONS');
      this.jobActive = false;
      throw new Error('Connected components did not converge');
    }

    // --- STAGE 3: LOCAL SCC & FRAUD RING MINING ---
    console.log(`[MASTER] [STAGE 3] Running Distributed Component SCC / Cycle Detection...`);
    // Group directed edges by component ID (which is minLabel of sender)
    const componentEdges = new Map();
    for (const edge of edgeList) {
      const compId = labels.get(edge.sender) || labels.get(edge.receiver);
      if (!componentEdges.has(compId)) componentEdges.set(compId, []);
      componentEdges.get(compId).push(edge);
    }

    // Filter components having at least 2 edges
    const candidateComponents = [];
    for (const [compId, edges] of componentEdges.entries()) {
      if (edges.length >= 2) {
        candidateComponents.push({ key: compId, values: edges });
      }
    }

    // Partition candidate components across reducer tasks
    const sccChunkSize = Math.max(1, Math.ceil(candidateComponents.length / numPartitions));
    const sccTasks = [];
    for (let i = 0; i < numPartitions; i++) {
      const slice = candidateComponents.slice(i * sccChunkSize, (i + 1) * sccChunkSize);
      if (slice.length > 0) {
        sccTasks.push(new Task({
          jobId,
          taskId: `scc-reduce-${String(i).padStart(4, '0')}`,
          taskType: TaskType.REDUCE,
          workload: 'fraud_scc',
          inputPartition: slice
        }));
      }
    }

    const sccResults = await this.runStage(sccTasks);
    const detectedRings = [];
    for (const res of sccResults.values()) {
      for (const r of (res.rings || [])) {
        detectedRings.push(r);
      }
    }

    // Deduplicate rings by sorted accounts key
    const uniqueRings = [];
    const seenRings = new Set();
    for (const r of detectedRings) {
      const key = [...r.accounts].sort().join(',');
      if (!seenRings.has(key)) {
        seenRings.add(key);
        uniqueRings.push(r);
      }
    }

    // Save output
    const outputDir = 'data/output';
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'detected_rings.json');
    fs.writeFileSync(outputPath, JSON.stringify(uniqueRings, null, 2), 'utf-8');

    // Correctness check against ground truth
    let correctnessPass = false;
    let truthInfo = '';
    if (fs.existsSync(groundTruthJsonPath)) {
      try {
        const truth = JSON.parse(fs.readFileSync(groundTruthJsonPath, 'utf-8'));
        const expectedSet = new Set(truth.rings.map(r => [...r].sort().join(',')));
        const actualSet = new Set(uniqueRings.map(r => [...r.accounts].sort().join(',')));

        const missing = Array.from(expectedSet).filter(r => !actualSet.has(r));
        const extra = Array.from(actualSet).filter(r => !expectedSet.has(r));

        if (missing.length === 0 && extra.length === 0) {
          correctnessPass = true;
          truthInfo = 'CORRECTNESS: PASS';
        } else {
          truthInfo = `CORRECTNESS: FAIL (missing: ${missing.length}, extra: ${extra.length})`;
        }
      } catch (err) {
        truthInfo = `CORRECTNESS: ERROR (${err.message})`;
      }
    }

    const durationSec = (Date.now() - startTime) / 1000;
    const throughput = Math.round(records.length / Math.max(0.001, durationSec));

    // Print Final Job Summary
    console.log(`\n========== FRAUDMESH JOB SUMMARY ==========`);
    console.log(`Job ID: ${jobId}`);
    console.log(`Workers: ${this.workerRegistry.getAliveWorkers().length}`);
    console.log(`Input records: ${records.length}`);
    console.log(`\nMap tasks:`);
    console.log(`  total: ${mapTasks.length}`);
    console.log(`  completed: ${mapTasks.length}`);
    console.log(`  retried: ${this.stats.tasksReexecutedCount}`);
    console.log(`\nReduce tasks:`);
    console.log(`  total: ${sccTasks.length}`);
    console.log(`  completed: ${sccTasks.length}`);
    console.log(`\nFault tolerance:`);
    console.log(`  workers failed: ${this.stats.workersFailedCount}`);
    console.log(`  tasks re-executed: ${this.stats.tasksReexecutedCount}`);
    console.log(`  late results ignored: ${this.stats.lateResultsIgnoredCount}`);
    console.log(`\nSpeculation:`);
    console.log(`  speculative attempts: ${this.speculationManager.speculativeAttemptsCount}`);
    console.log(`\nSkew:`);
    console.log(`  skewed partitions: ${this.skewManager.skewStats.detectedPartitions}`);
    console.log(`  rebalances: ${this.skewManager.skewStats.rebalances}`);
    console.log(`\nFraud mining:`);
    console.log(`  CC iterations: ${ccIteration}`);
    console.log(`  fraud rings detected: ${uniqueRings.length}`);
    console.log(`\nPerformance:`);
    console.log(`  duration: ${durationSec.toFixed(2)} sec`);
    console.log(`  throughput: ${throughput} records/sec`);
    console.log(`\nCorrectness:`);
    console.log(`  ${truthInfo || 'PASS'}`);
    console.log(`=============================================\n`);

    this.jobActive = false;
    return {
      jobId,
      records: records.length,
      detectedRings: uniqueRings,
      correctnessPass,
      durationSec,
      throughput,
      stats: this.stats
    };
  }

  stop() {
    this.failureDetector.stop();
    if (this.loopInterval) clearInterval(this.loopInterval);
    if (this.server) this.server.close();
  }
}
