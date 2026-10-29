import fs from 'fs';
import { Master } from '../master/Master.js';
import { Worker } from '../worker/Worker.js';

async function runClusterTest() {
  console.log('====================================================');
  console.log('   FRAUDMESH 4-WORKER CLUSTER CC VERIFICATION');
  console.log('====================================================\n');

  const csvPath = 'data/input/benchmark_data.csv';
  const truthPath = 'fraud/benchmark_truth.json';

  const results = [];

  for (const algo of ['hash_to_min', 'hash_greater_to_min']) {
    console.log(`\n--- [CLUSTER RUN] Testing ${algo} with 4 workers ---`);
    const port = 5060 + (algo === 'hash_to_min' ? 0 : 1);
    const master = new Master({
      port,
      ccAlgorithm: algo,
      speculationEnabled: false,
      skewEnabled: true
    });
    master.start();

    // Spawn 4 real TCP workers
    const workers = [];
    for (let i = 1; i <= 4; i++) {
      const w = new Worker({
        workerId: `cluster-worker-${algo}-${i}`,
        masterHost: 'localhost',
        masterPort: port,
        heartbeatIntervalMs: 1000
      });
      w.start();
      workers.push(w);
    }

    // Wait for all 4 workers to register
    while (master.workerRegistry.getAliveWorkers().length < 4) {
      await new Promise(r => setTimeout(r, 50));
    }
    console.log(`[CLUSTER] 4 workers registered successfully with master.`);

    const start = Date.now();
    const jobResult = await master.runFraudMining({
      transactionsCsvPath: csvPath,
      groundTruthJsonPath: truthPath,
      numPartitions: 4,
      ccAlgorithm: algo
    });
    const wallTimeMs = Date.now() - start;

    results.push({
      algorithm: algo,
      workers: 4,
      inputRecords: 2000,
      wallTimeMs,
      ccIterations: jobResult.ccIterations,
      ringsCount: jobResult.detectedRings.length,
      rings: jobResult.detectedRings.map(r => [...r.accounts].sort().join(',')).sort(),
      correctness: jobResult.correctnessPass ? 'PASS' : 'FAIL'
    });

    for (const w of workers) w.stop();
    master.stop();
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n====================================================');
  console.log('            CLUSTER RUN SUMMARY TABLE');
  console.log('====================================================');
  console.table(results.map(r => ({
    algorithm: r.algorithm,
    workers: r.workers,
    wallTimeMs: r.wallTimeMs,
    ccRounds: r.ccIterations,
    rings: r.ringsCount,
    correctness: r.correctness
  })));

  // Verify rings match exactly between both cluster runs
  const htmRings = results[0].rings.join(' | ');
  const hgtmRings = results[1].rings.join(' | ');
  if (htmRings !== hgtmRings) {
    console.error('MISMATCH between HtM and HGtM rings!');
    process.exit(1);
  }
  console.log('\n[VERIFICATION] Both algorithms produced 100% IDENTICAL rings on the 4-worker cluster!');
  console.log(`Detected Rings: ${htmRings}`);
  
  // Append to results/cluster_runs.json
  fs.writeFileSync('results/cluster_runs.json', JSON.stringify(results, null, 2), 'utf-8');
}

runClusterTest().catch(err => {
  console.error('[CLUSTER RUN ERROR]', err);
  process.exit(1);
});
