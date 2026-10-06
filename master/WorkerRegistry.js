import { WorkerStatus } from '../common/models.js';

export class WorkerRegistry {
  constructor() {
    this.workers = new Map(); // workerId -> { id, socket, status, lastHeartbeat, currentTask, hostname, pid }
  }

  register(workerId, socket, meta = {}) {
    const existing = this.workers.get(workerId);
    if (existing && existing.socket && existing.socket !== socket) {
      try { existing.socket.destroy(); } catch (e) {}
    }

    const worker = {
      id: workerId,
      socket,
      status: WorkerStatus.ALIVE,
      lastHeartbeat: Date.now(),
      currentTask: null,
      hostname: meta.hostname || '',
      pid: meta.pid || null,
      registeredAt: Date.now()
    };

    this.workers.set(workerId, worker);
    return worker;
  }

  get(workerId) {
    return this.workers.get(workerId);
  }

  getAll() {
    return Array.from(this.workers.values());
  }

  getAliveWorkers() {
    return Array.from(this.workers.values()).filter(w => w.status !== WorkerStatus.DEAD);
  }

  getIdleWorkers() {
    return Array.from(this.workers.values()).filter(w => w.status === WorkerStatus.ALIVE && !w.currentTask);
  }

  recordHeartbeat(workerId, { busy = false, currentTaskId = null } = {}) {
    const worker = this.workers.get(workerId);
    if (!worker) return null;

    worker.lastHeartbeat = Date.now();
    if (worker.status === WorkerStatus.DEAD) {
      worker.status = WorkerStatus.ALIVE;
    }
    worker.status = busy ? WorkerStatus.BUSY : WorkerStatus.ALIVE;
    return worker;
  }

  markDead(workerId) {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.status = WorkerStatus.DEAD;
      worker.currentTask = null;
    }
    return worker;
  }

  assignTask(workerId, taskInfo) {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.currentTask = taskInfo;
      worker.status = WorkerStatus.BUSY;
    }
  }

  clearTask(workerId) {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.currentTask = null;
      if (worker.status !== WorkerStatus.DEAD) {
        worker.status = WorkerStatus.ALIVE;
      }
    }
  }

  remove(workerId) {
    this.workers.delete(workerId);
  }
}
