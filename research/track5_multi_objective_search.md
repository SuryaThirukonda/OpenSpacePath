# Track 5: Multi-Objective Search (the Professor's Own Field)

## 1. Orientation

This track exists to teach Surya to speak Professor Rathinam's own research language before he has to formulate Phase C (the multi-objective route/trajectory search layer of the project) in front of him. Rathinam is a co-author on essentially every load-bearing paper in this track: **EMOA\*** (the general multi-objective A* framework), **MO-D\* Lite / MOPBD\*** (incremental replanning), **MO-CBS** and **MOM\*** (multi-agent multi-objective search). This is not background reading in an adjacent field — it is the professor's own algorithmic lineage, and Phase C's core deliverable (an exact or near-exact Pareto-optimal search over a transfer network with vector edge costs such as $(\Delta v, \text{ToF})$) is a direct application of it.

Mapping to the project phases:
- **Phase 0/A** (orbital mechanics, TLE/SGP4/frames — Tracks 1–2): produces the physics that generates edge costs.
- **Phase B** (Lambert/porkchop transfer search — Track 4): produces the actual $(\Delta v, \text{ToF})$ numbers per transfer leg, which is exactly the vector edge-cost input this track's algorithms consume.
- **Phase C** (this track): takes a graph of transfer legs with vector costs and computes the Pareto-optimal set of routes — the object EMOA\*, BOA\*, and friends are built to solve exactly.

The central technical claim this track exists to substantiate, and that the whole document keeps returning to: **weighted-sum (scalarized) A\* provably cannot find every Pareto-optimal solution** — it structurally misses "unsupported" points in non-convex regions of the cost front — while EMOA\*-style exact dominance-based search can. This is the single most important thing to be able to say fluently and prove numerically in the Monday meeting.

---

## 2. Sources Actually Read

**T5.1 — EMOA\* (AIJ 2025 / SoCS 2022):**
- Ren, Hernández, Likhachev, Felner, Koenig, Salzman, Rathinam, Choset, "EMOA\*: A framework for search-based multi-objective path planning," *Artificial Intelligence* 339 (2025), Article 104260. DOI 10.1016/j.artint.2024.104260. Free author-hosted copy: `http://biorobotics.ri.cmu.edu/papers/paperUploads/1-s2.0-S0004370224001966-main.pdf` and `https://idm-lab.org/bib/abstracts/papers/aij25.pdf`. Full text read (19 pp), extracted to `notes/aij2025_emoa.txt`.
- Ren, Zhan, Rathinam, Likhachev, Choset, "Enhanced Multi-Objective A\* Using Balanced Binary Search Trees," SoCS 2022, arXiv:2202.08992. Full text read, extracted to `notes/socs2022_bbst.txt`.
- `http://idm-lab.org/bib/abstracts/Koen25a.html` — citation confirmation (the idm-lab.org PDF link itself 404'd; the CMU mirror worked).
- `public_emoa` GitHub repo README, local clone at `scratchpad/repos/public_emoa/README.md` — opened.

**T5.2 — BOA\* and the field's dominance-check lineage:**
- Hernández Ulloa, Yeoh, Baier, Zhang, Suazo, Koenig, "A Simple and Fast Bi-Objective Search Algorithm (BOA\*)," ICAPS 2020. `https://ojs.aaai.org/index.php/ICAPS/article/download/6655/6509/9884`. Full text read (9 pp).
- Hernández Ulloa et al., "Multi-objective Search via Lazy and Efficient Dominance Checks" (LTMOA\*/LazyLTMOA\*), IJCAI 2023, `https://www.ijcai.org/proceedings/2023/0850.pdf`. Full text read (8 pp).
- "Simple and efficient bi-objective search algorithms via fast dominance checks," *Artificial Intelligence* 314 (2023) 103807 — **could not open**, paywalled on ScienceDirect; content triangulated via the ICAPS 2020 version and the IJCAI 2023 paper's citations.
- EMOA\* SoCS 2022 (arXiv:2202.08992) — abstract only opened directly in this item; full detail obtained via IJCAI-23's description.

**T5.3 — MO-D\* Lite / MOPBD\*:**
- Ren, Rathinam, Likhachev, Choset, "Multi-Objective Path-Based D\* Lite" (MOPBD\*), IEEE RA-L 7(2):3318–3325 (2022) / ICRA 2022, arXiv:2108.00710. Full text read from both the arXiv PDF and the author mirror `https://wonderren.github.io/files/ren22_mopbd-RAL_ICRA22.pdf`.
- MOD\* lite (Oral & Polat, IEEE Trans. Cybernetics, 2015/2016) — **not independently opened**; described secondhand via MOPBD\*'s own Section IV-C summary.
- BOA\* (ICAPS 2020) — confirmed via WebSearch snippet only in this item (full text is T5.2's job).

**T5.4 — MO-CBS and MOM\*:**
- Ren, Rathinam, Choset, "Subdimensional Expansion for Multi-Objective Multi-Agent Path Finding" (MOM\*), IEEE RA-L 2021, arXiv:2102.01353. Full text read.
- Ren, Rathinam, Choset, "A Conflict-Based Search Framework for Multi-Objective Multi-Agent Path Finding" (MO-CBS), IEEE T-ASE 2022 (arXiv v5, the accepted T-ASE text, which supersedes the ICRA 2021 conference version), arXiv:2101.03805. Full text read.
- MO-CBS's earlier ICRA 2021 conference version — **not fetched separately**, superseded by the T-ASE text.

**T5.5 — 2025 field survey:**
- Salzman, Hernández Ulloa, Felner, Koenig, "Multi-Objective Search: Algorithms, Applications, and Emerging Directions," arXiv:2510.25504v1 (29 Oct 2025), also AAAI 2026, 40(48):40990–40999. Full PDF fetched and read in full (10 pp, extracted to `notes/mos_survey_text.txt`).
- Salzman, Felner, Hernández, Zhang, Chan, Koenig, "Heuristic-Search Approaches for the Multi-Objective Shortest-Path Problem: Progress and Research Opportunities," IJCAI 2023, pp. 6759–6768 — the deeper technical predecessor the 2025 survey explicitly defers to. **Not opened this session** — flagged follow-up.

**T5.6 — public_emoa repository (local clone, hands-on):**
- `scratchpad/repos/public_emoa` — README, CMakeLists.txt, `include/`, `source/`, `python/`, `data/`, `test/` all read in full (code-level, file:line citations below).
- GitHub API metadata for `rap-lab-org/public_emoa` — opened.
- SoCS 2022 EMOA\* paper (arXiv:2202.08992) re-read for the code↔paper mapping.

**T5.7 — Evolutionary contrast (pygmo/NSGA-II):**
- pygmo2 overview, `https://esa.github.io/pygmo2/overview.html` — opened.
- Wikipedia: Multi-objective optimization, and Wikipedia: Pareto efficiency — opened.
- NSF PAR mirror of the EMOA\*/BOA\* dominance-check line, `https://par.nsf.gov/servlets/purl/10461944` — opened (secondary mirror; primary SoCS PDF did not parse via WebFetch in that pass).
- `https://wonderren.github.io/files/ren22_emoa_socs.pdf` — attempted, **could not parse** (binary/compressed content via WebFetch in that session; a different reader item did successfully extract it via `pypdf`).
- pygmo2 hypervolume-utilities docs page — **404, not found**; hypervolume API details in this item are unverified/general knowledge, flagged accordingly below.
- "Finding Knees in Multi-Objective Optimization" (Branke, Deb, Dierolf, Osswald) — **not fetched**, WebSearch summary only.

---

## 3. Core Notes

### 3.1 The MO-SPP formalism (EMOA\* papers, T5.1)

**Problem.** Graph $G=(V,E,\vec c)$. Each edge carries a non-negative cost vector $\vec c(e)\in(\mathbb{R}^+)^M$ ($M$ = number of objectives; AIJ 2025 is careful to distinguish vector length $K$ from objective count $M$, though nearly every experiment sets $K=M$). A path's cost is $\vec g(\pi)=\sum$ edge costs.

**Dominance** (identical across the papers, but watch the sign convention): $\vec a$ dominates $\vec b$ iff $a_k\le b_k$ for all $k$, with strict inequality for at least one $k$. **Pitfall:** SoCS 2022 writes $\vec a\succeq\vec b$ for "$a$ dominates $b$"; AIJ 2025 switches to $\vec a\prec\vec b$ for the identical relation. Don't mix notations when citing the professor's own papers back to him.

A path is **Pareto-optimal** if nothing dominates it. **MO-SPP** asks for a **maximal cost-unique Pareto-optimal set**: one representative path per distinct non-dominated cost vector, not every path realizing that vector. This qualifier matters for Phase C — if the design needs "all physically distinct transfer trajectories sharing a $(\Delta v,\text{ToF})$," EMOA\* as specified does not hand that to you for free.

MO-SPP is **NP-hard** — the Pareto front cardinality can be exponential in $|V|$ (Serafini 1987; Hansen 1980; Ehrgott 2005). Even deciding whether a given path is in the front is NP-hard (Papadimitriou & Yannakakis 2000).

### 3.2 Algorithm structure: labels, frontiers, and the two check regimes (T5.1)

A **label** $l=(v,\vec g)$ is a vertex plus an accumulated cost vector — one specific non-dominated partial path, not just a vertex. $\vec f(l):=\vec g(l)+\vec h(v(l))$ using a **consistent, single-valued heuristic** $\vec h$ (the canonical choice: $M$ independent backward Dijkstra runs from the destination, one per objective — the **ideal-point heuristic**). OPEN is a priority queue ordered by lexicographic $\vec f$. Every vertex keeps a **frontier set** $\Theta(v)$ of non-dominated labels reaching it; $\Theta(v_d)$ is the returned solution.

**Search loop:** pop lex-min-$\vec f$ label; run dominance checks; if it survives, expand successors, running dominance checks on each new label too; push survivors to OPEN. Terminate when OPEN is empty.

**Two instantiations, differing in when checks happen:**
- **EMOA\*-Early** (≡ NAMOA\*/NAMOA\*dr): checks and updates the frontier eagerly at label generation, proactively removing now-dominated labels from OPEN.
- **EMOA\*-Late** (≡ BOA\*): defers checks until a label is popped for expansion ("lazy"). Simpler bookkeeping ($\Theta(u)=$ closed$(u)$ only, no open/closed split needed) but can carry dominated labels in OPEN longer.

Both are correct/complete instantiations of one framework (proved via Theorems 1–2 in AIJ 2025, resting on the fact that consistent heuristics + lexicographic OPEN ordering make the **first** cost component non-decreasing along any expansion chain at a vertex — see next section).

### 3.3 Dimensionality reduction: why the first component can be dropped

Because heuristics are consistent and OPEN is popped in lexicographic $\vec f$-order, the sequence of labels *extracted* has non-decreasing $f_1$, and the sequence *expanded at a fixed vertex* has non-decreasing $f_1$ and $g_1$ too (AIJ 2025 Lemma 1/2, Corollary 1). Consequence: **the first cost component can be dropped** (projection $\text{Trunc}:\mathbb{R}^K\to\mathbb{R}^{K-1}$) when comparing labels at the same vertex for dominance — this is the theoretical basis for *every* speedup technique in this track, from BOA\*'s $O(1)$ trick to EMOA\*'s BBST. In EMOA\*-Late this applies uniformly to closed$(v)$; in EMOA\*-Early it only holds cleanly on closed$(v)$, forcing an explicit open/closed split.

### 3.4 BOA\*: the bi-objective special case (T5.2)

**BOA\*** (Hernández Ulloa, Yeoh, Baier, Zhang, Suazo, Koenig, ICAPS 2020) is the $M=2$ special case where the dimensionality-reduced frontier collapses to a **single scalar**: `g2min(s)` = the minimum second-cost value among nodes with state $s$ already expanded. All dominance checks become $O(1)$ scalar comparisons — no set, no tree, nothing to search. Pseudocode (Algorithm 2 of ICAPS'20, faithfully reproduced):

```
sols <- {}
for each s in S: g2min(s) <- inf
Open <- {start node x, g=(0,0), f=h(start)}
while Open not empty:
    x <- pop node with lexicographically smallest f=(f1,f2)
    if g2(x) >= g2min(state(x)) or f2(x) >= g2min(goal):
        continue                       # lazy check #1
    g2min(state(x)) <- g2(x)
    if state(x) == goal: sols.add(x); continue
    for t in Successors(state(x)):
        y = generate successor node
        if g2(y) >= g2min(t) or f2(y) >= g2min(goal):
            continue                   # lazy check #2
        Open.add(y)
return sols
```

**Correctness** (Lemmas 1–7, Theorem 1 of ICAPS'20): consistency guarantees expanded nodes at a fixed state have strictly decreasing $f_2$ and non-decreasing $f_1$ over time, so `g2min(s)` is a valid, monotonically tightening dominance bound, and any lazily-pruned node is always weakly dominated by a node that will still be expanded — laziness never loses a Pareto-optimal, cost-unique solution.

**Numbers (ICAPS 2020, DIMACS road maps):**

| Map | states/edges | avg \|sols\| | NAMOA\*dr avg (s) | BOA\* avg (s) | speedup |
|---|---|---|---|---|---|
| NY | 264,346 / 730,100 | 199 | 0.65 | 0.32 | ~2.0× |
| BAY | 321,270 / 794,830 | 119 | 0.38 | 0.29 | 1.3× |
| COL | 435,666 / 1,042,400 | 427 | 2.16 | 0.79 | 2.7× |
| FL | 1,070,376 / 2,712,798 | 739 | 19.66 | 4.59 | 4.3× |

Speedup grows with Pareto-set size — direct empirical signature of "$O(1)$ beats $O(n)$." Also: the full chain NAMOA\* $\to$ NAMOA\*dr $\to$ BOA\* is roughly two orders of magnitude cumulative (ICAPS'20 Table 2: NAMOA\* 157.17s $\to$ sBOA\* 9.75s on NY, a ~16× jump from the naive-dominance-check version alone).

### 3.5 BBST (Balanced Binary Search Tree): generalizing to $M\ge 3$ (T5.1, T5.2, T5.6)

For $M\ge3$ the truncated frontier is genuinely multi-dimensional, so a single scalar (BOA\*'s trick) is not enough. **EMOA\*** (SoCS 2022) stores the truncated frontier as an **AVL tree**, keyed by lexicographic order.

- **Check** (Alg. 2/4): descend the tree comparing the query against node keys; if the node weakly dominates, done; if the query is lex-smaller, only the left subtree needs checking; otherwise (in general $M$) **both** children must be checked.
- **Filter/Update** (Alg. 3/5): traverses/deletes dominated nodes, then does a standard AVL insert.
- **Special case $M=3\to$ TOA\*** (Tri-Objective A\*): with a 2-D truncated vector, Theorem 1/3 proves the left subtree is always safely prunable when it can't dominate — genuine $O(\log|B|)$ worst-case Check.
- **$M=2\to$ BOA\*** is literally the degenerate case: the AVL tree collapses to a singleton node holding the scalar `g2min`.

**Definitive complexity table** (AIJ 2025 Table 2 = SoCS 2022 Table 1 — cross-verified against the primary PDF in the verification pass, confirmed word-for-word):

| | BOA\* ($M{=}2$) | TOA\*-Late-BBST ($M{=}3$) | EMOA\*-Late-BBST ($M\ge2$) |
|---|---|---|---|
| Check | Constant time | $O(\log|B|)$ | $O(|B|\cdot(M-1))$ |
| Update | Constant time | $O(|B|)$ | $O(|B|\cdot(M-1))$ |

The paper's own text states plainly: for general $M$ (i.e. $M\ge4$), the BBST's worst case equals the naive linear-scan baseline's — the win at general $M$ is **practical (fewer entries visited), not asymptotic**.

**The nuance most worth surfacing in the meeting.** AIJ 2025 introduces a *second*, newer instantiation not present in the SoCS 2022 paper: **EMOA\*-Late-BS** — a lexicographically **sorted array + binary search**, not a tree at all. Same worst-case complexity as BBST, but empirically the **fastest configuration in every single tested (map, $M$) combination** in AIJ 2025's own experiments, because it avoids AVL rotation overhead. Verified directly against the primary AIJ 2025 PDF, Table 3: on NY at $M=3$, TOA\*-Late-BS solved 100/100 with mean 17.30s, versus NAMOA\*dr-LL's 98/100 at mean 127.97s — a computed ratio of $127.97/17.30\approx7.40\times$. This margin held (Late-BS/EMOA\*-Late-BS had the lowest mean runtime) in all six tested map×objective-count combinations (NY/COL × $M{=}3,4,5$) checked in the verification pass. **If Phase C builds an EMOA\* prototype, a sorted array plus binary search is a better starting point than an actual AVL tree.** A second, independent line of evidence for the same conclusion: IJCAI 2023's LazyLTMOA\* (plain arrays, checks deferred to extraction only, no checks at generation at all) beat EMOA\*'s AVL-tree implementation by 7.9× at $M=4$ and 13.5× at $M=5$ on the same NY benchmark (Table 3.6 in that item's summary below).

### 3.6 The dominance-check bottleneck, quantified (T5.1, T5.2)

Every popped and every generated label triggers a check against the current frontier(s). This runs on potentially millions of expansions, and naive per-check cost is $O(|B|\cdot K)$. AIJ 2025's own experiments make the scale concrete: average Pareto-front (solution-set) sizes on the NY road network rise from **4,396 at $M=3$ to 17,719 at $M=4$ to 34,142 at $M=5$**; raw dominance-check counts reach the **billions** per run (Table 6). IJCAI 2023's Table 4 makes the "checks, not heap operations, are the bottleneck" claim numerically explicit: on a 4-objective NY instance, LazyLTMOA\* performed **fewer** dominance checks (20.2B vs LTMOA\*'s 40.7B) but **more** heap percolations (450.8M vs 174.7M) and still ran faster — the dominance-check count, not queue maintenance, tracks wall-clock time.

### 3.7 EMOA\*'s successors: LTMOA\* and LazyLTMOA\* (T5.2)

IJCAI 2023 (Hernández/Yeoh/Baier/Felner/Salzman/Zhang/Chan/Koenig) is "what comes after EMOA\*," and gives the field's own comparison table:

| Algorithm | #Obj | Checks at generation | Checks at extraction | Dim. reduction? | Avoids Gop? | Skips generation-time checks entirely? |
|---|---|---|---|---|---|---|
| BOA\* | 2 | `g2min` scalar | same | yes | yes | no |
| NAMOA\* | ≥2 | full Gcl+Gop scan | Gcl(goal) | no | no | no |
| NAMOA\*dr | ≥2 | truncated Gcl + full Gop | truncated Gcl(goal) | yes | no | no |
| EMOA\* | ≥2 | truncated Gcl (BBST) | same | yes | yes | no |
| LTMOA\* | ≥2 | truncated Gcl (array/list) | same | yes | yes | no |
| LazyLTMOA\* | ≥2 | *(none)* | truncated Gcl | yes | yes | **yes** |

On a 4-objective NY instance (avg $|sols|=17{,}719$, 40 instances): LazyLTMOA\*-A solved 40/40, mean 71.24s; NAMOA\*dr and C++ EMOA\* solved 38/40 with mean 560–710s (timeouts on 2 instances at 3600s). The escalating "lazier + simpler-array-beats-tree" pattern recurs across two independent papers (AIJ 2025's own -BS variant, and IJCAI 2023's LazyLTMOA\*) — this is not a one-off finding.

### 3.8 MOPBD\* — incremental multi-objective replanning ("MO-D\* Lite") (T5.3)

**Naming pitfall, worth getting right in front of the professor:** the RA-L 2022 paper this track calls "MO-D\* Lite" is actually titled **"Multi-Objective Path-Based D\* Lite" (MOPBD\*)** — Ren, Rathinam, Likhachev, Choset, IEEE RA-L 7(2):3318–3325 (2022), arXiv:2108.00710. This was independently verified against the arXiv page, the paper's own PDF text, and DBLP in the verification pass (confirmed). It is distinct from the earlier, different paper "MOD\* lite" by Oral & Polat (IEEE Trans. Cybernetics, cited as 2015 in MOPBD\*'s own bibliography, formally 46(1):245–257, 2016) — which MOPBD\* uses as **baseline 1** and beats by up to an order of magnitude. Confusing these two names would be an obvious, checkable error to make in front of a co-author of the paper.

**Lineage MOPBD\* fuses:** D\* Lite's incremental local-consistency machinery (Koenig & Likhachev 2005) with NAMOA\*'s path-based expansion (state = node + cost vector, not just node). The technical difficulty: D\* Lite's node-level "consistency" doesn't naturally generalize to path-based states, so MOPBD\* defines a **new notion**: state $s=(u,\vec g)$ is consistent iff $\vec g\in V(u)$ (V(u) = confirmed non-dominated vectors at $u$'s last expansion), inconsistent iff $\vec g\in G(u)\setminus V(u)$.

**Repair mechanism** (Algorithms 1–5): per node $u$, $V(u)$ persists across replanning events (D\*-Lite-style reuse); $G(u)=\text{ND}(\bigcup_{w\in\text{ngh}(u)} V(w)+c(u,w))$ is the one-step lookahead. On an edge-cost change, **ProcessEdge** finds every stored state whose parent-edge is exactly that edge, **Delete**s it and its descendant subtree, then recomputes $G$-sets only for nodes whose $V$-set actually changed, reinserting any newly-uncovered non-dominated vector as a fresh inconsistent state. **UpdateVset** handles both cost increases (obstacle appears) and decreases (obstacle removed) with the same machinery.

**Correctness (Theorem 1):** at ComputePath termination, $C=V(u_c)$ equals the true Pareto front $C^*$ for the current task — proved via an invariant that $V(u)$ always holds all non-dominated confirmed vectors.

**Numbers (Table I, M=2, MAPF grid benchmark):**

| Grid | Algorithm | avg #expansions | avg runtime (s) |
|---|---|---|---|
| 32×32 (a) | NAMOA\* (from scratch) | 1556.6 | 0.55 |
| 32×32 (a) | MOD\* (Oral & Polat, incremental, node-based) | 92.1 | 3.15 |
| 32×32 (a) | **MOPBD\*** | **19.7** | **0.17** |
| 65×81 (game map) | NAMOA\* | 5923.3 | 2.85 |
| 65×81 | MOD\* | 208.4 | 12.6 |
| 65×81 | **MOPBD\*** | **28.0** | **2.43** |

Headline: MOPBD\* beats MOD\* by up to an order of magnitude, and beats from-scratch NAMOA\* on every map in expansions and on all but the smallest (trivial 16×16, where ProcessEdge's own bookkeeping overhead exceeds the savings — an honest caveat to state, not oversell).

**Critical, explicit caveats — both stated by the authors themselves, not editorializing:**
1. **The advantage shrinks and can invert as objective count $M$ grows.** At $M=4$ on a maze map (Table II), plain from-scratch NAMOA\* beats MOPBD\*, because larger per-node Pareto sets make delete/recompute as expensive as a fresh search.
2. **MOPBD\*'s own stated worst case:** if an edge change invalidates a large fraction of the prior search tree, MOPBD\* is *less* efficient than from-scratch search — it pays deletion overhead on top of what is effectively a full re-search.

**Mapping to Phase C.** A time-expanded transfer graph — nodes = (body, epoch) pairs, edges = Lambert-arc legs with cost $(\Delta v, \text{ToF}, \ldots)$ — is structurally identical to MOPBD\*'s own running example (an obstacle appears, edges go to $\infty$, only the affected subtree is repaired). If a launch window closes or an ephemeris update shifts a leg's cost, ProcessEdge-style repair touches only states whose parent edge was that leg. This is a strong, directly citable "why incremental over from-scratch" talking point (Table I's up-to-79× expansion reduction on a comparable-scale grid), **with the explicit caveat that the advantage degrades at $M\ge4$** — relevant since Phase C may end up with 3+ objectives (Δv, ToF, risk/C3).

### 3.9 MO-CBS and MOM\* — multi-agent multi-objective search (T5.4)

**Shared MO-MAPF problem:** graph $G=(V,E)$, $N$ agents, vector edge costs, a global unit-tick clock, wait-in-place modeled as a **strictly positive**-cost self-loop (a zero-cost wait would break the finiteness proofs). Vertex conflict = two agents at the same node/time; edge conflict = two agents swapping an edge between $t$ and $t{+}1$. Goal: the maximal cost-unique Pareto-optimal set of conflict-free joint paths.

**MOM\*** (subdimensional expansion, generalizing single-objective M\*, Wagner & Choset 2015): agents run backward multi-objective search individually to get a **Pareto policy** — unlike single-objective M\*'s single-valued policy, this can map a vertex to several neighbors, each on some non-dominated path to goal. Agents *not* in the current collision set $I_C(s)$ only follow their Pareto policy (cheap); agents *in* $I_C(s)$ get full graph expansion (expensive, coupled). **BackProp**/**DomBackProp** retroactively re-expand ancestors when a new conflict is found deeper in the search. **Theorem 1:** complete, finds all cost-unique Pareto-optimal paths. **Theorem 2 (bounded suboptimality):** with heuristic inflation $w>1$, "inflated MOM\*" returns some solution within factor $w$ of every true Pareto-optimal cost componentwise — this bound is what buys practical scale: plain MOM\* collapses to 12% success at $N=8$ agents on a 32×32 room map; with $w=2.0$ it holds 100% through $N=8$ and still 16% at $N=20$.

**MO-CBS** (extends CBS, Sharon/Stern/Felner/Sturtevant): instead of CBS's single tree, MO-CBS builds a **search forest** of $R=|\Pi^1|\times\cdots\times|\Pi^N|$ roots (Cartesian product of each agent's individual Pareto-path count). On conflict, the low-level solver (BOA\* for $M=2$, or NAMOA\*dr for general $M$, run on a time-augmented graph $G^t=G\times\{0,\ldots,T\}$) must return the agent's **entire** Pareto-optimal path set consistent with new constraints, not one path — so branches fan out. A running set $C$ tracks confirmed front vectors; Filter/Update purge dominated members. **Tree-by-tree (MO-CBS-t)** avoids materializing all $R$ roots up front — den312d 65×81, $M=2$: median #roots explodes from 36 ($N=2$) to 136,080,000 ($N=10$, max 17.8 billion); MO-CBS-b exhausts 16GB RAM initializing at $N\ge6$ on this map, MO-CBS-t doesn't.

**Both papers state explicitly:** there is no leading algorithm across all instances — echoing the same finding in plain single-objective MAPF (Felner et al. 2017). **Scale reality check:** even with all these tricks, this is small-instance territory — tens to low hundreds of grid vertices, single-digit to ~20 agents, with success rates collapsing well before $N=20$ almost everywhere. Plain CBS solves ~21 agents on an 8×8 grid and hundreds on large maps; MO-CBS solves "obviously fewer" because the low-level solver returns a whole front (not one path), conflicts must be resolved across every combination of individual fronts, and — a genuine inversion — larger maps *help* single-objective CBS (fewer conflicts) but *hurt* MO-CBS (bigger individual fronts).

**Relevance to Phase C:** the single-agent multi-objective core (EMOA\*/BOA\*) the project would build is precisely the subroutine MOM\* and MO-CBS call — a clean single-agent implementation is directly reusable infrastructure for a future fleet-planning extension, not throwaway work. A construction-site risk-vs-time worked example in the MO-CBS paper is a direct template for a multi-spacecraft $\Delta v$-vs-time Pareto visualization.

### 3.10 The 2025 field survey — where the field stands, and the missing space-application niche (T5.5)

Salzman, Hernández Ulloa, Felner, Koenig (arXiv:2510.25504, AAAI 2026) is a short, high-level field map, not a deep technical tutorial — it explicitly defers complexity detail to Salzman et al. 2023 (IJCAI). Useful vocabulary and lineage confirmation:

- Names EMOA\* (AIJ 2025, 339:104260), MO-D\* Lite (RA-L 2022), MO-CBS (T-ASE 2022), and MOM\* (RA-L 2021) as **all Rathinam-co-authored** — worth citing explicitly in the proposal to show continuity with his research line, not generic field familiarity.
- Names **A\*pex** (Zhang, Salzman, Kumar, Felner, Ulloa, Koenig, ICAPS 2022) as the general-$M$ generalization of PP-A\* (Goldin & Salzman 2021, bi-objective only) with a formal **$\varepsilon$-approximate** Pareto-front guarantee — the practically relevant tool once exact search stops scaling.
- States plainly: "Most existing algorithms scale poorly when the number of objectives grows beyond two or three" — an open problem, not solved.
- Section 6 explicitly calls current MOS benchmarks fragmented, naming "transportation, robotics and chemistry" as target application-inspired benchmark domains for future standardization work.

**The gap, independently verified in the verification pass.** A full-text search of the actual PDF for "orbit," "spacecraft," "satellite," "delta-v," and "Lambert" returns **zero hits** — confirmed independently by two verification passes with slightly different methodology, both landing on the same conclusion. One important precision correction from verification: the string "space" itself appears 5 times and "trajectory" once, but every instance is generic CS terminology ("state space," "action space," "cost space," an autonomous-vehicle road trajectory) — **not** a reference to outer space or spaceflight. So the literal claim "zero mentions of the word space" is not quite right, but the substantive claim — **no discussion anywhere of orbital mechanics, spacecraft, or spaceflight as an application domain** — is fully confirmed. This is a genuinely useful, checkable talking point: a Phase C interplanetary multi-objective search is not competing with an existing space-application literature in this survey's own view of the field; it would fill a real, currently-unclaimed niche.

**Caveat also carried from the reader agent:** "LTMOA\*" does not appear anywhere in this survey's text or references — it is an IJCAI 2023 paper (Hernández/Yeoh/Baier/Felner/Salzman/Zhang/Chan/Koenig) that this particular field-map survey simply doesn't name, not evidence it's non-existent or unimportant.

### 3.11 public_emoa: the professor's own reference implementation, read at the code level (T5.6)

`rap-lab-org/public_emoa` (24 stars, 3 forks, last pushed 2023-12-02) is Ren's reference C++ implementation of EMOA\*, bundling BOA\*, TOA\*, and general EMOA\* in one codebase.

**License — a genuine go/no-go input for the build.** **Independently re-verified in the verification pass**, not just repeated from the README: there is no LICENSE/COPYING file on either the `master` or `main` branch name (checked directly, both return HTTP 404), and the live GitHub repo page shows no "License" entry in its sidebar. The only text governing use is an informal README paragraph: *"The code is distributed for academic and non-commercial use. THE SOFTWARE IS PROVIDED \"AS IS\"..."* — an AS-IS disclaimer, not an OSI-approved license. **Conclusion for the build: this must stay an optional/plugin dependency, never vendored into an MIT-licensed repo**, and any distribution beyond academic/non-commercial use needs explicit author permission.

**Input format** (`LoadSparseGraphDIMAC`, `source/graph_io.cpp:17-83`): each cost dimension is its own file (DIMACS-style `p sp <N> <E>` header, `a <u> <v> <cost>` arc lines), read in lockstep across $M$ files. Negative costs throw a runtime error — **non-negative costs are a hard requirement**, needed for the Dijkstra-based admissible heuristic.

**Code↔paper mapping (file:line citations):**
- `Frontier::Check`/`_check` (`source/search_emoa.cpp:367-379 (_check) and 393-401 (Check)`) implements paper Algorithm 2, including the lexicographic-pruning recursion.
- `Frontier::Update`/`Filter`/`_filter` (`:292-319, 402-416`) implements paper Algorithm 3.
- `Frontier::_p` (`:418-424`) is the dimensionality-reduction projection.
- `EMOA::Search` (`include/search_emoa.hpp:96-165`, `source/search_emoa.cpp:36-277 (class EMOA from constructor through _UpdateFrontier; the Search method itself is lines 68-160)`) is the label-correcting main loop, OPEN as a `std::set` ordered lexicographically by $\vec f$.
- `EpsDom` (`include/vec_type.hpp:116-132`) is the actual weak-dominance predicate every tree traversal ultimately calls.
- `GraphExpandCostDim`'s `add_deg_cost` branch (`:431-473`) computes exactly the paper's Experiment 3 "hazmat risk" third objective ($c_3(e)=2$ if avg-degree$\ge4$ else $1$) — concrete confirmation the repo and the paper are the same experimental pipeline.

**No true Python bindings.** `python/emoa_py_api.py` is a subprocess/file-round-trip wrapper, explicitly documented as grid-map-only ("For general usage, please use the CLI"). Not production-grade.

**Integration feasibility (static code reading only, not built or run — no compiler in this sandbox):**
- **WASM (Emscripten):** low risk — no Boost dependency (explicitly commented out in CMakeLists.txt), STL-only. Main work: an embind wrapper replacing file I/O with an in-memory graph API.
- **Python service:** moderate effort — needs real pybind11 bindings around `SparseGraph`/`EMOA::Search`, since the existing wrapper is grid-only.
- **TypeScript reimplementation:** feasible, ~600–1800 LOC (core `.cpp` is 1911 lines total). Recommended path: reuse a tested balanced-BST npm package for the `Frontier` structure and hand-port only the graph/search core (~600–1000 LOC), rather than hand-porting the AVL tree — the tree's rotation/rebalancing logic is the highest-risk, most error-prone part to reimplement, and correctness (finding *all* Pareto-optimal paths) is the entire point of using this over a heuristic.

**NYC road-network benchmark shape** (Experiment 3, EMOA\* paper, matching the code's `add_deg_cost`): 264,346 vertices, 733,846 edges, distance+time as native costs, a synthetic degree-derived third "risk" cost. Success rate over 50 instances: TOA\* 33/50 vs. baselines 16–17/50; front sizes over the 16 jointly-solved instances: mean 389, median 327, max 1061.

### 3.12 Evolutionary contrast: pygmo/NSGA-II and Pareto-front basics (T5.7)

**pygmo's multi-objective toolbox:** `nsga2` (Non-dominated Sorting GA II — fast non-dominated sorting + crowding distance), `moead`/`moead_gen` (MOEA/D, decomposition into scalarized subproblems solved cooperatively), `maco` (MHACO, hypervolume-guided ant colony), `nspso` (Non-dominated Sorting PSO).

**The core distinction to hold onto:** exact graph search (EMOA\*/BOA\*/NAMOA\*) guarantees a *complete, exact* Pareto front on a discrete graph. Population-based methods (NSGA-II etc.) give an *approximation* with **no completeness or optimality guarantee**, in exchange for working directly on continuous decision variables (e.g., a raw departure epoch and DSM timing) without pre-discretizing into a graph. Neither is "wrong" — they are the right tool for different decision-space shapes. Don't oversell this as "our method beats theirs" in the meeting; frame it as "which tool for which decision-space shape."

**Hypervolume indicator** — the standard metric for scoring an approximate front against ground truth: the volume of objective space dominated by the front, relative to a fixed reference point. Exact computation is #P-hard/exponential in objective count (best general algorithms roughly $O(N^{m/3}\text{polylog }N)$); practical algorithms are the WFG/HSO family (**this complexity figure is sourced from a WebSearch summary, not a primary paper — flagged "likely," not verified**). A **knee** solution is the point of maximum local trade-off curvature — the natural pick with no explicit preference (also WebSearch-summary sourced, "likely").

**Numeric non-convexity counterexample**, run independently in this item (script `notes/nonconvex_pareto_counterexample.py`, venv Python): points $A=(1,10)$, $B=(5,7)$, $C=(10,1)$ are mutually non-dominated — all Pareto-optimal. $B$ lies strictly above the chord $A$–$C$ (chord value at $x=5$ is $y=6.0$; $B$'s $y=7$). Sweeping weighted-sum weight $w_1$ over 2001 evenly spaced values in $[0,1]$: $A$ wins exactly 50.0% of weights, $C$ wins the other 50.0%, and **$B$ is never selected — 0 out of 2001**.

---

## 4. Answers to the Track Questions

### Q1. Why does weighted-sum A\* provably miss non-convex (unsupported) Pareto points?

**Proof sketch.** Weighted-sum scalarization solves $\arg\min_\pi \sum_i w_i\,c_i(\pi)$ for fixed non-negative weights. Geometrically, the level sets of $\sum w_i c_i$ are hyperplanes of normal vector $\vec w$; the minimizer is the point where such a hyperplane, swept in from the origin, first touches the feasible cost set. That first-contact point is always on the **lower convex hull (convex envelope)** of the achievable cost set — a "supported" Pareto point. As $\vec w$ ranges over the whole non-negative simplex, the union of all weighted-sum minimizers traces out *exactly* the convex-hull boundary. Any Pareto-optimal point that sits in a concave "pocket" of the true front (not on the hull boundary) can therefore **never** be the unique minimizer for any weight vector, however finely swept. Such points are called **unsupported** (standard term, Ehrgott 2005, cited by every EMOA\*-family paper in this track).

**Numeric counterexample** (independently reproduced by at least four separate reading passes across this track, always with the same result). Representative version: $A=(1,10)$, $B=(5,7)$, $C=(10,1)$ — all mutually non-dominated (Pareto-optimal). Sweeping $w_1\in[0,1]$ over ~2000 steps, the weighted-sum minimizer is always $A$ or $C$; **$B$ is selected 0 times**, though it is a genuine Pareto-optimal solution. This is exactly the failure mode EMOA\*-style exact dominance search avoids — it enumerates the Pareto front via componentwise dominance, not scalarized linear optimization, and recovers $B$ along with $A$ and $C$.

**Which real space-transfer solutions live in non-convex regions — corrected wording after verification.** The master project document names **ballistic (low-energy, weak-stability-boundary) lunar transfers** and **multi-revolution Lambert-arc branches** as living in non-convex pockets of the $(\Delta v,\text{ToF})$ front — a large ToF increase buying a Δv reduction that is not a continuous function of flight time, or a discrete jump in trajectory family as revolution count changes. **Every single reader in this track flagged this claim identically: it is domain reasoning carried from the master document, not an independently computed number.** No numeric Lambert-solver output confirming this was produced in any of the seven reading items or in the verification pass. **This is the single most important open item to close before Monday** — it needs a concrete Track 4 porkchop/Lambert Δv-vs-ToF grid to move from "likely" to "verified."

### Q2. What makes dominance checking the bottleneck, and what does BBST buy over naive lists and over BOA\*'s O(1) check?

Every popped and every generated label must be dominance-checked against the current frontier. Naive: $O(|B|\cdot K)$ per check, and $|B|$ (frontier size) can be exponential — confirmed at scale: AIJ 2025's own numbers show average NY front sizes growing from 4,396 ($M=3$) to 34,142 ($M=5$), with raw dominance-check counts in the billions. **This double compounding (more checks, each more expensive as the front grows) is the asymptotic driver of MO-SPP runtime**, and it is confirmed directly and independently in two papers (AIJ 2025 Table 6; IJCAI 2023 Table 4 shows check count, not heap-percolation count, tracks wall-clock time).

**Complexity ladder, verified against the primary AIJ 2025 / SoCS 2022 table:**

| | BOA\* ($M{=}2$) | TOA\*-Late-BBST ($M{=}3$) | EMOA\*-Late-BBST ($M\ge2$) |
|---|---|---|---|
| Check | $O(1)$ | $O(\log|B|)$ | $O(|B|(M{-}1))$ |
| Update | $O(1)$ | $O(|B|)$ | $O(|B|(M{-}1))$ |

BOA\*'s $O(1)$ works only because at $M=2$ the truncated frontier collapses to a single scalar. BBST generalizes this to arbitrary $M$ by organizing the frontier lexicographically, buying a genuine asymptotic win **only at $M=3$**; for $M\ge4$ the worst case equals the naive scan — the general-$M$ win is a constant-factor practical speedup from pruning, stated explicitly by the paper itself, not an asymptotic guarantee.

**Corrected, verified nuance for the meeting:** AIJ 2025's own experiments show its **newest** technique — sorted array + binary search (EMOA\*/TOA\*-Late-BS), not the SoCS 2022 paper's titular BBST — is the fastest configuration in every tested case, e.g. beating NAMOA\*dr-LL by a verified $\approx7.4\times$ mean runtime on NY at $M=3$ (17.30s vs. 127.97s). Independently, IJCAI 2023's LazyLTMOA\* (plain array, checks deferred entirely to extraction time) beats EMOA\*'s AVL tree by 7.9–13.5× at $M=4$–$5$. Two separate follow-up papers reach the same conclusion: **simpler, lazier, array-based beats BBST in practice**, even though BBST has the better name recognition from the professor's own SoCS 2022 title.

### Q3. What would a benchmark instance set from this domain look like, vs. EMOA\*/BOA\* road-network benchmarks?

**Community convention** (9th DIMACS Implementation Challenge, `http://www.diag.uniroma1.it/~challenge9/`), verified in detail in the verification pass with one important correction: DIMACS road networks are used **only by the single-agent EMOA\*/BOA\* line, not universally by MO-CBS/MOM\***. On the single-agent side: real sparse US road networks (NY: 264,346 v / 730,100–733,846 e depending on paper/preprocessing; COL: 435,666 v / 1,042,400 e), 2–5 objectives built from natural correlated pairs (distance, time) plus synthetic add-ons, an explicit correlation-control knob $\rho$, timeouts of 600s (SoCS 2022) or 3,600s (AIJ 2025), success rate reported alongside runtime because a meaningful fraction of instances time out even for the best method at $M=5$. Front sizes: hundreds (SoCS 2022's NY subset: mean 389/median 327/max 1061) rising to tens of thousands (AIJ 2025: avg 34,142 at $M=5$ on NY).

**Multi-agent benchmarks (MO-CBS/MOM\*) are a completely different, much smaller regime** — this was a genuine correction surfaced by verification: they use small MAPF grid maps (16×16 up to 65×81, Stern et al. 2019 benchmark suite), synthetic i.i.d. random edge costs, 2–20 agents, and a 300-second timeout, not DIMACS road networks and not 600/3600s timeouts. Don't conflate the two benchmark traditions when citing them to the professor.

**For a Phase-C space-transfer benchmark:** far fewer nodes (dozens to low-thousands of (body, time-window) pairs, not hundreds of thousands) but much higher branching factor per node-pair from multi-rev Lambert-arc fan-out. $M=2$ ($\Delta v$, ToF) as the natural first cut, mapping directly to BOA\*'s $O(1)$ special case; a third risk/robustness objective as the natural EMOA\*/TOA\* stress test. The genuinely novel parameter with no road-network analogue: **time-discretization resolution** — graph size explodes as resolution × node count, unlike a fixed, static road network. The field's own 2025 survey names transportation, robotics, and chemistry as target benchmark domains for standardization — **space/aerospace is conspicuously absent**, so a credible Phase-C benchmark would be filling a real, named gap, not competing in a crowded space.

---

## 5. Verification Ledger

Six load-bearing claims were run through independent multi-lens verification (a computational/primary-source check and a second, separately-sourced check). All six survived with either full confirmation or a precise, useful correction — no claim was outright refuted, but two needed real qualification that changes how they should be stated to the professor.

| # | Claim | Compute-lens verdict | Source-lens verdict | Corrected / final wording |
|---|---|---|---|---|
| 1 | public_emoa has no formal license; GitHub reports `license: null` | Confirmed (0.93) | *(lens agent failed to complete — see note)* | **Confirmed.** No LICENSE file exists on either `master` or `main` branch (checked directly, both 404). The live repo page shows no License sidebar entry. Direct API confirmation of the literal `license: null` field was rate-limited (403) in one pass, but is the necessary and expected consequence of no license file existing. **Bottom line unchanged: treat as an optional/plugin dependency only, never vendor into an MIT repo.** |
| 2 | BOA\* O(1) is M=2-specific; BBST gets O(log\|B\|) only at M=3; M≥4 equals naive scan | Confirmed (0.90) | Confirmed (0.95) | **Confirmed, verbatim against the primary SoCS 2022 Table 1 and its text**, which states explicitly: "both Alg. 2 and 3 run in O(\|B\|K) time in the worst case, which is the same as the aforementioned baseline approaches." One added precision: the O(log\|B\|) win at M=3 (TOA\*) applies to Check only — Update stays O(\|B\|) even at M=3. |
| 3 | The "MO-D\* Lite" paper is actually titled MOPBD\*, distinct from Oral & Polat's earlier "MOD\* lite" | Confirmed (0.95) | Confirmed (0.97) | **Confirmed**, independently re-verified against the arXiv page, the paper's own PDF text and bibliography, and DBLP as a third cross-check. Minor nuance: MOPBD\*'s own bibliography cites Oral & Polat as "2015" though DBLP lists the formal print issue as 2016 (46(1):245–257) — a pre-existing inconsistency in the professor's own paper's bibliography, not an error to correct in our notes. |
| 4 | AIJ 2025's fastest config is the newer sorted-array+binary-search variant (Late-BS), not the SoCS 2022 BBST, beating NAMOA\*dr-LL by ~7.4× on NY at M=3 | Confirmed (0.97) | Confirmed (0.97) | **Confirmed**, both passes independently re-extracted Table 3 from the actual AIJ 2025 PDF and computed $127.97/17.30=7.397\approx7.4\times$ themselves. Verified across all 6 tested map×M combinations, not just the headline one. **One sharp detail surfaced by the source-lens pass, worth having ready for the meeting:** the winning BS technique's dominance-check method is attributed in AIJ 2025's own reference list to Hernández Ulloa et al.'s IJCAI 2023 paper — a paper Rathinam did **not** co-author — while Rathinam's own SoCS 2022 contribution is specifically the BBST approach, which these same experiments show losing to it. |
| 5 | The 2025 field survey (arXiv:2510.25504) contains zero mentions of space/orbit/spacecraft/trajectory/satellite/delta-v/Lambert | Needs qualification (0.90) | Confirmed, with the same qualification (0.88) | **Corrected wording:** the survey (only v1 exists, no revision) has zero occurrences of "orbit," "spacecraft," "satellite," "delta-v," and "Lambert." However, "space" appears 5 times and "trajectory" once — all as generic CS terminology ("state space," "action space," "cost space," an autonomous-vehicle road trajectory), never in an astronomical sense. **The substantive claim — no discussion anywhere of orbital mechanics or spaceflight as an application domain — is fully confirmed**; the literal "zero mentions of the word space" framing is not quite accurate and should be phrased as above. |
| 6 | EMOA\*/BOA\*/MO-CBS/MOM\* benchmarks "universally" draw from DIMACS road networks (NY/COL), timeouts 600s or 3600s, fronts growing to tens of thousands at M=5 | Needs qualification (0.85) | Refuted as stated (0.90) | **Corrected: this is true only for the single-agent EMOA\*/TOA\* line (and by construction BOA\*, which is its M=2 special case), and specifically the AIJ 2025 journal table for the tens-of-thousands/3600s figures.** The earlier SoCS 2022 paper used only NY, only M=3, a 600s timeout, and front sizes in the hundreds (mean 389/median 327/max 1061) — not thousands. **MO-CBS and MOM\* do NOT use DIMACS road networks at all** — both use small MAPF grid maps (Stern et al. 2019 suite: empty/room/maze/random/den312d, 16×16 to 65×81) with a 300-second timeout and front sizes from single digits to low hundreds, three to four orders of magnitude below "tens of thousands." **Do not describe DIMACS road-network benchmarking as universal across this whole track's algorithm family when speaking to the professor — it is specific to the single-agent line.** |

*Note on row 1: one verification lens agent failed to return a result for the source-lens check; the compute-lens result alone was sufficiently strong (direct branch-name probing plus live-page inspection) to stand as the verified conclusion.*

---

## 6. Implications for the Build

1. **Prefer sorted-array + binary-search dominance checking over an actual AVL/BBST implementation for a Phase-C EMOA\* prototype.** This is the single most actionable, verified finding in this track: AIJ 2025's own experiments (not just one paper — independently confirmed by IJCAI 2023's LazyLTMOA\*) show the simpler array-based, lazier-checking design consistently wins wall-clock time over the BBST the professor's own SoCS 2022 paper is titled around. Build the array version first; only reach for a tree if profiling later shows a genuine need.

2. **Treat `public_emoa` as an optional dependency, never a vendored one.** No formal OSI license exists — verified directly, not just repeated from the README. If Phase C wraps it (CLI subprocess, or eventually WASM/pybind11), keep it pluggable and ask the authors before any redistribution beyond academic/non-commercial use. A from-scratch TypeScript reimplementation (~600–1800 LOC, reusing a tested balanced-BST npm package for the frontier structure rather than hand-porting the AVL tree) is a realistic, license-clean alternative and — per the point above — could plausibly be *faster*, not just license-safer, since the reference implementation itself is not maximally optimized (the authors flag `std::unordered_map` overhead themselves).

3. **Start with $M=2$ ($\Delta v$, ToF) mapped directly onto BOA\*'s $O(1)$ special case.** This is the cheapest possible correct exact-search baseline and matches the field's own convention (BOA\* is the specialization every EMOA\* paper anchors to). Only add a third objective (risk, plane-change cost, robustness) once the two-objective pipeline is validated — and expect the BBST/array machinery's advantage to shrink noticeably past $M=3$, matching both the EMOA\* papers' own complexity table and MOPBD\*'s own $M=4$ inversion finding.

4. **Design the transfer graph with an explicit time-discretization-resolution parameter from day one.** Every reading item independently flagged this as the axis with no analogue in the DIMACS road-network literature — graph size scales as resolution × node count, and this is the parameter most likely to make or break tractability, not raw body/window count.

5. **Build the weighted-sum-A\* vs. EMOA\* comparison as a first-class benchmark/test, not an afterthought.** The non-convex counterexample (Section 3.12 / Q1) is cheap to reproduce on toy data and directly demonstrates the exactness claim; it should become an automated regression test: given a small synthetic graph with a known non-convex Pareto front, assert that weighted-sum search misses at least one point that exact dominance search finds.

6. **If a fleet/multi-vehicle extension is ever built, the single-agent EMOA\*/BOA\* core is not throwaway work** — it is literally the low-level solver both MOM\* (via Pareto policies) and MO-CBS (via BOA\*-st/NAMOA\*dr-st on a time-augmented graph) call as a subroutine. Keep the single-agent search's API clean and swappable so a future MO-CBS-style layer can call into it directly.

7. **Pitfalls/tests to encode explicitly:**
   - Enforce non-negative edge costs in every dimension at graph-construction time (a hard EMOA\* requirement, confirmed by `public_emoa`'s own runtime-error check).
   - Wait-in-place / staying at a node between epochs (if the graph ever models multi-agent scheduling) must have strictly positive cost — a zero-cost self-loop breaks the finiteness proofs in MOM\*/MO-CBS.
   - Do not conflate "Pareto-optimal set" with "cost-unique Pareto-optimal set" in test oracles — EMOA\*-family algorithms return one representative path per distinct cost vector, not every path achieving it.
   - Keep DIMACS-style benchmark claims scoped correctly: don't cite the 3600s/tens-of-thousands-of-solutions numbers as if they apply to a multi-agent (MO-CBS/MOM\*) test — those use a 300s timeout and much smaller fronts.

---

## 7. Still Uncertain / To Read Next

1. **No numeric Lambert-solver/porkchop example exists yet confirming ballistic lunar transfers or multi-rev Lambert branches sit in a non-convex $(\Delta v,\text{ToF})$ pocket.** Every reading item and the verification pass flagged this identically as unverified domain reasoning carried from the master document. This is the top-priority gap — it needs a concrete Track 4 output before the non-convexity story can be told with real project numbers instead of a toy 3-point example.
2. The second, unidentified SoCS/ICAPS precursor to AIJ 2025 (beyond the SoCS 2022 BBST paper — the paper states "preliminary versions... appeared in [24] and [25]") that likely introduced EMOA\*-Late-BS was not located or read; the AIJ 2025 reference list itself would resolve this.
3. Salzman et al. 2023 (IJCAI), the deeper technical predecessor the 2025 field survey explicitly defers to, was not opened this session.
4. `public_emoa` was never compiled or run (no C++ compiler in this sandbox); WASM/pybind11/TypeScript feasibility assessments rest on static code reading only, not a working proof-of-concept.
5. "LTMOA\*"'s exact relationship to the professor's own EMOA\* line is unresolved — it appears in IJCAI 2023 (a different, overlapping-but-not-identical author group) but nowhere in the 2025 field survey.
6. No first-draft numeric estimate exists yet for actual Phase-C time-expanded transfer-graph sizes (nodes per body-pair, discretization resolution, resulting branching factor) — the benchmark-design answer in Section 4/Q3 is qualitative and comparative only.
7. The pygmo hypervolume-utilities API (class member names, exact usage) was never successfully fetched (404 on the guessed docs URL) — treat any specific pygmo.hypervolume method names as unverified if they come up.
8. MOD\* lite (Oral & Polat 2015/2016) and the ICRA 2021 conference version of MO-CBS were never read directly — both were characterized only secondhand via the papers that supersede/cite them.

---

## 8. Glossary of Credibility Vocabulary Encountered

- **Verified**: independently confirmed against a primary source (the actual paper PDF, the actual repo, or a directly executed script) in this reading pass or the subsequent verification pass.
- **Likely**: consistent with available secondary evidence (a citing paper, a WebSearch summary, a mirror) but not independently confirmed against the primary source itself.
- **Confirmed** (verification-ledger term): a verification lens re-checked the claim against primary sources and found it accurate as stated.
- **Needs qualification** (verification-ledger term): the claim is substantively true but stated too broadly or imprecisely — the ledger entry gives the corrected, narrower wording.
- **Refuted** (verification-ledger term): the claim as stated does not hold; the ledger gives what actually holds instead. (No claim in this track's ledger was fully refuted — the closest case, claim 6, was refuted specifically in its "universal" framing while its core numeric content for the single-agent line remained accurate.)
- **Flagged / gap**: explicitly not attempted or not resolved in the available reading — distinguished from "likely" because no evidence was gathered at all, positive or negative.
- **Primary source**: the paper, repository, or dataset itself (e.g., the AIJ 2025 PDF, the `public_emoa` git history) as opposed to a citation, mirror, or summary of it.
- **Secondary source / mirror**: a non-primary copy or description (e.g., the NSF PAR mirror standing in for a SoCS 2022 PDF that failed to parse) used when the primary source was inaccessible — always flagged as such when it is the sole basis for a claim.
