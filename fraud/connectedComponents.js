/**
 * Hash-to-Min connected component logic.
 *
 * For a distributed MapReduce model:
 * In each iteration:
 * Map:
 *   For each node u with current label L and neighbor v:
 *     emit(u, L)
 *     emit(v, L)
 * Reduce:
 *   For node u and list of received labels [L1, L2, ...]:
 *     newLabel = min(L1, L2, ...)
 *     changed = (newLabel !== currentLabel)
 *     emit(u, newLabel)
 */

export function ccMap(record) {
  // record: { u, v, labelU, labelV } or { node, label, neighbors: [...] }
  const emits = [];
  const { node, label, neighbors } = record;
  // Node emits its own label to itself
  emits.push({ key: node, value: label });
  // Node propagates its label to each neighbor
  for (const n of neighbors) {
    emits.push({ key: n, value: label });
  }
  return emits;
}

export function ccReduce(key, values, currentLabels) {
  // key is node
  // values is array of candidate labels
  let minLabel = values[0];
  for (const val of values) {
    if (String(val).localeCompare(String(minLabel)) < 0) {
      minLabel = val;
    }
  }

  const prevLabel = currentLabels?.get(key) || key;
  const changed = String(minLabel) !== String(prevLabel);

  return {
    node: key,
    label: minLabel,
    changed
  };
}
