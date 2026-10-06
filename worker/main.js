import { Worker } from './Worker.js';

const worker = new Worker();
worker.start();

process.on('SIGINT', () => {
  worker.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  worker.stop();
  process.exit(0);
});
