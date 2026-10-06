import fs from 'fs';
import path from 'path';

// Seeded pseudorandom number generator (LCG)
function createRng(seed = 42) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function generateSyntheticData({
  rows = 1000,
  seed = 42,
  outputCsv = 'data/input/transactions.csv',
  outputGroundTruth = 'fraud/expectedRings.json',
  includeSkew = true
} = {}) {
  const rng = createRng(seed);

  // Define Ground Truth Fraud Rings
  const groundTruthRings = [
    ['ACC_RING1_A', 'ACC_RING1_B', 'ACC_RING1_C'],
    ['ACC_RING2_D', 'ACC_RING2_E', 'ACC_RING2_F', 'ACC_RING2_G']
  ];

  const transactions = [];
  const baseTimestamp = 1700000000000;

  // 1. Embed Fraud Ring 1: A -> B -> C -> A
  const ring1 = groundTruthRings[0];
  for (let i = 0; i < ring1.length; i++) {
    const sender = ring1[i];
    const receiver = ring1[(i + 1) % ring1.length];
    transactions.push({
      sender_account: sender,
      receiver_account: receiver,
      amount: (5000 + Math.floor(rng() * 1000)).toFixed(2),
      timestamp: new Date(baseTimestamp + transactions.length * 1000).toISOString()
    });
  }

  // 2. Embed Fraud Ring 2: D -> E -> F -> G -> D
  const ring2 = groundTruthRings[1];
  for (let i = 0; i < ring2.length; i++) {
    const sender = ring2[i];
    const receiver = ring2[(i + 1) % ring2.length];
    transactions.push({
      sender_account: sender,
      receiver_account: receiver,
      amount: (12000 + Math.floor(rng() * 3000)).toFixed(2),
      timestamp: new Date(baseTimestamp + transactions.length * 1000).toISOString()
    });
  }

  // 3. Generate Legitimate Acyclic Transactions
  // We use accounts ACC_0001 to ACC_0500 with strict sender < receiver to prevent cycles!
  const numAccounts = 200;
  const targetRows = Math.max(rows, transactions.length + 50);

  // If includeSkew is true, create a high-degree 'hub' account (e.g. ACC_HUB_999)
  const hubAccount = 'ACC_HUB_999';

  while (transactions.length < targetRows) {
    let sender, receiver;

    if (includeSkew && rng() < 0.35) {
      // 35% of transactions involve the hub to deliberately create partition skew
      sender = hubAccount;
      const rIdx = 1 + Math.floor(rng() * numAccounts);
      receiver = `ACC_LEGIT_${String(rIdx).padStart(4, '0')}`;
    } else {
      const idxA = 1 + Math.floor(rng() * numAccounts);
      const idxB = 1 + Math.floor(rng() * numAccounts);
      if (idxA === idxB) continue;
      // To strictly guarantee acyclicity among legit accounts:
      const minIdx = Math.min(idxA, idxB);
      const maxIdx = Math.max(idxA, idxB);
      sender = `ACC_LEGIT_${String(minIdx).padStart(4, '0')}`;
      receiver = `ACC_LEGIT_${String(maxIdx).padStart(4, '0')}`;
    }

    const amount = (10 + rng() * 500).toFixed(2);
    transactions.push({
      sender_account: sender,
      receiver_account: receiver,
      amount,
      timestamp: new Date(baseTimestamp + transactions.length * 1000).toISOString()
    });
  }

  // Shuffle transactions deterministically
  for (let i = transactions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [transactions[i], transactions[j]] = [transactions[j], transactions[i]];
  }

  // Write CSV
  const csvDir = path.dirname(outputCsv);
  if (!fs.existsSync(csvDir)) fs.mkdirSync(csvDir, { recursive: true });

  const csvHeader = 'sender_account,receiver_account,amount,timestamp\n';
  const csvLines = transactions.map(t => `${t.sender_account},${t.receiver_account},${t.amount},${t.timestamp}`).join('\n');
  fs.writeFileSync(outputCsv, csvHeader + csvLines + '\n', 'utf-8');

  // Write expectedRings.json
  const truthDir = path.dirname(outputGroundTruth);
  if (!fs.existsSync(truthDir)) fs.mkdirSync(truthDir, { recursive: true });

  const normalizedTruth = {
    rings: groundTruthRings.map(r => [...r].sort())
  };
  fs.writeFileSync(outputGroundTruth, JSON.stringify(normalizedTruth, null, 2), 'utf-8');

  console.log(`[DATASET GENERATOR] Generated ${transactions.length} transactions at ${outputCsv}`);
  console.log(`[DATASET GENERATOR] Saved ground truth with ${groundTruthRings.length} rings at ${outputGroundTruth}`);

  return { transactions, groundTruthRings };
}

// CLI usage
if (process.argv[1] && process.argv[1].endsWith('generateDataset.js')) {
  const args = process.argv.slice(2);
  let rows = 1000;
  let seed = 42;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--rows' && args[i + 1]) rows = parseInt(args[i + 1], 10);
    if (args[i] === '--seed' && args[i + 1]) seed = parseInt(args[i + 1], 10);
  }
  generateSyntheticData({ rows, seed });
}
