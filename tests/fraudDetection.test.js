import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import { generateSyntheticData } from '../fraud/generateDataset.js';
import { fraudMap } from '../fraud/mapper.js';
import { findSCCs } from '../fraud/scc.js';

test('fraud detection - detects expected rings in synthetic dataset', () => {
  const { transactions, groundTruthRings } = generateSyntheticData({
    rows: 300,
    seed: 42,
    outputCsv: 'data/input/test_transactions.csv',
    outputGroundTruth: 'fraud/test_expectedRings.json'
  });

  // Extract edges
  const edges = transactions.map(t => ({
    sender: t.sender_account,
    receiver: t.receiver_account
  }));

  // Detect rings with SCC
  const detected = findSCCs(edges, 2);

  const expectedSet = new Set(groundTruthRings.map(r => [...r].sort().join(',')));
  const detectedSet = new Set(detected.map(r => [...r].sort().join(',')));

  for (const exp of expectedSet) {
    assert(detectedSet.has(exp), `Expected ring ${exp} was not detected`);
  }

  // Cleanup test files
  if (fs.existsSync('data/input/test_transactions.csv')) fs.unlinkSync('data/input/test_transactions.csv');
  if (fs.existsSync('fraud/test_expectedRings.json')) fs.unlinkSync('fraud/test_expectedRings.json');
});
