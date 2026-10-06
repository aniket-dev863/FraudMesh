import test from 'node:test';
import assert from 'node:assert';
import { defaultPartitioner } from '../common/mapreduce.js';
import { ShuffleManager } from '../master/ShuffleManager.js';
import { TaskExecutor } from '../worker/TaskExecutor.js';

test('mapreduce - defaultPartitioner distributes consistently', () => {
  const p1 = defaultPartitioner('keyA', 4);
  const p2 = defaultPartitioner('keyA', 4);
  assert.strictEqual(p1, p2);
  assert(p1 >= 0 && p1 < 4);
});

test('mapreduce - ShuffleManager groups and partitions key-value pairs', () => {
  const emitted = [
    { key: 'apple', value: 1 },
    { key: 'banana', value: 2 },
    { key: 'apple', value: 3 },
  ];
  const partitions = ShuffleManager.shuffleAndGroup(emitted, 2);
  assert.strictEqual(partitions.size, 2);

  let totalItems = 0;
  for (const items of partitions.values()) {
    totalItems += items.length;
    for (const item of items) {
      if (item.key === 'apple') {
        assert.deepStrictEqual(item.values, [1, 3]);
      }
    }
  }
  assert.strictEqual(totalItems, 2);
});

test('mapreduce - TaskExecutor runs wordcount map and reduce', async () => {
  const executor = new TaskExecutor();

  // Map
  const mapResult = await executor.executeTask({
    workload: 'wordcount',
    taskType: 'MAP',
    inputPartition: ['Hello world', 'world']
  });
  assert.strictEqual(mapResult.emits.length, 3);

  // Reduce
  const reduceResult = await executor.executeTask({
    workload: 'wordcount',
    taskType: 'REDUCE',
    inputPartition: [{ key: 'world', values: [1, 1] }]
  });
  assert.strictEqual(reduceResult.results[0].key, 'world');
  assert.strictEqual(reduceResult.results[0].count, 2);
});
