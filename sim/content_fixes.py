#!/usr/bin/env python3
"""Balance edits to team content (signals, drivers, one scenario), applied to pristine copies.

    python3 -I content_fixes.py --orig /tmp/orig --apply      # write ../content/*.json + balance-edits.md
    python3 -I content_fixes.py --orig /tmp/orig              # dry run: print per-domain valence

Edits never touch source, signal text, primary domain or `reviewed`.
"""
import argparse, json, os, sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
CONTENT = os.path.normpath(os.path.join(HERE, "..", "content"))
DOMAINS = ["fire", "health", "water", "climate", "wood", "communities", "recreation", "workforce", "governance", "partners"]

# ---- 1. same-sign fixed secondaries turned into genuine trade-offs: id -> (domain, delta, text)
SECONDARY = {
    "sig-ten-am-rule-returns": ("communities", 1,
        "In the short run, fewer fires reach towns and managed-fire smoke days drop, even as fuels build."),
    "sig-smoke-gets-in-our-lungs": ("governance", 1,
        "Mounting health costs give fire and air agencies a shared case for prescribed-fire and smoke-readiness funding."),
    "sig-for-sale-public-land": ("communities", 1,
        "Sold parcels could open land for housing near crowded towns, the benefit sale backers point to."),
    "sig-pack-the-lab-or-quit": ("governance", 1,
        "USDA projects lower overhead; if the savings hold, some dollars could shift toward field work."),
    "sig-burn-boss-backstop": ("governance", -1,
        "The state now carries the claims risk, so one escaped burn could land on taxpayers and lawmakers."),
    "sig-raise-refilled-crews": ("governance", -1,
        "Permanent raises add a recurring cost that squeezes other programs when budgets stay flat."),
    "sig-states-take-the-wheel": ("workforce", -1,
        "State, county and Tribal staff stretch thin running work on land they do not own."),
    "sig-klamath-salmon-return": ("climate", -1,
        "Removing the dams also ended a source of carbon-free hydropower for the region."),
    "sig-california-cap-and-invest": ("wood", -1,
        "Forest offset projects pay owners to grow more and harvest later, trimming near-term log supply."),
    "sig-mass-timber-data-centers": ("water", -1,
        "The data centers inside these buildings draw heavily on local water and power."),
    "sig-family-forest-carbon": ("wood", -1,
        "Enrolled owners defer or lighten harvests, so local mills see less wood for a while."),
    "sig-canada-sink-flipped": ("wood", 1,
        "Shrinking Canadian supply lifts prices for U.S. mills and landowners, even as fire risk grows."),
    "sig-nm-reforestation-center": ("governance", -1,
        "Hardened, climate-matched seedlings cost more, so planting budgets cover fewer acres each year."),
    "sig-good-neighbor-540": ("recreation", -1,
        "Revenue-producing timber work can crowd trail and recreation projects off partner work lists."),
    "sig-divided-and-conquered": ("communities", 1,
        "Some land that changes hands becomes homes and tax base near growing towns."),
    "sig-nm-tree-deaths-tripled": ("wood", 1,
        "Salvage and biomass buyers get a pulse of dead timber where mills are close enough."),
    "sig-shrubland-conversion": ("water", 1,
        "With fewer trees drawing water, burned basins can yield more runoff for a time, though it arrives earlier."),
    "sig-zone-zero": ("workforce", -1,
        "Inspections and enforcement fall to local fire agencies that are already short of staff."),
    "sig-pulpwood-long-goodbye": ("climate", 1,
        "Owners who stop thinning may hold trees longer, storing more carbon for now."),
}
# ---- 2. valence: same-sign domain re-targets (not trade-offs) and primary +/-1 nudges
SECONDARY_RETARGET = {
    "sig-cow-creek-costewardship": ("health", 1,
        "Thinning and cultural burning restore open, diverse stands across ownership lines."),
    "sig-sharing-the-sacred-summit": ("workforce", 1,
        "Tribal hiring brings new rangers and interpreters with deep knowledge of the place."),
}
PRIMARY = {   # id -> new delta (|change| = 1)
    "sig-southern-pine-beetle-north": -1,
    "sig-paperwork-stalls-partners": -2,
    "sig-nm-reforestation-center": 2,
    "sig-wood-hits-the-gym": 1,
    "sig-cow-creek-costewardship": 1,
}

# ---- 3. drivers: id -> new immediate effects; dilemma options -> new effects (net 0), optional new text
DRIVER_EFFECTS = {
    "drv-regions-to-states": [("workforce", -2), ("partners", 1), ("governance", -1)],
    "drv-timber-push": [("wood", 2), ("workforce", -1), ("health", -1)],
    "drv-firesheds-fast-lane": [("fire", 1), ("governance", 1), ("partners", -2)],
    "drv-policy-pendulum": [("governance", 1), ("workforce", -1), ("partners", -1)],
    "drv-mass-timber-surge": [("wood", 2), ("climate", 1), ("workforce", -1)],
    "drv-carbon-boom": [("climate", 2), ("partners", 1), ("wood", -2)],
    "drv-algorithmic-forest": [("fire", 1), ("workforce", 1), ("governance", -1)],
    "drv-hand-it-to-states": [("governance", -2), ("partners", 1), ("recreation", -1)],
}
DILEMMA = {  # id -> list of (effects, new_text or None), in option order
    "drv-one-fire-service": [
        ([("fire", 1), ("health", -1)], None),
        ([("health", 1), ("governance", -1)], None),
        ([("fire", 1), ("workforce", -1)], None)],
    "drv-regions-to-states": [
        ([("partners", 1), ("governance", -1)], None),
        ([("governance", 1), ("partners", -1)], None),
        ([("workforce", 1), ("health", -1)], None)],
    "drv-lean-years": [
        ([("fire", 1), ("communities", 1), ("recreation", -2)], None),
        ([("partners", 1), ("fire", -1)], None),
        ([("workforce", 1), ("governance", 1), ("recreation", -2)], None)],
    "drv-record-fire-year": [
        ([("communities", 1), ("fire", -1)], None),
        ([("fire", 2), ("communities", -1), ("recreation", -1)], None),
        ([("fire", 1), ("health", -1)], None)],
    "drv-timber-push": [
        ([("wood", 1), ("communities", 1), ("fire", -2)], None),
        ([("fire", 1), ("health", 1), ("wood", -2)], None),
        ([("partners", 1), ("workforce", -1)], None)],
    "drv-firesheds-fast-lane": [
        ([("fire", 2), ("partners", -2)], None),
        ([("partners", 1), ("workforce", -1)], None),
        ([("governance", 1), ("fire", -1)], None)],
    "drv-policy-pendulum": [
        ([("workforce", 2), ("governance", -1), ("partners", -1)], None),
        ([("governance", 1), ("workforce", -1)], None),
        ([("governance", 2), ("fire", -1), ("workforce", -1)], None)],
    "drv-insurance-retreat": [
        ([("communities", 1), ("fire", -1)], None),
        ([("fire", 1), ("health", -1)], None),
        ([("fire", 1), ("governance", 1), ("communities", -2)], None)],
    "drv-mass-timber-surge": [
        ([("wood", 1), ("communities", 1), ("health", -2)], None),
        ([("fire", 1), ("health", 1), ("wood", -2)], None),
        ([("partners", 1), ("governance", -1)], None)],
    "drv-carbon-boom": [
        ([("climate", 2), ("wood", -2)],
         "Enroll forests in decades-long carbon contracts that pay well but lock in deferred harvest."),
        ([("climate", 1), ("fire", 1), ("governance", -2)], None),
        ([("wood", 1), ("climate", -1)], None)],
    "drv-river-runs-short": [
        ([("water", 1), ("fire", -1)], None),
        ([("fire", 1), ("partners", -1)], None),
        ([("water", 1), ("workforce", -1)], None)],
    "drv-fire-years": [
        ([("fire", 1), ("workforce", 1), ("governance", -2)], None),
        ([("partners", 1), ("workforce", -1)], None),
        ([("fire", 1), ("health", 1), ("recreation", -2)], None)],
    "drv-pathogen-arrives": [
        ([("health", 2), ("wood", -2)], None),
        ([("health", 1), ("partners", -1)], None),
        ([("wood", 1), ("climate", 1), ("health", -2)], None)],
    "drv-algorithmic-forest": [
        ([("fire", 2), ("partners", -1), ("workforce", -1)], None),
        ([("workforce", 1), ("governance", -1)], None),
        ([("partners", 1), ("communities", 1), ("governance", -2)], None)],
    "drv-tribal-co-management": [
        ([("partners", 2), ("governance", -1), ("workforce", -1)], None),
        ([("partners", 1), ("fire", 1), ("workforce", -2)], None),
        ([("partners", 1), ("fire", -1)], None)],
    "drv-hand-it-to-states": [
        ([("partners", 1), ("workforce", -1)], None),
        ([("governance", 1), ("partners", -1)], None),
        ([("communities", 1), ("governance", 1), ("recreation", -2)], None)],
}
# ---- 4. scenario
SCENARIO_START = {"scn-restoration-economy": {"governance": 4, "climate": 4}}


def eff(lst):
    return [{"domain": d, "delta": v} for d, v in lst]


def fmt_eff(lst):
    return ", ".join(f"{e['domain']} {e['delta']:+d}" for e in lst)


def load(p):
    with open(p) as f:
        return json.load(f)


def valence(cards):
    net = Counter()
    for s in cards:
        net[s["primary"]["domain"]] += s["primary"]["delta"]
        if s["secondary"].get("type") == "fixed":
            net[s["secondary"]["domain"]] += s["secondary"]["delta"]
    return net


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--orig", required=True)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    log = []
    all_before, all_after = [], []
    seen = set()
    for fn in ("signals-r1.json", "signals-r2.json", "signals-r3.json"):
        raw = load(os.path.join(a.orig, fn))
        cards = raw if isinstance(raw, list) else raw["signals"]
        all_before += json.loads(json.dumps(cards))
        for s in cards:
            sid = s["id"]
            p, se = s["primary"], s["secondary"]
            if sid in SECONDARY or sid in SECONDARY_RETARGET:
                d, v, t = SECONDARY.get(sid) or SECONDARY_RETARGET[sid]
                assert se["type"] == "fixed", sid
                assert d != p["domain"], sid
                if sid in SECONDARY:
                    assert (se["delta"] > 0) == (p["delta"] > 0), f"{sid} was not same-sign"
                    assert (v > 0) != (p["delta"] > 0), f"{sid} not a trade-off"
                assert len(t.split()) <= 25, sid
                kind = "trade-off" if sid in SECONDARY else "valence"
                log.append(f"- `{sid}` ({fn}, {kind}): secondary {se['domain']} {se['delta']:+d} → {d} {v:+d}; "
                           f"text \"{se.get('text', '')}\" → \"{t}\"")
                se["domain"], se["delta"], se["text"] = d, v, t
                seen.add(sid)
            if sid in PRIMARY:
                nv = PRIMARY[sid]
                assert abs(nv - p["delta"]) == 1 and nv != 0, sid
                log.append(f"- `{sid}` ({fn}, valence): primary {p['domain']} {p['delta']:+d} → {nv:+d}")
                p["delta"] = nv
                seen.add(sid)
        all_after += cards
        if a.apply:
            with open(os.path.join(CONTENT, fn), "w") as f:
                json.dump(raw, f, ensure_ascii=False, indent=2)
                f.write("\n")
    missing = (set(SECONDARY) | set(SECONDARY_RETARGET) | set(PRIMARY)) - seen
    assert not missing, missing

    ds = load(os.path.join(a.orig, "drivers-scenarios.json"))
    dlog = []
    for d in ds["drivers"]:
        if d["id"] in DRIVER_EFFECTS:
            new = eff(DRIVER_EFFECTS[d["id"]])
            dlog.append(f"- `{d['id']}` effects: {fmt_eff(d['effects'])} → {fmt_eff(new)}")
            d["effects"] = new
        if d["id"] in DILEMMA:
            spec = DILEMMA[d["id"]]
            assert len(spec) == len(d["dilemma"]["options"]), d["id"]
            for o, (e, txt) in zip(d["dilemma"]["options"], spec):
                new = eff(e)
                assert sum(x["delta"] for x in new) == 0, (d["id"], o["label"])
                line = f"- `{d['id']}` option \"{o['label']}\": {fmt_eff(o['effects'])} → {fmt_eff(new)}"
                if txt:
                    assert len(txt.split()) <= 25
                    line += f"; text \"{o['text']}\" → \"{txt}\""
                    o["text"] = txt
                o["effects"] = new
                dlog.append(line)
    slog = []
    for sc in ds["scenarios"]:
        if sc["id"] in SCENARIO_START:
            for k, v in SCENARIO_START[sc["id"]].items():
                slog.append(f"- `{sc['id']}` start {k}: {sc['start'][k]} → {v}")
                sc["start"][k] = v
    if a.apply:
        with open(os.path.join(CONTENT, "drivers-scenarios.json"), "w") as f:
            json.dump(ds, f, ensure_ascii=False, indent=2)
            f.write("\n")

    vb, va = valence(all_before), valence(all_after)
    same = sum(1 for s in all_after if s["secondary"].get("type") == "fixed"
               and (s["secondary"]["delta"] > 0) == (s["primary"]["delta"] > 0))
    fixed = sum(1 for s in all_after if s["secondary"].get("type") == "fixed")
    print(f"same-sign fixed secondaries: {same}/{fixed} (was 45/51); trade-off conversions: {len(SECONDARY)}")
    for dm in DOMAINS:
        print(f"  {dm:12s} net {vb[dm]:+3d} → {va[dm]:+3d}")
    drv = ds["drivers"]
    print("driver effect mean:", round(sum(sum(e["delta"] for e in d["effects"]) for d in drv) / len(drv), 2),
          " dilemma option nets:", sorted({sum(e['delta'] for e in o['effects']) for d in drv for o in d['dilemma']['options']}))
    if a.apply:
        md = ["# Balance edits to team content (2026-11-14)", "",
              "Balance edits by the game designer after simulation (see balance-report.md). Sources, signal text, "
              "primary domains and `reviewed` dates are unchanged. Format: id: before → after.", "",
              f"Signals: {len(SECONDARY)} same-sign secondaries turned into trade-offs "
              f"({same}/{fixed} fixed secondaries are now same-sign, was 45/51), "
              f"{len(SECONDARY_RETARGET)} secondaries re-targeted for valence, {len(PRIMARY)} primary deltas nudged by 1.", "",
              "Per-domain net (primary + fixed secondary): " +
              ", ".join(f"{dm} {vb[dm]:+d}→{va[dm]:+d}" for dm in DOMAINS), "",
              "## Signals", *log, "", "## Drivers and dilemmas (every option now nets 0)", *dlog, "", "## Scenarios", *slog, ""]
        with open(os.path.join(CONTENT, "balance-edits.md"), "w") as f:
            f.write("\n".join(md))
        print("applied; wrote balance-edits.md")


if __name__ == "__main__":
    main()
