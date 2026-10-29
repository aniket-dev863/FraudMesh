# Connected Components Algorithms — Design & Implementation

> **Reference:** V. Rastogi, A. Machanavajjhala, L. Chitnis, A. Das Sarma,
> "Finding Connected Components on Map-Reduce in Logarithmic Rounds", ICDE 2013 /
> [arXiv:1203.5387](https://arxiv.org/abs/1203.5387).

---

## 1. Algorithms

### 1.1 Hash-to-Min (HtM)

**Idea:** Every vertex maintains a cluster set $C_v$ initialized to $\{v\} \cup \Gamma(v)$.
Each round sends the full cluster to the minimum member and a pointer to the minimum
to every other member. Clusters grow monotonically until convergence.

**Pseudocode (one MapReduce round):**

```
MAP(v, C_v):
  m ← min(C_v)
  emit(m, C_v)
  for every u ∈ C_v, u ≠ m:
    emit(u, {m})

REDUCE(v, list_of_sets):
  C_v' ← union of all received sets
```

**Convergence:** When no cluster changes between rounds.

**Complexity (paper):**
- Rounds: $O(\log n)$ for path graphs; $O(\log d)$ in practice ($d$ = diameter)
- Communication per round: $\le 3(|V| + |E|)$

### 1.2 Hash-Greater-to-Min (HGtM) — Alternating Scheme

**Idea:** An alternating 3-round cycle (Hma, Hma, Hcm) that combines label propagation
with a core-shortcutting step.

**Pseudocode:**

```
ROUND CYCLE: repeat until convergence
  Round 1, 2 (Hma — label propagation):
    MAP(v, C_v):
      emit(v, C_v)                           // keep own cluster
      m ← min(C_v)
      for u ∈ Γ(v):                          // original neighbors
        emit(u, {m})                         // propagate minimum

    REDUCE(v, sets):
      C_v' ← union of all received sets

  Round 3 (Hcm — core shortcutting):
    MAP(v, C_v):
      core(v) ← {u ∈ C_v : u ≥ v}           // nodes not less than v
      m ← min(C_v)
      emit(m, core(v))
      for u ∈ core(v):
        emit(u, {m})

    REDUCE(v, sets):
      C_v' ← union of all received sets
```

**Convergence:** Checked only at the end of Hcm rounds (end of each 3-round cycle).
When no cluster changes during a Hcm round, the algorithm has converged.

**Complexity (paper):**
- Rounds: $O(3 \log n)$ with high probability
- Communication per round: $\le 2(|V| + |E|)$

---

## 2. Node Ordering Design

The algorithms compare node identifiers to determine "minimum" and "greater-than".
We provide two ordering modes via `OrderContext`:

| Mode | Behavior |
|------|----------|
| `natural` | Numerical-aware comparison: `"9" < "10"`, `"ACC_9" < "ACC_10"`. Uses `localeCompare` with `numeric: true` for strings, `BigInt` comparison for pure integers. |
| `seeded` | Deterministic pseudo-random order via `SHA-256(seed:nodeId)`. Same seed always produces the same total order. Different seeds give different orders, enabling the randomized guarantees of HGtM. |

**Implementation:** [`fraud/cc/ordering.js`](../fraud/cc/ordering.js)

---

## 3. Convergence Rule

- **Hash-to-Min:** Converged when `changedNodes === 0` after any round.
- **Hash-Greater-to-Min (Alternating):** Converged when `changedNodes === 0` after an
  Hcm round (round number divisible by 3).

A **max-rounds guard** prevents infinite loops:
`maxRounds = 10 × ceil(log₂(max(2, n))) + 20`

If the guard fires, the driver throws an error.

---

## 4. Counting Conventions (Instrumentation)

Per-round metrics are written to `results/cc_rounds.jsonl` as one JSON object per line.

| Metric | Definition |
|--------|------------|
| `shuffle_elements` | Total node IDs carried in all emitted values (the paper's communication unit). For an emission `(key, [v1, v2, v3])`, this counts 3 elements. |
| `shuffle_bytes` | `Buffer.byteLength(JSON.stringify(pair), 'utf-8')` for every emitted key-value pair, using the same JSON serializer the engine uses for NDJSON framing. |
| `elements_per_ve` | `shuffle_elements / (|V| + |E|)` — the paper's per-round communication diagnostic. |
| `changed_nodes` | Number of nodes whose cluster changed in this round. |
| `distinct_keys` | Number of unique keys emitted (unique reducer destinations). |
| `max_values_at_one_reducer` | Peak number of element IDs sent to any single key (reducer skew indicator). |

**Diagnostic:** If `elements_per_ve > 2.0` on an Hcm round, a warning is logged (never a crash).
The paper's exact counting convention may differ from ours (we count elements in emitted value
arrays; the paper counts "node IDs carried"). See the comparison report for which graphs exceeded
this threshold.

---

## 5. Strategy Interface

Both algorithms implement the `CCAlgorithm` base class ([`fraud/cc/base.js`](../fraud/cc/base.js)):

```
class CCAlgorithm {
  constructor(name)
  map(record, orderContext)       → [{key, value}, ...]
  reduce(key, values, orderContext) → {node, cluster}
  extractComponents(clusters, orderContext) → Map<node, componentId>
}
```

The driver ([`fraud/cc/driver.js`](../fraud/cc/driver.js)) runs a round loop that:
1. Calls `map()` for every node
2. Groups emitted pairs by key (shuffle)
3. Calls `reduce()` for each key
4. Checks convergence

Algorithm selection: `--cc-algorithm {hash_to_min, hash_greater_to_min}` or
env var `CC_ALGORITHM`. Default is `hash_to_min`.

---

## 6. Citation

```bibtex
@inproceedings{rastogi2013cc,
  author    = {Vibhor Rastogi and Ashwin Machanavajjhala and
               Laukik Chitnis and Anish Das Sarma},
  title     = {Finding Connected Components on Map-Reduce in
               Logarithmic Rounds},
  booktitle = {ICDE},
  year      = {2013},
  note      = {arXiv:1203.5387}
}
```
