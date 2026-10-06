/**
 * Graph data structure and helper functions for adjacency representation.
 */
export class Graph {
  constructor() {
    this.adj = new Map(); // node -> Set of target nodes
  }

  addNode(node) {
    if (!this.adj.has(node)) {
      this.adj.set(node, new Set());
    }
  }

  addEdge(u, v) {
    this.addNode(u);
    this.addNode(v);
    this.adj.get(u).add(v);
  }

  getNeighbors(node) {
    return Array.from(this.adj.get(node) || []);
  }

  getNodes() {
    return Array.from(this.adj.keys());
  }

  toUndirected() {
    const undirected = new Graph();
    for (const [u, targets] of this.adj.entries()) {
      for (const v of targets) {
        undirected.addEdge(u, v);
        undirected.addEdge(v, u);
      }
    }
    return undirected;
  }
}
