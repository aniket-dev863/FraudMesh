import { CCAlgorithm } from './base.js';

/**
 * Hash-to-Min connected components algorithm.
 *
 * Reference: V. Rastogi et al., "Finding connected components in map-reduce
 * in logarithmic rounds", ICDE 2013 / arXiv:1203.5387.
 *
 * Map:
 *   Given (v, C_v):
 *     m = min(C_v)
 *     emit(m, C_v)
 *     for every u in C_v, u != m:
 *       emit(u, [m])
 *
 * Reduce:
 *   Given (v, sets):
 *     C_v' = union of all sets
 */
export class HashToMinAlgorithm extends CCAlgorithm {
  constructor() {
    super('hash_to_min');
  }

  map(record, orderContext) {
    const { node, cluster } = record;
    if (!cluster || cluster.length === 0) {
      return [{ key: node, value: [node] }];
    }

    const m = orderContext.min(cluster);
    const emits = [];

    // Emit (m, C_v)
    emits.push({ key: m, value: cluster });

    // For every u in C_v, u != m: emit (u, [m])
    for (const u of cluster) {
      if (u !== m) {
        emits.push({ key: u, value: [m] });
      }
    }

    return emits;
  }

  reduce(key, values, orderContext) {
    return super.reduce(key, values, orderContext);
  }
}
