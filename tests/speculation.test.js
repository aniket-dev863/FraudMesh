import test from 'node:test';
import assert from 'node:assert';
import { SpeculationManager } from '../master/SpeculationManager.js';
import { TaskManager } from '../master/TaskManager.js';
import { WorkerRegistry } from '../master/WorkerRegistry.js';
import { Task, TaskType } from '../common/models.js';

test('speculation - identifies stragglers exceeding median threshold', () => {
  const sm = new SpeculationManager({ speculationEnabled: true, speculationMultiplier: 2.0 });
  const tm = new TaskManager();
  const wr = new WorkerRegistry();

  wr.register('worker-1', {});
  wr.register('worker-2', {}); // Idle backup worker

  // Pre-seed completed tasks with median duration 1000ms
  tm.taskDurations.set(TaskType.MAP, [900, 1000, 1100]);

  const stragglerTask = new Task({ jobId: 'j1', taskId: 'map-slow', taskType: TaskType.MAP, workload: 'wordcount' });
  stragglerTask.startedAt = Date.now() - 3000; // 3 seconds elapsed (3x median)
  tm.addTask(stragglerTask);
  tm.recordAttempt(stragglerTask.taskId, 'map-slow-attempt-1', 'worker-1');

  const stragglers = sm.findStragglers(tm, wr);
  assert.strictEqual(stragglers.length, 1);
  assert.strictEqual(stragglers[0].task.taskId, 'map-slow');
  assert.strictEqual(stragglers[0].targetWorker.id, 'worker-2');
});
