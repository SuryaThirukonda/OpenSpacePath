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
source: Rudich, Lopez-Ibanez, Romer, Cappart and Rousseau (2024): the two-phase relaxed diagram of section 3, the embedded restricted search of Algorithm 3, peeling (Algorithm 2), node splitting (Algorithm 1) and the Peel-and-Bound loop of Algorithm 4
description: Exact search on a relaxed decision diagram. Phase one weights every arc with the no-wait transfer B', phase two tightens the weights layer by layer with a heuristic route, then diagrams are taken from a queue: the last exact node on the shortest path is peeled into its own diagram, a restricted search of width SEARCH_WIDTH reads feasible routes from it, and a split along its shortest path strengthens it; a diagram is dropped once its shortest path cannot beat the best route. Stops after budget x n transfers, proven optimal within the bounds if the queue empties first.
"""
SEARCH_WIDTH = 6        # omega_s: width of each embedded restricted search (the paper runs 40 to 400)
MAX_LAYER_WIDTH = 64    # splits may grow a layer of the relaxed diagram to this many nodes (the paper: 256 to 2048)
PHASE_TWO_MAX_N = 16    # phase two costs n^3 relaxed transfers; above this many asteroids it is skipped


class Node:
    __slots__ = ("layer", "label", "inn", "out", "alld", "est", "zd", "zu", "exact", "prefix")

    def __init__(self, layer, label):
        self.layer, self.label = layer, label
        self.inn, self.out = [], []
        self.alld, self.est, self.zd, self.zu = frozenset(), 0.0, float("inf"), float("inf")
        self.exact, self.prefix = False, None


class Arc:
    __slots__ = ("u", "v", "w", "exact", "t")

    def __init__(self, u, v, w, exact=False, t=1.0):
        self.u, self.v, self.w, self.exact, self.t = u, v, w, exact, t
        u.out.append(self)
        v.inn.append(self)

    def drop(self):
        self.u.out.remove(self)
        self.v.inn.remove(self)


class Bounds:
    """Section 6.1.2: every value of B' is kept with the time window it was computed for. A window
    that contains another's is a valid bound for it, so after the diagram is built no bound is ever
    computed again; the tightest containing value is used."""

    def __init__(self, tools):
        self.tools, self.store = tools, {}

    def compute(self, a, b, eta, tau_f):
        tau_f = max(tau_f, 1e-6)
        tau, t, z = self.tools.relaxed_transfer(a, b, eta, tau_f)
        self.store.setdefault((a, b), []).append((eta, eta + tau_f, z, t))
        return z, t

    def lookup(self, a, b, eta, tau_f):
        best = None
        for e0, e1, z, t in self.store.get((a, b), ()):
            if e0 <= eta + 1e-9 and eta + tau_f <= e1 + 1e-9 and (best is None or z > best[0]):
                best = (z, t)
        if best is None:                      # the widest window of phase one always contains the arc's
            best = min(self.store[(a, b)], key=lambda r: r[0] - r[1])[2:]
        return best


class Diagram:
    """A relaxed decision diagram: one list of nodes per layer, root first, terminal last."""

    def __init__(self, layers):
        self.layers = layers

    @property
    def root(self):
        return self.layers[0][0]

    @property
    def terminal(self):
        return self.layers[-1][0]

    def propagate(self, zbar, time_weight):
        """Constraint propagation: shortest paths down and up, visited sets, earliest starts, and
        every arc or node that cannot lie on a route cheaper than zbar removed. Returns the bound."""
        changed = True
        while changed:
            changed = False
            self.forward()
            self.backward()
            for layer in self.layers[:-1]:
                for u in layer:
                    for a in list(u.out):
                        if (a.v.label in u.alld and a.v is not self.terminal) or u.zd + a.w + a.v.zu >= zbar - 1e-9:
                            a.drop()
                            changed = True
            for layer in self.layers[1:-1]:
                for m in list(layer):
                    if not m.inn or not m.out:
                        for a in list(m.inn) + list(m.out):
                            a.drop()
                        layer.remove(m)
                        changed = True
        return self.terminal.zd

    def forward(self):
        for k, layer in enumerate(self.layers):
            for v in layer:
                if k == 0:
                    continue
                v.zd, v.exact, v.prefix, v.est = float("inf"), False, None, float("inf")
                common = None
                for a in v.inn:
                    u = a.u
                    v.zd = min(v.zd, u.zd + a.w)
                    v.est = min(v.est, u.est + a.t)
                    common = set(u.alld) if common is None else common & u.alld
                v.alld = frozenset((common or set()) | {v.label})
                if len(v.inn) == 1 and v.inn[0].exact and v.inn[0].u.exact:
                    v.exact, v.prefix = True, v.inn[0].u.prefix + (v.label,)
                    v.est = v.inn[0].u.est + v.inn[0].t

    def backward(self):
        for layer in reversed(self.layers):
            for u in layer:
                u.zu = 0.0 if u is self.terminal else min([a.w + a.v.zu for a in u.out] or [float("inf")])

    def shortest_path(self):
        """Nodes of the shortest root-to-terminal path."""
        path, v = [self.terminal], self.terminal
        while v.inn:
            a = min(v.inn, key=lambda a: a.u.zd + a.w)
            v = a.u
            path.append(v)
        return path[::-1]

    def exactify(self, tools):
        """The paper's heuristic of section 3.3.1: an arc on the only path to a node is given its exact
        cost. Applied to the root's children, so the next peel can go one layer deeper."""
        r = self.root
        for a in r.out:
            if not a.exact and a.v is not self.terminal:
                tau, t, z = tools.transfer(r.label, a.v.label, r.est)
                a.w, a.exact, a.t = z, True, tau + t


def build(problem, tools, bounds, zbar):
    """Section 3: the initial relaxed diagram with n nodes a layer, weighted in two phases."""
    n, tw = problem.n, problem.time_weight
    root, terminal = Node(0, 0), Node(n + 1, -1)
    root.exact, root.prefix, root.zd = True, (), 0.0
    layers = [[root]] + [[Node(k, a) for a in range(1, n + 1)] for k in range(1, n + 1)] + [[terminal]]
    est1 = {}
    for v in layers[1]:                       # exact from Earth: eta can only be 0
        tau, t, z = tools.transfer(0, v.label, 0.0)
        Arc(root, v, z, True, tau + t)
        est1[v.label] = tau + t
    window = n * (problem.tau_max + problem.t_max) - problem.t_max
    zmin = {}
    for a in range(1, n + 1):                 # phase one, eq. 8: n^2 - n relaxed transfers
        for b in range(1, n + 1):
            if a != b:
                zmin[(a, b)] = bounds.compute(a, b, est1[a], window)
    for k in range(1, n):
        for u in layers[k]:
            for v in layers[k + 1]:
                if u.label != v.label:
                    z, t = zmin[(u.label, v.label)]
                    Arc(u, v, z, False, t)
    for u in layers[n]:
        Arc(u, terminal, 0.0, True, 0.0)
    D = Diagram(layers)
    tools.log("phase one: %d relaxed transfers, bound %.2f" % (len(zmin), D.propagate(zbar, tw)))
    if n <= PHASE_TWO_MAX_N:
        count = 0
        for k in range(1, n):                 # phase two, eq. 10, layer by layer
            for u in D.layers[k]:
                for a in list(u.out):
                    tau_f = (zbar - u.zd - a.v.zu) / tw
                    if tau_f <= 0:
                        a.drop()
                        continue
                    a.w, a.t = bounds.compute(u.label, a.v.label, u.est, tau_f)
                    count += 1
            D.forward()
        D.backward()
        tools.log("phase two: %d relaxed transfers, bound %.2f" % (count, D.propagate(zbar, tw)))
    else:
        tools.log("phase two skipped: it would take %d relaxed transfers" % (n ** 3 - 2 * n * n + n))
    return D


def nearest_neighbour(problem, tools):
    """The paper's first route: the closest unvisited asteroid by Euclidean distance at arrival."""
    order, day, here, cost = [], 0.0, 0, 0.0
    left = set(range(1, problem.n + 1))
    while left:
        nxt = min(left, key=lambda k: tools.distance(here, k, day))
        tau, t, z = tools.transfer(here, nxt, day)
        order.append(nxt)
        day, here, cost = day + tau + t, nxt, cost + z
        left.discard(nxt)
    return order, cost


def search(D, tools, width, best):
    """Algorithm 3: a restricted diagram of the given width read out of D from its root, each
    child chosen by z_down(u) + w(a) + z_up(v) in D; the chosen transfers are evaluated exactly.
    Returns (best order, best cost) over what it found and the diagram's known best."""
    r = D.root
    layer = [(r.prefix, r, r.est, r.zd)]
    best_order, best_cost = best
    while layer:
        candidates = []
        for prefix, u, est, zd in layer:
            for a in u.out:
                v = a.v
                if v is D.terminal:
                    if zd < best_cost:
                        best_order, best_cost = list(prefix), zd
                    continue
                if v.label in prefix:
                    continue
                candidates.append((zd + a.w + v.zu, prefix, u, est, zd, a))
        candidates.sort(key=lambda c: c[0])
        layer = []
        for bound, prefix, u, est, zd, a in candidates[:width]:
            if bound >= best_cost:
                continue
            tau, t, z = tools.transfer(u.label, a.v.label, est)
            if len(a.v.inn) == 1 and u.exact and not a.exact:      # the only path to a.v: its exact cost
                a.w, a.exact, a.t = z, True, tau + t
            layer.append((prefix + (a.v.label,), a.v, est + tau + t, zd + z))
    return best_order, best_cost


def peel(D, e):
    """Algorithm 2: the paths through the exact node e leave D and form a diagram of their own."""
    for a in list(e.inn):
        a.drop()
    base = e.layer - D.root.layer
    D.layers[base].remove(e)
    du_layers = [[e]]
    du = {id(e)}
    for L in range(base + 1, len(D.layers)):
        new = []
        for m in list(D.layers[L]):
            from_du = [a for a in m.inn if id(a.u) in du]
            if not from_du:
                continue
            m2 = Node(m.layer, m.label)
            for a in list(m.out):
                Arc(m2, a.v, a.w, a.exact, a.t)
            for a in from_du:
                m.inn.remove(a)
                a.v = m2
                m2.inn.append(a)
            new.append(m2)
            du.add(id(m2))
        du_layers.append(new)
    # the peeled diagram keeps the terminal; D's terminal arcs stay with D
    return Diagram(du_layers)


def split(D, zbar, time_weight):
    """Algorithm 1 along the shortest path: the first node with several in-arcs is split by whether
    the paths into it all visited the path's previous asteroid (h of eq. 5). True when a split was made."""
    path = D.shortest_path()
    for k in range(1, len(path) - 1):
        m, phi = path[k], path[k - 1].label
        if len(m.inn) < 2 or len(D.layers[m.layer - D.root.layer]) >= MAX_LAYER_WIDTH:
            continue
        moved = [a for a in m.inn if phi in a.u.alld]
        if not moved or len(moved) == len(m.inn):
            continue
        m2 = Node(m.layer, m.label)
        for a in list(m.out):
            Arc(m2, a.v, a.w, a.exact, a.t)
        for a in moved:
            m.inn.remove(a)
            a.v = m2
            m2.inn.append(a)
        D.layers[m.layer - D.root.layer].append(m2)
        D.propagate(zbar, time_weight)
        return True
    return False


def solve(problem, tools):
    n, tw = problem.n, problem.time_weight
    best, zbar = nearest_neighbour(problem, tools)
    tools.evaluate(best)
    tools.log("first route, nearest neighbour: %.2f" % zbar)
    bounds = Bounds(tools)
    M = build(problem, tools, bounds, zbar)
    allowance = tools.budget * n
    start = tools.transfers
    queue = [M]
    proven = True
    while queue:
        if tools.transfers - start > allowance:
            tools.log("stopped after %d transfers; the best route is not proven optimal" % (tools.transfers - start))
            proven = False
            break
        D = queue.pop()                       # the newest diagram first: depth first, a small queue
        if D.propagate(zbar, tw) >= zbar:
            continue
        path = D.shortest_path()
        exact = [v for v in path[:-1] if v.exact]
        e = exact[-1]
        if e is path[-2]:                     # the whole shortest path is exact: a route with a known cost
            order = list(e.prefix)
            if D.terminal.zd < zbar:
                best, zbar = order, D.terminal.zd
                tools.evaluate(best)
                tools.log("exact path: %.2f" % zbar)
            if D.propagate(zbar, tw) < zbar:  # that path is bounded away now; the rest of D may not be
                queue.append(D)
            continue
        if e is D.root:                       # nothing below the root is exact yet
            D.exactify(tools)
            D.propagate(zbar, tw)
            e = max((v for v in D.shortest_path()[:-1] if v.exact), key=lambda v: v.layer)
            if e is D.root:
                continue
        Du = peel(D, e)
        if D.propagate(zbar, tw) < zbar:
            queue.append(D)
        Du.propagate(zbar, tw)
        Du.exactify(tools)
        if Du.propagate(zbar, tw) >= zbar:
            continue
        order, cost = search(Du, tools, SEARCH_WIDTH, (best, zbar))
        if cost < zbar:
            best, zbar = order, cost
            tools.evaluate(best)
            tools.log("restricted search below %s: %.2f" % (list(e.prefix), zbar))
        if Du.propagate(zbar, tw) >= zbar:
            continue
        split(Du, zbar, tw)
        if Du.propagate(zbar, tw) < zbar:
            queue.append(Du)
    if proven:
        tools.log("every other route was bounded away: %.2f is optimal within the relaxed bounds" % zbar)
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
