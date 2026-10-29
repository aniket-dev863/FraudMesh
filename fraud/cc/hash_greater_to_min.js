import { CCAlgorithm } from './base.js';

/**
 * Hash-Greater-to-Min connected components algorithm.
 *
 * Reference: V. Rastogi et al., "Finding connected components in map-reduce
 * in logarithmic rounds", ICDE 2013 / arXiv:1203.5387.
 *
 * Map:
 *   Given (v, C_v):
 *     m = min(C_v)
 *     G = { u in C_v : u >= v } (under total order)
 *     if G is not empty:
 *       emit(m, G)
 *       for every u in G:
 *         emit(u, [m])
 *
 * Reduce:
 *   Given (v, sets):
 *     C_v' = union of all sets
 */
export class HashGreaterToMinAlgorithm extends CCAlgorithm {
  constructor() {
    super('hash_greater_to_min');
  }

  map(record, orderContext) {
    const { node, cluster } = record;
    if (!cluster || cluster.length === 0) {
      return [{ key: node, value: [node] }];
    }

    const m = orderContext.min(cluster);
    const G = cluster.filter(u => orderContext.compare(u, node) >= 0);

    const emits = [];
    if (G.length > 0) {
      // Emit (m, G)
      emits.push({ key: m, value: G });

      // For every u in G: emit (u, [m])
      for (const u of G) {
        emits.push({ key: u, value: [m] });
      }
    }

    return emits;
  }

  reduce(key, values, orderContext) {
    return super.reduce(key, values, orderContext);
  }
}
