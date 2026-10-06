export class SpeculationManager {
  constructor({
    speculationEnabled = true,
    speculationMultiplier = 2.0
  } = {}) {
    this.speculationEnabled = speculationEnabled;
    this.speculationMultiplier = speculationMultiplier;
    this.speculatedTaskIds = new Set();
    this.speculativeAttemptsCount = 0;
  }

  /**
   * Checks for straggler tasks and creates backup attempts if idle workers are available.
   */
  findStragglers(taskManager, workerRegistry) {
    if (!this.speculationEnabled) return [];

    const idleWorkers = workerRegistry.getIdleWorkers();
    if (idleWorkers.length === 0) return [];

    const runningTasks = taskManager.getRunningTasks();
    const stragglerAssignments = [];

    for (const task of runningTasks) {
      if (this.speculatedTaskIds.has(task.taskId)) continue; // Max 1 speculative attempt

      const median = taskManager.getMedianDuration(task.taskType);
      if (!median || median < 200) continue; // Need sufficient sample history

      const elapsed = Date.now() - (task.startedAt || Date.now());
      if (elapsed > median * this.speculationMultiplier) {
        // Pick an idle worker that is not already executing this task
        const targetWorkerIndex = idleWorkers.findIndex(w => w.id !== task.assignedWorker);
        if (targetWorkerIndex === -1) continue;
        const targetWorker = idleWorkers.splice(targetWorkerIndex, 1)[0];

        this.speculatedTaskIds.add(task.taskId);
        this.speculativeAttemptsCount++;

        console.log(`[MASTER] STRAGGLER DETECTED task=${task.taskId} elapsed=${(elapsed / 1000).toFixed(1)}s median=${(median / 1000).toFixed(1)}s`);
        stragglerAssignments.push({ task, targetWorker });
      }
    }

    return stragglerAssignments;
  }
}
