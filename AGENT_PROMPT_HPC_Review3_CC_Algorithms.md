# FraudMesh — Review 3 Task: Second Connected-Components Algorithm

You are working in the existing FraudMesh repository (fault-tolerant, skew-aware
MapReduce engine for fraud-ring mining). This task has **two parts, done in order**.

- **PART 1** is a read-only audit of the repository's current state.
- **PART 2** builds Hash-Greater-to-Min next to the existing Hash-to-Min and compares them.

Do not skip Part 1. Part 2's design depends on what Part 1 finds.

---

# PART 1 — Current-State Audit (read-only)

**Rule: in Part 1 you may only create one new file, `CURRENT_STATE.md`.** Do not edit,
move, or delete anything else.

## 1.1 Investigate

Run and read whatever you need (`git log --oneline`, file tree, README, PROGRESS_REPORT,
DEMO_GUIDE, the test suite, `docker compose config`). Run the existing tests and, if
feasible, the existing demo, and record the real output. Do not assume anything works
because it is documented.

## 1.2 Write `CURRENT_STATE.md`

**A. Phase status table.** The project was specified in 9 phases. For each, give
`Done / Partial / Missing` and **evidence** (file path, test name, or a command you ran
and what it printed). Never write "Done" without evidence.

| Phase | Scope |
|---|---|
| 1 | Skeleton + Docker Compose cluster, worker registration |
| 2 | Generic MapReduce task runner (pluggable map/reduce fns) |
| 3 | Fault tolerance: heartbeats, re-execution, idempotent results |
| 4 | Speculative execution for stragglers |
| 5 | Skew-aware rebalancing |
| 6 | Fraud-ring workload (Hash-to-Min connected components, then Tarjan SCC) |
| 7 | Fault-injection tooling |
| 8 | Benchmark harness |
| 9 | Demo script and documentation |

**B. Answer these eight questions precisely (cite `file:function`).** They decide the Part 2 design.

1. Where is Hash-to-Min implemented, and what are the signatures of its map and reduce functions?
2. Is each connected-components round run as a **separate distributed MapReduce job** through
   the master, or as an in-process loop? Where is the round loop and its convergence check?
3. How is graph state carried between rounds (shared-volume files, master memory, other)?
4. What type are node/account IDs, and how is "min" computed? Flag any string-comparison
   pitfall (for example `"10" < "9"`).
5. Is shuffle volume measured anywhere today? If so, how and where is it logged?
6. Which test framework is used, and how many tests exist and pass right now?
7. Can the full pipeline (generate data -> connected components -> Tarjan SCC -> rings)
   run end to end today? Show the command and its output.
8. List any place where the code diverges from the design in this document.

**C. Blockers.** List anything that would prevent Part 2.

## 1.3 End of Part 1

Print a summary of at most 10 lines. Then:

- If the audit finds **no blocker**, continue to Part 2.
- If Phase 2 or Phase 6 is **Missing** (no working MapReduce engine, or no Hash-to-Min),
  **stop** and report exactly what is missing. Do not invent a substitute engine.
- If the connected-components loop turns out to be in-process rather than distributed
  (question 2), continue, but record this in `CURRENT_STATE.md`. Part 2 handles both cases.

---

# PART 2 — Build: Hash-Greater-to-Min next to Hash-to-Min

## 2.0 Goal

Add a second connected-components algorithm, **Hash-Greater-to-Min**, beside the existing
**Hash-to-Min**. Compare them on **rounds to converge** and **shuffle volume**. This gives
the project a real, literature-backed algorithm comparison.

**Reference:** V. Rastogi, A. Machanavajjhala, L. Chitnis, A. Das Sarma, "Finding
connected components in map-reduce in logarithmic rounds," ICDE 2013, pp. 50-61,
DOI 10.1109/ICDE.2013.6544813, arXiv:1203.5387.

**What the paper claims (verify empirically, do not assume):**
- Hash-Greater-to-Min is randomized. With high probability it needs at most `3 log n`
  rounds, with at most `2(|V|+|E|)` communication per round.
- Hash-to-Min has a weaker theoretical guarantee, but in practice finishes in about
  `2 log d` rounds (d = graph diameter), with about `3(|V|+|E|)` communication per round.

## 2.1 Algorithm definitions

Work on the **undirected view** of the transaction graph: treat each (sender, receiver) as
an undirected edge for this stage only. Tarjan SCC afterwards still uses the directed edges.

Notation: `Γ(v)` = neighbours of v. Initial cluster `C_v = {v} ∪ Γ(v)`. `order(·)` is a total
order on nodes. `min(C)` is the smallest element under `order`.

**Hash-to-Min round** (already implemented; keep it and do not break it).
- Map `(v, C_v)`: let `m = min(C_v)`. Emit `(m, C_v)`. For every `u ∈ C_v, u ≠ m`, emit `(u, {m})`.
- Reduce `(v, sets)`: `C_v' = union of all sets`.

**Hash-Greater-to-Min round** (new). Paraphrase of the paper — **verify against the
paper's pseudocode before coding**:
- Map `(v, C_v)`: let `m = min(C_v)` and `G = {u ∈ C_v : u ≥ v}` (nodes not smaller than v).
  Emit `(m, G)`. For every `u ∈ G`, emit `(u, {m})`.
- Reduce `(v, sets)`: `C_v' = union of all sets`.

> The exact definition of `G` (≥ versus strict >) may differ between the paper and
> follow-up writeups. **Fetch arXiv:1203.5387 and follow its pseudocode exactly.** If it
> differs from the paraphrase above, use the paper's version and record the difference in
> `docs/cc_algorithms.md`. The correctness tests in 2.4 are the safety net for a misreading.

**Convergence (both):** stop when a round changes no node's cluster. At convergence, for
each component with minimum node `m`, `C_m` holds the whole component and every other node
holds `{m}`. Extract components from that.

**Ordering is the crux — do it explicitly.**
- Add `order_key(node, mode, seed)` returning a deterministic, totally ordered key
  (tie-break by the node ID itself so equal hashes never create ambiguity).
- Hash-to-Min uses the **natural** order, unchanged. Make sure integer-like string IDs
  compare consistently (fix the `"10" < "9"` trap if Part 1 found it).
- Hash-Greater-to-Min's guarantee is probabilistic, so use a **seeded pseudo-random
  order** (for example a keyed hash of the ID). The seed must be configurable and recorded
  in every result row.

## 2.2 Code structure

1. Introduce a small strategy interface in `fraud/cc/` (adapt names to the repo's style):
   - `hash_to_min.py` — move/wrap the existing implementation. **Its behaviour must not change.**
   - `hash_greater_to_min.py` — new.
   - `driver.py` — one round-loop that takes an algorithm object, drives rounds through the
     **same execution path the engine already uses** (distributed jobs if Part 1 says the
     rounds are distributed, otherwise the existing loop), checks convergence, and enforces a
     **max-rounds guard** (for example `10*ceil(log2(n)) + 20`) that raises a clear error
     instead of looping forever.
   - Algorithm selection via `--cc-algorithm {hash_to_min,hash_greater_to_min}` and the env
     var `CC_ALGORITHM`. Default stays `hash_to_min`.
2. Add a **local in-process mode** that runs the same map/reduce functions in a single
   process. Rounds and communication volume are properties of the algorithm and graph, not of
   the cluster, so the sweeps in 2.5 can use this mode. Reserve cluster runs for wall-time.
3. The downstream stage (per-component Tarjan SCC and ring output) must be untouched and
   must accept components from either algorithm.

## 2.3 Instrumentation (per round, both algorithms)

Write one JSON line per round to `results/cc_rounds.jsonl` with at least:
`run_id, algorithm, seed, graph_family, n_nodes, n_edges, round, map_records, shuffle_elements,
shuffle_bytes, distinct_keys, max_values_at_one_reducer, changed_nodes, round_seconds, converged`.

- `shuffle_elements` = total node IDs carried in all emitted values (the paper's
  communication unit).
- `shuffle_bytes` = serialized size of every intermediate key/value pair, measured with the
  **same serializer the engine uses for shuffling**, so both algorithms are counted identically.
- Also log `elements / (|V|+|E|)` per round. Warn (never crash) if Hash-Greater-to-Min exceeds
  `2(|V|+|E|)` in a round. Treat that as a diagnostic: the paper's exact counting convention
  may differ, so note in the docs how you counted.

## 2.4 Correctness tests (must pass before benchmarking)

For **both** algorithms, compare the resulting components against a ground truth
(`networkx.connected_components` or union-find) on:
- path graphs (the round-count stress case), star, ring, complete graph, tree
- several disconnected components, isolated nodes, self-loops, duplicate edges
- empty graph and single node
- 200+ random graphs (Erdos-Renyi plus preferential attachment) with different seeds
- the synthetic fraud dataset

For Hash-Greater-to-Min, run each graph with **at least 5 different seeds**.

Plus these:
- **Integration test:** the final fraud-ring output (after Tarjan) is **identical** whichever
  algorithm produced the components.
- **Guard test:** the max-rounds guard fires with a clear error on a deliberately broken
  algorithm (a mock that never converges).
- Existing tests must still pass. Report the before and after counts.

## 2.5 Comparison benchmark — `benchmarks/cc_compare.py`

Graph families: **path** (n = 2^10 ... 2^16), **random sparse** (average degree about 3),
**preferential attachment / power-law** (large components and a skewed degree
distribution), and the **synthetic fraud dataset** at several sizes. Hash-Greater-to-Min runs
with **5 or more seeds** per graph. Both algorithms also run with natural order versus
seeded-random order, so ordering effects are visible.

Output `results/cc_comparison.csv` plus plots in `results/`:
1. Rounds vs n for the path graph, with reference curves for `log2(n)` and `3*log2(n)`.
2. Shuffle bytes per round, both algorithms, per graph family (line chart).
3. Total shuffle bytes and total rounds (grouped bars) per graph family.
4. Peak values at a single reducer, to show skew pressure.

**Cluster check:** run at least one configuration (for example the fraud dataset, 4 workers)
on the real cluster for **both** algorithms, record wall time, and confirm the output rings
match the local-mode result.

## 2.6 Honest reporting — `results/CC_COMPARISON.md`

Include the results table, the plots, the exact counting conventions, the seeds used, and
the machine. Then write observations that follow the data:
- If Hash-to-Min wins on rounds in practice, **say so**. The paper itself says it is often
  faster in practice. Hash-Greater-to-Min's selling point is the provable round bound and
  bounded per-round communication.
- Say where each algorithm's communication grows, and whether any run exceeded the
  `2(|V|+|E|)` diagnostic, and on which graph.
- State plainly what was **not** measured or tested.

## 2.7 Documentation

- `docs/cc_algorithms.md`: pseudocode for both algorithms, the ordering design, convergence
  rule, counting conventions, and the citation above.
- Update `README.md` (how to choose the algorithm and rerun the comparison) and
  `PROGRESS_REPORT.md` (what was verified live versus only implemented, same honesty
  standard as before).

---

# Rules

- **Commit after each logical step** with a clear message: audit, strategy-interface refactor,
  Hash-Greater-to-Min, instrumentation, tests, benchmark, docs. No single giant commit.
- **No result without a command you actually ran.** Every number in the docs must come from
  `results/`. Do not write expected or typical values. If something could not be run, say so.
- Do not change the fault-tolerance, speculative-execution, or skew-rebalancing logic.
- Out of scope for this task: combiners, new partitioners, master failover, scaling studies.
  Do not start them.
- Keep the code explainable line by line in a viva. Prefer clarity over cleverness.

# Definition of Done

- `CURRENT_STATE.md` exists with evidence for every status and answers to all 8 questions.
- `--cc-algorithm hash_greater_to_min` runs end to end and produces the same fraud rings as
  `hash_to_min` on the fraud dataset.
- All correctness tests pass for both algorithms, and the earlier test count has not regressed.
- `results/cc_rounds.jsonl`, `results/cc_comparison.csv`, the plots, and
  `results/CC_COMPARISON.md` exist and are consistent with each other.
- At least one distributed (cluster) run per algorithm is recorded.
