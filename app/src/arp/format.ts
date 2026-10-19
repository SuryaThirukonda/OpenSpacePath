/**
 * The standard format for a routing algorithm, version 1: one Python file with a header
 * docstring and a solve(problem, tools) function. The page checks the shape before a run and
 * the runner (public/arp-worker.js) checks it again and enforces the contract of the return
 * value. research/06_routing_algorithm_format.md is the same specification with its rationale.
 */

export const FORMAT_NAME = 'ARP-ALGORITHM'
export const FORMAT_VERSION = 1

export interface AlgorithmHeader {
  ok: boolean
  name: string
  /** every "key: value" line of the header, keys in lower case */
  fields: Record<string, string>
  errors: string[]
}

const DOCSTRING = /^\uFEFF?(?:[ \t]*(?:#[^\n]*)?\n)*[ \t]*(?:[rRuU]{0,2})("""|''')([\s\S]*?)\1/
const SOLVE = /^def[ \t]+solve[ \t]*\([ \t]*problem[ \t]*,[ \t]*tools[ \t]*\)[ \t]*(?:->[^:\n]+)?:/m

/** Check a source against the format and read its header. Says exactly what is missing. */
export function parseAlgorithm(source: string): AlgorithmHeader {
  const errors: string[] = []
  const fields: Record<string, string> = {}
  const doc = DOCSTRING.exec(source)
  if (!doc) {
    errors.push(`the file must start with a docstring whose first line is "${FORMAT_NAME} ${FORMAT_VERSION}"`)
  } else {
    const lines = doc[2].split('\n').map((l) => l.trim())
    const first = lines.find((l) => l.length > 0) ?? ''
    const marker = new RegExp(`^${FORMAT_NAME}\\s+(\\d+)$`).exec(first)
    if (!marker) errors.push(`the docstring's first line must be "${FORMAT_NAME} ${FORMAT_VERSION}", found "${first.slice(0, 40)}"`)
    else if (Number(marker[1]) !== FORMAT_VERSION) errors.push(`this is format version ${marker[1]}; the page runs version ${FORMAT_VERSION}`)
    for (const line of lines) {
      const kv = /^([A-Za-z][A-Za-z _-]*):\s*(.+)$/.exec(line)
      if (kv) fields[kv[1].trim().toLowerCase()] = kv[2].trim()
    }
    if (!fields.name) errors.push('the header needs a "name:" line')
  }
  if (!SOLVE.test(source)) errors.push('the file must define "def solve(problem, tools):" at the top level')
  return { ok: errors.length === 0, name: fields.name ?? 'Unnamed algorithm', fields, errors }
}

export interface Preset {
  id: string
  label: string
  /** which paper the algorithm comes from */
  paper: 1 | 2
  source: string
}

export const PAPERS: Record<1 | 2, string> = {
  1: 'López-Ibáñez, Chicano and Gil-Merino (2022)',
  2: 'Rudich, López-Ibáñez, Römer, Cappart and Rousseau (2024)',
}

/** The algorithms of the two papers, two from each, each a complete file in the format and a starting point for your own. */
export const PRESETS: Preset[] = [
  { id: 'greedy-nn', label: 'Greedy nearest neighbour (paper 1, Algorithm 1)', paper: 1, source: `"""ARP-ALGORITHM 1
name: Greedy nearest neighbour
source: Lopez-Ibanez, Chicano and Gil-Merino (2022), Algorithm 1
description: Always fly to the unvisited asteroid that is closest to the spacecraft when it is ready to leave.
"""


def solve(problem, tools):
    here = 0                 # body 0 is Earth; the asteroids are 1..n
    eta = 0.0                # days since the mission start
    unvisited = list(range(1, problem.n + 1))
    order = []
    while unvisited:
        # Euclidean distance between the two orbits' positions at the epoch eta
        nxt = min(unvisited, key=lambda a: tools.distance(here, a, eta))
        tau, t, z = tools.transfer(here, nxt, eta)   # the black box B(a, a', eta)
        eta += tau + t
        unvisited.remove(nxt)
        order.append(nxt)
        here = nxt
        tools.report(order, "nearest was asteroid %d" % nxt)
    return order
` },
  { id: 'random', label: 'Random search (paper 1, baseline)', paper: 1, source: `"""ARP-ALGORITHM 1
name: Random search
source: the baseline of Lopez-Ibanez, Chicano and Gil-Merino (2022)
description: Evaluate random orders until the budget is used and keep the best.
"""


def solve(problem, tools):
    asteroids = list(range(1, problem.n + 1))
    best, best_cost = None, float("inf")
    while tools.evaluations < tools.budget:
        order = asteroids[:]
        tools.random.shuffle(order)          # seeded: the same seed repeats the run
        cost = tools.evaluate(order).cost    # f(pi), one evaluation of the budget
        if cost < best_cost:
            best, best_cost = order, cost
    return best
` },
  { id: 'restricted-dd', label: 'Restricted decision diagram (paper 2, Algorithm 3)', paper: 2, source: `"""ARP-ALGORITHM 1
name: Restricted decision diagram
source: Rudich, Lopez-Ibanez, Romer, Cappart and Rousseau (2024), Algorithm 3 with the phase-one bounds of section 3.3
description: Build the route layer by layer and keep only the WIDTH partial routes with the best bound; bounds come from the relaxed transfer B', exact costs from B, so at most WIDTH x n calls of B are made.
"""
WIDTH = 6   # omega_s of the paper: how many partial routes survive each layer


def relaxed_bounds(problem, tools):
    """Phase one of the paper (eq. 8): z_min(a, a') from the no-wait transfer B' with a wait window
    long enough for any route, a lower bound on the cost of a -> a' wherever it falls in a route."""
    n = problem.n
    window = n * (problem.tau_max + problem.t_max) - problem.t_max
    zmin = {}
    for a in range(0, n + 1):
        for b in range(1, n + 1):
            if a != b:
                zmin[(a, b)] = tools.relaxed_transfer(a, b, 0.0, window).z
    tools.log("relaxed bounds from %d transfers" % len(zmin))
    return zmin


def cost_to_go(zmin, last, remaining):
    """z_up of a node: the shortest path to the terminal in a width-one relaxed diagram, where every
    remaining asteroid is entered from its cheapest possible predecessor."""
    total = 0.0
    for r in remaining:
        total += min(zmin[(p, r)] for p in remaining | {last} if p != r)
    return total


def solve(problem, tools):
    n = problem.n
    zmin = relaxed_bounds(problem, tools)
    layer = [((), 0, 0.0, 0.0)]                  # (order, last body, earliest start, exact cost so far)
    for depth in range(n):
        candidates = []
        for order, last, est, z_down in layer:
            remaining = set(range(1, n + 1)) - set(order)
            for nxt in remaining:               # Algorithm 3, lines 11-14: bound every child, weight none yet
                bound = z_down + zmin[(last, nxt)] + cost_to_go(zmin, nxt, remaining - {nxt})
                candidates.append((bound, order, last, est, z_down, nxt))
        candidates.sort(key=lambda c: c[0])      # lines 17-20: keep the WIDTH best bounds
        layer = []
        for bound, order, last, est, z_down, nxt in candidates[:WIDTH]:
            tau, t, z = tools.transfer(last, nxt, est)   # lines 21-25: the exact arc, est of the child
            layer.append((order + (nxt,), nxt, est + tau + t, z_down + z))
        best = min(layer, key=lambda node: node[3])
        tools.report(list(best[0]), "layer %d of %d, best partial cost %.1f" % (depth + 1, n, best[3]))
    best = min(layer, key=lambda node: node[3])
    tools.evaluate(list(best[0]))                # the shortest path through the restricted diagram
    return list(best[0])
` },
  { id: 'peel-and-bound', label: 'Peel-and-Bound (paper 2, Algorithm 4)', paper: 2, source: `"""ARP-ALGORITHM 1
name: Peel-and-Bound
source: Rudich, Lopez-Ibanez, Romer, Cappart and Rousseau (2024), Algorithms 3 and 4 with the phase-one bounds of section 3.3
description: Exact search with the paper's bounds. The relaxed transfer B' weights every arc, a restricted diagram gives the first route, then exact nodes are peeled off one at a time and every partial route whose bound cannot beat the best route is dropped. Stops after budget x n transfers, proven optimal within the bounds if it finishes earlier.
"""
WIDTH = 6   # width of the restricted diagram that gives the first route


def relaxed_bounds(problem, tools):
    """Phase one of the paper (eq. 8): z_min(a, a') from the no-wait transfer B' with a wait window
    long enough for any route, a lower bound on the cost of a -> a' wherever it falls in a route."""
    n = problem.n
    window = n * (problem.tau_max + problem.t_max) - problem.t_max
    zmin = {}
    for a in range(0, n + 1):
        for b in range(1, n + 1):
            if a != b:
                zmin[(a, b)] = tools.relaxed_transfer(a, b, 0.0, window).z
    tools.log("relaxed bounds from %d transfers" % len(zmin))
    return zmin


def cost_to_go(zmin, last, remaining):
    """z_up of a node: the shortest path to the terminal in a width-one relaxed diagram, where every
    remaining asteroid is entered from its cheapest possible predecessor."""
    total = 0.0
    for r in remaining:
        total += min(zmin[(p, r)] for p in remaining | {last} if p != r)
    return total


def restricted(problem, tools, zmin):
    """Algorithm 3: the first route, the shortest path through a restricted diagram of width WIDTH."""
    n = problem.n
    layer = [((), 0, 0.0, 0.0)]
    for depth in range(n):
        candidates = []
        for order, last, est, z_down in layer:
            remaining = set(range(1, n + 1)) - set(order)
            for nxt in remaining:
                bound = z_down + zmin[(last, nxt)] + cost_to_go(zmin, nxt, remaining - {nxt})
                candidates.append((bound, order, last, est, z_down, nxt))
        candidates.sort(key=lambda c: c[0])
        layer = []
        for bound, order, last, est, z_down, nxt in candidates[:WIDTH]:
            tau, t, z = tools.transfer(last, nxt, est)
            layer.append((order + (nxt,), nxt, est + tau + t, z_down + z))
    best = min(layer, key=lambda node: node[3])
    return list(best[0]), best[3]


def solve(problem, tools):
    n = problem.n
    zmin = relaxed_bounds(problem, tools)
    best, best_cost = restricted(problem, tools, zmin)
    tools.evaluate(best)
    tools.log("first route, from the restricted diagram: %.2f" % best_cost)
    allowance = tools.budget * n
    start = tools.transfers
    # Algorithm 4 with the queue processed depth first: every node of the exact diagram is peeled in
    # turn; a child survives only if its exact cost so far plus the relaxed cost to go can beat the
    # best route, and the children with the best bounds are explored first
    stack = [((), 0, 0.0, 0.0)]
    proven = True
    while stack:
        if tools.transfers - start > allowance:
            tools.log("stopped after %d transfers; the best route is not proven optimal" % (tools.transfers - start))
            proven = False
            break
        order, last, est, z_down = stack.pop()
        remaining = set(range(1, n + 1)) - set(order)
        if not remaining:
            if z_down < best_cost:
                best, best_cost = list(order), z_down
                tools.evaluate(best)
            continue
        children = []
        for nxt in remaining:
            bound = z_down + zmin[(last, nxt)] + cost_to_go(zmin, nxt, remaining - {nxt})
            if bound < best_cost:
                children.append((bound, nxt))
        children.sort(reverse=True)              # the stack pops its last element: best bound on top
        for bound, nxt in children:
            tau, t, z = tools.transfer(last, nxt, est)
            if z_down + z + cost_to_go(zmin, nxt, remaining - {nxt}) < best_cost:
                stack.append((order + (nxt,), nxt, est + tau + t, z_down + z))
    if proven:
        tools.log("every other route was bounded away: %.2f is optimal within the relaxed bounds" % best_cost)
    return best
` },
]

/** The same list, under the name the panel uses when it groups the menu by paper. */
export const PAPER_PRESETS: Preset[] = PRESETS

/** The interface an algorithm is written against, as shown in the panel. */
export const FORMAT_REFERENCE = `An algorithm is one Python file in this shape.

    """ARP-ALGORITHM 1
    name: A short name
    description: One sentence on what it does.
    """

    def solve(problem, tools):
        ...
        return order

RULES
- The file starts with a docstring whose first line is "ARP-ALGORITHM 1" and that has a "name:" line. Other "key: value" lines (author, source, description) are kept with the run.
- It defines solve(problem, tools). Helper functions and imports are fine; numpy and scipy load if imported.
- solve returns the visiting order: a list with every asteroid index 1..n exactly once. Body 0 is Earth, where the route starts, and is not listed.
- It may instead return (order, times), with times a list of n (wait, transfer) pairs in days, to fix the times itself rather than use the inner optimizer.
- Returning None hands back the best complete route passed to tools.evaluate.

problem (read only)
- problem.n                      number of asteroids
- problem.earth, problem.asteroids, problem.bodies[k]   bodies with .index .name .a .e .i .raan .argp .M0 (km, rad)
- problem.mu, problem.epoch, problem.tau_max, problem.t_max, problem.time_weight, problem.seed
- problem.transfer                "threeburn" or "lambert2": how every transfer in this run is flown

tools
- tools.transfer(a, b, eta) -> (tau, t, z)
      The black box B(a, a', eta) of the papers. Leaving body a no earlier than day eta, the spacecraft waits tau days,
      flies for t days and matches body b. z = dv + time_weight * (tau + t). The next transfer can start at eta + tau + t.
- tools.relaxed_transfer(a, b, eta, tau_f=None) -> (tau, t, z)
      The relaxation B' of Rudich et al.: the wait is free. A lower bound, for pruning; never the cost of a route.
- tools.evaluate(order) -> Evaluation(cost, dv, time, legs, order)
      f(pi): the cost of visiting the asteroids in this order, complete or a prefix. Counts one evaluation of the budget,
      appears in the chart and the list, and the best complete route is drawn. legs holds a (tau, t, z) per transfer.
- tools.position(a, day) -> (x, y, z) in km;  tools.distance(a, b, day) -> km
- tools.report(order, note="")   draw a route (complete or partial) without evaluating it
- tools.log(...)                 write a line to the run log (print works too)
- tools.random                   a random.Random seeded with the run's seed; use it so a run can be repeated
- tools.budget, tools.evaluations, tools.transfers   the evaluation budget and the counts so far

Calling tools.evaluate past the budget ends the run and keeps the best route so far.
The transfer (two or three burns) and the Lambert solver chosen above are used for every transfer; the
times of a transfer are always chosen on the two-burn cost, as the papers define.`
