export const TaskStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  REQUEUED: 'REQUEUED',
  SPECULATIVE: 'SPECULATIVE',
  CANCELLED: 'CANCELLED',
};

export const TaskType = {
  MAP: 'MAP',
  REDUCE: 'REDUCE',
};

export const WorkerStatus = {
  ALIVE: 'ALIVE',
  BUSY: 'BUSY',
  DEAD: 'DEAD',
};

export class Task {
  constructor({
    jobId,
    taskId,
    taskType,
    workload, // 'wordcount' | 'fraud_map' | 'fraud_cc' | 'fraud_scc'
    inputPartition, // records array or key-values
    meta = {}
  }) {
    this.jobId = jobId;
    this.taskId = taskId;
    this.taskType = taskType;
    this.workload = workload;
    this.inputPartition = inputPartition;
    this.meta = meta;

    this.status = TaskStatus.PENDING;
    this.attempts = 0;
    this.assignedWorker = null;
    this.acceptedAttemptId = null;
    this.createdAt = Date.now();
    this.startedAt = null;
    this.finishedAt = null;
  }

  createAttempt(workerId) {
    this.attempts += 1;
    this.assignedWorker = workerId;
    this.status = TaskStatus.RUNNING;
    this.startedAt = Date.now();
    return `${this.taskId}-attempt-${this.attempts}`;
  }
}
