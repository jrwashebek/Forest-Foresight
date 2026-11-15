#!/usr/bin/env python3
"""Forest Futures balance simulator — batch runner.

    python3 -I run.py                      # default report: 5 players, Standard, all bot mixes
    python3 -I run.py --n 4000 --players 5 --length standard --mix mixed
    python3 -I run.py --synthetic          # ignore team content files, use synthetic deck
    python3 -I run.py --json out.json      # also dump aggregates

Bot mixes: random | selfish | coop | mixed (2 coop + 2 selfish + 1 random, seats shuffled)
           | seatmix (each seat independently 40% coop / 40% selfish / 20% random)
"""
import argparse, json, os, random, sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from content import load_content, DOMAINS
from engine import Game
import bots

MIXES = ["random", "selfish", "coop", "mixed", "seatmix"]


def seat_policies(mix, n, rng):
    if mix in ("random", "selfish", "coop"):
        names = [mix] * n
    elif mix == "mixed":
        base = ["coop", "coop", "selfish", "selfish", "random", "coop", "selfish"]
        names = base[:n]
        rng.shuffle(names)
    elif mix == "seatmix":
        names = rng.choices(["coop", "selfish", "random"], [0.4, 0.4, 0.2], k=n)
    else:
        raise ValueError(mix)
    return [bots.make(x, rng) for x in names]


def simulate(content, mix="mixed", n=2000, players=5, rounds=1, seed=1, scenario=None, roles=None):
    rng = random.Random(seed)
    agg = {"outcome": Counter(), "collapse": 0, "index": 0.0, "funded": defaultdict(float),
           "capacity": defaultdict(float), "lost": defaultdict(float), "unspent": defaultdict(float),
           "role_n": Counter(), "role_ful": Counter(), "role_win": Counter(), "role_met": Counter(),
           "var_n": Counter(), "var_ful": Counter(),
           "pol_n": Counter(), "pol_ful": Counter(), "pol_win": Counter(),
           "dom_final": defaultdict(float), "dom_crisis": Counter(), "cascade": Counter(),
           "strat_seen": Counter(), "strat_funded": Counter(), "abil": Counter(), "eras": 0,
           "scn_outcome": defaultdict(Counter), "by_source": defaultdict(float), "games": [], "n": n, "era_rows": 0, "fulfilled_any": 0}
    scns = content["scenarios"]
    for g in range(n):
        sc = scenario or rng.choice(scns)
        rs = roles or rng.sample(content["roles"], players)
        pol = seat_policies(mix, players, rng)
        game = Game(content, pol, rs, sc, random.Random(rng.random()), rounds=rounds)
        r = game.run()
        st = r["stats"]
        agg["games"].append((r["index"], min(r["levels"].values()), r["collapsed"],
                             tuple((x["role"], x["fulfilled"]) for x in r["roles"])))
        agg["outcome"][r["outcome"]] += 1
        agg["scn_outcome"][sc["id"]][r["outcome"]] += 1
        agg["collapse"] += r["collapsed"]
        agg["index"] += r["index"]
        agg["eras"] += r["eras_played"]
        for e, k in enumerate(st["funded"]):
            agg["funded"][e] += k
            agg["capacity"][e] += st["capacity"][e]
            agg["lost"][e] += st["pledged_lost"][e]
            agg["unspent"][e] += st["unspent"][e]
        agg["era_rows"] += len(st["funded"])
        for d in DOMAINS:
            agg["dom_final"][d] += r["levels"][d]
            agg["dom_crisis"][d] += r["levels"][d] <= 2
        for hits in st["cascade_hits"]:
            for h in hits:
                agg["cascade"][h] += 1
        for k, v in st["by_source"].items():
            agg["by_source"][k] += v
        for sid in st["funded_ids"]:
            agg["strat_funded"][sid] += 1
        for a in st["abilities"]:
            agg["abil"][a[0]] += 1
        anyful = False
        for rr in r["roles"]:
            agg["role_n"][rr["role"]] += 1
            agg["role_ful"][rr["role"]] += rr["fulfilled"]
            agg["role_win"][rr["role"]] += rr["winner"]
            agg["role_met"][rr["role"]] += rr["met"]
            agg["var_n"][rr["role"] + "/" + rr["variant"]] += 1
            agg["var_ful"][rr["role"] + "/" + rr["variant"]] += rr["fulfilled"]
            agg["pol_n"][rr["policy"]] += 1
            agg["pol_ful"][rr["policy"]] += rr["fulfilled"]
            agg["pol_win"][rr["policy"]] += rr["winner"]
            anyful |= rr["fulfilled"]
        agg["fulfilled_any"] += anyful
    return agg


def summary(agg):
    n = agg["n"]
    o = agg["outcome"]
    return {
        "Resilient": o["Resilient"] / n, "Holding": o["Holding"] / n, "Unraveling": o["Unraveling"] / n,
        "Collapse": agg["collapse"] / n, "index": agg["index"] / n,
        "funded_per_era": [agg["funded"][e] / n for e in range(3)],
        "capacity_per_era": [agg["capacity"][e] / n for e in range(3)],
        "by_source_per_era": {k: round(v / max(1, agg["eras"]), 2) for k, v in agg["by_source"].items()},
        "fulfil_by_role": {k: agg["role_ful"][k] / agg["role_n"][k] for k in sorted(agg["role_n"])},
        "win_by_role": {k: agg["role_win"][k] / agg["role_n"][k] for k in sorted(agg["role_n"])},
        "fulfil_by_policy": {k: agg["pol_ful"][k] / agg["pol_n"][k] for k in agg["pol_n"]},
        "win_by_policy": {k: agg["pol_win"][k] / agg["pol_n"][k] for k in agg["pol_n"]},
        "fulfil_by_variant": {k: agg["var_ful"][k] / agg["var_n"][k] for k in sorted(agg["var_n"])},
        "dom_final": {d: agg["dom_final"][d] / n for d in DOMAINS},
        "dom_crisis": {d: agg["dom_crisis"][d] / n for d in DOMAINS},
        "cascade_per_game": {k: v / n for k, v in agg["cascade"].most_common()},
        "strat_funded_per_game": {k: v / n for k, v in agg["strat_funded"].most_common()},
        "abilities_per_game": {k: agg["abil"][k] / agg["role_n"][k] for k in sorted(agg["role_n"])},
        "scenario": {k: {x: v[x] / sum(v.values()) for x in ("Resilient", "Holding", "Unraveling")}
                     for k, v in agg["scn_outcome"].items()},
    }


def pct(x):
    return f"{100 * x:5.1f}%"


def print_summary(name, s, full=False):
    fe = " / ".join(f"{x:.2f}" for x in s["funded_per_era"])
    ce = " / ".join(f"{x:.1f}" for x in s["capacity_per_era"])
    print(f"{name:9s} Res {pct(s['Resilient'])}  Hold {pct(s['Holding'])}  Unr {pct(s['Unraveling'])}  "
          f"(Collapse {pct(s['Collapse'])})  idx {s['index']:.2f}  funded/era {fe}  cap/era {ce}")
    print("  net points per era by source:", s["by_source_per_era"])
    if full:
        print("  fulfilment by policy:", {k: pct(v) for k, v in s["fulfil_by_policy"].items()},
              " winners:", {k: pct(v) for k, v in s["win_by_policy"].items()})
        print("  fulfilment by role:")
        for k, v in s["fulfil_by_role"].items():
            print(f"    {k:28s} {pct(v)}   win {pct(s['win_by_role'][k])}")
        print("  final level / crisis%:", "  ".join(f"{d[:5]} {s['dom_final'][d]:.1f}/{100*s['dom_crisis'][d]:.0f}" for d in DOMAINS))
        print("  scenarios:", {k: "/".join(f"{100*v[x]:.0f}" for x in ("Resilient", "Holding", "Unraveling")) for k, v in s["scenario"].items()})
        print("  strategy funded per game:", {k: round(v, 2) for k, v in s["strat_funded_per_game"].items()})
        print("  ability use rate by role:", {k.replace("role-", ""): round(v, 2) for k, v in s["abilities_per_game"].items()})
        print("  cascades/game:", {k: round(v, 2) for k, v in s["cascade_per_game"].items()})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=3000)
    ap.add_argument("--players", type=int, default=5)
    ap.add_argument("--length", choices=["standard", "deep"], default="standard")
    ap.add_argument("--mix", default="all")
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--synthetic", action="store_true")
    ap.add_argument("--json")
    ap.add_argument("--full", action="store_true")
    a = ap.parse_args()
    content = load_content(force_synthetic=a.synthetic)
    print("content:", content["provenance"])
    rounds = 1 if a.length == "standard" else 2
    mixes = MIXES if a.mix == "all" else a.mix.split(",")
    out = {}
    for mx in mixes:
        s = summary(simulate(content, mx, a.n, a.players, rounds, a.seed))
        out[mx] = s
        print_summary(mx, s, full=a.full or mx == "mixed")
    if a.json:
        with open(a.json, "w") as f:
            json.dump({"provenance": content["provenance"], "results": out}, f, indent=1)


if __name__ == "__main__":
    main()
