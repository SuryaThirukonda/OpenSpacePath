/*
 * Orbit Lab routing runner. Executes an algorithm written in the standard format (Python, see
 * src/arp/format.ts) with Pyodide, off the main thread and in the visitor's own browser: the
 * server never runs anyone's code. The algorithm reaches the transfer black box through
 * synchronous requests to the planner, which a worker is allowed to make, so it can be written
 * as ordinary sequential Python.
 *
 * Messages in:  {type: 'boot'} | {type: 'run', source, job: {instance, solver, transfer, budget, seed}}
 * Messages out: ready | started | event | log | done {result} | failed {message}
 */
const PYODIDE_VERSION = '0.29.5'
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v' + PYODIDE_VERSION + '/full/'

const HARNESS = "\nimport ast, json, math, random, sys, traceback\nfrom collections import namedtuple\nfrom js import arp_emit, arp_request\n\nFORMAT_NAME, FORMAT_VERSION = \"ARP-ALGORITHM\", 1\nTransfer = namedtuple(\"Transfer\", \"tau t z\")\nEvaluation = namedtuple(\"Evaluation\", \"cost dv time legs order\")\n\n\nclass BudgetExceeded(Exception):\n    \"\"\"Raised by tools.evaluate once the evaluation budget is used; the runner keeps the best route so far.\"\"\"\n\n\nclass AlgorithmError(Exception):\n    \"\"\"The algorithm broke the format or asked for something that does not exist.\"\"\"\n\n\nclass Body:\n    __slots__ = (\"index\", \"id\", \"name\", \"a\", \"e\", \"i\", \"raan\", \"argp\", \"M0\")\n\n    def __init__(self, index, rec):\n        el = rec[\"elements\"]\n        self.index, self.id, self.name = index, rec[\"id\"], rec.get(\"name\") or rec[\"id\"]\n        self.a, self.e, self.i = el[\"a\"], el[\"e\"], el[\"i\"]\n        self.raan, self.argp, self.M0 = el[\"raan\"], el[\"argp\"], el[\"M0\"]\n\n    def __repr__(self):\n        return \"Body(%d, %r)\" % (self.index, self.name)\n\n\nclass Problem:\n    def __init__(self, job):\n        inst = job[\"instance\"]\n        self.name = inst.get(\"name\", \"\")\n        self.earth = Body(0, inst[\"earth\"])\n        self.asteroids = [Body(k + 1, a) for k, a in enumerate(inst[\"asteroids\"])]\n        self.bodies = [self.earth] + self.asteroids\n        self.n = len(self.asteroids)\n        self.mu, self.epoch = inst[\"mu\"], inst[\"epoch\"]\n        self.tau_max, self.t_max, self.time_weight = inst[\"tauMax\"], inst[\"tMax\"], inst[\"timeWeight\"]\n        self.seed = job[\"seed\"]\n        self.transfer = job.get(\"transfer\", \"threeburn\")   # how every transfer is flown: \"lambert2\" or \"threeburn\"\n\n\ndef _position(b, mu, day):\n    n = math.sqrt(mu / b.a ** 3)\n    M = (b.M0 + n * day * 86400.0) % (2 * math.pi)\n    E = M if b.e < 0.8 else math.pi\n    for _ in range(60):\n        d = (E - b.e * math.sin(E) - M) / (1 - b.e * math.cos(E))\n        E -= d\n        if abs(d) < 1e-13:\n            break\n    x, y = b.a * (math.cos(E) - b.e), b.a * math.sqrt(1 - b.e * b.e) * math.sin(E)\n    cw, sw, cO, sO, ci, si = math.cos(b.argp), math.sin(b.argp), math.cos(b.raan), math.sin(b.raan), math.cos(b.i), math.sin(b.i)\n    return ((cO * cw - sO * sw * ci) * x + (-cO * sw - sO * cw * ci) * y,\n            (sO * cw + cO * sw * ci) * x + (-sO * sw + cO * cw * ci) * y,\n            (sw * si) * x + (cw * si) * y)\n\n\nclass Tools:\n    def __init__(self, job, problem):\n        self._job, self._p = job, problem\n        self.budget = int(job[\"budget\"])\n        self.evaluations = 0\n        self.transfers = 0\n        self.random = random.Random(job[\"seed\"])\n        self._cache = {}\n        self._best = None\n        self._max_transfers = max(2000, 40 * self.budget * max(problem.n, 1))\n\n    # ---- helpers\n    def _body(self, a):\n        try:\n            k = int(a)\n        except Exception:\n            raise AlgorithmError(\"a body is a number: 0 for Earth, 1..%d for the asteroids; got %r\" % (self._p.n, a))\n        if not 0 <= k <= self._p.n:\n            raise AlgorithmError(\"body %r does not exist: 0 is Earth and the asteroids are 1..%d\" % (a, self._p.n))\n        return k\n\n    def _order(self, order, complete=False):\n        try:\n            out = [int(k) for k in order]\n        except Exception:\n            raise AlgorithmError(\"an order is a list of asteroid indices, got %r\" % (order,))\n        n = self._p.n\n        if any(k < 1 or k > n for k in out):\n            raise AlgorithmError(\"an order may only contain 1..%d (0 is Earth, where the route starts): %r\" % (n, out))\n        if len(set(out)) != len(out):\n            raise AlgorithmError(\"an order visits an asteroid twice: %r\" % (out,))\n        if complete and len(out) != n:\n            raise AlgorithmError(\"the returned order visits %d of the %d asteroids; a solution visits each exactly once\" % (len(out), n))\n        return out\n\n    def _post(self, path, payload):\n        payload[\"instance\"] = self._job[\"instance\"]\n        payload[\"solver\"] = self._job[\"solver\"]\n        payload[\"transfer\"] = self._job.get(\"transfer\", \"threeburn\")\n        raw = json.loads(arp_request(path, json.dumps(payload)))\n        if raw[\"status\"] != 200:\n            detail = None\n            try:\n                detail = json.loads(raw[\"body\"]).get(\"detail\")\n            except Exception:\n                pass\n            if raw[\"status\"] == 0:\n                raise AlgorithmError(\"the transfer service could not be reached\")\n            raise AlgorithmError(detail if isinstance(detail, str) else \"the transfer service answered HTTP %s\" % raw[\"status\"])\n        return json.loads(raw[\"body\"])\n\n    def _transfer(self, a, b, eta, relaxed, tau_f):\n        a, b, eta = self._body(a), self._body(b), float(eta)\n        if b == 0:\n            raise AlgorithmError(\"the route never returns to Earth: a transfer ends at an asteroid 1..%d\" % self._p.n)\n        if a == b:\n            raise AlgorithmError(\"a transfer needs two different bodies, got %d twice\" % a)\n        if eta < 0 or eta != eta:\n            raise AlgorithmError(\"eta is days after the mission start and cannot be %r\" % eta)\n        key = (a, b, round(eta, 6), relaxed, tau_f)\n        hit = self._cache.get(key)\n        if hit is None:\n            if self.transfers >= self._max_transfers:\n                raise AlgorithmError(\"more than %d transfers were requested; the run was stopped\" % self._max_transfers)\n            body = {\"origin\": a, \"target\": b, \"eta\": eta, \"relaxed\": relaxed}\n            if tau_f is not None:\n                body[\"tauF\"] = float(tau_f)\n            r = self._post(\"/api/arp/transfer\", body)\n            hit = Transfer(r[\"tau\"], r[\"t\"], r[\"z\"])\n            self._cache[key] = hit\n            self.transfers += 1\n            arp_emit(json.dumps({\"type\": \"transfer\", \"origin\": a, \"target\": b, \"eta\": eta, \"tau\": hit.tau, \"t\": hit.t, \"z\": hit.z, \"relaxed\": relaxed}))\n        return hit\n\n    # ---- the interface\n    def transfer(self, a, b, eta):\n        \"\"\"B(a, a', eta) -> (tau, t, z): wait tau days at a, fly t days to b; z is the cost.\"\"\"\n        return self._transfer(a, b, eta, False, None)\n\n    def relaxed_transfer(self, a, b, eta, tau_f=None):\n        \"\"\"B'(a, a', eta, tau_f): the same with the wait free. A lower bound, never a route's cost.\"\"\"\n        return self._transfer(a, b, eta, True, tau_f)\n\n    def evaluate(self, order):\n        \"\"\"f(pi): the cost of visiting the asteroids in this order. Uses one evaluation of the budget.\"\"\"\n        order = self._order(order)\n        if not order:\n            raise AlgorithmError(\"cannot evaluate an empty order\")\n        if self.evaluations >= self.budget:\n            raise BudgetExceeded()\n        r = self._post(\"/api/arp/evaluate\", {\"order\": order})\n        self.evaluations += 1\n        legs = [Transfer(l[\"tau\"], l[\"t\"], l[\"z\"]) for l in r[\"legs\"]]\n        times = [[l.tau, l.t] for l in legs]\n        complete = len(order) == self._p.n\n        improved = complete and (self._best is None or r[\"cost\"] < self._best[0])\n        if improved:\n            self._best = (r[\"cost\"], order, times)\n        arp_emit(json.dumps({\"type\": \"evaluation\", \"index\": self.evaluations, \"order\": order, \"cost\": r[\"cost\"], \"dv\": r[\"dv\"],\n                             \"time\": r[\"time\"], \"times\": times, \"complete\": complete, \"improved\": improved}))\n        return Evaluation(r[\"cost\"], r[\"dv\"], r[\"time\"], legs, order)\n\n    def position(self, a, day):\n        \"\"\"Heliocentric position of a body in km, `day` days after the mission start.\"\"\"\n        return _position(self._p.bodies[self._body(a)], self._p.mu, float(day))\n\n    def distance(self, a, b, day):\n        \"\"\"Distance in km between two bodies, `day` days after the mission start.\"\"\"\n        p, q = self.position(a, day), self.position(b, day)\n        return math.sqrt((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2)\n\n    def report(self, order, note=\"\"):\n        \"\"\"Draw a route, complete or partial, without evaluating it.\"\"\"\n        order = self._order(order)\n        if order:\n            arp_emit(json.dumps({\"type\": \"report\", \"order\": order, \"note\": str(note)[:200]}))\n\n    def log(self, *parts):\n        print(*parts)\n\n\ndef check_format(source):\n    try:\n        tree = ast.parse(source, \"<algorithm>\")\n    except SyntaxError as e:\n        raise AlgorithmError(\"syntax error on line %s: %s\" % (e.lineno, e.msg))\n    doc = ast.get_docstring(tree) or \"\"\n    lines = [l.strip() for l in doc.splitlines()]\n    first = next((l for l in lines if l), \"\")\n    parts = first.split()\n    if len(parts) != 2 or parts[0] != FORMAT_NAME or not parts[1].isdigit():\n        raise AlgorithmError('the file must start with a docstring whose first line is \"%s %d\"' % (FORMAT_NAME, FORMAT_VERSION))\n    if int(parts[1]) != FORMAT_VERSION:\n        raise AlgorithmError(\"this is format version %s; the page runs version %d\" % (parts[1], FORMAT_VERSION))\n    if not any(l.lower().startswith(\"name:\") and l[5:].strip() for l in lines):\n        raise AlgorithmError('the header needs a \"name:\" line')\n    fn = next((n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == \"solve\"), None)\n    if fn is None:\n        raise AlgorithmError('the file must define \"def solve(problem, tools):\" at the top level')\n    args = [a.arg for a in fn.args.args]\n    if args != [\"problem\", \"tools\"] or fn.args.vararg or fn.args.kwarg or fn.args.kwonlyargs:\n        raise AlgorithmError(\"solve must take exactly (problem, tools), found (%s)\" % \", \".join(args))\n\n\ndef user_traceback(source):\n    etype, e, tb = sys.exc_info()\n    lines = source.splitlines()\n    out = [\"%s: %s\" % (etype.__name__, e)]\n    for fr in traceback.extract_tb(tb):\n        if fr.filename == \"<algorithm>\":\n            text = lines[fr.lineno - 1].strip() if 0 < fr.lineno <= len(lines) else \"\"\n            out.append(\"  line %d, in %s:  %s\" % (fr.lineno, fr.name, text))\n    return \"\\n\".join(out)\n\n\ndef normalise(answer, problem, tools):\n    if answer is None:\n        if tools._best is None:\n            raise AlgorithmError(\"solve returned nothing and no complete route was evaluated, so there is no route to show\")\n        return tools._best[1], tools._best[2], \"solve returned None: the best evaluated route is shown\"\n    times = None\n    if isinstance(answer, tuple) and len(answer) == 2 and not isinstance(answer[0], (int, float)):\n        answer, times = answer\n    if isinstance(answer, (str, bytes, dict)) or not hasattr(answer, \"__iter__\"):\n        raise AlgorithmError(\"solve must return the visiting order as a list of asteroid indices, got %r\" % (answer,))\n    order = tools._order(list(answer), complete=True)\n    if times is not None:\n        try:\n            times = [[float(p[0]), float(p[1])] for p in times]\n        except Exception:\n            raise AlgorithmError(\"times must be a list of (wait, transfer) pairs in days\")\n        if len(times) != problem.n:\n            raise AlgorithmError(\"times needs one (wait, transfer) pair per asteroid: %d given for %d\" % (len(times), problem.n))\n        if any(w < 0 or w > problem.tau_max or t < 1 or t > problem.t_max or w != w or t != t for w, t in times):\n            raise AlgorithmError(\"a wait must lie in [0, %g] days and a transfer in [1, %g] days\" % (problem.tau_max, problem.t_max))\n    elif tools._best is not None and tools._best[1] == order:\n        times = tools._best[2]\n    return order, times, \"\"\n\n\ndef arp_run(job_json, source):\n    job = json.loads(job_json)\n    problem = Problem(job)\n    tools = Tools(job, problem)\n    out = {\"ok\": False, \"order\": None, \"times\": None, \"note\": \"\", \"error\": None}\n    try:\n        check_format(source)\n        scope = {\"__name__\": \"__algorithm__\"}\n        exec(compile(source, \"<algorithm>\", \"exec\"), scope)\n        note = \"\"\n        try:\n            answer = scope[\"solve\"](problem, tools)\n        except BudgetExceeded:\n            answer, note = None, \"The budget of %d route evaluations was used; the best route so far is shown.\" % tools.budget\n        order, times, why = normalise(answer, problem, tools)\n        out.update(ok=True, order=order, times=times, note=note or why)\n    except AlgorithmError as e:\n        out[\"error\"] = str(e)\n    except BaseException:\n        out[\"error\"] = user_traceback(source)\n    out[\"evaluations\"] = tools.evaluations\n    out[\"transfers\"] = tools.transfers\n    return json.dumps(out)\n"

let ready = null

function boot() {
  if (!ready) {
    ready = (async () => {
      importScripts(PYODIDE + 'pyodide.js')
      const py = await self.loadPyodide({
        indexURL: PYODIDE,
        stdout: (text) => postMessage({ type: 'log', text }),
        stderr: (text) => postMessage({ type: 'log', text }),
      })
      py.runPython(HARNESS)
      return py
    })()
  }
  return ready
}

// FastAPI's validation errors come as a list of {loc, msg}; the algorithm is shown one sentence.
function readable(status, text) {
  if (status === 502 || status === 503 || status === 504) {
    return JSON.stringify({ detail: 'the planner is starting up or busy; run again in a few seconds' })
  }
  try {
    const j = JSON.parse(text)
    if (Array.isArray(j.detail)) {
      const parts = j.detail.map((d) => {
        const where = Array.isArray(d && d.loc) ? d.loc.filter((x) => x !== 'body').join('.') : ''
        return (where ? where + ': ' : '') + ((d && d.msg) || 'is not valid')
      })
      return JSON.stringify({ detail: parts.slice(0, 3).join('; ') })
    }
  } catch {
    // not JSON
  }
  return text
}

function send(path, body) {
  const x = new XMLHttpRequest()
  x.open('POST', path, false)
  x.setRequestHeader('content-type', 'application/json')
  x.send(body)
  return x
}

// A blocking request: the algorithm waits for the answer like any function call. A cold start
// (502, 503, 504) or a dropped connection is tried once more before the algorithm hears of it.
self.arp_request = (path, body) => {
  let x = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      x = send(path, body)
      if (x.status !== 502 && x.status !== 503 && x.status !== 504) break
    } catch (e) {
      x = null
      if (attempt === 1) return JSON.stringify({ status: 0, body: String(e) })
    }
  }
  if (!x) return JSON.stringify({ status: 0, body: 'no answer' })
  return JSON.stringify({ status: x.status, body: x.status === 200 ? x.responseText : readable(x.status, x.responseText) })
}
self.arp_emit = (json) => postMessage({ type: 'event', event: JSON.parse(json) })

self.onmessage = async (e) => {
  const m = e.data
  try {
    const py = await boot()
    if (m.type === 'boot') {
      postMessage({ type: 'ready' })
      return
    }
    if (m.type === 'run') {
      await py.loadPackagesFromImports(m.source)
      postMessage({ type: 'started' })
      py.globals.set('ARP_JOB', JSON.stringify(m.job))
      py.globals.set('ARP_SOURCE', m.source)
      const out = py.runPython('arp_run(ARP_JOB, ARP_SOURCE)')
      postMessage({ type: 'done', result: JSON.parse(out) })
    }
  } catch (err) {
    postMessage({ type: 'failed', message: String((err && err.message) || err) })
  }
}
