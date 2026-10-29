import fs from 'fs';
import path from 'path';
import { OrderContext } from './ordering.js';
import { HashToMinAlgorithm } from './hash_to_min.js';
import { HashGreaterToMinAlgorithm } from './hash_greater_to_min.js';
import { Task, TaskType } from '../../common/models.js';
import { MessageType } from '../../common/protocol.js';
import { ShuffleManager } from '../../master/ShuffleManager.js';

export function resolveAlgorithm(algorithmOrName) {
  if (typeof algorithmOrName === 'string') {
    const norm = algorithmOrName.trim().toLowerCase();
    if (norm === 'hash_greater_to_min' || norm === 'hcm') {
      return new HashGreaterToMinAlgorithm();
    }
    return new HashToMinAlgorithm();
  }
  return algorithmOrName;
}

/**
 * Driver executing connected-components rounds (local in-process or distributed via Master).
 */
export async function runCCDriver({
  algorithm = 'hash_to_min',
  orderMode = 'natural',
  seed = 42,
  graphFamily = 'custom',
  runId = `cc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  nodes = [],
  adjacency = new Map(),
  executionMode = 'local',
  master = null,
  jobId = `job-cc-${Date.now()}`,
  numPartitions = 4,
  stageDelayMs = 0,
  maxRounds = null,
  resultsJsonlPath = 'results/cc_rounds.jsonl',
  recordMetrics = true,
  onRoundMetric = null
} = {}) {
  const algo = resolveAlgorithm(algorithm);
  const orderContext = new OrderContext(orderMode, seed);

  // Normalize graph nodes and undirected adjacency
  const nodeSet = new Set(nodes);
  const adjMap = new Map();

  for (const n of nodeSet) {
    adjMap.set(n, new Set([n]));
  }

  let edgeCount = 0;
  for (const [u, neighbors] of adjacency.entries()) {
    nodeSet.add(u);
    if (!adjMap.has(u)) adjMap.set(u, new Set([u]));
    for (const v of neighbors) {
      nodeSet.add(v);
      if (!adjMap.has(v)) adjMap.set(v, new Set([v]));
      if (u !== v) {
        adjMap.get(u).add(v);
        adjMap.get(v).add(u);
        edgeCount++;
      }
    }
  }
  // If adjacency was directed/bidirectional, undirected edges = edgeCount / 2
  const numEdges = Math.round(edgeCount / 2);
  const allNodes = Array.from(nodeSet);
  const numNodes = allNodes.length;

  // Max-rounds guard: 10 * ceil(log2(max(2, n))) + 20
  const maxRoundsGuard = maxRounds || (10 * Math.ceil(Math.log2(Math.max(2, numNodes))) + 20);

  // Initialize clusters: C_v = {v} U Gamma(v)
  let clusters = new Map();
  for (const node of allNodes) {
    clusters.set(node, new Set(adjMap.get(node) || [node]));
  }

  let round = 0;
  let converged = false;
  const metricsHistory = [];

  while (round < maxRoundsGuard && !converged) {
    round++;
    const roundStartTime = performance.now();

    let emittedPairs = [];
    let mapRecords = allNodes.length;

    if (executionMode === 'distributed' && master) {
      // --- Distributed Execution via Master ---
      const mapInputs = allNodes.map(node => ({
        node,
        cluster: Array.from(clusters.get(node) || [node])
      }));

      const chunkSize = Math.max(1, Math.ceil(mapInputs.length / numPartitions));
      const mapTasks = [];
      for (let i = 0; i < numPartitions; i++) {
        const slice = mapInputs.slice(i * chunkSize, (i + 1) * chunkSize);
        if (slice.length > 0) {
          mapTasks.push(new Task({
            jobId,
            taskId: `cc-map-r${round}-${String(i).padStart(4, '0')}`,
            taskType: TaskType.MAP,
            workload: 'fraud_cc',
            inputPartition: slice,
            meta: {
              ccAlgorithm: algo.name,
              orderMode,
              seed
            }
          }));
        }
      }

      const mapResults = await master.runStage(mapTasks, stageDelayMs);
      for (const res of mapResults.values()) {
        if (res.emits) emittedPairs.push(...res.emits);
      }
    } else {
      // --- Local In-Process Execution ---
      for (const node of allNodes) {
        const clusterArr = Array.from(clusters.get(node) || [node]);
        const emits = algo.map({ node, cluster: clusterArr }, orderContext);
        for (const e of emits) emittedPairs.push(e);
      }
    }

    // --- Calculate Shuffle Metrics ---
    let shuffleElements = 0;
    let shuffleBytes = 0;
    const keyToValues = new Map();

    for (const pair of emittedPairs) {
      const val = pair.value;
      const elemCount = Array.isArray(val) ? val.length : 1;
      shuffleElements += elemCount;

      // Serialized size using standard JSON serializer
      const jsonStr = JSON.stringify(pair);
      shuffleBytes += Buffer.byteLength(jsonStr, 'utf-8');

      const k = pair.key;
      if (!keyToValues.has(k)) keyToValues.set(k, []);
      keyToValues.get(k).push(val);
    }

    const distinctKeys = keyToValues.size;
    let maxValuesAtOneReducer = 0;
    for (const values of keyToValues.values()) {
      let count = 0;
      for (const v of values) {
        count += (Array.isArray(v) ? v.length : 1);
      }
      if (count > maxValuesAtOneReducer) maxValuesAtOneReducer = count;
    }

    // --- Reduce Step ---
    let changedNodes = 0;
    const nextClusters = new Map();

    if (executionMode === 'distributed' && master) {
      const ccPartitions = ShuffleManager.shuffleAndGroup(emittedPairs, numPartitions);
      const { balancedPartitions } = master.skewManager.inspectAndBalance(ccPartitions);

      const reduceTasks = balancedPartitions.map((p, idx) => new Task({
        jobId,
        taskId: `cc-reduce-r${round}-${String(idx).padStart(4, '0')}`,
        taskType: TaskType.REDUCE,
        workload: 'fraud_cc',
        inputPartition: p.items,
        meta: {
          ccAlgorithm: algo.name,
          orderMode,
          seed
        }
      }));

      const reduceResults = await master.runStage(reduceTasks, stageDelayMs);
      for (const res of reduceResults.values()) {
        if (res.updatedClusters) {
          for (const item of res.updatedClusters) {
            nextClusters.set(item.node, new Set(item.cluster));
          }
        }
      }

      // Check changed nodes compared to previous round
      for (const node of allNodes) {
        const nextSet = nextClusters.get(node) || new Set([node]);
        const prevSet = clusters.get(node) || new Set([node]);
        if (nextSet.size !== prevSet.size || Array.from(nextSet).some(x => !prevSet.has(x))) {
          changedNodes++;
        }
      }
    } else {
      // Local Reduce
      for (const node of allNodes) {
        const values = keyToValues.get(node) || [];
        const reduced = algo.reduce(node, values, orderContext);
        const nextSet = new Set(reduced.cluster);
        const prevSet = clusters.get(node) || new Set([node]);

        if (nextSet.size !== prevSet.size || Array.from(nextSet).some(x => !prevSet.has(x))) {
          changedNodes++;
        }
        nextClusters.set(node, nextSet);
      }
    }

    clusters = nextClusters;
    if (changedNodes === 0) {
      converged = true;
    }

    const roundDurationSec = (performance.now() - roundStartTime) / 1000;

    // Diagnostic check for Hash-Greater-to-Min
    const elementsRatio = shuffleElements / Math.max(1, numNodes + numEdges);
    if (algo.name === 'hash_greater_to_min' && elementsRatio > 2.0) {
      console.warn(`[CC-DIAGNOSTIC] Hash-Greater-to-Min exceeded 2(|V|+|E|) in round ${round}: elements=${shuffleElements}, |V|+|E|=${numNodes + numEdges}, ratio=${elementsRatio.toFixed(3)}`);
    }

    const roundMetric = {
      run_id: runId,
      algorithm: algo.name,
      seed,
      order_mode: orderMode,
      graph_family: graphFamily,
      n_nodes: numNodes,
      n_edges: numEdges,
      round,
      map_records: mapRecords,
      shuffle_elements: shuffleElements,
      shuffle_bytes: shuffleBytes,
      distinct_keys: distinctKeys,
      max_values_at_one_reducer: maxValuesAtOneReducer,
      changed_nodes: changedNodes,
      round_seconds: parseFloat(roundDurationSec.toFixed(4)),
      converged,
      elements_per_ve: parseFloat(elementsRatio.toFixed(4))
    };

    metricsHistory.push(roundMetric);
    if (onRoundMetric) onRoundMetric(roundMetric);

    if (recordMetrics && resultsJsonlPath) {
      const dir = path.dirname(resultsJsonlPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(resultsJsonlPath, JSON.stringify(roundMetric) + '\n', 'utf-8');
    }
  }

  if (!converged && round >= maxRoundsGuard) {
    throw new Error(`Connected components did not converge within max-rounds guard (${maxRoundsGuard} rounds) for algorithm ${algo.name}`);
  }

  // Extract component assignments: node -> componentId
  const nodeToComponent = algo.extractComponents(clusters, orderContext);

  return {
    runId,
    algorithm: algo.name,
    orderMode,
    seed,
    converged,
    rounds: round,
    nodeToComponent,
    clusters,
    metrics: metricsHistory
  };
}
