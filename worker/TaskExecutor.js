import { ccMap, ccReduce } from '../fraud/connectedComponents.js';
import { fraudReduce } from '../fraud/reducer.js';
import { fraudMap } from '../fraud/mapper.js';

/**
 * Worker-side execution engine for assigned tasks.
 */
export class TaskExecutor {
  constructor({ workerSlowdownMs = 0 } = {}) {
    this.workerSlowdownMs = workerSlowdownMs;
  }

  async executeTask(task) {
    const { workload, taskType, inputPartition, meta } = task;

    // Apply artificial slowdown if configured for this worker (useful for straggler demo)
    if (this.workerSlowdownMs > 0) {
      await new Promise((res) => setTimeout(res, this.workerSlowdownMs));
    }

    if (workload === 'wordcount') {
      return this._executeWordCount(taskType, inputPartition);
    } else if (workload === 'fraud_map') {
      return this._executeFraudMap(inputPartition);
    } else if (workload === 'fraud_cc') {
      return this._executeFraudCC(taskType, inputPartition, meta);
    } else if (workload === 'fraud_scc') {
      return this._executeFraudSCC(inputPartition);
    } else {
      throw new Error(`Unknown task workload: ${workload}`);
    }
  }

  _executeWordCount(taskType, inputPartition) {
    if (taskType === 'MAP') {
      // inputPartition: array of text lines
      const emits = [];
      for (const line of inputPartition) {
        const words = line.trim().toLowerCase().split(/\s+/).filter(Boolean);
        for (const w of words) {
          emits.push({ key: w, value: 1 });
        }
      }
      return { emits };
    } else if (taskType === 'REDUCE') {
      // inputPartition: array of { key, values }
      const results = [];
      for (const { key, values } of inputPartition) {
        const sum = values.reduce((acc, v) => acc + (typeof v === 'number' ? v : 1), 0);
        results.push({ key, count: sum });
      }
      return { results };
    }
  }

  _executeFraudMap(inputPartition) {
    // inputPartition: array of transaction objects { sender_account, receiver_account, amount, timestamp }
    const emits = [];
    for (const record of inputPartition) {
      const items = fraudMap(record);
      for (const it of items) emits.push(it);
    }
    return { emits };
  }

  _executeFraudCC(taskType, inputPartition, meta) {
    if (taskType === 'MAP') {
      // inputPartition: array of { node, label, neighbors }
      const emits = [];
      for (const item of inputPartition) {
        const mapped = ccMap(item);
        for (const m of mapped) emits.push(m);
      }
      return { emits };
    } else if (taskType === 'REDUCE') {
      // inputPartition: array of { key, values } where key is node, values are candidate labels
      // meta contains currentLabels map as object
      const currentLabelsMap = new Map(Object.entries(meta?.currentLabels || {}));
      let anyChanged = false;
      const updatedNodes = [];

      for (const { key, values } of inputPartition) {
        const res = ccReduce(key, values, currentLabelsMap);
        if (res.changed) anyChanged = true;
        updatedNodes.push({ node: res.node, label: res.label });
      }

      return { updatedNodes, anyChanged };
    }
  }

  _executeFraudSCC(inputPartition) {
    // inputPartition: array of { key: componentId, values: [ { sender, receiver } ] }
    const rings = [];
    for (const { key, values } of inputPartition) {
      const detected = fraudReduce(key, values);
      for (const ring of detected) rings.push(ring);
    }
    return { rings };
  }
}
