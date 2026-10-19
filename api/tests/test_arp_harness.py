"""The routing runner end to end, without a browser.

The page runs algorithms with Pyodide in a worker (app/public/arp-worker.js). The Python half of
that worker, the harness that implements `problem` and `tools`, is plain Python, so here it is
lifted out of the worker file and run under CPython with a stand-in for the two JavaScript
functions it imports. Every preset algorithm shipped in app/src/arp/format.ts is run against the
real transfer service, which checks the format, the interface and the presets in one go.
"""
import json
import re
import sys
import types
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.index import app
from api.tests.test_arp import make_instance

ROOT = Path(__file__).resolve().parents[2]
client = TestClient(app)


def load_harness(events):
    src = (ROOT / "app/public/arp-worker.js").read_text()
    harness = json.loads(re.search(r'const HARNESS = (".*")\n\nlet ready', src, re.S).group(1))
    fake = types.ModuleType("js")

    def arp_request(path, body):
        r = client.post(path, content=body, headers={"content-type": "application/json"})
        return json.dumps({"status": r.status_code, "body": r.text})

    fake.arp_request = arp_request
    fake.arp_emit = lambda text: events.append(json.loads(text))
    sys.modules["js"] = fake
    scope = {}
    exec(compile(harness, "<harness>", "exec"), scope)
    return scope


def presets():
    ts = (ROOT / "app/src/arp/format.ts").read_text()
    out = {}
    for ident, body in re.findall(r"\{ id: '([a-z-]+)', label: '[^']*', paper: (?:1|2), source: `((?:[^`\\]|\\.)*)` \}", ts):
        out[ident] = body.replace("\\`", "`").replace("\\${", "${").replace("\\\\", "\\")
    return out


def run(source, n=5, budget=12, seed=3, solver="izzo2015", transfer="lambert2"):
    events = []
    scope = load_harness(events)
    job = {"instance": make_instance(n).model_dump(), "solver": solver, "transfer": transfer, "budget": budget, "seed": seed}
    return json.loads(scope["arp_run"](json.dumps(job), source)), events


PRESETS = presets()


def test_all_presets_are_found():
    assert set(PRESETS) == {"greedy-nn", "random", "restricted-dd", "peel-and-bound"}


@pytest.mark.parametrize("ident", sorted(PRESETS))
def test_every_preset_runs_and_returns_a_complete_route(ident):
    out, events = run(PRESETS[ident])
    assert out["ok"], out["error"]
    assert sorted(out["order"]) == [1, 2, 3, 4, 5]
    assert out["evaluations"] <= 12
    kinds = {e["type"] for e in events}
    assert kinds <= {"transfer", "evaluation", "report"} and kinds


def test_the_second_papers_algorithms_bound_before_they_pay():
    """The decision-diagram algorithms ask for the n(n+1) relaxed bounds first, then exact transfers for
    the few children that survive, and Peel-and-Bound never returns a worse route than its restricted start."""
    out, events = run(PRESETS["restricted-dd"])
    assert out["ok"], out["error"]
    relaxed = [e for e in events if e["type"] == "transfer" and e["relaxed"]]
    exact = [e for e in events if e["type"] == "transfer" and not e["relaxed"]]
    assert len(relaxed) == 5 * 5 + 5 - 5   # (n + 1) origins x n targets, minus a -> a
    assert 0 < len(exact) <= 6 * 5          # WIDTH x n exact arcs at most
    assert out["evaluations"] == 1 and sorted(out["order"]) == [1, 2, 3, 4, 5]
    out2, events2 = run(PRESETS["peel-and-bound"])
    assert out2["ok"], out2["error"]
    evals = [e for e in events2 if e["type"] == "evaluation"]
    assert evals and evals[-1]["cost"] <= evals[0]["cost"]       # the restricted start is never beaten upward
    assert out2["order"] == evals[-1]["order"]


def test_the_greedy_route_is_the_papers_algorithm():
    out, events = run(PRESETS["greedy-nn"])
    # one black-box call per asteroid, each starting when the previous transfer arrives
    transfers = [e for e in events if e["type"] == "transfer"]
    assert len(transfers) == 5 and out["transfers"] == 5
    eta = 0.0
    for tr, there in zip(transfers, out["order"]):
        assert tr["target"] == there and tr["eta"] == pytest.approx(eta)
        eta += tr["tau"] + tr["t"]
    assert [e["order"] for e in events if e["type"] == "report"][-1] == out["order"]


def test_random_search_is_repeatable_and_stops_at_the_budget():
    a, ev_a = run(PRESETS["random"], budget=6, seed=11)
    b, _ = run(PRESETS["random"], budget=6, seed=11)
    c, _ = run(PRESETS["random"], budget=6, seed=12)
    assert a["order"] == b["order"] and a["evaluations"] == 6
    evals = [e for e in ev_a if e["type"] == "evaluation"]
    assert [e["index"] for e in evals] == [1, 2, 3, 4, 5, 6]
    best = min(evals, key=lambda e: e["cost"])
    assert a["order"] == best["order"] and a["times"] == best["times"]
    assert sum(e["improved"] for e in evals) >= 1
    assert c["ok"]


HEAD = '"""ARP-ALGORITHM 1\nname: test\n"""\n'


@pytest.mark.parametrize("source, needle", [
    ("def solve(problem, tools):\n    return [1, 2, 3, 4, 5]\n", "docstring"),
    ('"""ARP-ALGORITHM 2\nname: x\n"""\ndef solve(problem, tools):\n    return []\n', "version 2"),
    ('"""ARP-ALGORITHM 1\n"""\ndef solve(problem, tools):\n    return []\n', "name:"),
    (HEAD + "def route(problem, tools):\n    return []\n", "def solve"),
    (HEAD + "def solve(problem):\n    return []\n", "exactly (problem, tools)"),
    (HEAD + "def solve(problem, tools):\n    return [1, 2, 3]\n", "3 of the 5"),
    (HEAD + "def solve(problem, tools):\n    return [1, 2, 3, 4, 4]\n", "twice"),
    (HEAD + "def solve(problem, tools):\n    return [0, 1, 2, 3, 4]\n", "0 is Earth"),
    (HEAD + "def solve(problem, tools):\n    return 5\n", "list of asteroid indices"),
    (HEAD + "def solve(problem, tools):\n    return None\n", "no complete route"),
    (HEAD + "def solve(problem, tools):\n    tools.transfer(1, 0, 0)\n", "never returns to Earth"),
    (HEAD + "def solve(problem, tools):\n    tools.transfer(0, 9, 0)\n", "does not exist"),
    (HEAD + "def solve(problem, tools):\n    return [1, 2, 3, 4, 5], [(0, 100)]\n", "one (wait, transfer) pair per asteroid"),
    (HEAD + "def solve(problem, tools):\n    return (\n", "syntax error"),
])
def test_breaking_the_format_is_explained(source, needle):
    out, _ = run(source)
    assert not out["ok"]
    assert needle in out["error"], out["error"]


def test_an_exception_in_the_algorithm_points_at_its_line():
    out, _ = run(HEAD + "def solve(problem, tools):\n    x = problem.n\n    return [1 / (x - 5)]\n")
    assert not out["ok"]
    assert out["error"].startswith("ZeroDivisionError")
    assert "line 6, in solve" in out["error"] and "1 / (x - 5)" in out["error"]


def test_the_transfer_mode_reaches_the_algorithm_and_the_service():
    probe = HEAD + ("def solve(problem, tools):\n"
                    "    tools.log(problem.transfer)\n"
                    "    tau, t, z = tools.transfer(0, 1, 0.0)\n"
                    "    tools.log(repr(z))\n"
                    "    return [1, 2, 3, 4, 5]\n")
    import io
    from contextlib import redirect_stdout
    out = {}
    for mode in ("lambert2", "threeburn"):
        buf = io.StringIO()
        with redirect_stdout(buf):
            res, _ = run(probe, transfer=mode)
        assert res["ok"], res["error"]
        name, z = buf.getvalue().strip().splitlines()
        assert name == mode
        out[mode] = float(z)
    assert out["lambert2"] != out["threeburn"]


def test_explicit_times_and_the_budget_cut_off():
    fixed = HEAD + "def solve(problem, tools):\n    return [1, 2, 3, 4, 5], [(0, 200)] * 5\n"
    out, _ = run(fixed)
    assert out["ok"] and out["times"] == [[0.0, 200.0]] * 5
    greedy_forever = HEAD + "def solve(problem, tools):\n    while True:\n        tools.evaluate([5, 4, 3, 2, 1])\n"
    out, events = run(greedy_forever, budget=3)
    assert out["ok"] and out["order"] == [5, 4, 3, 2, 1] and out["evaluations"] == 3
    assert "budget of 3" in out["note"]


def test_tools_positions_match_the_planner():
    probe = HEAD + ("def solve(problem, tools):\n"
                    "    tools.log(repr(tools.position(2, 123.5)))\n"
                    "    tools.log(repr(tools.distance(0, 2, 123.5)))\n"
                    "    return [1, 2, 3, 4, 5]\n")
    import io
    from contextlib import redirect_stdout
    from api.propagation import elements_state
    buf = io.StringIO()
    with redirect_stdout(buf):
        out, _ = run(probe)
    assert out["ok"], out["error"]
    pos, dist = [eval(line) for line in buf.getvalue().strip().splitlines()]
    inst = make_instance(5)
    r = elements_state(inst.asteroids[1].elements.model_dump(), inst.mu, 123.5 * 86400.0)[0]
    e = elements_state(inst.earth.elements.model_dump(), inst.mu, 123.5 * 86400.0)[0]
    assert max(abs(a - b) for a, b in zip(pos, r)) < 1e-3
    assert dist == pytest.approx(float(((r - e) ** 2).sum() ** 0.5), rel=1e-12)
