"""Load Forest Futures content for the simulator.

Uses the real team files in ../content/ when present:
  signals-r*.json, drivers-scenarios.json, design.json
Missing parts are replaced by a synthetic deck with SPEC-plausible distributions
(the returned `provenance` dict says which parts are real and which synthetic).
"""
import glob, json, os, random

HERE = os.path.dirname(os.path.abspath(__file__))
CONTENT_DIR = os.path.normpath(os.path.join(HERE, "..", "content"))
DOMAINS = ["fire", "health", "water", "climate", "wood", "communities", "recreation", "workforce", "governance", "partners"]
HORIZONS = ["now", "near", "far"]
ERA_WEIGHTS = {"now": {"now": 0.70, "near": 0.25, "far": 0.05},
               "near": {"now": 0.25, "near": 0.55, "far": 0.20},
               "far": {"now": 0.05, "near": 0.35, "far": 0.60}}


def _load(p):
    with open(p) as f:
        return json.load(f)


def _active(items):
    return [x for x in items if x.get("status", "active") == "active"]


# ---------------------------------------------------------------- synthetic fallback
def synthetic_signals(seed=7, n_per_horizon=30, pos_share=0.55):
    rng = random.Random(seed)
    out = []
    for h in HORIZONS:
        doms = (DOMAINS * 3)[:n_per_horizon]
        rng.shuffle(doms)
        npos = round(n_per_horizon * pos_share)
        signs = [1] * npos + [-1] * (n_per_horizon - npos)
        rng.shuffle(signs)
        for i, (d, sg) in enumerate(zip(doms, signs)):
            mag = rng.choices([1, 2, 3], [0.45, 0.45, 0.10])[0]
            r = rng.random()
            others = [x for x in DOMAINS if x != d]
            if r < 0.50:
                sec = {"type": "fixed", "domain": rng.choice(others),
                       "delta": rng.choice([1, -1]) * rng.choices([1, 2], [0.85, 0.15])[0]}
            elif r < 0.65:
                sec = {"type": "add", "amount": 1}
            elif r < 0.77:
                sec = {"type": "remove", "amount": 1}
            elif r < 0.90:
                sec = {"type": "move", "amount": 1}
            else:
                sec = {"type": "protect"}
            out.append({"id": f"syn-{h}-{i}", "title": f"Synthetic {h} {i}", "horizon": h,
                        "primary": {"domain": d, "delta": sg * mag}, "secondary": sec, "status": "active"})
    return out


def synthetic_drivers_scenarios(seed=11):
    rng = random.Random(seed)
    drivers = []
    for h in HORIZONS:
        for i in range(5):
            ds = rng.sample(DOMAINS, 3)
            pattern = rng.choice([[-2, -1, 1], [-2, 1], [-1, -1, 1], [2, -1, -1], [-2, -1], [1, -2, 1]])
            effects = [{"domain": d, "delta": v} for d, v in zip(ds, pattern)]
            opts = []
            for _ in range(rng.choice([2, 2, 3])):
                a, b = rng.sample(DOMAINS, 2)
                pat = rng.choice([[1, -1], [2, -1], [1, 0], [1, 1], [2, -2]])
                eff = [{"domain": a, "delta": pat[0]}]
                if pat[1]:
                    eff.append({"domain": b, "delta": pat[1]})
                opts.append({"label": "opt", "effects": eff})
            drivers.append({"id": f"drv-syn-{h}-{i}", "horizon": h, "effects": effects,
                            "dilemma": {"options": opts}, "status": "active"})
    pools = {h: [d["id"] for d in drivers if d["horizon"] == h] for h in HORIZONS}
    starts = [
        {"fire": 3, "health": 4, "water": 5, "climate": 4, "wood": 4, "communities": 4, "recreation": 5, "workforce": 3, "governance": 3, "partners": 5},
        {"fire": 4, "health": 5, "water": 5, "climate": 4, "wood": 5, "communities": 5, "recreation": 5, "workforce": 4, "governance": 4, "partners": 5},
        {"fire": 3, "health": 3, "water": 4, "climate": 4, "wood": 3, "communities": 4, "recreation": 4, "workforce": 3, "governance": 4, "partners": 4},
        {"fire": 4, "health": 4, "water": 4, "climate": 5, "wood": 4, "communities": 4, "recreation": 6, "workforce": 4, "governance": 3, "partners": 6},
        {"fire": 3, "health": 4, "water": 5, "climate": 3, "wood": 5, "communities": 5, "recreation": 5, "workforce": 4, "governance": 4, "partners": 4},
    ]
    scenarios = [{"id": f"scn-syn-{i}", "name": f"Synthetic {i}", "start": s, "drivers": pools, "status": "active"}
                 for i, s in enumerate(starts)]
    return drivers, scenarios


# ---------------------------------------------------------------- loader
def load_content(content_dir=CONTENT_DIR, design=None, force_synthetic=False):
    prov = {}
    signals = []
    files = sorted(glob.glob(os.path.join(content_dir, "signals-r*.json")))
    if not force_synthetic:
        for p in files:
            try:
                data = _load(p)
            except Exception as e:  # half-written file from a teammate
                prov.setdefault("errors", []).append(f"{os.path.basename(p)}: {e}")
                continue
            if isinstance(data, dict):
                data = data.get("signals", [])
            signals += data
    signals = [s for s in _active(signals) if _valid_signal(s)]
    if len(signals) >= 80:
        prov["signals"] = f"real ({len(signals)} from {', '.join(os.path.basename(p) for p in files)})"
    elif len(signals) >= 20:
        real_n = len(signals)
        signals = signals + proxy_clones(signals)
        prov["signals"] = (f"real {real_n} + {len(signals) - real_n} proxy clones of real cards re-targeted to "
                           f"uncovered domains (provisional)")
    else:
        signals = synthetic_signals()
        prov["signals"] = f"synthetic ({len(signals)})"

    ds_path = os.path.join(content_dir, "drivers-scenarios.json")
    drivers, scenarios = [], []
    if os.path.exists(ds_path) and not force_synthetic:
        try:
            ds = _load(ds_path)
            drivers = _active(ds.get("drivers", []))
            scenarios = _active(ds.get("scenarios", []))
        except Exception as e:
            prov.setdefault("errors", []).append(f"drivers-scenarios.json: {e}")
    if len(drivers) >= 6 and scenarios:
        prov["drivers"] = f"real ({len(drivers)} drivers, {len(scenarios)} scenarios)"
    else:
        drivers, scenarios = synthetic_drivers_scenarios()
        prov["drivers"] = f"synthetic ({len(drivers)} drivers, {len(scenarios)} scenarios)"

    if design is None:
        design = _load(os.path.join(content_dir, "design.json"))
    return {
        "signals": signals, "drivers": drivers, "scenarios": scenarios,
        "roles": _active(design["roles"]), "strategies": _active(design["strategies"]),
        "cascades": design["cascades"], "rules": design["rules"], "provenance": prov,
    }


def proxy_clones(real, per_domain=9):
    """Fill domains the real deck does not cover yet with clones of real cards (same horizon, deltas
    and secondary structure) whose primary domain is re-targeted. Keeps real valence/shape."""
    have = {}
    for s in real:
        have[s["primary"]["domain"]] = have.get(s["primary"]["domain"], 0) + 1
    out, k = [], 0
    for d in DOMAINS:
        for i in range(max(0, per_domain - have.get(d, 0))):
            src = real[k % len(real)]
            k += 7
            c = json.loads(json.dumps(src))
            orig = c["primary"]["domain"]
            c["id"] = f"proxy-{d}-{i}"
            c["primary"]["domain"] = d
            sec = c["secondary"]
            if sec.get("type") == "fixed" and sec.get("domain") == d:
                sec["domain"] = orig
            out.append(c)
    return out


def _valid_signal(s):
    try:
        p = s["primary"]
        return s.get("horizon") in HORIZONS and p["domain"] in DOMAINS and isinstance(p["delta"], int) \
            and isinstance(s.get("secondary"), dict)
    except Exception:
        return False
