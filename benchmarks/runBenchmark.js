import fs from 'fs';
import path from 'path';
import { Master } from '../master/Master.js';
import { generateSyntheticData } from '../fraud/generateDataset.js';

async function runBenchmarkSuite() {
  console.log('====================================================');
  console.log('   FRAUDMESH 70% REVIEW BENCHMARK SUITE');
  console.log('====================================================\n');

  const results = [];
  const testDataPath = 'data/input/benchmark_data.csv';
  const truthPath = 'fraud/benchmark_truth.json';

  // Generate 2000 transactions for benchmark
  generateSyntheticData({
    rows: 2000,
    seed: 1234,
    outputCsv: testDataPath,
    outputGroundTruth: truthPath
  });

  const experiments = [
    {
      name: 'Baseline (All Optimizations OFF)',
      speculation: false,
      skew: false,
      partitions: 4
    },
    {
      name: 'Fault Tolerance Enabled',
      speculation: false,
      skew: false,
      partitions: 4
    },
    {
      name: 'Skew-Aware Rebalancing ON',
      speculation: false,
      skew: true,
      partitions: 4
    },
    {
      name: 'Speculation ON (with straggler mitigation)',
      speculation: true,
      skew: true,
      partitions: 4
    }
  ];

  for (const exp of experiments) {
    console.log(`\n--- Running Experiment: ${exp.name} ---`);
    const master = new Master({
      port: 5055,
      speculationEnabled: exp.speculation,
      skewEnabled: exp.skew
    });
    master.start();

    // Spawn 4 in-process mock workers
    const { Worker } = await import('../worker/Worker.js');
    const workers = [];
    for (let i = 1; i <= 4; i++) {
      const w = new Worker({
        workerId: `bench-worker-${i}`,
        masterHost: 'localhost',
        masterPort: 5055,
        heartbeatIntervalMs: 1000,
        workerSlowdownMs: (exp.speculation && i === 4) ? 500 : 0 // Slow down worker-4 if testing speculation
      });
      w.start();
      workers.push(w);
    }

    // Wait for registration
    while (master.workerRegistry.getAliveWorkers().length < 4) {
      await new Promise(r => setTimeout(r, 100));
    }

    const start = Date.now();
    const jobResult = await master.runFraudMining({
      transactionsCsvPath: testDataPath,
      groundTruthJsonPath: truthPath,
      numPartitions: exp.partitions
    });
    const duration = Date.now() - start;

    results.push({
      experiment: exp.name,
      workers: 4,
      datasetRows: 2000,
      durationMs: duration,
      throughput: Math.round(2000 / (duration / 1000)),
      correctness: jobResult.correctnessPass ? 'PASS' : 'FAIL',
      tasksReexecuted: jobResult.stats.tasksReexecutedCount,
      speculativeAttempts: master.speculationManager.speculativeAttemptsCount,
      rebalances: master.skewManager.skewStats.rebalances
    });

    // Clean up
    for (const w of workers) w.stop();
    master.stop();
    await new Promise(r => setTimeout(r, 500));
  }

  // Save CSV
  const csvDir = 'benchmarks/results';
  if (!fs.existsSync(csvDir)) fs.mkdirSync(csvDir, { recursive: true });
  const csvPath = path.join(csvDir, 'results.csv');

  const headers = ['experiment', 'workers', 'datasetRows', 'durationMs', 'throughput', 'correctness', 'tasksReexecuted', 'speculativeAttempts', 'rebalances'];
  const lines = results.map(r => `${r.experiment},${r.workers},${r.datasetRows},${r.durationMs},${r.throughput},${r.correctness},${r.tasksReexecuted},${r.speculativeAttempts},${r.rebalances}`);
  fs.writeFileSync(csvPath, headers.join(',') + '\n' + lines.join('\n') + '\n', 'utf-8');

  console.log(`\n[BENCHMARK] Results saved to ${csvPath}:`);
  console.table(results);
}

runBenchmarkSuite().catch(err => {
  console.error('[BENCHMARK ERROR]', err);
  process.exit(1);
});
