/**
 * Tarjan's Strongly Connected Components (SCC) algorithm.
 *
 * Given a directed graph (or directed edges of a connected component),
 * finds all maximal strongly connected subgraphs with size >= minSize.
 */

export function findSCCs(edges, minSize = 2) {
  // Build directed adjacency list
  const adj = new Map();
  const nodes = new Set();

  for (const { sender, receiver } of edges) {
    nodes.add(sender);
    nodes.add(receiver);
    if (!adj.has(sender)) adj.set(sender, []);
    adj.get(sender).push(receiver);
  }

  let index = 0;
  const indices = new Map();
  const lowlinks = new Map();
  const onStack = new Map();
  const stack = [];
  const sccs = [];

  function strongConnect(v) {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.set(v, true);

    const neighbors = adj.get(v) || [];
    for (const w of neighbors) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v), lowlinks.get(w)));
      } else if (onStack.get(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v), indices.get(w)));
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const scc = [];
      let w = null;
      do {
        w = stack.pop();
        onStack.set(w, false);
        scc.push(w);
      } while (w !== v);

      if (scc.length >= minSize) {
        // Sort accounts deterministically
        scc.sort();
        sccs.push(scc);
      }
    }
  }

  for (const node of nodes) {
    if (!indices.has(node)) {
      strongConnect(node);
    }
  }

  // Sort list of rings deterministically by first account
  sccs.sort((a, b) => a[0].localeCompare(b[0]));
  return sccs;
}
