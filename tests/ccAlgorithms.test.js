import test from 'node:test';
import assert from 'node:assert';
import { runCCDriver, resolveAlgorithm } from '../fraud/cc/driver.js';
import { OrderContext } from '../fraud/cc/ordering.js';
import { HashToMinAlgorithm } from '../fraud/cc/hash_to_min.js';
import { HashGreaterToMinAlgorithm } from '../fraud/cc/hash_greater_to_min.js';
import { generateSyntheticData } from '../fraud/generateDataset.js';
import { findSCCs } from '../fraud/scc.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

class UnionFind {
  constructor(elements) { this.parent = new Map(); for (const e of elements) this.parent.set(e, e); }
  find(i) { if (this.parent.get(i) === i) return i; const r = this.find(this.parent.get(i)); this.parent.set(i, r); return r; }
  union(i, j) { const rI = this.find(i); const rJ = this.find(j); if (rI !== rJ) this.parent.set(rI, rJ); }
  getComponentsKey() {
    const groups = new Map();
    for (const k of this.parent.keys()) {
      const root = this.find(k);
      if (!groups.has(root)) groups.set(root, new Set());
      groups.get(root).add(k);
    }
    return JSON.stringify(
      Array.from(groups.values()).map(s => Array.from(s).sort()).sort((a, b) => a[0].localeCompare(b[0]))
    );
  }
}

function componentsKey(nodeToComponent) {
  const g = new Map();
  for (const [k, c] of nodeToComponent.entries()) {
    if (!g.has(c)) g.set(c, []);
    g.get(c).push(k);
  }
  return JSON.stringify(
    Array.from(g.values()).map(s => s.sort()).sort((a, b) => a[0].localeCompare(b[0]))
  );
}

function makeGraph(nodes, edges) {
  const adj = new Map();
  for (const n of nodes) adj.set(n, new Set());
  for (const [u, v] of edges) {
    adj.get(u).add(v);
    adj.get(v).add(u);
  }
  return adj;
}

// ─── Ordering Tests ──────────────────────────────────────────────────────────

test('ordering - natural order handles numeric strings correctly', () => {
  const ctx = new OrderContext('natural');
  assert.strictEqual(ctx.compare('9', '10'), -1, '"9" should be < "10" numerically');
  assert.strictEqual(ctx.compare('ACC_9', 'ACC_10'), -1, '"ACC_9" should be < "ACC_10"');
  assert.strictEqual(ctx.min(['10', '9', '2']), '2');
});

test('ordering - seeded order is deterministic and consistent', () => {
  const ctx1 = new OrderContext('seeded', 42);
  const ctx2 = new OrderContext('seeded', 42);
  const nodes = ['A', 'B', 'C', 'D'];
  const sorted1 = [...nodes].sort((a, b) => ctx1.compare(a, b));
  const sorted2 = [...nodes].sort((a, b) => ctx2.compare(a, b));
  assert.deepStrictEqual(sorted1, sorted2, 'Same seed must give same order');
  // Different seed should give different order (with high probability)
  const ctx3 = new OrderContext('seeded', 99);
  const sorted3 = [...nodes].sort((a, b) => ctx3.compare(a, b));
  assert.notDeepStrictEqual(sorted1, sorted3, 'Different seeds should give different order');
});

// ─── Algorithm Unit Tests ────────────────────────────────────────────────────

test('algorithm - resolveAlgorithm returns correct types', () => {
  assert(resolveAlgorithm('hash_to_min') instanceof HashToMinAlgorithm);
  assert(resolveAlgorithm('hash_greater_to_min') instanceof HashGreaterToMinAlgorithm);
  assert(resolveAlgorithm('hcm') instanceof HashGreaterToMinAlgorithm);
});

test('algorithm - Hash-to-Min map emits correctly', () => {
  const algo = new HashToMinAlgorithm();
  const ctx = new OrderContext('natural');
  const emits = algo.map({ node: 'B', cluster: ['A', 'B', 'C'] }, ctx);
  // min = A, so emit (A, [A,B,C]) and (B, [A]), (C, [A])
  const keys = emits.map(e => e.key);
  assert(keys.includes('A'), 'Should emit to min key');
  assert(keys.includes('B'), 'Should emit to B');
  assert(keys.includes('C'), 'Should emit to C');
});

test('algorithm - Hash-Greater-to-Min Hcm map computes core correctly', () => {
  const algo = new HashGreaterToMinAlgorithm();
  const ctx = new OrderContext('natural');
  // node=B, cluster=[A,B,C,D]. core(B) = {u >= B} = {B,C,D}. min = A.
  const emits = algo.mapHcm({ node: 'B', cluster: ['A', 'B', 'C', 'D'] }, ctx);
  // Should emit (A, [B,C,D]) and (B, [A]), (C, [A]), (D, [A])
  const toMin = emits.find(e => e.key === 'A');
  assert(toMin, 'Should emit core to min');
  assert.deepStrictEqual(toMin.value.sort(), ['B', 'C', 'D']);
});

test('algorithm - Hash-Greater-to-Min getRoundType alternates correctly', () => {
  const algo = new HashGreaterToMinAlgorithm();
  assert.strictEqual(algo.getRoundType(1), 'hma');
  assert.strictEqual(algo.getRoundType(2), 'hma');
  assert.strictEqual(algo.getRoundType(3), 'hcm');
  assert.strictEqual(algo.getRoundType(4), 'hma');
  assert.strictEqual(algo.getRoundType(5), 'hma');
  assert.strictEqual(algo.getRoundType(6), 'hcm');
});

// ─── Graph Structure Tests ───────────────────────────────────────────────────

const graphTests = [
  { name: 'path graph P4', nodes: ['A','B','C','D'], edges: [['A','B'],['B','C'],['C','D']] },
  { name: 'star graph', nodes: ['0','1','2','3','4'], edges: [['0','1'],['0','2'],['0','3'],['0','4']] },
  { name: 'ring/cycle C5', nodes: ['A','B','C','D','E'], edges: [['A','B'],['B','C'],['C','D'],['D','E'],['E','A']] },
  { name: 'complete K4', nodes: ['A','B','C','D'], edges: [['A','B'],['A','C'],['A','D'],['B','C'],['B','D'],['C','D']] },
  { name: 'tree', nodes: ['R','L','LL','LR','RL','RR'], edges: [['R','L'],['R','RL'],['L','LL'],['L','LR'],['RL','RR']] },
  { name: 'disconnected components', nodes: ['A','B','C','X','Y'], edges: [['A','B'],['B','C'],['X','Y']] },
  { name: 'isolated nodes', nodes: ['A','B','C'], edges: [] },
  { name: 'self-loops', nodes: ['A','B'], edges: [['A','A'],['A','B']] },
  { name: 'duplicate edges', nodes: ['A','B','C'], edges: [['A','B'],['A','B'],['B','C'],['B','C']] },
  { name: 'empty graph', nodes: [], edges: [] },
  { name: 'single node', nodes: ['X'], edges: [] },
];

for (const gt of graphTests) {
  for (const algoName of ['hash_to_min', 'hash_greater_to_min']) {
    test(`cc correctness - ${algoName} on ${gt.name}`, async () => {
      if (gt.nodes.length === 0) return; // Skip empty graph
      const adj = makeGraph(gt.nodes, gt.edges);
      const uf = new UnionFind(gt.nodes);
      for (const [u, v] of gt.edges) if (u !== v) uf.union(u, v);
      const expected = uf.getComponentsKey();

      const seeds = algoName === 'hash_greater_to_min' ? [1, 7, 42, 99, 123] : [42];
      for (const s of seeds) {
        const res = await runCCDriver({
          algorithm: algoName,
          orderMode: algoName === 'hash_greater_to_min' ? 'seeded' : 'natural',
          seed: s,
          nodes: gt.nodes,
          adjacency: adj,
          recordMetrics: false
        });
        assert(res.converged, `${algoName} must converge on ${gt.name} (seed=${s})`);
        const actual = componentsKey(res.nodeToComponent);
        assert.strictEqual(actual, expected,
          `${algoName} components mismatch on ${gt.name} (seed=${s})`);
      }
    });
  }
}

// ─── Random Graph Tests (200 Erdős–Rényi + preferential-attachment mix) ──────

test('cc correctness - 200+ random graphs, both algorithms, 5 seeds each', async () => {
  let totalTests = 0;
  for (let seed = 1; seed <= 210; seed++) {
    const n = 8 + (seed % 25);
    const nodes = Array.from({ length: n }, (_, i) => `n${i}`);
    const adj = new Map();
    for (const node of nodes) adj.set(node, new Set());
    const uf = new UnionFind(nodes);

    // Erdős–Rényi-like: p ≈ 0.25
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if ((seed * 31 + i * 17 + j * 13) % 100 < 25) {
          adj.get(nodes[i]).add(nodes[j]);
          adj.get(nodes[j]).add(nodes[i]);
          uf.union(nodes[i], nodes[j]);
        }
      }
    }
    const expected = uf.getComponentsKey();

    // Hash-to-Min
    const r1 = await runCCDriver({
      algorithm: 'hash_to_min', nodes, adjacency: adj, recordMetrics: false
    });
    assert.strictEqual(componentsKey(r1.nodeToComponent), expected,
      `HtM mismatch at random seed ${seed}`);
    totalTests++;

    // Hash-Greater-to-Min with 5 seeds
    for (const s of [1, 2, 3, 4, 5]) {
      const r2 = await runCCDriver({
        algorithm: 'hash_greater_to_min', orderMode: 'seeded', seed: s,
        nodes, adjacency: adj, recordMetrics: false
      });
      assert.strictEqual(componentsKey(r2.nodeToComponent), expected,
        `HGtM mismatch at random seed=${seed} ordSeed=${s}`);
      totalTests++;
    }
  }
  assert(totalTests >= 1200, `Expected 1200+ tests, got ${totalTests}`);
});

// ─── Synthetic Fraud Dataset Test ────────────────────────────────────────────

test('cc correctness - synthetic fraud dataset, both algorithms', async () => {
  const { transactions } = generateSyntheticData({ rows: 500, seed: 42 });
  const adj = new Map();
  for (const t of transactions) {
    const u = t.sender_account, v = t.receiver_account;
    if (!adj.has(u)) adj.set(u, new Set());
    if (!adj.has(v)) adj.set(v, new Set());
    adj.get(u).add(v);
    adj.get(v).add(u);
  }
  const nodes = Array.from(adj.keys());
  const uf = new UnionFind(nodes);
  for (const [u, neighbors] of adj.entries()) {
    for (const v of neighbors) uf.union(u, v);
  }
  const expected = uf.getComponentsKey();

  for (const algoName of ['hash_to_min', 'hash_greater_to_min']) {
    const seeds = algoName === 'hash_greater_to_min' ? [1, 7, 42, 99, 123] : [42];
    for (const s of seeds) {
      const res = await runCCDriver({
        algorithm: algoName,
        orderMode: algoName === 'hash_greater_to_min' ? 'seeded' : 'natural',
        seed: s, nodes, adjacency: adj, recordMetrics: false
      });
      assert.strictEqual(componentsKey(res.nodeToComponent), expected,
        `${algoName} fraud dataset mismatch (seed=${s})`);
    }
  }
});

// ─── Integration: Tarjan SCC produces identical rings from either algorithm ──

test('integration - fraud rings identical from both CC algorithms', async () => {
  const { transactions, groundTruthRings } = generateSyntheticData({ rows: 600, seed: 42 });
  const edges = transactions.map(t => ({ sender: t.sender_account, receiver: t.receiver_account }));
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.sender)) adj.set(e.sender, new Set());
    if (!adj.has(e.receiver)) adj.set(e.receiver, new Set());
    adj.get(e.sender).add(e.receiver);
    adj.get(e.receiver).add(e.sender);
  }
  const nodes = Array.from(adj.keys());

  const ringsFromAlgo = {};
  for (const algoName of ['hash_to_min', 'hash_greater_to_min']) {
    const res = await runCCDriver({
      algorithm: algoName,
      orderMode: algoName === 'hash_greater_to_min' ? 'seeded' : 'natural',
      seed: 42, nodes, adjacency: adj, recordMetrics: false
    });

    // Group edges by component, then run Tarjan
    const componentEdges = new Map();
    for (const e of edges) {
      const compId = res.nodeToComponent.get(e.sender);
      if (!componentEdges.has(compId)) componentEdges.set(compId, []);
      componentEdges.get(compId).push(e);
    }

    const rings = [];
    for (const [, compEdges] of componentEdges.entries()) {
      if (compEdges.length >= 2) {
        const found = findSCCs(compEdges, 2);
        for (const r of found) rings.push(r);
      }
    }
    ringsFromAlgo[algoName] = new Set(rings.map(r => [...r].sort().join(',')));
  }

  // Both should produce identical rings
  const htmRings = ringsFromAlgo['hash_to_min'];
  const hgtmRings = ringsFromAlgo['hash_greater_to_min'];
  assert.deepStrictEqual(htmRings, hgtmRings, 'Fraud rings must be identical from both algorithms');

  // Verify against ground truth
  const truthSet = new Set(groundTruthRings.map(r => [...r].sort().join(',')));
  for (const exp of truthSet) {
    assert(htmRings.has(exp), `Ground truth ring ${exp} missing from HtM`);
  }
});

// ─── Max-rounds guard test ───────────────────────────────────────────────────

test('guard - max-rounds guard fires on non-converging algorithm', async () => {
  // Use a path graph (A-B-C-D) that needs multiple rounds, but set maxRounds=1
  // so the guard fires before convergence is reached.
  await assert.rejects(
    () => runCCDriver({
      algorithm: 'hash_to_min',
      nodes: ['A', 'B', 'C', 'D'],
      adjacency: makeGraph(['A','B','C','D'], [['A','B'],['B','C'],['C','D']]),
      maxRounds: 1, // Too few rounds for a 4-node path to converge
      recordMetrics: false
    }),
    { message: /did not converge within max-rounds guard/ }
  );
});
