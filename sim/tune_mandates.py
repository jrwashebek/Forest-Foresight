#!/usr/bin/env python3
"""Iteratively tune per-role mandate thresholds toward 25-45% fulfilment in mixed 5-player games.
Prints the override table to paste into design_src.ROLE_TIER_OVERRIDES."""
import sys, os, copy, random, json
from collections import defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import design_src
from content import load_content
from tune import make_content
from engine import Game
from run import seat_policies

def run(c, n, seed):
    rng = random.Random(seed)
    st = defaultdict(lambda: [0, 0, [0, 0, 0, 0]])
    for g in range(n):
        sc = rng.choice(c["scenarios"]); rs = rng.sample(c["roles"], 5)
        r = Game(c, seat_policies("mixed", 5, rng), rs, sc, random.Random(rng.random())).run()
        for x in r["roles"]:
            k = (x["role"], x["variant"]); st[k][0] += 1; st[k][1] += x["fulfilled"]
            for i, f in enumerate(x["flags"]): st[k][2][i] += f
    return st

def main(iters=int(os.environ.get('ITERS', 4)), n=int(os.environ.get('N', 1500)), lo=0.27, hi=0.43):
    base = load_content()
    ov = {}
    for r in design_src.ROLES:
        ov[r["id"]] = {m[0]: copy.deepcopy(design_src.ROLE_TIER_OVERRIDES.get(r["id"], {}).get(
            m[0], {"t": list(design_src.TIERS["t"]), "g": design_src.TIERS["g"]})) for m in r["mandates"]}
    for it in range(iters):
        c = make_content(base, overrides=ov)
        st = run(c, n, 100 + it)
        changed = 0
        for (rid, vid), (cnt, ful, flags) in sorted(st.items()):
            rate = ful / cnt; p = [f / cnt for f in flags]
            t = ov[rid][vid]
            act = ""
            if rate > hi:
                i = max(range(3), key=lambda i: p[i] - 0.02 * t["t"][i])
                if t["t"][i] < 9: t["t"][i] += 1; act = f"raise t{i}"
                changed += 1
            elif rate < lo:
                i = min(range(4), key=lambda i: p[i])
                if i == 3:
                    if t["g"] > 3: t["g"] -= 1; act = "lower guard"
                elif t["t"][i] > 4: t["t"][i] -= 1; act = f"lower t{i}"
                changed += 1
            print(f"it{it} {rid:28s}/{vid} n={cnt:4d} fulfil {rate:5.1%} flags {' '.join(f'{x:.2f}' for x in p)} {t} {act}")
        if not changed: break
    print(json.dumps(ov))

if __name__ == "__main__":
    main()
