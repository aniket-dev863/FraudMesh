import { WorkerStatus } from '../common/models.js';

export class FailureDetector {
  constructor({
    workerRegistry,
    heartbeatIntervalMs = 2000,
    heartbeatMissesAllowed = 3,
    onWorkerFailed = () => {}
  }) {
    this.workerRegistry = workerRegistry;
    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.heartbeatMissesAllowed = heartbeatMissesAllowed;
    this.timeoutThresholdMs = heartbeatIntervalMs * heartbeatMissesAllowed;
    this.onWorkerFailed = onWorkerFailed;
    this.checkTimer = null;
  }

  start() {
    this.stop();
    this.checkTimer = setInterval(() => {
      this.checkHeartbeats();
    }, Math.max(500, Math.floor(this.heartbeatIntervalMs / 2)));
  }

  checkHeartbeats() {
    const now = Date.now();
    const workers = this.workerRegistry.getAll();

    for (const worker of workers) {
      if (worker.status === WorkerStatus.DEAD) continue;

      const elapsed = now - worker.lastHeartbeat;
      if (elapsed > this.timeoutThresholdMs) {
        console.log(`[MASTER] HEARTBEAT TIMEOUT ${worker.id}`);
        console.log(`[MASTER] WORKER FAILED ${worker.id}`);
        this.workerRegistry.markDead(worker.id);
        this.onWorkerFailed(worker.id);
      }
    }
  }

  stop() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }
}
