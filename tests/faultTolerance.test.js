import test from 'node:test';
import assert from 'node:assert';
import { TaskManager } from '../master/TaskManager.js';
import { Task, TaskType, TaskStatus } from '../common/models.js';

test('fault tolerance - requeues unaccepted tasks on worker failure', () => {
  const tm = new TaskManager();
  const task1 = new Task({ jobId: 'j1', taskId: 'map-1', taskType: TaskType.MAP, workload: 'wordcount' });
  const task2 = new Task({ jobId: 'j1', taskId: 'map-2', taskType: TaskType.MAP, workload: 'wordcount' });

  tm.addTask(task1);
  tm.addTask(task2);

  // Attempt 1 for map-1 on worker-A
  const attempt1 = task1.createAttempt('worker-A');
  tm.recordAttempt(task1.taskId, attempt1, 'worker-A');

  // Attempt 1 for map-2 on worker-B
  const attempt2 = task2.createAttempt('worker-B');
  tm.recordAttempt(task2.taskId, attempt2, 'worker-B');

  // Worker-A fails!
  const requeued = tm.handleWorkerFailure('worker-A');
  assert.strictEqual(requeued.length, 1);
  assert.strictEqual(requeued[0].taskId, 'map-1');
  assert.strictEqual(task1.status, TaskStatus.REQUEUED);

  // Next pending task should be map-1
  const next = tm.getNextPendingTask();
  assert.strictEqual(next.taskId, 'map-1');
});

test('fault tolerance - exactly-once logical result acceptance suppresses late results', () => {
  const tm = new TaskManager();
  const task = new Task({ jobId: 'j1', taskId: 'map-1', taskType: TaskType.MAP, workload: 'wordcount' });
  tm.addTask(task);

  const attempt1 = task.createAttempt('worker-1');
  tm.recordAttempt(task.taskId, attempt1, 'worker-1');

  // Worker-1 stalls, attempt 2 launched on worker-2
  const attempt2 = task.createAttempt('worker-2');
  tm.recordAttempt(task.taskId, attempt2, 'worker-2');

  // Worker-2 completes first
  const res2 = tm.acceptResult('map-1', attempt2, { emits: ['apple'] });
  assert.strictEqual(res2.accepted, true);

  // Worker-1 late result arrives
  const res1 = tm.acceptResult('map-1', attempt1, { emits: ['apple'] });
  assert.strictEqual(res1.accepted, false);
  assert.strictEqual(res1.reason, 'ALREADY_ACCEPTED');

  // Final accepted result remains attempt2
  assert.strictEqual(task.acceptedAttemptId, attempt2);
});
