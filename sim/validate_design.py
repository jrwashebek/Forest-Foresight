#!/usr/bin/env python3
"""Validate content/design.json: schema, word limits, ability vocabulary, mandate/strategy balance."""
import json, os, sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.normpath(os.path.join(HERE, "..", "content", "design.json"))
DOMAINS = ["fire", "health", "water", "climate", "wood", "communities", "recreation", "workforce", "governance", "partners"]
SECTORS = {"federal", "state", "tribal", "local", "private", "ngo", "science"}
KINDS = {"no-regret", "hedge", "big-bet", "trade-off"}
SCOPES = {"driver", "signal", "cascade"}
HORIZONS = {"now", "near", "far"}

def words(t): return len(str(t or "").split())

def check_ability(eff, where, errs):
    t = eff.get("type")
    allowed = {
        "boost": {"type", "delta", "choices"}, "protect": {"type", "choices"}, "capacity": {"type", "amount"},
        "discount": {"type", "amount", "tag"}, "cancel": {"type", "scope"}, "decide": {"type"},
        "redraw": {"type", "horizon"}, "refresh-market": {"type", "count"}, "move": {"type", "amount"},
    }
    if t not in allowed:
        errs.append(f"{where}: ability type {t!r} not in vocabulary"); return
    extra = set(eff) - allowed[t]
    if extra: errs.append(f"{where}: ability keys {extra} not in vocabulary")
    for c in eff.get("choices", []) or []:
        if c not in DOMAINS: errs.append(f"{where}: bad choice {c}")
    if t == "cancel" and eff.get("scope") not in SCOPES: errs.append(f"{where}: bad cancel scope")
    if t == "redraw" and eff.get("horizon") not in (None, *HORIZONS): errs.append(f"{where}: bad horizon")
    for k in ("delta", "amount", "count"):
        if k in eff and (not isinstance(eff[k], int) or eff[k] < 1): errs.append(f"{where}: bad {k}")

def main(path=PATH, quiet=False):
    with open(path) as f: d = json.load(f)
    errs, warns = [], []
    roles = d["roles"]
    if len(roles) != 12: errs.append(f"expected 12 roles, got {len(roles)}")
    tgt, grd, sect = Counter(), Counter(), Counter()
    for r in roles:
        w = r["id"]; sect[r["sector"]] += 1
        if r["sector"] not in SECTORS: errs.append(f"{w}: bad sector")
        if words(r["bio"]) > 40: errs.append(f"{w}: bio {words(r['bio'])} words")
        if len(r["mandates"]) != 2: errs.append(f"{w}: needs 2 mandates")
        for m in r["mandates"]:
            if len(m["targets"]) != 3: errs.append(f"{w}/{m['id']}: needs 3 targets")
            ds = [t["domain"] for t in m["targets"]] + [m["guardrail"]["domain"]]
            if len(set(ds)) != 4: errs.append(f"{w}/{m['id']}: repeated domain {ds}")
            for t in m["targets"]:
                if t["domain"] not in DOMAINS: errs.append(f"{w}: bad domain")
                tgt[t["domain"]] += 1
            grd[m["guardrail"]["domain"]] += 1
            if words(m["why"]) > 25: errs.append(f"{w}/{m['id']}: why {words(m['why'])} words")
        check_ability(r["ability"]["effect"], w, errs)
        if not r["ability"]["text"].startswith("Once per game"): warns.append(f"{w}: ability text should start 'Once per game'")
        if set(r["future"]) != {"resilient", "holding", "unraveling"}: errs.append(f"{w}: future keys")
        if r.get("status") != "active": errs.append(f"{w}: status")
    ids = {r["id"] for r in roles}
    for k, v in d.get("roleSets", {}).items():
        if k == "notes": continue
        for x in v:
            if x not in ids: errs.append(f"roleSet {k}: unknown {x}")
    pos, neg, costs, kinds = Counter(), Counter(), Counter(), Counter()
    for s in d["strategies"]:
        w = s["id"]
        if words(s["text"]) > 30: errs.append(f"{w}: text {words(s['text'])} words")
        if not (2 <= s["cost"] <= 8): errs.append(f"{w}: cost {s['cost']}")
        if s["kind"] not in KINDS: errs.append(f"{w}: kind")
        kinds[s["kind"]] += 1; costs[s["cost"]] += 1
        for e in s["effects"] + s.get("delayed", []):
            if e["domain"] not in DOMAINS or not isinstance(e["delta"], int) or e["delta"] == 0:
                errs.append(f"{w}: bad effect {e}")
            (pos if e["delta"] > 0 else neg)[e["domain"]] += abs(e["delta"])
    for c in d["cascades"]:
        if c["when"]["domain"] not in DOMAINS: errs.append(f"{c['id']}: bad when")
    tags = Counter(t for s in d["strategies"] for t in s["tags"])
    for r in roles:
        tg = r["ability"]["effect"].get("tag")
        if tg and tags[tg] == 0: errs.append(f"{r['id']}: discount tag {tg} matches no strategy")
    if not quiet:
        print("sectors:", dict(sect))
        print("mandate domain use (targets+guardrails):")
        for dm in DOMAINS:
            print(f"  {dm:12s} targets {tgt[dm]:2d}  guardrail {grd[dm]:2d}  total {tgt[dm]+grd[dm]:2d}")
        print("strategy +points / -points by domain:")
        for dm in DOMAINS: print(f"  {dm:12s} +{pos[dm]:2d}  -{neg[dm]:2d}")
        print("strategies:", len(d["strategies"]), "kinds:", dict(kinds), "costs:", dict(sorted(costs.items())))
        print("cascades:", len(d["cascades"]))
        print(f"{len(errs)} errors, {len(warns)} warnings")
        for e in errs: print("  ERROR", e)
        for e in warns: print("  warn ", e)
    return errs

if __name__ == "__main__":
    sys.exit(1 if main(sys.argv[1] if len(sys.argv) > 1 else PATH) else 0)
