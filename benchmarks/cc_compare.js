import fs from 'fs';
import path from 'path';
import { runCCDriver } from '../fraud/cc/driver.js';
import { generateSyntheticData } from '../fraud/generateDataset.js';

/**
 * CC Algorithm Comparison Benchmark
 *
 * Graph families:
 *   - path:    P_n (n = 2^10 ... 2^16)
 *   - sparse:  Erdős–Rényi with avg degree ≈ 3
 *   - power:   Preferential attachment (Barabási–Albert), large components + skew
 *   - fraud:   Synthetic fraud dataset at several sizes
 *
 * Both algorithms run with natural and seeded-random order.
 * Hash-Greater-to-Min runs with 5+ seeds per graph.
 */

// ─── Graph Generators ────────────────────────────────────────────────────────

function generatePath(n) {
  const nodes = Array.from({ length: n }, (_, i) => `p${i}`);
  const adj = new Map();
  for (const node of nodes) adj.set(node, new Set());
  for (let i = 0; i < n - 1; i++) {
    adj.get(nodes[i]).add(nodes[i + 1]);
    adj.get(nodes[i + 1]).add(nodes[i]);
  }
  return { nodes, adjacency: adj, edgeCount: n - 1 };
}

function generateErdosRenyi(n, avgDeg, seed) {
  const nodes = Array.from({ length: n }, (_, i) => `er${i}`);
  const adj = new Map();
  for (const node of nodes) adj.set(node, new Set());
  // p such that expected degree ≈ avgDeg
  const p = avgDeg / (n - 1);
  let rng = mulberry32(seed);
  let edgeCount = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (rng() < p) {
        adj.get(nodes[i]).add(nodes[j]);
        adj.get(nodes[j]).add(nodes[i]);
        edgeCount++;
      }
    }
  }
  return { nodes, adjacency: adj, edgeCount };
}

function generateBarabasiAlbert(n, m, seed) {
  // m: edges to attach from each new node
  const nodes = Array.from({ length: n }, (_, i) => `ba${i}`);
  const adj = new Map();
  for (const node of nodes) adj.set(node, new Set());
  let rng = mulberry32(seed);

  // Start with a complete graph of m+1 nodes
  const init = Math.min(m + 1, n);
  for (let i = 0; i < init; i++) {
    for (let j = i + 1; j < init; j++) {
      adj.get(nodes[i]).add(nodes[j]);
      adj.get(nodes[j]).add(nodes[i]);
    }
  }

  let edgeCount = (init * (init - 1)) / 2;

  // Degree list for preferential attachment (repeated nodes)
  const targets = [];
  for (let i = 0; i < init; i++) {
    for (let j = i + 1; j < init; j++) {
      targets.push(nodes[i], nodes[j]);
    }
  }

  for (let i = init; i < n; i++) {
    const newNode = nodes[i];
    const selected = new Set();
    const attempts = m * 10;
    for (let a = 0; a < attempts && selected.size < m; a++) {
      const target = targets[Math.floor(rng() * targets.length)];
      if (target !== newNode && !selected.has(target)) {
        selected.add(target);
      }
    }
    for (const target of selected) {
      adj.get(newNode).add(target);
      adj.get(target).add(newNode);
      targets.push(newNode, target);
      edgeCount++;
    }
  }

  return { nodes, adjacency: adj, edgeCount };
}

function generateFraudGraph(nRows, seed) {
  const { transactions } = generateSyntheticData({ rows: nRows, seed });
  const adj = new Map();
  let edgeCount = 0;
  for (const t of transactions) {
    const u = t.sender_account, v = t.receiver_account;
    if (!adj.has(u)) adj.set(u, new Set());
    if (!adj.has(v)) adj.set(v, new Set());
    if (!adj.get(u).has(v)) {
      adj.get(u).add(v);
      adj.get(v).add(u);
      edgeCount++;
    }
  }
  return { nodes: Array.from(adj.keys()), adjacency: adj, edgeCount };
}

// Simple 32-bit seeded PRNG
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ─── Main Benchmark ──────────────────────────────────────────────────────────

async function runBenchmark() {
  console.log('====================================================');
  console.log('   CC ALGORITHM COMPARISON BENCHMARK');
  console.log('====================================================\n');

  // Clear previous results
  const resultsJsonl = 'results/cc_rounds.jsonl';
  if (fs.existsSync(resultsJsonl)) fs.writeFileSync(resultsJsonl, '', 'utf-8');

  const csvRows = [];
  const hgtmSeeds = [1, 7, 42, 99, 123];

  // ─── Define experiments ─────────────────────────────────────────────────────

  const experiments = [];

  // Path graphs: n = 64, 128, 256, 512, 1024
  for (const n of [64, 128, 256, 512, 1024]) {
    const { nodes, adjacency, edgeCount } = generatePath(n);
    experiments.push({
      family: 'path',
      label: `path_${n}`,
      n, edges: edgeCount,
      nodes, adjacency,
      seed: 42
    });
  }

  // Random sparse (avg degree ≈ 3): n = 512, 1024, 2048
  for (const n of [512, 1024, 2048]) {
    const { nodes, adjacency, edgeCount } = generateErdosRenyi(n, 3, 42);
    experiments.push({
      family: 'sparse',
      label: `sparse_${n}`,
      n, edges: edgeCount,
      nodes, adjacency,
      seed: 42
    });
  }

  // Preferential attachment / power-law: n = 512, 1024, 2048
  for (const n of [512, 1024, 2048]) {
    const { nodes, adjacency, edgeCount } = generateBarabasiAlbert(n, 3, 42);
    experiments.push({
      family: 'power_law',
      label: `power_${n}`,
      n, edges: edgeCount,
      nodes, adjacency,
      seed: 42
    });
  }

  // Fraud datasets at several sizes
  for (const nRows of [500, 1000, 2000]) {
    const { nodes, adjacency, edgeCount } = generateFraudGraph(nRows, 42);
    experiments.push({
      family: 'fraud',
      label: `fraud_${nRows}`,
      n: nodes.length, edges: edgeCount,
      nodes, adjacency,
      seed: 42
    });
  }

  // ─── Run all experiments ────────────────────────────────────────────────────

  let expIdx = 0;
  for (const exp of experiments) {
    expIdx++;
    console.log(`\n[${expIdx}/${experiments.length}] ${exp.label} (n=${exp.n}, edges=${exp.edges})`);

    // Hash-to-Min: natural + seeded(42)
    for (const orderMode of ['natural', 'seeded']) {
      const runId = `htm_${exp.label}_${orderMode}`;
      console.log(`  HtM (${orderMode}) ...`);
      const startMs = performance.now();
      const res = await runCCDriver({
        algorithm: 'hash_to_min',
        orderMode,
        seed: 42,
        graphFamily: exp.family,
        runId,
        nodes: exp.nodes,
        adjacency: exp.adjacency,
        maxRounds: null,
        resultsJsonlPath: resultsJsonl,
        recordMetrics: true
      });
      const durationMs = performance.now() - startMs;

      const totalShuffleBytes = res.metrics.reduce((s, m) => s + m.shuffle_bytes, 0);
      const totalShuffleElements = res.metrics.reduce((s, m) => s + m.shuffle_elements, 0);
      const peakReducerValues = Math.max(...res.metrics.map(m => m.max_values_at_one_reducer));
      const maxElementsRatio = Math.max(...res.metrics.map(m => m.elements_per_ve));

      csvRows.push({
        run_id: runId,
        algorithm: 'hash_to_min',
        order_mode: orderMode,
        seed: 42,
        graph_family: exp.family,
        graph_label: exp.label,
        n_nodes: exp.n,
        n_edges: exp.edges,
        rounds: res.rounds,
        total_shuffle_elements: totalShuffleElements,
        total_shuffle_bytes: totalShuffleBytes,
        peak_reducer_values: peakReducerValues,
        max_elements_per_ve: parseFloat(maxElementsRatio.toFixed(4)),
        duration_ms: Math.round(durationMs),
        converged: res.converged
      });

      console.log(`    → ${res.rounds} rounds, ${durationMs.toFixed(0)}ms, shuffle=${totalShuffleBytes}B`);
    }

    // Hash-Greater-to-Min: natural order
    for (const orderMode of ['natural']) {
      const runId = `hgtm_${exp.label}_${orderMode}`;
      console.log(`  HGtM (${orderMode}) ...`);
      const startMs = performance.now();
      try {
        const res = await runCCDriver({
          algorithm: 'hash_greater_to_min',
          orderMode,
          seed: 42,
          graphFamily: exp.family,
          runId,
          nodes: exp.nodes,
          adjacency: exp.adjacency,
          maxRounds: null,
          resultsJsonlPath: resultsJsonl,
          recordMetrics: true
        });
        const durationMs = performance.now() - startMs;

        const totalShuffleBytes = res.metrics.reduce((s, m) => s + m.shuffle_bytes, 0);
        const totalShuffleElements = res.metrics.reduce((s, m) => s + m.shuffle_elements, 0);
        const peakReducerValues = Math.max(...res.metrics.map(m => m.max_values_at_one_reducer));
        const maxElementsRatio = Math.max(...res.metrics.map(m => m.elements_per_ve));

        csvRows.push({
          run_id: runId,
          algorithm: 'hash_greater_to_min',
          order_mode: orderMode,
          seed: 42,
          graph_family: exp.family,
          graph_label: exp.label,
          n_nodes: exp.n,
          n_edges: exp.edges,
          rounds: res.rounds,
          total_shuffle_elements: totalShuffleElements,
          total_shuffle_bytes: totalShuffleBytes,
          peak_reducer_values: peakReducerValues,
          max_elements_per_ve: parseFloat(maxElementsRatio.toFixed(4)),
          duration_ms: Math.round(durationMs),
          converged: res.converged
        });

        console.log(`    → ${res.rounds} rounds, ${durationMs.toFixed(0)}ms, shuffle=${totalShuffleBytes}B`);
      } catch (err) {
        const durationMs = performance.now() - startMs;
        console.log(`    → DID NOT CONVERGE within guard (${Math.round(durationMs)}ms): ${err.message}`);
        csvRows.push({
          run_id: runId,
          algorithm: 'hash_greater_to_min',
          order_mode: orderMode,
          seed: 42,
          graph_family: exp.family,
          graph_label: exp.label,
          n_nodes: exp.n,
          n_edges: exp.edges,
          rounds: 'DNF',
          total_shuffle_elements: 'N/A',
          total_shuffle_bytes: 'N/A',
          peak_reducer_values: 'N/A',
          max_elements_per_ve: 'N/A',
          duration_ms: Math.round(durationMs),
          converged: false
        });
      }
    }

    // Hash-Greater-to-Min with 5 seeded orders
    for (const s of hgtmSeeds) {
      const runId = `hgtm_${exp.label}_seeded_${s}`;
      console.log(`  HGtM (seeded:${s}) ...`);
      const startMs = performance.now();
      try {
        const res = await runCCDriver({
          algorithm: 'hash_greater_to_min',
          orderMode: 'seeded',
          seed: s,
          graphFamily: exp.family,
          runId,
          nodes: exp.nodes,
          adjacency: exp.adjacency,
          maxRounds: null,
          resultsJsonlPath: resultsJsonl,
          recordMetrics: true
        });
        const durationMs = performance.now() - startMs;

        const totalShuffleBytes = res.metrics.reduce((s, m) => s + m.shuffle_bytes, 0);
        const totalShuffleElements = res.metrics.reduce((s, m) => s + m.shuffle_elements, 0);
        const peakReducerValues = Math.max(...res.metrics.map(m => m.max_values_at_one_reducer));
        const maxElementsRatio = Math.max(...res.metrics.map(m => m.elements_per_ve));

        csvRows.push({
          run_id: runId,
          algorithm: 'hash_greater_to_min',
          order_mode: 'seeded',
          seed: s,
          graph_family: exp.family,
          graph_label: exp.label,
          n_nodes: exp.n,
          n_edges: exp.edges,
          rounds: res.rounds,
          total_shuffle_elements: totalShuffleElements,
          total_shuffle_bytes: totalShuffleBytes,
          peak_reducer_values: peakReducerValues,
          max_elements_per_ve: parseFloat(maxElementsRatio.toFixed(4)),
          duration_ms: Math.round(durationMs),
          converged: res.converged
        });

        console.log(`    → ${res.rounds} rounds, ${durationMs.toFixed(0)}ms, shuffle=${totalShuffleBytes}B`);
      } catch (err) {
        const durationMs = performance.now() - startMs;
        console.log(`    → DID NOT CONVERGE within guard (${Math.round(durationMs)}ms): ${err.message}`);
        csvRows.push({
          run_id: runId,
          algorithm: 'hash_greater_to_min',
          order_mode: 'seeded',
          seed: s,
          graph_family: exp.family,
          graph_label: exp.label,
          n_nodes: exp.n,
          n_edges: exp.edges,
          rounds: 'DNF',
          total_shuffle_elements: 'N/A',
          total_shuffle_bytes: 'N/A',
          peak_reducer_values: 'N/A',
          max_elements_per_ve: 'N/A',
          duration_ms: Math.round(durationMs),
          converged: false
        });
      }
    }
  }

  // ─── Write CSV ──────────────────────────────────────────────────────────────

  const csvDir = 'results';
  if (!fs.existsSync(csvDir)) fs.mkdirSync(csvDir, { recursive: true });
  const csvPath = path.join(csvDir, 'cc_comparison.csv');

  const headers = Object.keys(csvRows[0]);
  const lines = csvRows.map(r => headers.map(h => r[h]).join(','));
  fs.writeFileSync(csvPath, headers.join(',') + '\n' + lines.join('\n') + '\n', 'utf-8');

  console.log(`\n[BENCHMARK] Results saved to ${csvPath}`);
  console.log(`[BENCHMARK] Per-round metrics in ${resultsJsonl}`);
  console.log(`[BENCHMARK] ${csvRows.length} experiments completed.`);
  console.table(csvRows.map(r => ({
    graph: r.graph_label,
    algo: r.algorithm.replace('hash_', 'H').replace('to_min', '2M').replace('greater_', 'G>'),
    order: `${r.order_mode}${r.order_mode === 'seeded' ? ':' + r.seed : ''}`,
    rounds: r.rounds,
    shuffleKB: (r.total_shuffle_bytes / 1024).toFixed(1),
    peakReducer: r.peak_reducer_values,
    ms: r.duration_ms
  })));
}

runBenchmark().catch(err => {
  console.error('[BENCHMARK ERROR]', err);
  process.exit(1);
});
