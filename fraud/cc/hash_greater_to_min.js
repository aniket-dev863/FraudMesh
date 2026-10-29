import { CCAlgorithm } from './base.js';

/**
 * Hash-Greater-to-Min connected components algorithm (Alternating scheme).
 *
 * Reference: V. Rastogi et al., "Finding connected components in map-reduce
 * in logarithmic rounds", ICDE 2013 / arXiv:1203.5387, Section 4.4.
 *
 * The paper specifies an "Alternating" algorithm that repeats a 3-round cycle:
 *   Round 1 (Hma): emit (v, C_v) and (u, {v_min}) for all u in neighbors(v)
 *   Round 2 (Hma): same as round 1
 *   Round 3 (Hcm): compute core(v) = {u in C_v : u >= v}, emit (v_min, core(v))
 *                   and (u, {v_min}) for all u in core(v)
 *
 * Merge function:
 *   Hma rounds: C_v' = C_v ∪ {min of all incoming messages}
 *   Hcm rounds: C_v' = union of all incoming messages (like Hash-to-All)
 *
 * Theoretical guarantees: O(3 log n) rounds w.h.p., 2(|V|+|E|) communication/round.
 *
 * IMPLEMENTATION NOTE: The prompt's paraphrase treats Hash-Greater-to-Min as a
 * standalone hashing strategy. The paper (algos.tex line 152) explicitly states:
 * "Hcm algorithm runs two rounds using Hma hash function, followed by a round
 * using Hcm hash function, and keeps on repeating these three rounds until
 * convergence." We implement the full alternating scheme here.
 * The difference from the prompt's paraphrase: the prompt gives only the Hcm
 * hashing step and omits the prerequisite Hma propagation rounds.
 */
export class HashGreaterToMinAlgorithm extends CCAlgorithm {
  constructor() {
    super('hash_greater_to_min');
  }

  /**
   * Returns the round type for a given 1-based round number.
   * Cycle: Hma, Hma, Hcm, Hma, Hma, Hcm, ...
   * @param {number} round - 1-based round number
   * @returns {'hma' | 'hcm'}
   */
  getRoundType(round) {
    return (round % 3 === 0) ? 'hcm' : 'hma';
  }

  /**
   * Hma Map step (label propagation):
   *   emit (v, C_v)               — send own cluster back to self
   *   emit (u, {v_min}) for u ∈ neighbors(v)
   *
   * NOTE: This requires knowing the original neighbors, not just the cluster.
   * The driver passes { node, cluster, neighbors } during Hma rounds.
   */
  mapHma(record, orderContext) {
    const { node, cluster, neighbors } = record;
    const m = orderContext.min(cluster);
    const emits = [];

    // Send own cluster back to self
    emits.push({ key: node, value: cluster });

    // Send v_min to all neighbors
    if (neighbors) {
      for (const u of neighbors) {
        emits.push({ key: u, value: [m] });
      }
    }

    return emits;
  }

  /**
   * Hma Reduce: C_v' = C_v ∪ {min of all incoming messages}
   * In practice this is the same as union for correctness; the paper's
   * description adds only the global minimum to the own cluster, but
   * functionally the mapper already restricts what's sent.
   */
  reduceHma(key, values, orderContext) {
    // The first value list should be the node's own cluster (sent to self).
    // Others are singleton {v_min} from neighbors.
    const union = new Set();
    for (const valList of values) {
      if (Array.isArray(valList)) {
        for (const item of valList) union.add(item);
      } else if (valList !== undefined && valList !== null) {
        union.add(valList);
      }
    }
    return {
      node: key,
      cluster: Array.from(union)
    };
  }

  /**
   * Hcm Map step (core shortcutting):
   *   core(v) = {u ∈ C_v : u >= v}  (nodes not less than v under the order)
   *   emit (v_min, core(v))
   *   emit (u, {v_min}) for all u ∈ core(v)
   */
  mapHcm(record, orderContext) {
    const { node, cluster } = record;
    if (!cluster || cluster.length === 0) {
      return [{ key: node, value: [node] }];
    }

    const m = orderContext.min(cluster);
    const G = cluster.filter(u => orderContext.compare(u, node) >= 0);

    const emits = [];
    if (G.length > 0) {
      // Emit (v_min, core(v))
      emits.push({ key: m, value: G });

      // Emit (u, {v_min}) for all u in core(v)
      for (const u of G) {
        emits.push({ key: u, value: [m] });
      }
    }

    return emits;
  }

  /**
   * Hcm Reduce: C_v' = union of all incoming messages (like Hash-to-All merge)
   */
  reduceHcm(key, values, orderContext) {
    return super.reduce(key, values, orderContext);
  }

  /**
   * Unified map dispatcher — called by the driver with roundType in record.meta.
   */
  map(record, orderContext) {
    const roundType = record.roundType || 'hcm';
    if (roundType === 'hma') {
      return this.mapHma(record, orderContext);
    }
    return this.mapHcm(record, orderContext);
  }

  /**
   * Unified reduce dispatcher.
   */
  reduce(key, values, orderContext, roundType = 'hcm') {
    if (roundType === 'hma') {
      return this.reduceHma(key, values, orderContext);
    }
    return this.reduceHcm(key, values, orderContext);
  }
}
