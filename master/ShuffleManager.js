import { defaultPartitioner } from '../common/mapreduce.js';

export class ShuffleManager {
  /**
   * Groups emitted key-value pairs by key, and partitions keys across reducers.
   *
   * @param {Array<{key, value}>} emittedPairs
   * @param {number} numReducers
   * @returns {Map<number, Array<{key: string, values: Array<any>}>>} partitionIndex -> grouped key-values
   */
  static shuffleAndGroup(emittedPairs, numReducers = 4) {
    // 1. Group by key
    const keyToValues = new Map();
    for (const { key, value } of emittedPairs) {
      if (!keyToValues.has(key)) {
        keyToValues.set(key, []);
      }
      keyToValues.get(key).push(value);
    }

    // 2. Partition across reducers
    const partitions = new Map();
    for (let i = 0; i < numReducers; i++) {
      partitions.set(i, []);
    }

    for (const [key, values] of keyToValues.entries()) {
      const pIdx = defaultPartitioner(key, numReducers);
      partitions.get(pIdx).push({ key, values });
    }

    return partitions;
  }
}
