export class SkewManager {
  constructor({
    skewEnabled = true,
    skewThreshold = 2.0
  } = {}) {
    this.skewEnabled = skewEnabled;
    this.skewThreshold = skewThreshold;
    this.skewStats = {
      detectedPartitions: 0,
      rebalances: 0
    };
  }

  /**
   * Inspects partitions and splits oversized partitions into multiple chunks.
   *
   * @param {Map<number, Array<{key, values}>>} partitions
   * @returns {{ balancedPartitions: Array<{ partitionId: string, items: Array<{key, values}> }>, wasSkewed: boolean }}
   */
  inspectAndBalance(partitions) {
    if (!this.skewEnabled) {
      const normalList = [];
      for (const [pIdx, items] of partitions.entries()) {
        normalList.push({ partitionId: `p-${pIdx}`, items });
      }
      return { balancedPartitions: normalList, wasSkewed: false };
    }

    let totalItems = 0;
    const partitionSizes = [];

    for (const [pIdx, items] of partitions.entries()) {
      const size = items.length;
      totalItems += size;
      partitionSizes.push({ pIdx, size, items });
    }

    const numPartitions = partitionSizes.length;
    if (numPartitions === 0) return { balancedPartitions: [], wasSkewed: false };

    const avgSize = totalItems / numPartitions;
    let skewFound = false;
    const resultPartitions = [];

    for (const { pIdx, size, items } of partitionSizes) {
      if (avgSize > 0 && size > avgSize * this.skewThreshold && items.length > 2) {
        skewFound = true;
        this.skewStats.detectedPartitions++;
        this.skewStats.rebalances++;

        // Determine split factor (e.g. 2 to 4 chunks)
        const chunkCount = Math.min(4, Math.ceil(size / avgSize));
        console.log(`[MASTER] SKEW DETECTED partition=${pIdx} size=${size} average=${avgSize.toFixed(1)}`);
        console.log(`[MASTER] REBALANCING partition=${pIdx} chunks=${chunkCount}`);

        const chunkSize = Math.ceil(items.length / chunkCount);
        for (let c = 0; c < chunkCount; c++) {
          const slice = items.slice(c * chunkSize, (c + 1) * chunkSize);
          if (slice.length > 0) {
            resultPartitions.push({
              partitionId: `p-${pIdx}-chunk-${c}`,
              items: slice
            });
          }
        }
      } else {
        resultPartitions.push({
          partitionId: `p-${pIdx}`,
          items
        });
      }
    }

    return { balancedPartitions: resultPartitions, wasSkewed: skewFound };
  }
}
