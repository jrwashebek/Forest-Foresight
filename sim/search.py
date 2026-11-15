#!/usr/bin/env python3
"""Random search over mechanics knobs; outcome thresholds are re-scored post hoc from final states."""
import sys, os, copy, random, itertools, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import design_src
from content import load_content
from tune import make_content
from run import simulate, summary

def classify(games, rt, ht, floor=3, hfloor=0):
    n = len(games); res = hold = unr = col = 0
    for idx, mn, collapsed, _ in games:
        if collapsed: unr += 1; col += 1
        elif idx >= rt and mn >= floor: res += 1
        elif idx >= ht and mn >= hfloor: hold += 1
        else: unr += 1
    return res / n, hold / n, unr / n, col / n

def band(x, lo, hi):
    return 0 if lo <= x <= hi else min(abs(x - lo), abs(x - hi))

def cascades(chronic_lte, extra, pos):
    cs = copy.deepcopy(design_src.CASCADES)
    for x in cs:
        if x["id"] in ("cas-fire-deficit", "cas-heat-stress"): x["when"]["lte"] = chronic_lte
    if pos == "trim": cs = [x for x in cs if x["id"] != "cas-partners-thriving"]
    if extra: cs.append(design_src.C("cas-forest-stress", "health", "lte", chronic_lte, [("fire", -1)], ""))
    return cs

def weaken(strats, mode):
    out = copy.deepcopy(strats)
    for s in out:
        if mode in ("nodelay",): s.pop("delayed", None)
        if mode in ("minus1",):
            for e in s["effects"]:
                if e["delta"] >= 2: e["delta"] -= 1
    return out

def main(n=400, trials=60, seed=1):
    base = load_content()
    rng = random.Random(seed)
    space = dict(chronic=[3, 4, 5], extra=[False, True], pos=["all", "trim"], thr=[0, 1], cb=[2, 3],
                 strat=["none", "nodelay", "minus1"], cc=[3, 4])
    seen = set(); rows = []
    for t in range(trials):
        cfg = {k: rng.choice(v) for k, v in space.items()}
        key = tuple(sorted(cfg.items()))
        if key in seen: continue
        seen.add(key)
        rules = copy.deepcopy(design_src.RULES)
        rules["capacityBase"] = cfg["cb"]; rules["capacityModifiers"]["Thriving"] = cfg["thr"]
        rules["collapseCrisisCount"] = cfg["cc"]
        c = make_content(base, rules=rules, cascades=cascades(cfg["chronic"], cfg["extra"], cfg["pos"]),
                         strategies=weaken(design_src.STRATEGIES, cfg["strat"]))
        am = simulate(c, "mixed", n, 5, 1, seed=7)
        ac = simulate(c, "coop", n // 2, 5, 1, seed=7)
        asf = simulate(c, "selfish", n // 2, 5, 1, seed=7)
        fe = sum(am["funded"].values()) / max(1, am["era_rows"])
        best = None
        for rt, ht in itertools.product((6.0, 6.5, 7.0), (4.5, 5.0, 5.5)):
            r, h, u, col = classify(am["games"], rt, ht)
            rc = classify(ac["games"], rt, ht); rs = classify(asf["games"], rt, ht)
            sc = band(r, .25, .40) + band(h, .40, .55) + band(u, .15, .25) + 3 * band(col, 0, .08) \
                 + 0.5 * band(rc[0] - rs[0], 0.25, 1.0) + 0.1 * band(fe, 3, 5)
            if best is None or sc < best[0]:
                best = (sc, rt, ht, r, h, u, col, rc[0], rs[0], fe)
        rows.append((best, cfg))
        b = best
        print(f"{b[0]:.3f} rt{b[1]} ht{b[2]} mixed R{b[3]:.2f} H{b[4]:.2f} U{b[5]:.2f} C{b[6]:.2f} | coopR {b[7]:.2f} selfR {b[8]:.2f} | funded/era {b[9]:.2f} | {cfg}", flush=True)
    rows.sort(key=lambda r: r[0][0])
    print("\nTOP")
    for b, cfg in rows[:8]:
        print(f"{b[0]:.3f} rt{b[1]} ht{b[2]} R{b[3]:.2f} H{b[4]:.2f} U{b[5]:.2f} C{b[6]:.2f} coopR {b[7]:.2f} selfR {b[8]:.2f} fe {b[9]:.2f} {cfg}")

if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 400, int(sys.argv[2]) if len(sys.argv) > 2 else 60)
