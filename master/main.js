import { Master } from './Master.js';
import fs from 'fs';

const args = process.argv.slice(2);
let jobType = null;
let csvPath = 'data/input/transactions.csv';
let truthPath = 'fraud/expectedRings.json';
let ccAlgorithm = process.env.CC_ALGORITHM || 'hash_to_min';
let orderMode = process.env.CC_ORDER_MODE || 'natural';
let seed = parseInt(process.env.CC_SEED || '42', 10);

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--cc-algorithm' && args[i + 1]) {
    ccAlgorithm = args[i + 1];
    i++;
  } else if (args[i] === '--order-mode' && args[i + 1]) {
    orderMode = args[i + 1];
    i++;
  } else if (args[i] === '--seed' && args[i + 1]) {
    seed = parseInt(args[i + 1], 10);
    i++;
  } else if (!args[i].startsWith('--')) {
    if (!jobType) jobType = args[i];
    else if (i === 1) csvPath = args[i];
    else if (i === 2) truthPath = args[i];
  }
}

const master = new Master({ ccAlgorithm, ccOrderMode: orderMode, ccSeed: seed });
master.start();

async function checkAndRunJob() {
  if (jobType === 'wordcount') {
    // Wait for at least 1 worker
    console.log('[MASTER] Waiting for workers to register before WordCount...');
    while (master.workerRegistry.getAliveWorkers().length === 0) {
      await new Promise(r => setTimeout(r, 500));
    }
    const sampleText = [
      'hello hello world',
      'hello world',
      'distributed systems with nodejs',
      'fault tolerant mapreduce cluster'
    ];
    await master.runWordCount(sampleText, 2);
  } else if (jobType === 'fraud') {
    const csvPath = args[1] || 'data/input/transactions.csv';
    const truthPath = args[2] || 'fraud/expectedRings.json';
    console.log('[MASTER] Waiting for workers to register before Fraud Mining...');
    while (master.workerRegistry.getAliveWorkers().length < 2) {
      await new Promise(r => setTimeout(r, 500));
    }
    await master.runFraudMining({
      transactionsCsvPath: csvPath,
      groundTruthJsonPath: truthPath,
      numPartitions: 4
    });
  }
}

if (jobType) {
  checkAndRunJob().catch(err => {
    console.error('[MASTER] Fatal job error:', err);
  });
}

process.on('SIGINT', () => {
  master.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  master.stop();
  process.exit(0);
});
