import test from 'node:test';
import assert from 'node:assert';
import { ccMap, ccReduce } from '../fraud/connectedComponents.js';

test('connected components - Hash-to-Min propagation logic', () => {
  // Triangle: A-B-C with initial labels A, B, C
  const nodeA = { node: 'A', label: 'A', neighbors: ['B'] };
  const emitsA = ccMap(nodeA);
  assert.strictEqual(emitsA.length, 2); // {A, 'A'}, {B, 'A'}

  // Node B receives candidate labels ['B', 'A', 'C']
  const redB = ccReduce('B', ['B', 'A', 'C'], new Map([['B', 'B']]));
  assert.strictEqual(redB.label, 'A');
  assert.strictEqual(redB.changed, true);

  // If node B already has 'A', and receives ['A', 'A']
  const redBNoChange = ccReduce('B', ['A', 'A'], new Map([['B', 'A']]));
  assert.strictEqual(redBNoChange.label, 'A');
  assert.strictEqual(redBNoChange.changed, false);
});
