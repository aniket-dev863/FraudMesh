import { MessageType, createMessage } from '../common/protocol.js';
import { MessageFramer } from '../common/framing.js';

export class Scheduler {
  constructor({ workerRegistry, taskManager }) {
    this.workerRegistry = workerRegistry;
    this.taskManager = taskManager;
  }

  schedulePendingTasks() {
    const idleWorkers = this.workerRegistry.getIdleWorkers();
    if (idleWorkers.length === 0) return 0;

    let scheduledCount = 0;
    for (const worker of idleWorkers) {
      const task = this.taskManager.getNextPendingTask();
      if (!task) break;

      const attemptId = task.createAttempt(worker.id);
      this.taskManager.recordAttempt(task.taskId, attemptId, worker.id);
      this.workerRegistry.assignTask(worker.id, { taskId: task.taskId, attemptId });

      console.log(`[MASTER] Assigning ${attemptId} -> ${worker.id}`);

      const msg = createMessage(MessageType.TASK_ASSIGN, {
        workerId: worker.id,
        jobId: task.jobId,
        taskId: task.taskId,
        attemptId,
        payload: {
          taskType: task.taskType,
          workload: task.workload,
          inputPartition: task.inputPartition,
          meta: task.meta
        }
      });

      if (worker.socket && !worker.socket.destroyed) {
        worker.socket.write(MessageFramer.frame(msg));
        scheduledCount++;
      }
    }

    return scheduledCount;
  }

  assignSpeculativeAttempt(task, worker) {
    const attemptId = task.createAttempt(worker.id);
    this.taskManager.recordAttempt(task.taskId, attemptId, worker.id);
    this.workerRegistry.assignTask(worker.id, { taskId: task.taskId, attemptId });

    console.log(`[MASTER] SPECULATIVE ATTEMPT task=${task.taskId} attempt=${attemptId} worker=${worker.id}`);

    const msg = createMessage(MessageType.TASK_ASSIGN, {
      workerId: worker.id,
      jobId: task.jobId,
      taskId: task.taskId,
      attemptId,
      payload: {
        taskType: task.taskType,
        workload: task.workload,
        inputPartition: task.inputPartition,
        meta: task.meta
      }
    });

    if (worker.socket && !worker.socket.destroyed) {
      worker.socket.write(MessageFramer.frame(msg));
    }
  }
}
