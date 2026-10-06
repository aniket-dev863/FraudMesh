import test from 'node:test';
import assert from 'node:assert';
import { SkewManager } from '../master/SkewManager.js';

test('skew - detects oversized partitions and splits into sub-chunks', () => {
  const sm = new SkewManager({ skewEnabled: true, skewThreshold: 2.0 });

  // Normal partitions have 10 items, but partition 3 has 50 items
  const partitions = new Map();
  partitions.set(0, Array(10).fill({ key: 'k0', values: [1] }));
  partitions.set(1, Array(10).fill({ key: 'k1', values: [1] }));
  partitions.set(2, Array(10).fill({ key: 'k2', values: [1] }));
  partitions.set(3, Array(50).fill({ key: 'k3', values: [1] }));

  const { balancedPartitions, wasSkewed } = sm.inspectAndBalance(partitions);
  assert.strictEqual(wasSkewed, true);
  assert.strictEqual(sm.skewStats.detectedPartitions, 1);

  // Partition 3 should have been split into chunks
  const chunkedP3 = balancedPartitions.filter(p => p.partitionId.startsWith('p-3-chunk'));
  assert(chunkedP3.length >= 2);
});
