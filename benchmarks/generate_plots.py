import os
import json
import csv
import math
import matplotlib.pyplot as plt
import numpy as np

os.makedirs('results', exist_ok=True)

# ─── Load CSV Data ────────────────────────────────────────────────────────────

csv_rows = []
with open('results/cc_comparison.csv', 'r') as f:
    reader = csv.DictReader(f)
    for r in reader:
        csv_rows.append(r)

# ─── Load JSONL Data ──────────────────────────────────────────────────────────

jsonl_records = []
with open('results/cc_rounds.jsonl', 'r') as f:
    for line in f:
        line = line.strip()
        if line:
            jsonl_records.append(json.loads(line))

# ─── Plot 1: Rounds vs n for the Path Graph ──────────────────────────────────
# With reference curves for log2(n) and 3*log2(n)

path_rows = [r for r in csv_rows if r['graph_family'] == 'path']
# Distinct n values
n_vals = sorted(list(set(int(r['n_nodes']) for r in path_rows)))

htm_nat_rounds = []
htm_seed_rounds = []
hgtm_nat_rounds = []
hgtm_seed_avg_rounds = []

for n in n_vals:
    # HtM natural
    r_hn = [r for r in path_rows if int(r['n_nodes']) == n and r['algorithm'] == 'hash_to_min' and r['order_mode'] == 'natural']
    htm_nat_rounds.append(int(r_hn[0]['rounds']) if r_hn and r_hn[0]['rounds'] != 'DNF' else None)

    # HtM seeded
    r_hs = [r for r in path_rows if int(r['n_nodes']) == n and r['algorithm'] == 'hash_to_min' and r['order_mode'] == 'seeded']
    htm_seed_rounds.append(int(r_hs[0]['rounds']) if r_hs and r_hs[0]['rounds'] != 'DNF' else None)

    # HGtM natural
    r_gn = [r for r in path_rows if int(r['n_nodes']) == n and r['algorithm'] == 'hash_greater_to_min' and r['order_mode'] == 'natural']
    hgtm_nat_rounds.append(int(r_gn[0]['rounds']) if r_gn and r_gn[0]['rounds'] != 'DNF' else None)

    # HGtM seeded (average over 5 seeds)
    r_gs = [r for r in path_rows if int(r['n_nodes']) == n and r['algorithm'] == 'hash_greater_to_min' and r['order_mode'] == 'seeded' and r['rounds'] != 'DNF']
    if r_gs:
        avg_r = sum(int(x['rounds']) for x in r_gs) / len(r_gs)
        hgtm_seed_avg_rounds.append(avg_r)
    else:
        hgtm_seed_avg_rounds.append(None)

plt.figure(figsize=(9, 6), dpi=150)
x_curve = np.linspace(min(n_vals), max(n_vals), 200)
log2_curve = np.log2(x_curve)
three_log2_curve = 3 * np.log2(x_curve)

plt.plot(x_curve, log2_curve, 'k--', label=r'$\log_2(n)$ (reference bound)')
plt.plot(x_curve, three_log2_curve, 'k:', label=r'$3\log_2(n)$ (HGtM worst-case bound)')

plt.plot(n_vals, htm_nat_rounds, 'o-', color='#1f77b4', label='Hash-to-Min (natural order)')
plt.plot(n_vals, htm_seed_rounds, 's--', color='#aec7e8', label='Hash-to-Min (seeded order)')
plt.plot(n_vals, hgtm_nat_rounds, '^-', color='#d62728', label='Hash-Greater-to-Min (natural order)')
if any(x is not None for x in hgtm_seed_avg_rounds):
    plt.plot(n_vals[:len(hgtm_seed_avg_rounds)], [x for x in hgtm_seed_avg_rounds if x is not None], 'd-.', color='#ff9896', label='Hash-Greater-to-Min (seeded avg)')

plt.xscale('log', base=2)
plt.xlabel('Number of Nodes $n$ in Path Graph $P_n$ (log scale)')
plt.ylabel('Rounds to Convergence')
plt.title('Path Graph Convergence: Rounds vs. $n$')
plt.grid(True, which="both", ls="--", alpha=0.5)
plt.legend(loc='upper left', framealpha=0.9)
plt.tight_layout()
plt.savefig('results/rounds_vs_n_path.png')
plt.close()
print('Generated results/rounds_vs_n_path.png')

# ─── Plot 2: Shuffle Bytes per Round across Graph Families ───────────────────

families = ['path', 'sparse', 'power_law', 'fraud']
family_titles = {'path': 'Path Graph (n=1024)', 'sparse': 'Sparse Erdős–Rényi (n=1024)', 'power_law': 'Power-Law (n=1024)', 'fraud': 'Fraud Graph (2000 tx)'}

fig, axes = plt.subplots(2, 2, figsize=(14, 10), dpi=150)
axes = axes.flatten()

for idx, fam in enumerate(families):
    ax = axes[idx]
    # Filter representative runs
    if fam == 'path':
        target_label = 'path_1024'
    elif fam == 'sparse':
        target_label = 'sparse_1024'
    elif fam == 'power_law':
        target_label = 'power_1024'
    elif fam == 'fraud':
        target_label = 'fraud_2000'

    # Get round metrics for HtM (natural & seeded) and HGtM (natural & seeded:42)
    runs_to_plot = [
        (f'htm_{target_label}_natural', 'HtM natural', '#1f77b4', '-'),
        (f'htm_{target_label}_seeded', 'HtM seeded', '#aec7e8', '--'),
        (f'hgtm_{target_label}_natural', 'HGtM natural', '#d62728', '-'),
        (f'hgtm_{target_label}_seeded_42', 'HGtM seeded:42', '#ff9896', '--')
    ]

    for run_id, label, col, ls in runs_to_plot:
        recs = [m for m in jsonl_records if m['run_id'] == run_id]
        if recs:
            rounds = [m['round'] for m in recs]
            sbytes = [m['shuffle_bytes'] / 1024.0 for m in recs] # KB
            ax.plot(rounds, sbytes, marker='o', markersize=3, label=label, color=col, linestyle=ls)

    ax.set_title(family_titles[fam], fontweight='bold')
    ax.set_xlabel('Round')
    ax.set_ylabel('Shuffle Volume (KB)')
    ax.grid(True, ls='--', alpha=0.5)
    ax.legend(fontsize=8)

plt.suptitle('Intermediate Shuffle Bytes per Round by Graph Family', fontsize=14, y=0.98)
plt.tight_layout(rect=[0, 0.03, 1, 0.95])
plt.savefig('results/shuffle_bytes_per_round.png')
plt.close()
print('Generated results/shuffle_bytes_per_round.png')

# ─── Plot 3: Total Shuffle Bytes & Total Rounds (Grouped Bars) ───────────────

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 6), dpi=150)

# Representative test case for each family
bench_cases = [
    ('Path (n=512)', 'path_512'),
    ('Sparse ER (n=1024)', 'sparse_1024'),
    ('Power-Law (n=1024)', 'power_1024'),
    ('Fraud (2000 tx)', 'fraud_2000')
]

x = np.arange(len(bench_cases))
width = 0.35

htm_totals_bytes = []
hgtm_totals_bytes = []
htm_totals_rounds = []
hgtm_totals_rounds = []

for name, lbl in bench_cases:
    # HtM seeded
    r_h = [r for r in csv_rows if r['graph_label'] == lbl and r['algorithm'] == 'hash_to_min' and r['order_mode'] == 'seeded']
    b_h = float(r_h[0]['total_shuffle_bytes']) / 1024.0 if r_h else 0
    rnd_h = int(r_h[0]['rounds']) if r_h else 0
    htm_totals_bytes.append(b_h)
    htm_totals_rounds.append(rnd_h)

    # HGtM seeded avg
    r_g = [r for r in csv_rows if r['graph_label'] == lbl and r['algorithm'] == 'hash_greater_to_min' and r['order_mode'] == 'seeded' and r['total_shuffle_bytes'] != 'N/A']
    if r_g:
        b_g = sum(float(x['total_shuffle_bytes']) for x in r_g) / (len(r_g) * 1024.0)
        rnd_g = sum(int(x['rounds']) for x in r_g) / len(r_g)
    else:
        b_g = 0
        rnd_g = 0
    hgtm_totals_bytes.append(b_g)
    hgtm_totals_rounds.append(rnd_g)

# Left: Total Shuffle (KB)
ax1.bar(x - width/2, htm_totals_bytes, width, label='Hash-to-Min', color='#1f77b4')
ax1.bar(x + width/2, hgtm_totals_bytes, width, label='Hash-Greater-to-Min', color='#d62728')
ax1.set_ylabel('Total Shuffle Bytes (KB)')
ax1.set_title('Total Shuffle Communication per Family (Seeded Order)')
ax1.set_xticks(x)
ax1.set_xticklabels([b[0] for b in bench_cases], rotation=15)
ax1.legend()
ax1.grid(True, axis='y', ls='--', alpha=0.5)

# Right: Total Rounds
ax2.bar(x - width/2, htm_totals_rounds, width, label='Hash-to-Min', color='#1f77b4')
ax2.bar(x + width/2, hgtm_totals_rounds, width, label='Hash-Greater-to-Min', color='#d62728')
ax2.set_ylabel('Total Rounds to Convergence')
ax2.set_title('Total Convergence Rounds per Family (Seeded Order)')
ax2.set_xticks(x)
ax2.set_xticklabels([b[0] for b in bench_cases], rotation=15)
ax2.legend()
ax2.grid(True, axis='y', ls='--', alpha=0.5)

plt.tight_layout()
plt.savefig('results/total_shuffle_and_rounds.png')
plt.close()
print('Generated results/total_shuffle_and_rounds.png')

# ─── Plot 4: Peak Values at Single Reducer (Skew Pressure) ────────────────────

plt.figure(figsize=(10, 6), dpi=150)

# Compare peak reducer across various graphs
test_graphs = [
    ('Path (n=256)', 'path_256'),
    ('Path (n=1024)', 'path_1024'),
    ('Sparse (n=1024)', 'sparse_1024'),
    ('Power-Law (n=1024)', 'power_1024'),
    ('Fraud (1000 tx)', 'fraud_1000'),
    ('Fraud (2000 tx)', 'fraud_2000')
]

labels = [g[0] for g in test_graphs]
x = np.arange(len(labels))
width = 0.22

# 1. HtM natural (skew stress)
htm_nat_peaks = []
# 2. HtM seeded
htm_seed_peaks = []
# 3. HGtM natural
hgtm_nat_peaks = []
# 4. HGtM seeded
hgtm_seed_peaks = []

for _, lbl in test_graphs:
    # HtM nat
    r = [x for x in csv_rows if x['graph_label'] == lbl and x['algorithm'] == 'hash_to_min' and x['order_mode'] == 'natural']
    htm_nat_peaks.append(int(r[0]['peak_reducer_values']) if r and r[0]['peak_reducer_values'] != 'N/A' else 0)

    # HtM seed
    r = [x for x in csv_rows if x['graph_label'] == lbl and x['algorithm'] == 'hash_to_min' and x['order_mode'] == 'seeded']
    htm_seed_peaks.append(int(r[0]['peak_reducer_values']) if r and r[0]['peak_reducer_values'] != 'N/A' else 0)

    # HGtM nat
    r = [x for x in csv_rows if x['graph_label'] == lbl and x['algorithm'] == 'hash_greater_to_min' and x['order_mode'] == 'natural']
    hgtm_nat_peaks.append(int(r[0]['peak_reducer_values']) if r and r[0]['peak_reducer_values'] != 'N/A' else 0)

    # HGtM seed
    r = [x for x in csv_rows if x['graph_label'] == lbl and x['algorithm'] == 'hash_greater_to_min' and x['order_mode'] == 'seeded' and x['peak_reducer_values'] != 'N/A']
    hgtm_seed_peaks.append(int(r[0]['peak_reducer_values']) if r else 0)

plt.bar(x - 1.5*width, htm_nat_peaks, width, label='HtM (natural)', color='#1f77b4')
plt.bar(x - 0.5*width, htm_seed_peaks, width, label='HtM (seeded)', color='#aec7e8')
plt.bar(x + 0.5*width, hgtm_nat_peaks, width, label='HGtM (natural)', color='#d62728')
plt.bar(x + 1.5*width, hgtm_seed_peaks, width, label='HGtM (seeded:1)', color='#ff9896')

plt.yscale('log')
plt.ylabel('Peak Values at a Single Reducer (log scale)')
plt.title('Reducer Skew Pressure: Maximum Elements Assigned to a Single Key')
plt.xticks(x, labels, rotation=20, ha='right')
plt.legend()
plt.grid(True, axis='y', ls='--', alpha=0.5)
plt.tight_layout()
plt.savefig('results/peak_reducer_values.png')
plt.close()
print('Generated results/peak_reducer_values.png')
