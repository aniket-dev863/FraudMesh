import net from 'net';
import { MessageType, createMessage } from '../common/protocol.js';
import { MessageFramer } from '../common/framing.js';

const args = process.argv.slice(2);
let jobType = 'fraud';
let csvPath = 'data/input/transactions.csv';
let groundTruthPath = 'fraud/expectedRings.json';
let stageDelayMs = parseInt(process.env.STAGE_DELAY_MS || '0', 10);
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
  } else if (args[i] === '--delay' && args[i + 1]) {
    stageDelayMs = parseInt(args[i + 1], 10);
    i++;
  } else if (!args[i].startsWith('--')) {
    if (i === 0) jobType = args[i];
    else if (i === 1) csvPath = args[i];
    else if (i === 2) groundTruthPath = args[i];
  }
}

const host = process.env.MASTER_HOST || 'localhost';
const port = parseInt(process.env.MASTER_PORT || '5050', 10);

console.log(`[CLIENT] Connecting to Master at ${host}:${port} to submit '${jobType}' job (ccAlgorithm=${ccAlgorithm}, orderMode=${orderMode}, seed=${seed})...`);

const client = new net.Socket();

const framer = new MessageFramer((msg) => {
  if (msg.type === MessageType.JOB_COMPLETE) {
    console.log('[CLIENT] Job completed successfully!');
    client.destroy();
    process.exit(0);
  } else if (msg.type === MessageType.JOB_FAILED) {
    console.error('[CLIENT] Job failed:', msg.payload?.error);
    client.destroy();
    process.exit(1);
  }
});

client.on('data', (d) => framer.feed(d));

client.connect(port, host, () => {
  console.log('[CLIENT] Connected. Submitting JOB_START...');
  const msg = createMessage(MessageType.JOB_START, {
    payload: {
      jobType,
      csvPath,
      groundTruthPath,
      numPartitions: 4,
      stageDelayMs,
      ccAlgorithm,
      orderMode,
      seed
    }
  });
  client.write(MessageFramer.frame(msg));
});

client.on('error', (err) => {
  console.error('[CLIENT] Connection error:', err.message);
  process.exit(1);
});
