#!/usr/bin/env python3
"""Parameter sweeps for Forest Futures balance. Builds design content in memory from design_src.

    python3 -I tune.py --n 800 --grid base     # small grid over capacity / start shift / thresholds
"""
import argparse, copy, itertools, json, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import design_src
from content import load_content, DOMAINS
from run import simulate, summary, print_summary


def make_content(base, start_shift=0, rules=None, tiers=None, cascade_mult=1, cascade_lte=None,
                 strategies=None, overrides=None, drop_positive_cascades=False, cascades=None):
    c = copy.deepcopy(base)
    d = design_src.build(tiers=tiers, rules=rules, strategies=strategies, overrides=overrides, cascades=cascades)
    c["roles"], c["strategies"], c["rules"] = d["roles"], d["strategies"], d["rules"]
    cas = d["cascades"]
    if drop_positive_cascades:
        cas = [x for x in cas if "lte" in x["when"]]
    for x in cas:
        if cascade_lte is not None and "lte" in x["when"]:
            x["when"]["lte"] = cascade_lte
        for e in x["effects"]:
            if e["delta"] < 0:
                e["delta"] *= cascade_mult
    c["cascades"] = cas
    if start_shift:
        for sc in c["scenarios"]:
            sc["start"] = {k: max(0, min(10, v + start_shift)) for k, v in sc["start"].items()}
    return c


def score(s_mixed):
    """Distance from the 5-player Standard targets (mixed bots)."""
    def band(x, lo, hi):
        return 0 if lo <= x <= hi else min(abs(x - lo), abs(x - hi))
    return (band(s_mixed["Resilient"], .25, .40) + band(s_mixed["Holding"], .40, .55)
            + band(s_mixed["Unraveling"], .15, .25) + 2 * band(s_mixed["Collapse"], 0, .08))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=800)
    ap.add_argument("--synthetic", action="store_true")
    ap.add_argument("--grid", default="base")
    a = ap.parse_args()
    base = load_content(force_synthetic=a.synthetic)
    print("content:", base["provenance"])
    R0 = design_src.RULES
    rows = []
    if a.grid == "base":
        grid = itertools.product([-1, 0], [2, 3], [0, 1], [(6.0, 4.5), (6.5, 5.0)], [1, 2])
        for shift, cb, thr_mod, (rt, ht), cm in grid:
            rules = copy.deepcopy(R0)
            rules["capacityBase"] = cb
            rules["capacityModifiers"]["Thriving"] = thr_mod
            rules["outcome"] = {"resilient": rt, "holding": ht}
            c = make_content(base, start_shift=shift, rules=rules, cascade_mult=cm)
            s = summary(simulate(c, "mixed", a.n, 5, 1, seed=11))
            sc = score(s)
            rows.append((sc, dict(shift=shift, cb=cb, thr=thr_mod, rt=rt, ht=ht, cm=cm), s))
            print(f"shift {shift:+d} cb {cb} thr {thr_mod} out {rt}/{ht} cm {cm}  score {sc:.3f}  ", end="")
            print_summary("mixed", s)
    if a.grid == "cascades":
        crisis = [x for x in design_src.CASCADES if "lte" in x["when"]]
        pos = [x for x in design_src.CASCADES if "gte" in x["when"]]
        sets = {
            "v0-current": design_src.CASCADES,
            "crisis-only": crisis,
            "crisis+bal": crisis + design_src.BALANCING + pos[:1],
            "crisis+bal+chronic": crisis + design_src.BALANCING + design_src.CHRONIC + pos[:1],
            "crisis+chronic+pos": crisis + design_src.CHRONIC + pos,
        }
        for thr in (1, 0):
            for (rt, ht) in ((6.0, 4.5), (6.5, 5.0)):
                for name, cs in sets.items():
                    rules = copy.deepcopy(R0)
                    rules["capacityModifiers"]["Thriving"] = thr
                    rules["outcome"] = {"resilient": rt, "holding": ht}
                    c = make_content(base, rules=rules, cascades=cs)
                    s = summary(simulate(c, "mixed", a.n, 5, 1, seed=11))
                    sc = score(s)
                    rows.append((sc, dict(set=name, thr=thr, rt=rt), s))
                    print(f"{name:20s} thr {thr} out {rt}/{ht} score {sc:.3f} ", end="")
                    print_summary("mixed", s)
    rows.sort(key=lambda r: r[0])
    print("\nBEST:")
    for sc, p, s in rows[:5]:
        print(f"{sc:.3f}", p)


if __name__ == "__main__":
    main()
