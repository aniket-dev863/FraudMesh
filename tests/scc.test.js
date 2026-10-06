import test from 'node:test';
import assert from 'node:assert';
import { findSCCs } from '../fraud/scc.js';

test('scc - Tarjan detects simple 3-node cycle', () => {
  const edges = [
    { sender: 'A', receiver: 'B' },
    { sender: 'B', receiver: 'C' },
    { sender: 'C', receiver: 'A' },
  ];
  const sccs = findSCCs(edges, 2);
  assert.strictEqual(sccs.length, 1);
  assert.deepStrictEqual(sccs[0], ['A', 'B', 'C']);
});

test('scc - ignores acyclic chain and branches', () => {
  const edges = [
    { sender: 'A', receiver: 'B' },
    { sender: 'B', receiver: 'C' },
    { sender: 'C', receiver: 'D' },
  ];
  const sccs = findSCCs(edges, 2);
  assert.strictEqual(sccs.length, 0); // No cycles
});

test('scc - isolates cycle within larger component', () => {
  const edges = [
    { sender: 'A', receiver: 'B' },
    { sender: 'B', receiver: 'C' },
    { sender: 'C', receiver: 'A' },
    { sender: 'C', receiver: 'D' }, // Directed edge pointing to acyclic tail
    { sender: 'D', receiver: 'E' },
  ];
  const sccs = findSCCs(edges, 2);
  assert.strictEqual(sccs.length, 1);
  assert.deepStrictEqual(sccs[0], ['A', 'B', 'C']);
});
