import crypto from 'crypto';

/**
 * Total ordering implementation for connected-components nodes.
 * Supports:
 *  - 'natural': Consistent numerical-aware comparison, eliminating the '10' < '9' pitfall.
 *  - 'random' | 'seeded': Deterministic pseudo-random order using SHA-256 keyed hash with tie-breaker.
 */

export function getOrderKey(node, mode = 'natural', seed = 0) {
  const str = String(node);
  if (mode === 'random' || mode === 'seeded') {
    const h = crypto.createHash('sha256').update(`${seed}:${str}`).digest('hex');
    return { type: 'hash', hash: h, id: str };
  }
  if (/^-?\d+$/.test(str)) {
    return { type: 'num', num: BigInt(str), id: str };
  }
  return { type: 'str', id: str };
}

export function compareOrderKeys(a, b) {
  if (a.type === 'hash' && b.type === 'hash') {
    if (a.hash < b.hash) return -1;
    if (a.hash > b.hash) return 1;
    return a.id.localeCompare(b.id);
  }
  if (a.type === 'num' && b.type === 'num') {
    if (a.num < b.num) return -1;
    if (a.num > b.num) return 1;
    return 0;
  }
  if (a.type === 'num' && b.type !== 'num') return -1;
  if (a.type !== 'num' && b.type === 'num') return 1;
  return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
}

export class OrderContext {
  constructor(mode = 'natural', seed = 0) {
    this.mode = mode;
    this.seed = seed;
    this.cache = new Map();
  }

  getKey(node) {
    let k = this.cache.get(node);
    if (!k) {
      k = getOrderKey(node, this.mode, this.seed);
      this.cache.set(node, k);
    }
    return k;
  }

  compare(u, v) {
    if (u === v) return 0;
    return compareOrderKeys(this.getKey(u), this.getKey(v));
  }

  min(nodeList) {
    if (!nodeList || nodeList.length === 0) return null;
    let minNode = nodeList[0];
    let minKey = this.getKey(minNode);
    for (let i = 1; i < nodeList.length; i++) {
      const curKey = this.getKey(nodeList[i]);
      if (compareOrderKeys(curKey, minKey) < 0) {
        minNode = nodeList[i];
        minKey = curKey;
      }
    }
    return minNode;
  }
}
