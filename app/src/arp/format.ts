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
  source: string
}

/** Starting points, each a complete algorithm in the format. The first two follow the papers. */
export const PRESETS: Preset[] = [
  { id: 'greedy-nn', label: 'Greedy nearest neighbour (paper)', source: `"""ARP-ALGORITHM 1
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
  { id: 'greedy-cost', label: 'Greedy cheapest transfer', source: `"""ARP-ALGORITHM 1
name: Greedy cheapest transfer
description: At each step ask the black box for the transfer to every unvisited asteroid and take the cheapest.
"""


def solve(problem, tools):
    here, eta = 0, 0.0
    unvisited = list(range(1, problem.n + 1))
    order = []
    while unvisited:
        options = [(tools.transfer(here, a, eta), a) for a in unvisited]
        (tau, t, z), nxt = min(options, key=lambda option: option[0].z)
        eta += tau + t
        unvisited.remove(nxt)
        order.append(nxt)
        here = nxt
        tools.report(order, "cheapest cost %.2f" % z)
    return order
` },
  { id: 'random', label: 'Random search (paper baseline)', source: `"""ARP-ALGORITHM 1
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
  { id: 'local', label: 'Greedy + swap local search', source: `"""ARP-ALGORITHM 1
name: Greedy start, then swap local search
description: Start from the nearest-neighbour route and keep any swap of two asteroids that lowers the cost.
"""


def nearest_neighbour(problem, tools):
    here, eta = 0, 0.0
    unvisited = list(range(1, problem.n + 1))
    order = []
    while unvisited:
        nxt = min(unvisited, key=lambda a: tools.distance(here, a, eta))
        tau, t, z = tools.transfer(here, nxt, eta)
        eta += tau + t
        unvisited.remove(nxt)
        order.append(nxt)
        here = nxt
    return order


def solve(problem, tools):
    order = nearest_neighbour(problem, tools)
    best = tools.evaluate(order).cost
    improved = True
    while improved:
        improved = False
        for i in range(problem.n - 1):
            for j in range(i + 1, problem.n):
                if tools.evaluations >= tools.budget:
                    return order
                candidate = order[:]
                candidate[i], candidate[j] = candidate[j], candidate[i]
                cost = tools.evaluate(candidate).cost
                if cost < best:
                    order, best, improved = candidate, cost, True
    return order
` },
  { id: 'exhaustive', label: 'Exhaustive (small instances)', source: `"""ARP-ALGORITHM 1
name: Exhaustive search
description: Evaluate every order. Exact for the inner optimizer in use, and only practical up to about six asteroids (720 orders).
"""
from itertools import permutations


def solve(problem, tools):
    best, best_cost = None, float("inf")
    for order in permutations(range(1, problem.n + 1)):
        if tools.evaluations >= tools.budget:
            tools.log("budget used before every order was tried")
            break
        cost = tools.evaluate(list(order)).cost
        if cost < best_cost:
            best, best_cost = list(order), cost
    return best
` },
]

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
