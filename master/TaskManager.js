import { Task, TaskStatus } from '../common/models.js';

export class TaskManager {
  constructor() {
    this.tasks = new Map(); // taskId -> Task
    this.pendingQueue = []; // array of taskIds
    this.acceptedAttempts = new Map(); // taskId -> attemptId
    this.results = new Map(); // taskId -> result payload
    this.attemptToTask = new Map(); // attemptId -> taskId
    this.taskDurations = new Map(); // taskType -> array of duration ms
  }

  addTask(task) {
    this.tasks.set(task.taskId, task);
    this.pendingQueue.push(task.taskId);
  }

  addTasks(tasks) {
    for (const t of tasks) this.addTask(t);
  }

  getNextPendingTask() {
    while (this.pendingQueue.length > 0) {
      const taskId = this.pendingQueue.shift();
      const task = this.tasks.get(taskId);
      if (task && (task.status === TaskStatus.PENDING || task.status === TaskStatus.REQUEUED)) {
        return task;
      }
    }
    return null;
  }

  recordAttempt(taskId, attemptId, workerId) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    this.attemptToTask.set(attemptId, taskId);
    task.assignedWorker = workerId;
    task.status = TaskStatus.RUNNING;
  }

  acceptResult(taskId, attemptId, result) {
    const task = this.tasks.get(taskId);
    if (!task) return { accepted: false, reason: 'TASK_NOT_FOUND' };

    // Check if result for this logical task was already accepted
    if (this.acceptedAttempts.has(taskId)) {
      return { accepted: false, reason: 'ALREADY_ACCEPTED', acceptedAttemptId: this.acceptedAttempts.get(taskId) };
    }

    // Check if task is marked CANCELLED
    if (task.status === TaskStatus.CANCELLED) {
      return { accepted: false, reason: 'TASK_CANCELLED' };
    }

    this.acceptedAttempts.set(taskId, attemptId);
    this.results.set(taskId, result);
    task.status = TaskStatus.SUCCEEDED;
    task.acceptedAttemptId = attemptId;
    task.finishedAt = Date.now();

    if (task.startedAt) {
      const duration = task.finishedAt - task.startedAt;
      if (!this.taskDurations.has(task.taskType)) {
        this.taskDurations.set(task.taskType, []);
      }
      this.taskDurations.get(task.taskType).push(duration);
    }

    return { accepted: true };
  }

  handleWorkerFailure(workerId) {
    const affectedTasks = [];
    for (const task of this.tasks.values()) {
      if (task.assignedWorker === workerId && task.status === TaskStatus.RUNNING && !this.acceptedAttempts.has(task.taskId)) {
        task.status = TaskStatus.REQUEUED;
        task.assignedWorker = null;
        this.pendingQueue.unshift(task.taskId); // High priority requeue
        affectedTasks.push(task);
      }
    }
    return affectedTasks;
  }

  isStageComplete() {
    if (this.pendingQueue.length > 0) return false;
    for (const task of this.tasks.values()) {
      if (!this.acceptedAttempts.has(task.taskId)) {
        return false;
      }
    }
    return true;
  }

  getMedianDuration(taskType) {
    const durations = this.taskDurations.get(taskType);
    if (!durations || durations.length === 0) return null;
    const sorted = [...durations].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  getRunningTasks() {
    return Array.from(this.tasks.values()).filter(t => t.status === TaskStatus.RUNNING && !this.acceptedAttempts.has(t.taskId));
  }

  clear() {
    this.tasks.clear();
    this.pendingQueue = [];
    this.acceptedAttempts.clear();
    this.results.clear();
    this.attemptToTask.clear();
  }
}
