"""Bot policies for the Forest Futures simulator.

random      — uniform choices; pledges everything to a random strategy; abilities at random.
selfish     — maximises its own mandate only (targets + guardrail, plus a small buffer bonus);
              indifferent to the shared outcome; backs only strategies that help its own domains.
cooperative — blends its mandate with the shared Resilience outcome (concave: points in Crisis
              domains are worth most); coordinates with other cooperative players in Council.
"""
from engine import clamp
from content import DOMAINS

THRESH = [2.5, 1.5, 0.01]          # value needed before spending a once-per-game ability, by era


def own_table(m):
    V = {d: [0.0] * 11 for d in DOMAINS}
    for t in m["targets"]:
        V[t["domain"]] = [-1.0 * max(0, t["min"] - x) + 0.15 * min(max(0, x - t["min"]), 2) for x in range(11)]
    g = m["guardrail"]
    V[g["domain"]] = [-2.0 * max(0, g["min"] - x) + 0.1 * min(max(0, x - g["min"]), 2) for x in range(11)]
    return V


SHARED = [x + 2.0 * min(x, 3) + 0.5 * min(x, 6) for x in range(11)]


class Bot:
    name = "base"
    council_style = "anchor"
    moves_pledges = True

    def __init__(self, rng, alpha=1.0, delayed_factor=0.85):
        self.rng = rng
        self.alpha = alpha
        self.delayed_factor = delayed_factor
        self._cache = None

    # ------------------------------------------------ valuation
    def table(self, p):
        key = id(p.mandate)
        if self._cache and self._cache[0] == key:
            return self._cache[1]
        own = own_table(p.mandate)
        if self.alpha >= 1.0:
            V = own
        else:
            a = self.alpha
            V = {d: [2.0 * a * own[d][x] + (1 - a) * SHARED[x] for x in range(11)] for d in DOMAINS}
        self._cache = (key, V)
        return V

    def g1(self, game, p, d, delta, signal=False):
        if signal and d in game.protected:
            return 0.0
        V = self.table(p)
        x = game.L[d]
        return V[d][clamp(x + delta)] - V[d][x]

    def gain(self, game, p, effects, signal=False):
        return sum(self.g1(game, p, e["domain"], e["delta"], signal) for e in effects)

    def jitter(self):
        return self.rng.random() * 1e-6

    def argmax(self, items, key):
        best, bv = None, None
        for it in items:
            v = key(it) + self.jitter()
            if bv is None or v > bv:
                best, bv = it, v
        return best, bv

    # ------------------------------------------------ dilemma
    def vote(self, game, p, opts):
        i, _ = self.argmax(range(len(opts)), lambda i: self.gain(game, p, opts[i].get("effects", [])))
        return i

    # ------------------------------------------------ signals
    def best_resolution(self, game, p, card):
        pr = card["primary"]
        v = self.g1(game, p, pr["domain"], pr["delta"], True)
        sec = card["secondary"]
        t = sec.get("type")
        amt = int(sec.get("amount", 1) or 1)
        others = [d for d in DOMAINS if d != pr["domain"]]
        free = [d for d in others if d not in game.protected]
        res = None
        if t == "fixed":
            v += self.g1(game, p, sec["domain"], sec["delta"], True)
        elif t in ("add", "remove") and free:
            dl = amt if t == "add" else -amt
            d, gv = self.argmax(free, lambda d: self.g1(game, p, d, dl, True))
            v += gv
            res = {"domain": d}
        elif t == "move" and len(free) >= 2:
            best = None
            for f in free:
                m = min(amt, game.L[f])
                if m <= 0:
                    continue
                lf = self.g1(game, p, f, -m, True)
                for to in free:
                    if to == f:
                        continue
                    gv = lf + self.g1(game, p, to, m, True) + self.jitter()
                    if best is None or gv > best[0]:
                        best = (gv, f, to)
            if best and best[0] > 0:
                v += best[0]
                res = {"from": best[1], "to": best[2]}
        elif t == "protect":
            d, dv = self.argmax(DOMAINS, lambda d: self.g1(game, p, d, 0) - self.g1(game, p, d, -1))
            v += 0.25 * dv
            res = {"domain": d}
        return v, res

    def play(self, game, p):
        best = None
        for i, c in enumerate(p.hand):
            v, res = self.best_resolution(game, p, c)
            v += self.jitter()
            if best is None or v > best[0]:
                best = (v, i, res)
        return best[1], best[2]

    def discards(self, game, p):
        out = []
        for i, c in enumerate(p.hand):
            v, _ = self.best_resolution(game, p, c)
            if v < 0 or (self.alpha >= 1.0 and v <= 0):
                out.append(i)
        return out

    # ------------------------------------------------ headline
    def pick_headline(self, game, lead, others):
        return self.rng.choice(others)

    def headline(self, game, p, amt):
        opts = [{d: amt} for d in DOMAINS]
        if amt == 2:
            opts += [{a: 1, b: 1} for i, a in enumerate(DOMAINS) for b in DOMAINS[i + 1:]]
        o, _ = self.argmax(opts, lambda o: sum(self.g1(game, p, d, v) for d, v in o.items()))
        return o

    # ------------------------------------------------ council
    def strategy_value(self, game, p, s):
        v = self.gain(game, p, s.get("effects", []))
        if s.get("delayed"):
            if game.era < 2:
                v += self.delayed_factor * self.gain(game, p, s["delayed"])
            elif game.rules.get("farDelayed") == "final":
                v += self.delayed_factor * self.gain(game, p, s["delayed"])
        return v

    def rank_strategies(self, game, p, market, vals, cost):
        ok = [s["id"] for s in market if vals[s["id"]] > 1e-9]
        return sorted(ok, key=lambda x: -(vals[x] / max(1, cost[x])))

    def would_back(self, game, p, sid, vals):
        return vals[sid] > 1e-9

    # ------------------------------------------------ abilities
    def thr(self, game):
        return THRESH[game.era]

    def use_cancel(self, game, p, d, delta):
        return -self.g1(game, p, d, delta) >= self.thr(game) and -self.g1(game, p, d, delta) > 0

    def use_decide(self, game, p, opts, win):
        i, v = self.argmax(range(len(opts)), lambda i: self.gain(game, p, opts[i].get("effects", [])))
        wv = self.gain(game, p, opts[win].get("effects", []))
        return i if v - wv >= self.thr(game) and v - wv > 0 else None

    def use_redraw(self, game, p):
        bv = max(self.best_resolution(game, p, c)[0] for c in p.hand) if p.hand else -9
        return bv < 0.5 or game.era == 2

    def use_protect(self, game, p):
        ch = p.ability.get("choices") or DOMAINS
        d, dv = self.argmax(ch, lambda d: self.g1(game, p, d, 0) - self.g1(game, p, d, -1))
        return d if (dv >= self.thr(game) or game.era == 2) and dv > 0 else None

    def use_boost(self, game, p):
        ch = p.ability.get("choices") or DOMAINS
        dl = p.ability.get("delta", 1)
        d, gv = self.argmax(ch, lambda d: self.g1(game, p, d, dl))
        return d if (gv >= self.thr(game) * dl or game.era == 2) and gv > 0 else None

    def use_move(self, game, p):
        amt = p.ability.get("amount", 2)
        best = None
        for f in DOMAINS:
            m = min(amt, game.L[f])
            if m <= 0:
                continue
            for t in DOMAINS:
                if t != f:
                    gv = self.g1(game, p, f, -m) + self.g1(game, p, t, m)
                    if best is None or gv > best[0]:
                        best = (gv, f, t)
        if best and best[0] > 0 and (best[0] >= self.thr(game) or game.era == 2):
            return best[1], best[2]
        return None

    def use_refresh(self, game, p, market):
        bad = sorted([s for s in market if self.strategy_value(game, p, s) <= 0],
                     key=lambda s: self.strategy_value(game, p, s))
        if len(bad) >= 2 or (bad and game.era == 2):
            return bad[:p.ability.get("count", 2)]
        return None

    def use_capacity_early(self, game, p, market):
        return game.era == 2

    def use_discount_early(self, game, p, market):
        if game.era != 2:
            return None
        tag = p.ability.get("tag")
        ok = [s for s in market if (not tag or tag in s.get("tags", [])) and self.strategy_value(game, p, s) > 0]
        if not ok:
            return None
        s, _ = self.argmax(ok, lambda s: self.strategy_value(game, p, s))
        return s

    def use_gap_ability(self, game, p, s):
        return self.strategy_value(game, p, s) > 0


class Selfish(Bot):
    name = "selfish"
    council_style = "anchor"

    def __init__(self, rng):
        super().__init__(rng, alpha=1.0)


class Cooperative(Bot):
    name = "coop"
    council_style = "coalition"

    def __init__(self, rng, alpha=0.5):
        super().__init__(rng, alpha=alpha)


class RandomBot(Bot):
    name = "random"
    council_style = "anchor"
    moves_pledges = False

    def __init__(self, rng):
        super().__init__(rng, alpha=1.0)
        self.ability_era = rng.randrange(3)

    def vote(self, game, p, opts):
        return self.rng.randrange(len(opts))

    def play(self, game, p):
        i = self.rng.randrange(len(p.hand))
        c = p.hand[i]
        t = c["secondary"].get("type")
        others = [d for d in DOMAINS if d != c["primary"]["domain"]]
        res = None
        if t in ("add", "remove", "protect"):
            res = {"domain": self.rng.choice(others if t != "protect" else DOMAINS)}
        elif t == "move":
            f, to = self.rng.sample(others, 2)
            res = {"from": f, "to": to}
        return i, res

    def discards(self, game, p):
        return [i for i in range(len(p.hand)) if self.rng.random() < 0.25]

    def headline(self, game, p, amt):
        return {self.rng.choice(DOMAINS): amt}

    def strategy_value(self, game, p, s):
        return self.rng.random()

    def rank_strategies(self, game, p, market, vals, cost):
        ids = [s["id"] for s in market]
        self.rng.shuffle(ids)
        return ids

    def would_back(self, game, p, sid, vals):
        return self.rng.random() < 0.5

    def use_cancel(self, game, p, d, delta):
        return self.rng.random() < 0.3 or game.era == 2

    def use_decide(self, game, p, opts, win):
        return self.rng.randrange(len(opts)) if game.era == self.ability_era else None

    def use_redraw(self, game, p):
        return game.era == self.ability_era

    def use_protect(self, game, p):
        return self.rng.choice(p.ability.get("choices") or DOMAINS) if game.era == self.ability_era else None

    def use_boost(self, game, p):
        return self.rng.choice(p.ability.get("choices") or DOMAINS) if game.era == self.ability_era else None

    def use_move(self, game, p):
        return tuple(self.rng.sample(DOMAINS, 2)) if game.era == self.ability_era else None

    def use_refresh(self, game, p, market):
        return self.rng.sample(market, min(2, len(market))) if game.era == self.ability_era else None

    def use_capacity_early(self, game, p, market):
        return game.era == self.ability_era

    def use_discount_early(self, game, p, market):
        tag = p.ability.get("tag")
        ok = [s for s in market if not tag or tag in s.get("tags", [])]
        return self.rng.choice(ok) if ok and game.era == self.ability_era else None

    def use_gap_ability(self, game, p, s):
        return False


POLICIES = {"random": RandomBot, "selfish": Selfish, "coop": Cooperative}


def make(name, rng):
    return POLICIES[name](rng)
