/**
 * Generic MapReduce interfaces and execution helpers.
 */
export class MapReduceJob {
  constructor({
    jobId,
    mapFn,
    reduceFn,
    numReducers = 4
  }) {
    this.jobId = jobId;
    this.mapFn = mapFn;
    this.reduceFn = reduceFn;
    this.numReducers = numReducers;
  }
}

/**
 * Standard partitioner: Hash string key to integer [0, numPartitions - 1]
 */
export function defaultPartitioner(key, numPartitions) {
  const str = String(key);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash) % numPartitions;
}
