import net from 'net';
import { MessageType, createMessage } from '../common/protocol.js';
import { MessageFramer } from '../common/framing.js';

const jobType = process.argv[2] || 'fraud';
const host = process.env.MASTER_HOST || 'localhost';
const port = parseInt(process.env.MASTER_PORT || '5050', 10);

console.log(`[CLIENT] Connecting to Master at ${host}:${port} to submit '${jobType}' job...`);

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
  const stageDelayMs = parseInt(process.env.STAGE_DELAY_MS || process.argv[5] || '0', 10);
  const msg = createMessage(MessageType.JOB_START, {
    payload: {
      jobType,
      csvPath: process.argv[3] || 'data/input/transactions.csv',
      groundTruthPath: process.argv[4] || 'fraud/expectedRings.json',
      numPartitions: 4,
      stageDelayMs
    }
  });
  client.write(MessageFramer.frame(msg));
});

client.on('error', (err) => {
  console.error('[CLIENT] Connection error:', err.message);
  process.exit(1);
});
