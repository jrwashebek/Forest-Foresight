"""Forest Futures rules engine (SPEC section 3), used by the balance simulator.

Rules implemented faithfully:
  3 eras (now, near, far); Era Lead rotates; delayed strategy effects mature at era open;
  1 Driver per era from the scenario pool, its effects, then a Dilemma vote (plurality, Lead breaks ties);
  Signal turns (Lead first), era-weighted draws, primary + secondary (fixed/add/remove/move/protect),
  optional discards, refill to hand size; Leadership Council with pooled pledges (capacity =
  base + band modifier(workforce) + band modifier(governance), min 1), fully funded strategies apply,
  other pledges and unspent capacity are lost; Headline of the Era (+2 to one domain or +1/+1, author
  chosen by the Lead); simultaneous cascades; System Collapse if >= N domains in Crisis; final outcome
  and mandates. Protect blocks Signal effects only, until end of era. All 9 ability effect types.
Choices the SPEC leaves open (documented in balance-report.md and rules):
  market is dealt fresh each Council (unfunded strategies go back to the deck); delayed effects bought
  in the Far era are "legacy" (do not mature in play); move/remove at 0 move only what exists.
"""
import random
from content import DOMAINS, HORIZONS, ERA_WEIGHTS

BANDS = [(0, 2, "Crisis"), (3, 4, "Strained"), (5, 6, "Stable"), (7, 8, "Thriving"), (9, 10, "Transformed")]


def band(x):
    for lo, hi, name in BANDS:
        if lo <= x <= hi:
            return name
    return "Transformed"


def clamp(x):
    return 0 if x < 0 else 10 if x > 10 else x


class Player:
    def __init__(self, seat, role, mandate, policy):
        self.seat, self.role, self.mandate, self.policy = seat, role, mandate, policy
        self.hand = []
        self.ability = role["ability"]["effect"]
        self.ability_used = False
        self.capacity = 0

    def has(self, typ, scope=None):
        if self.ability_used or self.ability.get("type") != typ:
            return False
        return scope is None or self.ability.get("scope") == scope


class Game:
    def __init__(self, content, policies, roles, scenario, rng, rounds=1, rules=None, mandate_ids=None,
                 trace=False):
        self.c = content
        self.rules = rules or content["rules"]
        self.rng = rng
        self.rounds = rounds
        self.trace = trace
        self.log = []
        self.scenario = scenario
        self.L = {d: clamp(int(scenario["start"][d])) for d in DOMAINS}
        self.protected = set()
        self.pending_delayed = []
        self.era = 0
        self.era_id = "now"
        self.lead = 0
        self.players = []
        for i, (pol, role) in enumerate(zip(policies, roles)):
            ms = role["mandates"]
            m = ms[mandate_ids[i]] if mandate_ids else rng.choice(ms)
            self.players.append(Player(i, role, m, pol))
        self.drivers = {d["id"]: d for d in content["drivers"]}
        self.decks = {h: [s for s in content["signals"] if s["horizon"] == h] for h in HORIZONS}
        for h in HORIZONS:
            rng.shuffle(self.decks[h])
        self.discard = {h: [] for h in HORIZONS}
        self.strat_deck = list(content["strategies"])
        rng.shuffle(self.strat_deck)
        self.stats = {"funded": [], "funded_ids": [], "capacity": [], "pledged_lost": [], "unspent": [],
                      "abilities": [], "cancels": 0, "cascade_hits": [], "dilemma": [], "rings": [],
                      "signals_played": [], "driver_ids": [], "by_source": {}}
        self.collapsed = False

    # ------------------------------------------------------------ helpers
    def note(self, *a):
        if self.trace:
            self.log.append(" ".join(str(x) for x in a))

    def crisis_count(self, L=None):
        L = L or self.L
        return sum(1 for d in DOMAINS if L[d] <= 2)

    def apply(self, d, delta, source):
        """Apply one domain effect. source in driver/dilemma/signal/strategy/delayed/headline/cascade/ability."""
        if delta == 0:
            return 0
        if source == "signal" and d in self.protected:
            self.note("   (protected)", d, delta)
            return 0
        if delta < 0 and source in ("driver", "signal", "cascade"):
            for p in self.order():
                if p.has("cancel", source) and p.policy.use_cancel(self, p, d, delta):
                    p.ability_used = True
                    self.stats["abilities"].append((p.role["id"], "cancel-" + source, self.era))
                    self.stats["cancels"] += 1
                    self.note("   CANCEL by", p.role["title"], d, delta)
                    return 0
        old = self.L[d]
        self.L[d] = clamp(old + delta)
        self.note("  ", source, d, f"{old}->{self.L[d]}")
        bs = self.stats["by_source"]
        bs[source] = bs.get(source, 0) + (self.L[d] - old)
        return self.L[d] - old

    def order(self):
        n = len(self.players)
        return [self.players[(self.lead + i) % n] for i in range(n)]

    def draw_signal(self):
        w = ERA_WEIGHTS[self.era_id]
        hs = list(HORIZONS)
        for _ in range(6):
            h = self.rng.choices(hs, [w[x] for x in hs])[0]
            if not self.decks[h] and self.discard[h]:
                self.decks[h] = self.discard[h]
                self.discard[h] = []
                self.rng.shuffle(self.decks[h])
            if self.decks[h]:
                return self.decks[h].pop()
        for h in hs:
            if self.decks[h]:
                return self.decks[h].pop()
        return None

    def draw_from(self, h):
        if not self.decks[h] and self.discard[h]:
            self.decks[h] = self.discard[h]; self.discard[h] = []; self.rng.shuffle(self.decks[h])
        return self.decks[h].pop() if self.decks[h] else self.draw_signal()

    def refill(self, p):
        while len(p.hand) < self.rules.get("handSize", 3):
            s = self.draw_signal()
            if s is None:
                break
            p.hand.append(s)

    def capacity_mod(self, d):
        return self.rules["capacityModifiers"][band(self.L[d])]

    # ------------------------------------------------------------ phases
    def run(self):
        for p in self.order():
            self.refill(p)
        for e, eid in enumerate(HORIZONS):
            self.era, self.era_id = e, eid
            self.lead = e % len(self.players)
            self.protected = set()
            self.note(f"== ERA {eid} lead={self.players[self.lead].role['title']}", dict(self.L))
            # 1. delayed effects mature
            for d, v in self.pending_delayed:
                self.apply(d, v, "delayed")
            self.pending_delayed = []
            # 2. driver + dilemma
            self.phase_driver()
            # protect abilities are declared once the driver is known
            for p in self.order():
                if p.has("protect"):
                    d = p.policy.use_protect(self, p)
                    if d:
                        p.ability_used = True
                        self.protected.add(d)
                        self.stats["abilities"].append((p.role["id"], "protect", e))
            # 3. signals
            for _ in range(self.rounds):
                for p in self.order():
                    self.signal_turn(p)
            # 4. council
            self.phase_council()
            # 5. headline
            self.phase_headline()
            # 6. cascades + ring + collapse
            self.phase_cascades()
            self.stats["rings"].append(dict(self.L))
            if self.crisis_count() >= self.rules["collapseCrisisCount"]:
                self.collapsed = True
                self.note("!! SYSTEM COLLAPSE")
                break
        if self.rules.get("farDelayed") == "final" and not self.collapsed:
            for d, v in self.pending_delayed:
                self.apply(d, v, "delayed")
        return self.result()

    def phase_driver(self):
        pool = self.scenario.get("drivers", {}).get(self.era_id) or \
            [d["id"] for d in self.c["drivers"] if d["horizon"] == self.era_id]
        pool = [x for x in pool if x in self.drivers]
        if not pool:
            return
        drv = self.drivers[self.rng.choice(pool)]
        self.stats["driver_ids"].append(drv["id"])
        self.note(" DRIVER", drv["id"])
        for ef in drv.get("effects", []):
            self.apply(ef["domain"], ef["delta"], "driver")
        opts = drv.get("dilemma", {}).get("options", [])
        if not opts:
            return
        votes = {p.seat: p.policy.vote(self, p, opts) for p in self.players}
        tally = [0] * len(opts)
        for v in votes.values():
            tally[v] += 1
        top = max(tally)
        tied = [i for i, t in enumerate(tally) if t == top]
        lead = self.players[self.lead]
        if len(tied) == 1:
            win = tied[0]
        elif votes[lead.seat] in tied:
            win = votes[lead.seat]
        else:
            win = lead.policy.vote(self, lead, [opts[i] for i in tied])
            win = tied[win]
        for p in self.order():
            if p.has("decide"):
                alt = p.policy.use_decide(self, p, opts, win)
                if alt is not None and alt != win:
                    p.ability_used = True
                    self.stats["abilities"].append((p.role["id"], "decide", self.era))
                    win = alt
                    break
        self.stats["dilemma"].append((drv["id"], win))
        for ef in opts[win].get("effects", []):
            self.apply(ef["domain"], ef["delta"], "dilemma")

    def signal_turn(self, p):
        if p.has("redraw") and p.policy.use_redraw(self, p):
            p.ability_used = True
            self.stats["abilities"].append((p.role["id"], "redraw", self.era))
            for s in p.hand:
                self.discard[s["horizon"]].append(s)
            h = p.ability.get("horizon")
            p.hand = [self.draw_from(h) if h else self.draw_signal() for _ in range(self.rules.get("handSize", 3))]
            p.hand = [s for s in p.hand if s]
        if not p.hand:
            self.refill(p)
            if not p.hand:
                return
        idx, res = p.policy.play(self, p)
        card = p.hand.pop(idx)
        self.stats["signals_played"].append(card["id"])
        self.note(" SIGNAL", p.role["title"], card["id"], card["primary"], card["secondary"].get("type"), res)
        pr = card["primary"]
        self.apply(pr["domain"], pr["delta"], "signal")
        sec = card["secondary"]
        t = sec.get("type")
        amt = int(sec.get("amount", 1) or 1)
        if t == "fixed":
            self.apply(sec["domain"], sec["delta"], "signal")
        elif t == "add" and res:
            self.apply(res["domain"], amt, "signal")
        elif t == "remove" and res:
            self.apply(res["domain"], -amt, "signal")
        elif t == "move" and res:
            f, to = res["from"], res["to"]
            if f not in self.protected and to not in self.protected:
                moved = -self.apply(f, -min(amt, self.L[f]), "signal")
                if moved:
                    self.apply(to, moved, "signal")
        elif t == "protect" and res:
            self.protected.add(res["domain"])
        self.discard[card["horizon"]].append(card)
        for i in sorted(p.policy.discards(self, p), reverse=True):
            s = p.hand.pop(i)
            self.discard[s["horizon"]].append(s)
        self.refill(p)

    # ------------------------------------------------------------ council
    def phase_council(self):
        R = self.rules
        n = R.get("marketSize", 5)
        market = [self.strat_deck.pop() for _ in range(min(n, len(self.strat_deck)))]
        base = R.get("capacityBaseByPlayers", {}).get(str(len(self.players)), R["capacityBase"])
        for p in self.players:
            p.capacity = max(R.get("capacityMin", 1), base + self.capacity_mod("workforce")
                             + self.capacity_mod("governance"))
        # refresh-market ability (before pledging)
        for p in self.order():
            if p.has("refresh-market"):
                k = p.policy.use_refresh(self, p, market)
                if k:
                    p.ability_used = True
                    self.stats["abilities"].append((p.role["id"], "refresh-market", self.era))
                    for s in k[:p.ability.get("count", 2)]:
                        market.remove(s)
                        self.strat_deck.insert(0, s)
                        if self.strat_deck:
                            market.append(self.strat_deck.pop())
        cost = {s["id"]: s["cost"] for s in market}
        # pre-negotiation abilities (capacity boosts the pledger; discount on a chosen strategy)
        for p in self.order():
            if p.has("capacity") and p.policy.use_capacity_early(self, p, market):
                p.ability_used = True
                p.capacity += p.ability.get("amount", 2)
                self.stats["abilities"].append((p.role["id"], "capacity", self.era))
            if p.has("discount"):
                s = p.policy.use_discount_early(self, p, market)
                if s:
                    p.ability_used = True
                    cost[s["id"]] = max(0, cost[s["id"]] - p.ability.get("amount", 2))
                    self.stats["abilities"].append((p.role["id"], "discount", self.era))
        total_cap = sum(p.capacity for p in self.players)
        pledges = negotiate(self, market, cost)
        # post-negotiation abilities: close a gap
        for p in self.order():
            if p.has("capacity") or p.has("discount"):
                close_gap_with_ability(self, p, market, cost, pledges)
        funded, lost = [], 0
        for s in market:
            got = sum(pledges[s["id"]].values())
            if got >= cost[s["id"]]:
                funded.append(s)
            else:
                lost += got
        spent = sum(sum(pledges[s["id"]].values()) for s in market)
        unspent = sum(p.capacity for p in self.players) - spent
        self.stats["funded"].append(len(funded))
        self.stats["capacity"].append(total_cap)
        self.stats["pledged_lost"].append(lost)
        self.stats["unspent"].append(unspent)
        for s in funded:
            self.stats["funded_ids"].append(s["id"])
            self.note(" FUNDED", s["id"])
            for ef in s.get("effects", []):
                self.apply(ef["domain"], ef["delta"], "strategy")
            for ef in s.get("delayed", []) or []:
                self.pending_delayed.append((ef["domain"], ef["delta"]))
        # unfunded strategies return to the bottom of the deck; funded ones are done
        fids = {s["id"] for s in funded}
        for s in market:
            if s["id"] not in fids:
                self.strat_deck.insert(0, s)

    # ------------------------------------------------------------ headline & cascades
    def phase_headline(self):
        others = [p for p in self.players if p.seat != self.lead]
        if others:
            lead = self.players[self.lead]
            author = lead.policy.pick_headline(self, lead, others)
            amt = self.rules.get("headlineInfluence", 2)
            for d, v in author.policy.headline(self, author, amt).items():
                self.apply(d, v, "headline")
        # timing abilities (boost / move) resolve at end of era, before cascades
        for p in self.order():
            if p.has("boost"):
                d = p.policy.use_boost(self, p)
                if d:
                    p.ability_used = True
                    self.apply(d, p.ability.get("delta", 1), "ability")
                    self.stats["abilities"].append((p.role["id"], "boost", self.era))
            if p.has("move"):
                mv = p.policy.use_move(self, p)
                if mv:
                    p.ability_used = True
                    f, t = mv
                    moved = -self.apply(f, -min(p.ability.get("amount", 2), self.L[f]), "ability")
                    self.apply(t, moved, "ability")
                    self.stats["abilities"].append((p.role["id"], "move", self.era))

    def phase_cascades(self):
        snap = dict(self.L)
        hits = []
        for cas in self.c["cascades"]:
            w = cas["when"]
            v = snap[w["domain"]]
            ok = ("lte" in w and v <= w["lte"]) or ("gte" in w and v >= w["gte"])
            if ok:
                hits.append(cas["id"])
                for ef in cas["effects"]:
                    self.apply(ef["domain"], ef["delta"], "cascade")
        self.stats["cascade_hits"].append(hits)

    # ------------------------------------------------------------ outcome
    def result(self):
        R = dict(self.rules["outcome"])
        if self.rounds >= 2:                       # Deep length: tougher Resilient floor
            R.update(self.rules.get("outcomeDeep", {}))
        idx = sum(self.L.values()) / len(DOMAINS)
        crisis = self.crisis_count()
        low = min(self.L.values())
        # floors: lowest domain allowed for the outcome (SPEC v0.1 equivalent: resilientFloor 3, holdingFloor 0)
        rf, hf = R.get("resilientFloor", 3), R.get("holdingFloor", 0)
        if self.collapsed:
            outcome = "Unraveling"
        elif idx >= R["resilient"] and low >= rf:
            outcome = "Resilient"
        elif idx >= R["holding"] and low >= hf:
            outcome = "Holding"
        else:
            outcome = "Unraveling"
        roles = []
        for p in self.players:
            m = p.mandate
            met = [self.L[t["domain"]] >= t["min"] for t in m["targets"]]
            g = self.L[m["guardrail"]["domain"]] >= m["guardrail"]["min"]
            roles.append({"role": p.role["id"], "variant": m["id"], "policy": p.policy.name,
                          "met": sum(met) + int(g), "fulfilled": all(met) and g, "flags": met + [g],
                          "winner": all(met) and g and outcome != "Unraveling"})
        return {"outcome": outcome, "collapsed": self.collapsed, "index": idx, "crisis": crisis,
                "levels": dict(self.L), "roles": roles, "stats": self.stats,
                "eras_played": len(self.stats["rings"])}


# ---------------------------------------------------------------- council negotiation
def negotiate(game, market, cost):
    """Open, timed pledging. Returns pledges[strategy_id][seat] = amount.

    1. Anchors: selfish & random players pledge toward their own favourite(s).
    2. Coalition: cooperative players pool remaining capacity on the bundle that maximises their
       combined value, counting what anchors already put in.
    3. Lock-in: before the timer ends, anyone holding stranded pledges or spare capacity may move it
       to an unfunded strategy they value if that completes it.
    """
    pledges = {s["id"]: {} for s in market}
    free = {p.seat: p.capacity for p in game.players}
    val = {p.seat: {s["id"]: p.policy.strategy_value(game, p, s) for s in market} for p in game.players}

    def got(sid):
        return sum(pledges[sid].values())

    def need(sid):
        return max(0, cost[sid] - got(sid))

    def put(seat, sid, amt):
        amt = min(amt, free[seat], need(sid))
        if amt > 0:
            pledges[sid][seat] = pledges[sid].get(seat, 0) + amt
            free[seat] -= amt
        return amt

    order = game.order()
    # 1. anchors
    for p in order:
        if p.policy.council_style == "anchor":
            prefs = p.policy.rank_strategies(game, p, market, val[p.seat], cost)
            for sid in prefs:
                if free[p.seat] <= 0:
                    break
                put(p.seat, sid, free[p.seat])
    # 2. coalition
    coop = [p for p in order if p.policy.council_style == "coalition"]
    if coop:
        pool = sum(free[p.seat] for p in coop)
        ids = [s["id"] for s in market if need(s["id"]) > 0]
        best, best_v = [], 0.0
        for mask in range(1, 1 << len(ids)):
            sel = [ids[i] for i in range(len(ids)) if mask >> i & 1]
            nd = sum(need(x) for x in sel)
            if nd > pool:
                continue
            v = sum(sum(val[p.seat][x] for p in coop) for x in sel)
            if all(sum(val[p.seat][x] for p in coop) > 0 for x in sel) and v > best_v + 1e-9:
                best, best_v = sel, v
        for sid in sorted(best, key=lambda x: -need(x)):
            for p in sorted(coop, key=lambda q: -free[q.seat]):
                if need(sid) <= 0:
                    break
                put(p.seat, sid, free[p.seat])
    # 3. lock-in consolidation
    for _ in range(3):
        changed = False
        unfunded = sorted([s["id"] for s in market if need(s["id"]) > 0], key=lambda x: (need(x), -got(x)))
        for sid in unfunded:
            nd = need(sid)
            if nd <= 0:
                continue
            # movable = spare capacity + pledges stranded on other unfunded strategies
            sup = []
            for p in order:
                if not p.policy.would_back(game, p, sid, val[p.seat]):
                    continue
                stranded = sum(a for x, row in pledges.items() if x != sid and need(x) > 0
                               for seat, a in row.items() if seat == p.seat)
                movable = free[p.seat] + (stranded if p.policy.moves_pledges else 0)
                if movable > 0:
                    sup.append((p, movable))
            if sum(m for _, m in sup) < nd:
                continue
            for p, _ in sup:
                if need(sid) <= 0:
                    break
                put(p.seat, sid, free[p.seat])
                if need(sid) > 0 and p.policy.moves_pledges:
                    for x, row in pledges.items():
                        if x != sid and need(x) > 0 and row.get(p.seat):
                            take = min(row[p.seat], need(sid))
                            row[p.seat] -= take
                            free[p.seat] += take
                            put(p.seat, sid, take)
                            if need(sid) <= 0:
                                break
            changed = True
        if not changed:
            break
    return pledges


def close_gap_with_ability(game, p, market, cost, pledges):
    typ = p.ability.get("type")
    amt = p.ability.get("amount", 2)
    for s in sorted(market, key=lambda s: -p.policy.strategy_value(game, p, s)):
        sid = s["id"]
        gap = cost[sid] - sum(pledges[sid].values())
        if gap <= 0 or gap > amt:
            continue
        if typ == "discount" and p.ability.get("tag") and p.ability["tag"] not in s.get("tags", []):
            continue
        if not p.policy.use_gap_ability(game, p, s):
            continue
        p.ability_used = True
        game.stats["abilities"].append((p.role["id"], typ + "-gap", game.era))
        if typ == "capacity":
            p.capacity += amt
            pledges[sid][p.seat] = pledges[sid].get(p.seat, 0) + gap
        else:
            cost[sid] = max(0, cost[sid] - amt)
        return
