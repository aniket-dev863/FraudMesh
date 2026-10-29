#!/usr/bin/env python3
"""
FraudMesh Connected-Components Comparison Benchmark Runner
Executes the CC comparison benchmark suite across path, sparse, power-law, and fraud graph families,
records metrics in results/cc_comparison.csv and results/cc_rounds.jsonl, and generates
the 4 comparative figures in results/.
"""

import subprocess
import sys
import os

def main():
    print("=== FraudMesh CC Comparison Benchmark ===")
    
    # 1. Run Node.js benchmark suite
    print("[1/2] Running benchmark sweeps (Node.js engine)...")
    res = subprocess.run(["node", "benchmarks/cc_compare.js"], check=True)
    
    # 2. Generate visualization plots
    print("[2/2] Generating comparison plots (Matplotlib)...")
    res2 = subprocess.run([sys.executable, "benchmarks/generate_plots.py"], check=True)
    
    print("\nBenchmark complete! Outputs:")
    print("  - Data table: results/cc_comparison.csv")
    print("  - Per-round metrics: results/cc_rounds.jsonl")
    print("  - Plot 1: results/rounds_vs_n_path.png")
    print("  - Plot 2: results/shuffle_bytes_per_round.png")
    print("  - Plot 3: results/total_shuffle_and_rounds.png")
    print("  - Plot 4: results/peak_reducer_values.png")

if __name__ == "__main__":
    main()
