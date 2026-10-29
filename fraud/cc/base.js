/**
 * Base strategy interface for Connected Components algorithms.
 */
export class CCAlgorithm {
  constructor(name) {
    this.name = name;
  }

  /**
   * Map step for one node's cluster.
   * @param {{ node: string, cluster: string[] }} record
   * @param {import('./ordering.js').OrderContext} orderContext
   * @returns {Array<{ key: string, value: string[] }>}
   */
  map(record, orderContext) {
    throw new Error('map() must be implemented by subclass');
  }

  /**
   * Reduce step for one node key and candidate cluster sets.
   * @param {string} key
   * @param {Array<string[]>} values
   * @param {import('./ordering.js').OrderContext} orderContext
   * @returns {{ node: string, cluster: string[] }}
   */
  reduce(key, values, orderContext) {
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
   * Extract component map (node -> componentId) from converged clusters.
   * @param {Map<string, Set<string>>} clusters
   * @param {import('./ordering.js').OrderContext} orderContext
   * @returns {Map<string, string>} node -> componentId
   */
  extractComponents(clusters, orderContext) {
    const nodeToComponent = new Map();
    for (const [node, cSet] of clusters.entries()) {
      const arr = Array.from(cSet);
      const minNode = orderContext.min(arr) || node;
      nodeToComponent.set(node, minNode);
    }
    return nodeToComponent;
  }
}
