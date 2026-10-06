import { findSCCs } from './scc.js';

/**
 * Fraud Reducer:
 * Given componentId -> list of transaction edges,
 * runs Tarjan's SCC to detect fraud rings.
 */
export function fraudReduce(componentId, edges) {
  const sccs = findSCCs(edges, 2);
  return sccs.map((accounts, idx) => ({
    ringId: `ring-${componentId}-${idx + 1}`,
    accounts,
    ringSize: accounts.length
  }));
}
