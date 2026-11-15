#!/usr/bin/env python3
"""Merge team content files into content.json and validate against SPEC.md.

Usage: python3 -I merge.py [--colors app/sample-content.json] [--out content.json]
Prints a validation report; exits 1 on errors.
"""
import json, sys, re, glob, os
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[1:]
def opt(name, default=None):
    return args[args.index(name) + 1] if name in args else default

DOMAINS = ["fire","health","water","climate","wood","communities","recreation","workforce","governance","partners"]
HORIZONS = ["now","near","far"]
SEC_TYPES = {"fixed","add","remove","move","protect"}
ABILITY_TYPES = {"boost","protect","capacity","discount","cancel","decide","redraw","refresh-market","move"}
KINDS = {"no-regret","hedge","big-bet","trade-off"}
URL = re.compile(r"^https?://[^\s]+$")

errors, warnings = [], []
def err(m): errors.append(m)
def warn(m): warnings.append(m)

def load(p):
    with open(p) as f: return json.load(f)

base = load(os.path.join(HERE, "base.json"))
content = dict(base)

# colours from engineer's sample content (if available)
cpath = opt("--colors")
if cpath and os.path.exists(cpath):
    sample = load(cpath)
    cmap = {d["id"]: d for d in sample.get("domains", [])}
    for d in content["domains"]:
        s = cmap.get(d["id"], {})
        for k in ("color", "icon"):
            if k in s: d[k] = s[k]

signals = []
for p in sorted(glob.glob(os.path.join(HERE, "signals-r*.json"))):
    data = load(p)
    if isinstance(data, dict): data = data.get("signals", [])
    for s in data: s.setdefault("_file", os.path.basename(p))
    signals += data
content["signals"] = signals

ds_path = os.path.join(HERE, "drivers-scenarios.json")
ds = load(ds_path) if os.path.exists(ds_path) else {}
content["drivers"] = ds.get("drivers", [])
content["scenarios"] = ds.get("scenarios", [])

dz_path = os.path.join(HERE, "design.json")
dz = load(dz_path) if os.path.exists(dz_path) else {}
for k in ("roles","strategies","cascades","rules","prompts","roleSets"):
    if k in dz: content[k] = dz[k]

# ---------- validation ----------
def check_effects(effs, where, lo=-3, hi=3):
    if not isinstance(effs, list): err(f"{where}: effects not a list"); return
    for e in effs:
        if e.get("domain") not in DOMAINS: err(f"{where}: bad domain {e.get('domain')!r}")
        dv = e.get("delta")
        if not isinstance(dv, int) or not (lo <= dv <= hi) or dv == 0: err(f"{where}: bad delta {dv!r}")

def check_source(src, where):
    if not isinstance(src, dict): err(f"{where}: missing source"); return
    if not URL.match(str(src.get("url",""))): err(f"{where}: bad source url {src.get('url')!r}")
    for k in ("title","publisher","date"):
        if not src.get(k): warn(f"{where}: source missing {k}")

def words(t): return len(str(t or "").split())

ids = Counter()
for s in signals:
    sid = s.get("id","?"); ids[sid] += 1; w = f"signal {sid} ({s.get('_file')})"
    for k in ("title","signal","horizon","primary","secondary","source"):
        if k not in s: err(f"{w}: missing {k}")
    if s.get("horizon") not in HORIZONS: err(f"{w}: bad horizon")
    p = s.get("primary", {})
    check_effects([{"domain": p.get("domain"), "delta": p.get("delta")}], w + " primary")
    sec = s.get("secondary", {})
    t = sec.get("type")
    if t not in SEC_TYPES: err(f"{w}: bad secondary type {t!r}")
    if t == "fixed":
        check_effects([{"domain": sec.get("domain"), "delta": sec.get("delta")}], w + " secondary", -2, 2)
        if sec.get("domain") == p.get("domain"): err(f"{w}: secondary same domain as primary")
    if t in ("add","remove","move") and not isinstance(sec.get("amount", 1), int): err(f"{w}: bad amount")
    check_source(s.get("source"), w)
    if words(s.get("title")) > 7: warn(f"{w}: title {words(s.get('title'))} words")
    if words(s.get("signal")) > 45: warn(f"{w}: signal text {words(s.get('signal'))} words")
    s.pop("_file", None)
    s.setdefault("status","active"); s.setdefault("reviewed","2026-11-14"); s.setdefault("tags",[])

driver_ids = set()
for d in content["drivers"]:
    did = d.get("id","?"); ids[did] += 1; driver_ids.add(did); w = f"driver {did}"
    if d.get("horizon") not in HORIZONS: err(f"{w}: bad horizon")
    check_effects(d.get("effects", []), w)
    dil = d.get("dilemma", {})
    opts = dil.get("options", [])
    if not (2 <= len(opts) <= 3): err(f"{w}: dilemma needs 2-3 options")
    for i, o in enumerate(opts): check_effects(o.get("effects", []), f"{w} option {i}")
    check_source(d.get("source"), w)

for sc in content["scenarios"]:
    w = f"scenario {sc.get('id')}"; ids[sc.get("id")] += 1
    st = sc.get("start", {})
    for dm in DOMAINS:
        v = st.get(dm)
        if not isinstance(v, int) or not 0 <= v <= 10: err(f"{w}: start {dm}={v!r}")
    for era in HORIZONS:
        pool = sc.get("drivers", {}).get(era, [])
        if not pool: err(f"{w}: empty driver pool for {era}")
        for x in pool:
            if x not in driver_ids: err(f"{w}: unknown driver {x}")

for st in content.get("strategies", []):
    w = f"strategy {st.get('id')}"; ids[st.get("id")] += 1
    if not isinstance(st.get("cost"), int) or not 1 <= st["cost"] <= 10: err(f"{w}: bad cost")
    check_effects(st.get("effects", []), w)
    if st.get("delayed"): check_effects(st["delayed"], w + " delayed")
    if st.get("kind") not in KINDS: warn(f"{w}: kind {st.get('kind')!r}")

for r in content.get("roles", []):
    w = f"role {r.get('id')}"; ids[r.get("id")] += 1
    ms = r.get("mandates", [])
    if len(ms) < 1: err(f"{w}: no mandates")
    for m in ms:
        for t in m.get("targets", []):
            if t.get("domain") not in DOMAINS: err(f"{w}: bad target domain")
        g = m.get("guardrail", {})
        if g and g.get("domain") not in DOMAINS: err(f"{w}: bad guardrail domain")
    eff = (r.get("ability") or {}).get("effect", {})
    if eff.get("type") not in ABILITY_TYPES: err(f"{w}: ability type {eff.get('type')!r} not in vocabulary")

for c in content.get("cascades", []):
    w = f"cascade {c.get('id')}"
    if c.get("when", {}).get("domain") not in DOMAINS: err(f"{w}: bad when.domain")
    check_effects(c.get("effects", []), w)

for k, n in ids.items():
    if n > 1: err(f"duplicate id {k}")

for k in ("roles","strategies","cascades","rules","prompts","drivers","scenarios"):
    if not content.get(k): warn(f"missing section: {k}")

# ---------- report ----------
print(f"signals: {len(signals)}  drivers: {len(content['drivers'])}  scenarios: {len(content['scenarios'])}  "
      f"strategies: {len(content.get('strategies',[]))}  roles: {len(content.get('roles',[]))}  cascades: {len(content.get('cascades',[]))}")
grid = defaultdict(Counter); val = Counter(); sec = Counter(); origin = Counter()
for s in signals:
    grid[s["primary"]["domain"]][s["horizon"]] += 1
    val["+" if s["primary"]["delta"] > 0 else "-"] += 1
    sec[s["secondary"].get("type")] += 1; origin[s.get("origin","new")] += 1
print("primary domain x horizon:")
for dm in DOMAINS:
    g = grid[dm]; print(f"  {dm:12s} now {g['now']:2d}  near {g['near']:2d}  far {g['far']:2d}  total {sum(g.values()):2d}")
print("valence:", dict(val), " secondary types:", dict(sec), " origin:", dict(origin))
print(f"\n{len(errors)} errors, {len(warnings)} warnings")
for e in errors: print("  ERROR", e)
for w_ in warnings[:40]: print("  warn ", w_)

out = opt("--out", os.path.join(HERE, "content.json"))
with open(out, "w") as f: json.dump(content, f, ensure_ascii=False, indent=1)
print("wrote", out)
sys.exit(1 if errors else 0)
