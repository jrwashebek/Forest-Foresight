// Forest Futures game engine — pure & deterministic: reduce(content, state, action) → new state.
// No DOM, no clock, no Math.random. All randomness comes from the seeded RNG stored in state.rng.
import { Rng, seedFromCode, mandateVariant, CODE_RE } from "./rng.js";
import {
  rulesOf, isCrisis, capacityModifier, clamp, indexBy, active, fingerprint, wordCount, outcomeRules, capacityBaseFor,
} from "./content.js";

export const ENGINE_VERSION = 1;

export class EngineError extends Error {
  constructor(msg) { super(msg); this.name = "EngineError"; }
}
const fail = (msg) => { throw new EngineError(msg); };

export const PHASES = ["era-open", "driver", "signals", "council", "headline", "cascades", "over"];

// ---------------------------------------------------------------------------
// Lookups (memoised per content object)
// ---------------------------------------------------------------------------
const lookCache = new WeakMap();
export function lookups(content) {
  let L = lookCache.get(content);
  if (!L) {
    L = {
      domains: indexBy(content.domains), signals: indexBy(content.signals), drivers: indexBy(content.drivers),
      strategies: indexBy(content.strategies), roles: indexBy(content.roles), scenarios: indexBy(content.scenarios),
      cascades: indexBy(content.cascades), domainIds: (content.domains || []).map((d) => d.id),
      eraIds: (content.eras || []).map((e) => e.id),
    };
    lookCache.set(content, L);
  }
  return L;
}

const clone = (s) => JSON.parse(JSON.stringify(s));

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
/**
 * opts: { code, scenarioId, length: "standard"|"deep", players: [{ name, roleId }] }
 */
export function createGame(content, opts) {
  const L = lookups(content);
  const rules = rulesOf(content);
  const code = String(opts.code || "").toUpperCase();
  if (!CODE_RE.test(code)) fail("Game code must be 6 characters from the game-code alphabet.");
  const scn = L.scenarios[opts.scenarioId];
  if (!scn || scn.status === "retired") fail("Choose an active scenario.");
  const players = opts.players || [];
  if (players.length < 1 || players.length > 12) fail("A game needs 1–12 players (3–7 recommended).");
  const roleSeen = new Set();
  players.forEach((p, i) => {
    if (!p.name || !String(p.name).trim()) fail(`Seat ${i + 1} needs a name.`);
    const r = L.roles[p.roleId];
    if (!r || r.status === "retired") fail(`Seat ${i + 1} needs an active role.`);
    if (roleSeen.has(p.roleId)) fail(`Two players can't share the role "${r.title}".`);
    roleSeen.add(p.roleId);
  });
  const length = opts.length === "deep" ? "deep" : "standard";
  const cond = {};
  for (const id of L.domainIds) cond[id] = clamp(Math.round(+((scn.start || {})[id] ?? 5)));
  const state = {
    v: ENGINE_VERSION,
    code, fp: fingerprint(content), scenarioId: scn.id, length, autoLock: !!opts.autoLock,
    rounds: Math.max(1, Math.floor(+rules.signalRounds[length] || (length === "deep" ? 2 : 1))),
    rng: seedFromCode(code),
    players: players.map((p) => ({ name: String(p.name).trim().slice(0, 40), roleId: p.roleId, abilityUsed: false })),
    start: { ...cond }, cond, rings: [], era: 0, lead: 0, phase: "era-open",
    hands: players.map(() => []), out: [], usedDrivers: [], funded: [], protected: [],
    pendingDelayed: [], matured: [], legacy: [], marketCarry: [],
    driver: null, turn: null, council: null, headline: null, cascade: null,
    batch: null, seq: 0, fx: null,
    story: [], insights: [], outcome: null, collapsed: false,
  };
  const rng = new Rng(state.rng);
  for (let s = 0; s < players.length; s++) for (let k = 0; k < rules.handSize; k++) drawSignal(content, state, rng, s, null);
  state.rng = rng.s;
  state.story.push({ era: 0, k: "start", scenario: scn.id });
  return state;
}

// ---------------------------------------------------------------------------
// Draws
// ---------------------------------------------------------------------------
function eraWeights(content, eraIdx) {
  const e = (content.eras || [])[eraIdx] || {};
  return e.weights || { now: 1 };
}

function pickHorizon(rng, weights, availableBy) {
  const entries = Object.entries(weights).filter(([h, w]) => +w > 0 && (availableBy[h] || []).length);
  if (!entries.length) {
    const any = Object.keys(availableBy).filter((h) => availableBy[h].length);
    return any.length ? any[rng.int(any.length)] : null;
  }
  const total = entries.reduce((a, [, w]) => a + +w, 0);
  let r = rng.next() * total;
  for (const [h, w] of entries) { r -= +w; if (r < 0) return h; }
  return entries[entries.length - 1][0];
}

function availableSignals(content, state) {
  const inHand = new Set(state.hands.flat());
  const out = new Set(state.out);
  return active(content.signals).filter((s) => !inHand.has(s.id) && !out.has(s.id));
}

/** Draw one signal into seat's hand. horizon: forced horizon id, or null for era-weighted mix. */
export function drawSignal(content, state, rng, seat, horizon) {
  let avail = availableSignals(content, state);
  if (!avail.length && state.out.length) { state.out = []; avail = availableSignals(content, state); } // reshuffle discards
  if (!avail.length) return null;
  const by = {};
  for (const s of avail) (by[s.horizon] = by[s.horizon] || []).push(s);
  let h = horizon && (by[horizon] || []).length ? horizon : null;
  if (!h) h = pickHorizon(rng, horizon ? { [horizon]: 1 } : eraWeights(content, state.era), by);
  if (!h) return null;
  const pool = by[h];
  const card = pool[rng.int(pool.length)];
  state.hands[seat].push(card.id);
  return card.id;
}

function drawDriver(content, state, rng) {
  const L = lookups(content);
  const eraId = L.eraIds[state.era];
  const scn = L.scenarios[state.scenarioId] || {};
  const used = new Set(state.usedDrivers);
  const ok = (d) => d && d.status !== "retired" && !used.has(d.id);
  let pool = ((scn.drivers || {})[eraId] || []).map((id) => L.drivers[id]).filter(ok);
  if (!pool.length) pool = active(content.drivers).filter((d) => d.horizon === eraId && ok(d));
  if (!pool.length) pool = active(content.drivers).filter(ok);
  if (!pool.length) pool = active(content.drivers);
  return pool.length ? pool[rng.int(pool.length)] : null;
}

function drawMarket(content, state, rng, count, exclude = []) {
  const ex = new Set([...state.funded, ...exclude]);
  const pool = active(content.strategies).filter((s) => !ex.has(s.id));
  return rng.shuffle(pool).slice(0, count).map((s) => s.id);
}

function dealMarket(content, state, rng, count) {
  const L = lookups(content);
  const carry = rulesOf(content).marketRefresh === "keep"
    ? (state.marketCarry || []).filter((id) => L.strategies[id] && L.strategies[id].status !== "retired" && !state.funded.includes(id)).slice(0, count)
    : [];
  return carry.concat(drawMarket(content, state, rng, count - carry.length, carry));
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------
function newBatch(state, scope, label) {
  state.seq += 1;
  state.batch = { id: state.seq, scope, label, changes: [] };
  return state.batch;
}

function addFx(state, label, d, from, to, note) {
  if (!state.fx || state.fx.seq !== state.seq) state.fx = { seq: state.seq, label, changes: [] };
  state.fx.changes.push(note ? { d, from, to, note } : { d, from, to });
}

/**
 * Apply domain effects. opts: { scope, label, signal: bool (respect protection), batch: bool }.
 * Returns the applied changes [{domain, delta(requested), applied, from, to, blocked}]
 */
function applyEffects(content, state, effects, { scope, label, signal = false, batch = true } = {}) {
  const L = lookups(content);
  const b = batch ? (state.batch && state.batch.keep ? state.batch : newBatch(state, scope, label)) : null;
  if (!batch) state.seq += 1;
  const res = [];
  for (const e of effects || []) {
    if (!e || !L.domains[e.domain] || !e.delta) continue;
    const from = state.cond[e.domain];
    if (signal && state.protected.includes(e.domain)) {
      res.push({ domain: e.domain, delta: e.delta, applied: 0, from, to: from, blocked: true });
      addFx(state, label, e.domain, from, from, "protected");
      continue;
    }
    const to = clamp(from + e.delta);
    state.cond[e.domain] = to;
    const ch = { domain: e.domain, delta: e.delta, applied: to - from, from, to };
    res.push(ch);
    if (b) b.changes.push({ ...ch });
    addFx(state, label, e.domain, from, to);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------
export function seatOrder(state) {
  const n = state.players.length;
  return Array.from({ length: n }, (_, i) => (state.lead + i) % n);
}

export function baseCapacity(content, state) {
  const rules = rulesOf(content);
  const wf = state.cond.workforce, gv = state.cond.governance;
  const m = (v) => (v == null ? 0 : capacityModifier(content, v));
  return Math.max(rules.capacityMin ?? 1, capacityBaseFor(content, state.players.length) + m(wf) + m(gv));
}

export function effectiveCost(content, state, strategyId) {
  const s = lookups(content).strategies[strategyId];
  if (!s) return Infinity;
  const disc = (state.council && state.council.discounts && state.council.discounts[strategyId]) || 0;
  return Math.max(1, s.cost - disc); // a discount never makes a strategy free
}

export function pledgedTotal(state, strategyId) {
  const p = state.council && state.council.pledges[strategyId];
  return p ? p.reduce((a, b) => a + b, 0) : 0;
}

export function seatSpent(state, seat) {
  if (!state.council) return 0;
  let t = 0;
  for (const id of Object.keys(state.council.pledges)) t += state.council.pledges[id][seat] || 0;
  return t;
}

export function resilienceIndex(content, cond) {
  const ids = lookups(content).domainIds;
  if (!ids.length) return 0;
  return ids.reduce((a, id) => a + (cond[id] || 0), 0) / ids.length;
}

export function crisisDomains(content, cond) {
  return lookups(content).domainIds.filter((id) => isCrisis(content, cond[id]));
}

/**
 * Resilient = index ≥ resilient AND every domain ≥ resilientFloor; Holding = index ≥ holding AND every
 * domain ≥ holdingFloor; else Unraveling (always Unraveling after a collapse). Deep games use outcomeDeep.
 */
export function outcomeTier(content, cond, collapsed, length = "standard") {
  const R = outcomeRules(content, length);
  const index = resilienceIndex(content, cond);
  const crisis = crisisDomains(content, cond);
  const ids = lookups(content).domainIds;
  const low = ids.length ? Math.min(...ids.map((id) => cond[id] ?? 0)) : 0;
  let tier = "unraveling";
  if (!collapsed) {
    if (index >= R.resilient && low >= R.resilientFloor) tier = "resilient";
    else if (index >= R.holding && low >= R.holdingFloor) tier = "holding";
  }
  return { tier, index: Math.round(index * 10) / 10, crisis, collapsed: !!collapsed, low, thresholds: R };
}

export function mandateFor(content, code, seat, roleId) {
  const role = lookups(content).roles[roleId];
  if (!role || !role.mandates || !role.mandates.length) return null;
  const v = mandateVariant(code, seat + 1, roleId, role.mandates.length);
  return role.mandates[v];
}

export function mandateProgress(content, cond, mandate) {
  if (!mandate) return { met: 0, total: 0, checks: [], fulfilled: false };
  const checks = (mandate.targets || []).map((t) => ({ kind: "target", domain: t.domain, min: t.min, value: cond[t.domain], ok: (cond[t.domain] ?? 0) >= t.min }));
  if (mandate.guardrail) {
    const g = mandate.guardrail;
    checks.push({ kind: "guardrail", domain: g.domain, min: g.min, value: cond[g.domain], ok: (cond[g.domain] ?? 0) >= g.min });
  }
  const met = checks.filter((c) => c.ok).length;
  return { met, total: checks.length, checks, fulfilled: met === checks.length && checks.length > 0 };
}

export function finalResults(content, state) {
  const L = lookups(content);
  const out = outcomeTier(content, state.cond, state.collapsed, state.length);
  const players = state.players.map((p, seat) => {
    const mandate = mandateFor(content, state.code, seat, p.roleId);
    const prog = mandateProgress(content, state.cond, mandate);
    const role = L.roles[p.roleId] || {};
    return {
      seat, name: p.name, roleId: p.roleId, mandate, ...prog,
      winner: prog.fulfilled && out.tier !== "unraveling",
      future: (role.future || {})[out.tier] || "",
    };
  });
  return { ...out, collective: out.tier === "resilient", players };
}

/**
 * Valid choices for the waiting player-chosen secondary effect. Each map is domain → null (ok) or a
 * short reason it can't be chosen. anyValid=false means the effect can be skipped.
 */
export function secondaryTargets(content, state) {
  const L = lookups(content);
  const t = state.turn;
  const sig = t && t.card ? L.signals[t.card] : null;
  const sec = sig && sig.secondary;
  const out = { type: sec ? sec.type : null, domain: {}, from: {}, to: {}, anyValid: false };
  if (!sec) return out;
  const prot = (d) => (state.protected.includes(d) ? "protected this era" : null);
  for (const d of L.domainIds) {
    const v = state.cond[d];
    if (sec.type === "add") out.domain[d] = d === sig.primary.domain ? "the primary effect's domain" : prot(d) || (v >= 10 ? "already at 10" : null);
    else if (sec.type === "remove") out.domain[d] = d === sig.primary.domain ? "the primary effect's domain" : prot(d) || (v <= 0 ? "already at 0" : null);
    else if (sec.type === "protect") out.domain[d] = state.protected.includes(d) ? "already protected" : null;
    else if (sec.type === "move") {
      out.from[d] = prot(d) || (v <= 0 ? "at 0: nothing to move" : null);
      out.to[d] = prot(d) || (v >= 10 ? "already at 10" : null);
    }
  }
  if (sec.type === "move") {
    const froms = L.domainIds.filter((d) => !out.from[d]);
    out.anyValid = froms.some((f) => L.domainIds.some((t2) => t2 !== f && !out.to[t2]));
  } else out.anyValid = L.domainIds.some((d) => !out.domain[d]);
  return out;
}

export function currentSeat(state) {
  if (state.phase !== "signals" || !state.turn || state.turn.done) return null;
  return state.turn.order[state.turn.pos];
}

export function cascadePreview(content, state) {
  return (content.cascades || []).filter((c) => c && c.status !== "retired" && cascadeFires(c, state.cond));
}

export function cascadeFires(c, cond) {
  const w = c.when || {};
  const v = cond[w.domain];
  if (v == null) return false;
  if (w.lte != null) return v <= w.lte;
  if (w.gte != null) return v >= w.gte;
  if (w.lt != null) return v < w.lt;
  if (w.gt != null) return v > w.gt;
  return false;
}

export function dilemmaTally(state, nOptions) {
  const counts = Array.from({ length: nOptions }, () => 0);
  for (const v of (state.driver && state.driver.votes) || []) if (v != null && v >= 0 && v < nOptions) counts[v]++;
  return counts;
}

/** What a seat's ability can do right now → { ok, reason } */
export function abilityAvailability(content, state, seat) {
  const p = state.players[seat];
  if (!p) return { ok: false, reason: "No such seat." };
  const role = lookups(content).roles[p.roleId];
  const eff = role && role.ability && role.ability.effect;
  if (!eff) return { ok: false, reason: "This role has no ability." };
  if (p.abilityUsed) return { ok: false, reason: "Already used this game." };
  if (state.phase === "over") return { ok: false, reason: "The game is over." };
  const c = state.council;
  switch (eff.type) {
    case "capacity": case "refresh-market":
      return state.phase === "council" && c && !c.locked ? { ok: true } : { ok: false, reason: "Use during the Leadership Council, before Lock." };
    case "discount": {
      if (!(state.phase === "council" && c && !c.locked)) return { ok: false, reason: "Use during the Leadership Council, before Lock." };
      // only "ready" when the market holds a strategy this discount can actually lower
      const L = lookups(content);
      const fits = c.market.filter((id) => !eff.tag || ((L.strategies[id] || {}).tags || []).includes(eff.tag));
      if (!fits.length) return { ok: false, reason: eff.tag ? `No “${eff.tag}” strategy in the market.` : "No strategy in the market." };
      if (!fits.some((id) => effectiveCost(content, state, id) > 1)) return { ok: false, reason: "Every strategy it could discount already costs 1." };
      return { ok: true };
    }
    case "decide":
      return state.phase === "driver" && state.driver && state.driver.chosen == null ? { ok: true } : { ok: false, reason: "Use while the table is voting on a Dilemma." };
    case "cancel": {
      const b = state.batch;
      const scopeOk = b && cancelScopeMatches(eff.scope, b.scope) && phaseForScope(eff.scope) === state.phase;
      const neg = scopeOk && b.changes.some((ch) => ch.applied < 0 && !ch.cancelled);
      return neg ? { ok: true } : { ok: false, reason: `Use right after a ${eff.scope} lowers a domain.` };
    }
    default: return { ok: true };
  }
}

function cancelScopeMatches(scope, batchScope) {
  if (scope === "driver") return batchScope === "driver" || batchScope === "dilemma";
  return scope === batchScope;
}
function phaseForScope(scope) {
  return scope === "driver" ? "driver" : scope === "signal" ? "signals" : "cascades";
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------
export function reduce(content, state0, action) {
  if (!action || !action.type) fail("Unknown action.");
  const h = HANDLERS[action.type];
  if (!h) fail(`Unknown action "${action.type}".`);
  const state = clone(state0);
  state.fx = null;
  const rng = new Rng(state.rng);
  h(content, state, action, rng);
  state.rng = rng.s;
  return state;
}

const need = (cond, msg) => { if (!cond) fail(msg); };
const needPhase = (state, ...ph) => need(ph.includes(state.phase), `Not available in the ${state.phase} phase.`);
const needSeat = (state, seat) => need(Number.isInteger(seat) && seat >= 0 && seat < state.players.length, "Unknown seat.");
const eraName = (content, state) => ((content.eras || [])[state.era] || {}).name || `Era ${state.era + 1}`;

const HANDLERS = {
  // ---- Era open → Driver -------------------------------------------------
  revealDriver(content, state, a, rng) {
    needPhase(state, "era-open");
    const d = drawDriver(content, state, rng);
    need(d, "No drivers available in this content.");
    state.usedDrivers.push(d.id);
    const votes = state.players.map(() => null);
    state.driver = { id: d.id, votes, chosen: null, decidedBy: null, tie: null };
    state.phase = "driver";
    const res = applyEffects(content, state, d.effects, { scope: "driver", label: `Driver: ${d.title}` });
    state.story.push({ era: state.era, k: "driver", id: d.id, changes: res.map(slim) });
  },

  vote(content, state, a) {
    needPhase(state, "driver");
    needSeat(state, a.seat);
    const d = lookups(content).drivers[state.driver.id];
    need(state.driver.chosen == null, "The dilemma is already decided.");
    const n = d.dilemma.options.length;
    need(a.option === null || (Number.isInteger(a.option) && a.option >= 0 && a.option < n), "Unknown option.");
    state.driver.votes[a.seat] = a.option;
  },

  resolveDilemma(content, state, a) {
    needPhase(state, "driver");
    const dr = state.driver;
    need(dr.chosen == null, "The dilemma is already decided.");
    const d = lookups(content).drivers[dr.id];
    const n = d.dilemma.options.length;
    const counts = dilemmaTally(state, n);
    const max = Math.max(...counts);
    need(max > 0 || Number.isInteger(a.tieBreak), "No votes yet — record votes, or let the Lead decide.");
    const top = counts.map((c, i) => (c === max ? i : -1)).filter((i) => i >= 0);
    let choice;
    if (top.length === 1 && max > 0) choice = top[0];
    else {
      const leadVote = dr.votes[state.lead];
      if (Number.isInteger(a.tieBreak) && (max === 0 ? a.tieBreak >= 0 && a.tieBreak < n : top.includes(a.tieBreak))) choice = a.tieBreak;
      else if (leadVote != null && top.includes(leadVote)) choice = leadVote;
      else { dr.tie = top; fail("Tied vote — the Lead must break the tie."); }
    }
    chooseOption(content, state, choice, null);
  },

  beginSignals(content, state) {
    needPhase(state, "driver");
    need(state.driver.chosen != null, "Resolve the dilemma first.");
    state.phase = "signals";
    state.turn = { round: 0, pos: 0, order: seatOrder(state), step: "choose", card: null, done: false, entry: null };
    state.batch = null;
  },

  // ---- Signals -----------------------------------------------------------
  playSignal(content, state, a) {
    needPhase(state, "signals");
    const t = state.turn;
    need(!t.done, "All signal turns are finished.");
    need(t.step === "choose", "This turn already played a signal.");
    const seat = t.order[t.pos];
    if (a.seat != null) need(a.seat === seat, "It's not that player's turn.");
    const hand = state.hands[seat];
    need(hand.includes(a.card), "That signal is not in this player's hand.");
    const sig = lookups(content).signals[a.card];
    need(sig, "Unknown signal.");
    state.hands[seat] = hand.filter((c) => c !== a.card);
    state.out.push(a.card);
    t.card = a.card;
    const label = `Signal: ${sig.title}`;
    newBatch(state, "signal", label);
    state.batch.keep = true;
    const prim = applyEffects(content, state, [{ domain: sig.primary.domain, delta: sig.primary.delta }], { scope: "signal", label, signal: true });
    const entry = { era: state.era, k: "signal", seat, id: sig.id, primary: prim.map(slim), secondary: null, reasoning: "" };
    const sec = sig.secondary;
    if (sec && sec.type === "fixed") {
      const r = applyEffects(content, state, [{ domain: sec.domain, delta: sec.delta }], { scope: "signal", label, signal: true });
      entry.secondary = { type: "fixed", changes: r.map(slim) };
      t.step = "discard";
    } else if (sec && SECONDARY_CHOICE.includes(sec.type)) {
      t.step = "secondary";
    } else {
      t.step = "discard";
    }
    state.batch.keep = false;
    state.story.push(entry);
    t.entry = state.story.length - 1;
  },

  resolveSecondary(content, state, a) {
    needPhase(state, "signals");
    const t = state.turn;
    need(t.step === "secondary", "No secondary effect waiting.");
    const sig = lookups(content).signals[t.card];
    const sec = sig.secondary;
    const label = `Signal: ${sig.title}`;
    const entry = state.story[t.entry];
    const tg = secondaryTargets(content, state);
    const check = (map, d) => { need(d && d in map, "Choose a domain."); need(!map[d], map[d]); };
    state.batch.keep = true;
    if (a.skip) {
      need(!tg.anyValid, "A domain can still be chosen, so this effect can't be skipped.");
      entry.secondary = { type: sec.type, skipped: true, changes: [] };
    } else if (sec.type === "add" || sec.type === "remove") {
      check(tg.domain, a.domain);
      const delta = (sec.type === "add" ? 1 : -1) * (sec.amount || 1);
      const r = applyEffects(content, state, [{ domain: a.domain, delta }], { scope: "signal", label, signal: true });
      entry.secondary = { type: sec.type, changes: r.map(slim) };
    } else if (sec.type === "move") {
      check(tg.from, a.from);
      check(tg.to, a.to);
      need(a.from !== a.to, "Move between two different domains.");
      // conserve points: move only what the source has and the destination can receive
      const amt = Math.min(sec.amount || 1, state.cond[a.from], 10 - state.cond[a.to]);
      const r = applyEffects(content, state, [{ domain: a.from, delta: -amt }, { domain: a.to, delta: amt }], { scope: "signal", label, signal: true });
      entry.secondary = { type: "move", from: a.from, to: a.to, changes: r.map(slim) };
    } else if (sec.type === "protect") {
      check(tg.domain, a.domain);
      state.protected.push(a.domain);
      entry.secondary = { type: "protect", domain: a.domain, changes: [] };
    }
    state.batch.keep = false;
    if (a.reasoning != null) entry.reasoning = String(a.reasoning).slice(0, 400);
    t.step = "discard";
  },

  setReasoning(content, state, a) {
    needPhase(state, "signals");
    const t = state.turn;
    need(t.entry != null && state.story[t.entry], "No signal played this turn.");
    state.story[t.entry].reasoning = String(a.text || "").slice(0, 400);
  },

  endTurn(content, state, a, rng) {
    needPhase(state, "signals");
    const t = state.turn;
    need(!t.done, "All signal turns are finished.");
    need(t.step !== "secondary", "Resolve the secondary effect first.");
    const seat = t.order[t.pos];
    if (t.step === "choose") state.story.push({ era: state.era, k: "pass", seat });
    if (a.reasoning != null && t.entry != null && state.story[t.entry]) state.story[t.entry].reasoning = String(a.reasoning).slice(0, 400);
    const discard = (a.discard || []).filter((c) => state.hands[seat].includes(c));
    if (discard.length) {
      state.hands[seat] = state.hands[seat].filter((c) => !discard.includes(c));
      state.out.push(...discard);
    }
    const size = rulesOf(content).handSize;
    while (state.hands[seat].length < size) if (!drawSignal(content, state, rng, seat, null)) break;
    // advance
    t.pos += 1;
    if (t.pos >= t.order.length) { t.pos = 0; t.round += 1; }
    if (t.round >= state.rounds) { t.done = true; t.pos = 0; }
    t.step = "choose"; t.card = null; t.entry = null;
  },

  // ---- Council -----------------------------------------------------------
  beginCouncil(content, state, a, rng) {
    needPhase(state, "signals");
    need(state.turn.done, "Finish all signal turns first.");
    const rules = rulesOf(content);
    const market = dealMarket(content, state, rng, rules.marketSize);
    const base = baseCapacity(content, state);
    const pledges = {};
    for (const id of market) pledges[id] = state.players.map(() => 0);
    state.council = { market, base, capacity: state.players.map(() => base), bonus: state.players.map(() => 0), pledges, discounts: {}, locked: false, funded: [], unfunded: [], lost: 0 };
    state.phase = "council";
    state.batch = null;
  },

  pledge(content, state, a) {
    needPhase(state, "council");
    const c = state.council;
    need(!c.locked, "The Council is locked.");
    needSeat(state, a.seat);
    need(c.market.includes(a.strategy), "That strategy is not in the market.");
    let amt = Math.max(0, Math.floor(+a.amount || 0));
    const cur = c.pledges[a.strategy][a.seat];
    const others = pledgedTotal(state, a.strategy) - cur;
    const roomOnCard = Math.max(0, effectiveCost(content, state, a.strategy) - others);
    const roomInBudget = c.capacity[a.seat] - (seatSpent(state, a.seat) - cur);
    amt = Math.min(amt, roomOnCard, roomInBudget);
    c.pledges[a.strategy][a.seat] = Math.max(0, amt);
  },

  lockCouncil(content, state) {
    needPhase(state, "council");
    const c = state.council;
    need(!c.locked, "The Council is already locked.");
    const L = lookups(content);
    const last = state.era >= (content.eras || []).length - 1;
    let spent = 0;
    for (const id of c.market) {
      const s = L.strategies[id];
      const total = pledgedTotal(state, id);
      const seats = c.pledges[id].map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0);
      if (total >= effectiveCost(content, state, id)) {
        c.funded.push(id);
        state.funded.push(id);
        spent += effectiveCost(content, state, id);
        const res = applyEffects(content, state, s.effects, { scope: "strategy", label: `Strategy: ${s.title}`, batch: false });
        if (s.delayed && s.delayed.length) {
          if (!last) state.pendingDelayed.push({ era: state.era + 1, id, effects: s.delayed });
          else if (rulesOf(content).farDelayed === "final") state.pendingDelayed.push({ era: "end", id, effects: s.delayed });
          else state.legacy.push({ era: state.era, id, effects: s.delayed });
        }
        state.story.push({ era: state.era, k: "strategy", id, seats, changes: res.map(slim), delayed: !!(s.delayed && s.delayed.length) });
      } else if (total > 0) {
        c.unfunded.push(id);
        state.story.push({ era: state.era, k: "unfunded", id, seats, pledged: total });
      }
    }
    const totalCap = c.capacity.reduce((x, y) => x + y, 0);
    const pledgedAll = c.market.reduce((x, id) => x + pledgedTotal(state, id), 0);
    c.lost = totalCap - spent;
    c.overflow = pledgedAll - spent;
    c.locked = true;
    state.marketCarry = c.market.filter((id) => !c.funded.includes(id));
    state.batch = null;
  },

  // ---- Headline ----------------------------------------------------------
  beginHeadline(content, state) {
    needPhase(state, "council");
    need(state.council.locked, "Lock the Council first.");
    state.phase = "headline";
    state.headline = { subs: state.players.map(() => null), pick: null, placed: false, skipped: false };
  },

  submitHeadline(content, state, a) {
    needPhase(state, "headline");
    needSeat(state, a.seat);
    const hl = state.headline;
    need(hl.pick == null && !hl.skipped, "A headline was already chosen.");
    need(a.seat !== state.lead, "The Lead picks the headline instead of writing one.");
    const text = String(a.text || "").replace(/\s+/g, " ").trim();
    need(wordCount(text) <= 10, "Headlines are 10 words or fewer.");
    hl.subs[a.seat] = text ? text.slice(0, 120) : null;
  },

  pickHeadline(content, state, a) {
    needPhase(state, "headline");
    needSeat(state, a.seat);
    const hl = state.headline;
    need(hl.pick == null && !hl.skipped, "A headline was already chosen.");
    need(hl.subs[a.seat], "That player has no headline.");
    hl.pick = a.seat;
    state.story.push({ era: state.era, k: "headline", seat: a.seat, text: hl.subs[a.seat] });
  },

  placeInfluence(content, state, a) {
    needPhase(state, "headline");
    const hl = state.headline;
    need(hl.pick != null, "Pick a headline first.");
    need(!hl.placed, "Influence is already placed.");
    const L = lookups(content);
    const inf = rulesOf(content).headlineInfluence;
    const alloc = (a.alloc || []).filter((x) => x && x.delta > 0);
    need(alloc.length >= 1 && alloc.length <= inf, `Place +${inf} on one domain or split it.`);
    need(alloc.every((x) => L.domains[x.domain] && Number.isInteger(x.delta)), "Unknown domain in influence.");
    need(new Set(alloc.map((x) => x.domain)).size === alloc.length, "Use different domains when splitting.");
    need(alloc.reduce((s, x) => s + x.delta, 0) === inf, `Influence must add up to +${inf}.`);
    for (const x of alloc) need(state.cond[x.domain] + x.delta <= 10, `${L.domains[x.domain].name} can only take +${10 - state.cond[x.domain]}.`);
    const res = applyEffects(content, state, alloc, { scope: "headline", label: "Headline influence", batch: false });
    hl.placed = true;
    state.story.push({ era: state.era, k: "influence", seat: hl.pick, changes: res.map(slim) });
  },

  skipHeadline(content, state) {
    needPhase(state, "headline");
    const hl = state.headline;
    need(hl.pick == null, "A headline was already chosen.");
    hl.skipped = true;
  },

  setInsight(content, state, a) {
    const text = String(a.text || "").replace(/\s+/g, " ").trim().slice(0, 280);
    const era = Number.isInteger(a.era) ? a.era : state.era;
    state.insights = state.insights.filter((x) => x.era !== era);
    if (text) state.insights.push({ era, text });
    state.insights.sort((x, y) => x.era - y.era);
  },

  // ---- System response -----------------------------------------------------
  beginCascades(content, state) {
    needPhase(state, "headline");
    const hl = state.headline;
    need(hl.skipped || (hl.pick != null && hl.placed), "Finish the headline (or skip it) first.");
    state.phase = "cascades";
    state.cascade = { fired: [], done: false, matured: [] };
    state.batch = null;
  },

  runCascades(content, state) {
    needPhase(state, "cascades");
    const cs = state.cascade;
    need(!cs.done, "System response already ran.");
    const L = lookups(content);
    const list = (content.cascades || []).filter((c) => c && c.status !== "retired");
    const sequential = rulesOf(content).cascadeMode === "sequential";
    newBatch(state, "cascade", "System response");
    state.batch.keep = true;
    const fired = [];
    const snapshot = { ...state.cond };
    const all = [];
    for (const c of list) {
      // simultaneous: every condition is checked on the pre-cascade tree; sequential: on the tree as it changes
      if (!cascadeFires(c, sequential ? state.cond : snapshot)) continue;
      fired.push(c.id);
      const eff = (c.effects || []).filter((e) => L.domains[e.domain]);
      const res = applyEffects(content, state, eff, { scope: "cascade", label: "System response" });
      all.push(...res);
    }
    state.batch.keep = false;
    cs.fired = fired;
    cs.changes = all.map(slim);
    for (const id of fired) state.story.push({ era: state.era, k: "cascade", id });
    cs.done = true;
    // Ring + collapse check happen when the facilitator lays down the ring (closeEra), so a
    // cascade "cancel" ability can still be used here.
  },

  closeEra(content, state) {
    needPhase(state, "cascades");
    need(state.cascade.done, "Run the system response first.");
    const L = lookups(content);
    const rules = rulesOf(content);
    state.rings.push({ era: L.eraIds[state.era], cond: { ...state.cond } });
    state.protected = [];
    state.batch = null;
    const crisis = crisisDomains(content, state.cond);
    const last = state.era >= (content.eras || []).length - 1;
    if (crisis.length >= rules.collapseCrisisCount) {
      state.collapsed = true;
      state.story.push({ era: state.era, k: "collapse", domains: crisis });
      finish(content, state);
      return;
    }
    if (last) { finish(content, state); return; }
    // next era
    state.era += 1;
    state.lead = (state.lead + 1) % state.players.length;
    state.phase = "era-open";
    state.driver = null; state.turn = null; state.council = null; state.headline = null; state.cascade = null;
    const due = state.pendingDelayed.filter((p) => p.era === state.era);
    state.matured = [];
    for (const pd of due) {
      const s = L.strategies[pd.id] || { title: pd.id };
      const res = applyEffects(content, state, pd.effects, { scope: "delayed", label: `Matured: ${s.title}`, batch: false });
      state.matured.push({ id: pd.id, changes: res.map(slim) });
      state.story.push({ era: state.era, k: "delayed", id: pd.id, changes: res.map(slim) });
    }
    state.pendingDelayed = state.pendingDelayed.filter((p) => p.era !== state.era);
  },

  // ---- Abilities -----------------------------------------------------------
  useAbility(content, state, a, rng) {
    needSeat(state, a.seat);
    const av = abilityAvailability(content, state, a.seat);
    need(av.ok, av.reason);
    const L = lookups(content);
    const p = state.players[a.seat];
    const role = L.roles[p.roleId];
    const eff = role.ability.effect;
    const label = `${role.ability.name} (${p.name})`;
    const inChoices = (d) => need(L.domains[d] && (!eff.choices || eff.choices.includes(d)), "Choose one of the allowed domains.");
    const entry = { era: state.era, k: "ability", seat: a.seat, type: eff.type };
    switch (eff.type) {
      case "boost": {
        inChoices(a.domain);
        need(state.cond[a.domain] < 10, `${L.domains[a.domain].name} is already at 10.`);
        const r = applyEffects(content, state, [{ domain: a.domain, delta: eff.delta || 1 }], { scope: "ability", label, batch: false });
        entry.changes = r.map(slim);
        break;
      }
      case "protect": {
        inChoices(a.domain);
        need(!state.protected.includes(a.domain), "That domain is already protected.");
        state.protected.push(a.domain);
        entry.domain = a.domain;
        break;
      }
      case "capacity": {
        const n = eff.amount || 1;
        state.council.bonus[a.seat] += n;
        state.council.capacity[a.seat] += n;
        entry.amount = n;
        break;
      }
      case "discount": {
        const s = L.strategies[a.strategy];
        need(s && state.council.market.includes(a.strategy), "Choose a strategy in the market.");
        if (eff.tag) need((s.tags || []).includes(eff.tag), `This ability only discounts “${eff.tag}” strategies.`);
        need(effectiveCost(content, state, a.strategy) > 1, "That strategy already costs 1.");
        state.council.discounts[a.strategy] = (state.council.discounts[a.strategy] || 0) + (eff.amount || 1);
        entry.strategy = a.strategy; entry.amount = eff.amount || 1;
        // Pledges above the new cost would be stranded at Lock: hand the surplus back, largest pledges
        // first (ties: the later seat), so it can go to another strategy.
        {
          const row = state.council.pledges[a.strategy];
          let over = pledgedTotal(state, a.strategy) - effectiveCost(content, state, a.strategy);
          const refunds = [];
          while (over > 0) {
            let best = -1;
            row.forEach((n, i) => { if (n > 0 && (best < 0 || n >= row[best])) best = i; });
            if (best < 0) break;
            row[best] -= 1; over -= 1;
            const r = refunds.find((x) => x.seat === best);
            if (r) r.amount += 1; else refunds.push({ seat: best, amount: 1 });
          }
          if (refunds.length) entry.refunded = refunds.sort((x, y) => x.seat - y.seat);
        }
        break;
      }
      case "cancel": {
        const b = state.batch;
        const ch = b.changes.find((x) => x.domain === a.domain && x.applied < 0 && !x.cancelled);
        need(ch, "Choose a domain that was just lowered.");
        const from = state.cond[a.domain];
        const to = clamp(from - ch.applied);
        state.cond[a.domain] = to;
        ch.cancelled = true;
        state.seq += 1;
        addFx(state, label, a.domain, from, to);
        entry.domain = a.domain; entry.scope = eff.scope; entry.changes = [{ domain: a.domain, from, to }];
        break;
      }
      case "decide": {
        const d = L.drivers[state.driver.id];
        need(Number.isInteger(a.option) && a.option >= 0 && a.option < d.dilemma.options.length, "Choose an option.");
        p.abilityUsed = true;
        state.story.push(entry);
        chooseOption(content, state, a.option, a.seat);
        return;
      }
      case "redraw": {
        const hz = eff.horizon || (a.horizon && L.eraIds.includes(a.horizon) ? a.horizon : null);
        const t = state.turn;
        if (state.phase === "signals" && t && !t.done && t.order[t.pos] === a.seat) need(t.step === "choose", "Redraw before playing, or after this turn.");
        state.out.push(...state.hands[a.seat]);
        state.hands[a.seat] = [];
        const size = rulesOf(content).handSize;
        for (let i = 0; i < size; i++) if (!drawSignal(content, state, rng, a.seat, hz)) break;
        entry.horizon = hz || "mix";
        break;
      }
      case "refresh-market": {
        const ids = (a.strategies || []).filter((id) => state.council.market.includes(id));
        need(ids.length >= 1 && ids.length <= (eff.count || 1), `Choose 1–${eff.count || 1} strategies to replace.`);
        const fresh = drawMarket(content, state, rng, ids.length, state.council.market);
        const c = state.council;
        ids.forEach((id, i) => {
          const at = c.market.indexOf(id);
          if (fresh[i]) {
            c.market[at] = fresh[i];
            delete c.pledges[id]; delete c.discounts[id];
            c.pledges[fresh[i]] = state.players.map(() => 0);
          }
        });
        entry.replaced = ids; entry.added = fresh;
        break;
      }
      case "move": {
        need(L.domains[a.from] && L.domains[a.to] && a.from !== a.to, "Choose two different domains.");
        const want = Math.max(1, Math.min(eff.amount || 1, Math.floor(+a.amount || eff.amount || 1)));
        need(state.cond[a.from] > 0, `${L.domains[a.from].name} is at 0: there is nothing to move.`);
        need(state.cond[a.to] < 10, `${L.domains[a.to].name} is already at 10.`);
        const amt = Math.min(want, state.cond[a.from], 10 - state.cond[a.to]);
        const r = applyEffects(content, state, [{ domain: a.from, delta: -amt }, { domain: a.to, delta: amt }], { scope: "ability", label, batch: false });
        entry.changes = r.map(slim);
        break;
      }
      default: fail("Unknown ability.");
    }
    p.abilityUsed = true;
    state.story.push(entry);
  },
};

const SECONDARY_CHOICE = ["add", "remove", "move", "protect"];

function chooseOption(content, state, option, decidedBy) {
  const d = lookups(content).drivers[state.driver.id];
  const opt = d.dilemma.options[option];
  state.driver.chosen = option;
  state.driver.decidedBy = decidedBy;
  state.driver.tie = null;
  const res = applyEffects(content, state, opt.effects, { scope: "dilemma", label: `Dilemma: ${opt.label}` });
  state.story.push({
    era: state.era, k: "dilemma", id: d.id, option, decidedBy,
    votes: state.driver.votes.slice(), changes: res.map(slim),
  });
}

function finish(content, state) {
  // farDelayed "final": final-era long-term effects land at 2050 (unless the system collapsed)
  if (!state.collapsed) {
    for (const pd of state.pendingDelayed.filter((p) => p.era === "end")) {
      const s = lookups(content).strategies[pd.id] || { title: pd.id };
      const res = applyEffects(content, state, pd.effects, { scope: "delayed", label: `Matured: ${s.title}`, batch: false });
      state.story.push({ era: state.era, k: "delayed", id: pd.id, changes: res.map(slim) });
    }
  }
  state.pendingDelayed = state.pendingDelayed.filter((p) => p.era !== "end");
  state.phase = "over";
  state.outcome = finalResults(content, state);
  state.driver = null; state.turn = null; state.council = null; state.headline = null;
}

function slim(r) {
  const o = { d: r.domain, from: r.from, to: r.to };
  if (r.blocked) { o.blocked = true; o.delta = r.delta; }
  return o;
}

// Convenience: the "continue" button's next action for a phase.
export function nextStep(content, state) {
  switch (state.phase) {
    case "era-open": return { type: "revealDriver" };
    case "driver": return state.driver && state.driver.chosen != null ? { type: "beginSignals" } : null;
    case "signals": return state.turn && state.turn.done ? { type: "beginCouncil" } : null;
    case "council": return state.council && state.council.locked ? { type: "beginHeadline" } : null;
    case "headline": return state.headline && (state.headline.skipped || state.headline.placed) ? { type: "beginCascades" } : null;
    case "cascades": return state.cascade && state.cascade.done ? { type: "closeEra" } : { type: "runCascades" };
    default: return null;
  }
}
