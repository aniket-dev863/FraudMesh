import { Master } from './Master.js';
import fs from 'fs';

const master = new Master();
master.start();

const args = process.argv.slice(2);
const jobType = args[0]; // 'wordcount' | 'fraud'

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
