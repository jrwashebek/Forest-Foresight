import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  outcomeRules, capacityBaseFor, rulesOf, secondaryTargets,
  createGame, reduce, EngineError, validateContent, mandateVariant, mandateFor, mandateProgress, finalResults,
  outcomeTier, baseCapacity, drawSignal, Rng, startHistory, dispatch, undo, replay, seedFromCode, makeCode,
  CODE_RE, fingerprint, abilityAvailability, currentSeat, nextStep, cascadePreview, reviewDue, bandOf, effectiveCost,
} from "../src/engine/index.js";

const BASE = JSON.parse(readFileSync(new URL("../sample-content.json", import.meta.url), "utf8"));
const C = () => structuredClone(BASE);

const ROLES5 = ["role-state-forester", "role-forest-supervisor", "role-tribal-director", "role-county-commissioner", "role-mill-owner"];
const setup5 = (over = {}) => ({
  code: "FRST42", scenarioId: "scn-thin-margins", length: "standard",
  players: ROLES5.map((roleId, i) => ({ name: `P${i + 1}`, roleId })), ...over,
});
const run = (content, s, ...actions) => actions.reduce((st, a) => reduce(content, st, a), s);
const throwsEngine = (fn, re) => assert.throws(fn, (e) => e instanceof EngineError && (!re || re.test(e.message)));

/** Start a game with a single-driver pool for the first era. */
function withDriver(content, id) {
  content.scenarios[0].drivers.now = [id];
  return content;
}
function toSignals(content, s) {
  s = run(content, s, { type: "revealDriver" });
  s = run(content, s, { type: "vote", seat: 0, option: 0 }, { type: "resolveDilemma" }, { type: "beginSignals" });
  return s;
}
function toCouncil(content, s) {
  s = toSignals(content, s);
  while (!s.turn.done) s = run(content, s, { type: "endTurn" });
  return run(content, s, { type: "beginCouncil" });
}

describe("content", () => {
  test("sample content validates with no errors", () => {
    const v = validateContent(BASE);
    assert.deepEqual(v.errors, []);
  });
  test("validation reports bad refs, ranges, duplicates", () => {
    const c = C();
    c.signals[0].primary.domain = "nope";
    c.signals[1].primary.delta = 7;
    c.signals[2].id = c.signals[3].id;
    c.signals[4].secondary = { type: "fixed", domain: c.signals[4].primary.domain, delta: 1, text: "x" };
    c.strategies[0].cost = 12;
    c.roles[0].ability.effect.type = "teleport";
    const v = validateContent(c);
    const all = v.errors.join("\n");
    assert.match(all, /primary effect's domain/);
    assert.match(all, /Primary change must be/);
    assert.match(all, /Duplicate id/);
    assert.match(all, /different domain than the primary/);
    assert.match(all, /Cost must be/);
    assert.match(all, /unknown ability type/);
  });
  test("non-object content fails gracefully", () => {
    assert.ok(validateContent(null).errors.length);
    assert.ok(validateContent({ meta: {} }).errors.length);
  });
  test("fingerprint is stable and changes with edits", () => {
    const a = fingerprint(BASE), b = fingerprint(C());
    assert.equal(a, b);
    const c = C(); c.signals[0].title = "Changed";
    assert.notEqual(fingerprint(c), a);
    assert.match(a, /^2026\.11-sample\//);
  });
  test("review due after 18 months", () => {
    assert.equal(reviewDue({ reviewed: "2024-09-01" }, "2026-11-14"), true);
    assert.equal(reviewDue({ reviewed: "2026-01-01" }, "2026-11-14"), false);
  });
  test("bands", () => {
    assert.equal(bandOf(BASE, 0).label, "Crisis");
    assert.equal(bandOf(BASE, 4).label, "Strained");
    assert.equal(bandOf(BASE, 10).label, "Transformed");
  });
});

describe("setup", () => {
  test("creates a deterministic game from code", () => {
    const a = createGame(BASE, setup5());
    const b = createGame(BASE, setup5());
    assert.deepEqual(a, b);
    assert.equal(a.phase, "era-open");
    assert.equal(a.players.length, 5);
    assert.deepEqual(a.cond, BASE.scenarios[0].start);
    a.hands.forEach((h) => assert.equal(h.length, 3));
    assert.equal(new Set(a.hands.flat()).size, 15, "no duplicate cards across hands");
    const c = createGame(BASE, setup5({ code: "ABCDEF" }));
    assert.notDeepEqual(c.hands, a.hands);
  });
  test("rejects bad setups", () => {
    throwsEngine(() => createGame(BASE, setup5({ code: "bad" })), /code/);
    throwsEngine(() => createGame(BASE, setup5({ scenarioId: "scn-x" })), /scenario/);
    throwsEngine(() => createGame(BASE, setup5({ players: [{ name: "A", roleId: "role-mill-owner" }, { name: "B", roleId: "role-mill-owner" }] })), /share/);
    throwsEngine(() => createGame(BASE, setup5({ players: [{ name: "", roleId: "role-mill-owner" }] })), /name/);
  });
  test("codes", () => {
    for (let i = 0; i < 50; i++) assert.match(makeCode(i * 7919), CODE_RE);
    assert.equal(seedFromCode("ABCDEF"), seedFromCode("ABCDEF"));
  });
  test("autoLock option is stored (default off)", () => {
    assert.equal(createGame(BASE, setup5()).autoLock, false);
    assert.equal(createGame(BASE, setup5({ autoLock: true })).autoLock, true);
  });
  test("deep length gives 2 signal rounds", () => {
    const s = createGame(BASE, setup5({ length: "deep" }));
    assert.equal(s.rounds, 2);
  });
});

describe("era-weighted draws", () => {
  test("draw frequencies follow era weights", () => {
    const content = C();
    // 300 synthetic signals: 100 per horizon
    content.signals = [];
    for (const h of ["now", "near", "far"]) for (let i = 0; i < 100; i++)
      content.signals.push({ id: `sig-${h}-${i}`, title: "t", signal: "s", horizon: h, primary: { domain: "fire", delta: 1, text: "x" }, source: { title: "t", url: "https://x" }, status: "active" });
    const counts = { 0: {}, 2: {} };
    for (const era of [0, 2]) {
      const tally = { now: 0, near: 0, far: 0 };
      const rng = new Rng(12345 + era);
      for (let trial = 0; trial < 400; trial++) {
        const st = { era, hands: [[]], out: [] };
        const id = drawSignal(content, st, rng, 0, null);
        tally[id.split("-")[1]]++;
      }
      counts[era] = tally;
    }
    // Now era: 70/25/5 ; Far era: 5/35/60  (generous tolerance)
    assert.ok(counts[0].now / 400 > 0.6 && counts[0].now / 400 < 0.8, JSON.stringify(counts[0]));
    assert.ok(counts[0].far / 400 < 0.11, JSON.stringify(counts[0]));
    assert.ok(counts[2].far / 400 > 0.5 && counts[2].far / 400 < 0.7, JSON.stringify(counts[2]));
    assert.ok(counts[2].now / 400 < 0.11, JSON.stringify(counts[2]));
  });
  test("falls back to other horizons and recycles discards when exhausted", () => {
    const content = C();
    content.signals = content.signals.slice(0, 7); // tiny deck
    const st = { era: 0, hands: [[]], out: content.signals.slice(0, 6).map((s) => s.id) };
    const rng = new Rng(1);
    const a = drawSignal(content, st, rng, 0, null);
    assert.equal(a, content.signals[6].id);
    const b = drawSignal(content, st, rng, 0, null); // all out → recycle
    assert.ok(b && b !== a);
  });
});

describe("driver & dilemma", () => {
  test("driver effects apply, majority wins", () => {
    const content = withDriver(C(), "drv-budget-squeeze");
    let s = createGame(content, setup5());
    s = run(content, s, { type: "revealDriver" });
    assert.equal(s.phase, "driver");
    assert.equal(s.cond.governance, 2); // 4 - 2
    assert.equal(s.cond.recreation, 5);
    s = run(content, s, { type: "vote", seat: 0, option: 0 }, { type: "vote", seat: 1, option: 2 }, { type: "vote", seat: 2, option: 2 });
    s = run(content, s, { type: "resolveDilemma" });
    assert.equal(s.driver.chosen, 2);
    assert.equal(s.cond.partners, 6);
    assert.equal(s.cond.workforce, 2);
    assert.deepEqual(nextStep(content, s), { type: "beginSignals" });
  });
  test("tie → Lead's vote breaks it; otherwise Lead must choose", () => {
    const content = withDriver(C(), "drv-budget-squeeze");
    let s = run(content, createGame(content, setup5()), { type: "revealDriver" });
    let t = run(content, s, { type: "vote", seat: 0, option: 1 }, { type: "vote", seat: 1, option: 0 }, { type: "resolveDilemma" });
    assert.equal(t.driver.chosen, 1, "lead (seat 0) vote wins the 1–1 tie");
    let u = run(content, s, { type: "vote", seat: 1, option: 0 }, { type: "vote", seat: 2, option: 1 }, { type: "vote", seat: 0, option: 2 }, { type: "vote", seat: 3, option: 2 }, { type: "vote", seat: 4, option: 0 });
    // 0:2, 1:1, 2:2 → tie between 0 and 2; lead voted 2
    u = run(content, u, { type: "resolveDilemma" });
    assert.equal(u.driver.chosen, 2);
    let w = run(content, s, { type: "vote", seat: 1, option: 0 }, { type: "vote", seat: 2, option: 1 });
    throwsEngine(() => run(content, w, { type: "resolveDilemma" }), /tie/i);
    w = run(content, w, { type: "resolveDilemma", tieBreak: 1 });
    assert.equal(w.driver.chosen, 1);
    throwsEngine(() => run(content, s, { type: "resolveDilemma" }), /No votes/);
  });
});

describe("signals", () => {
  const setHand = (s, seat, ids) => { s.hands[seat] = ids; return s; };
  test("fixed secondary applies; turn order starts with the Lead", () => {
    const content = C();
    let s = toSignals(content, createGame(content, setup5()));
    assert.equal(currentSeat(s), 0);
    s = setHand(s, 0, ["sig-good-neighbors", "sig-fewer-hands", "sig-eyes-in-orbit"]);
    const p0 = s.cond.partners, f0 = s.cond.fire;
    s = run(content, s, { type: "playSignal", seat: 0, card: "sig-good-neighbors" });
    assert.equal(s.cond.partners, Math.min(10, p0 + 2));
    assert.equal(s.cond.fire, f0 + 1);
    assert.equal(s.turn.step, "discard");
    s = run(content, s, { type: "endTurn", discard: ["sig-fewer-hands"], reasoning: "GNA crews" });
    assert.equal(s.hands[0].length, 3);
    assert.ok(!s.hands[0].includes("sig-fewer-hands"));
    assert.equal(currentSeat(s), 1);
    const entry = s.story.find((e) => e.k === "signal");
    assert.equal(entry.reasoning, "GNA crews");
  });
  test("wrong player / card not in hand is rejected", () => {
    const content = C();
    let s = toSignals(content, createGame(content, setup5()));
    throwsEngine(() => run(content, s, { type: "playSignal", seat: 2, card: s.hands[2][0] }), /turn/);
    throwsEngine(() => run(content, s, { type: "playSignal", seat: 0, card: "sig-nope" }), /hand/);
  });
  test("add / remove / move / protect secondaries", () => {
    const content = C();
    let s = toSignals(content, createGame(content, setup5()));
    // add (sig-fewer-hands: workforce -2, add 1)
    s = setHand(s, 0, ["sig-fewer-hands"]);
    s = run(content, s, { type: "playSignal", seat: 0, card: "sig-fewer-hands" });
    assert.equal(s.turn.step, "secondary");
    throwsEngine(() => run(content, s, { type: "endTurn" }), /secondary/);
    throwsEngine(() => run(content, s, { type: "resolveSecondary", domain: "workforce" }), /primary effect/);
    throwsEngine(() => run(content, s, { type: "resolveSecondary", skip: true }), /can't be skipped/);
    const p = s.cond.partners;
    s = run(content, s, { type: "resolveSecondary", domain: "partners", reasoning: "NGO crews" });
    assert.equal(s.cond.partners, p + 1);
    s = run(content, s, { type: "endTurn" });
    // remove (sig-seedling-squeeze)
    s = setHand(s, 1, ["sig-seedling-squeeze"]);
    const w = s.cond.wood;
    s = run(content, s, { type: "playSignal", seat: 1, card: "sig-seedling-squeeze" }, { type: "resolveSecondary", domain: "wood" });
    assert.equal(s.cond.wood, w - 1);
    s = run(content, s, { type: "endTurn" });
    // move (sig-insurers-exit: move 1)
    s = setHand(s, 2, ["sig-insurers-exit"]);
    const r0 = s.cond.recreation, c0 = s.cond.climate;
    s = run(content, s, { type: "playSignal", seat: 2, card: "sig-insurers-exit" });
    throwsEngine(() => run(content, s, { type: "resolveSecondary", from: "climate", to: "climate" }), /different/);
    s = run(content, s, { type: "resolveSecondary", from: "recreation", to: "climate" });
    assert.equal(s.cond.recreation, r0 - 1);
    assert.equal(s.cond.climate, c0 + 1);
    s = run(content, s, { type: "endTurn" });
    // protect (sig-co-stewardship-scale)
    s = setHand(s, 3, ["sig-co-stewardship-scale"]);
    s = run(content, s, { type: "playSignal", seat: 3, card: "sig-co-stewardship-scale" }, { type: "resolveSecondary", domain: "water" });
    assert.deepEqual(s.protected, ["water"]);
    s = run(content, s, { type: "endTurn" });
    // protected domain ignores a signal's effect
    s = setHand(s, 4, ["sig-snow-that-wasnt"]);
    const wat = s.cond.water;
    s = run(content, s, { type: "playSignal", seat: 4, card: "sig-snow-that-wasnt" });
    assert.equal(s.cond.water, wat, "protected: no change from signal");
    assert.ok(s.story.at(-1).primary[0].blocked);
    s.protected.push("health");
    throwsEngine(() => run(content, s, { type: "resolveSecondary", domain: "health" }), /protected/);
    s = run(content, s, { type: "resolveSecondary", domain: "fire" });
    s = run(content, s, { type: "endTurn" });
    assert.ok(s.turn.done);
  });
  test("protect does not block drivers or cascades", () => {
    const content = withDriver(C(), "drv-budget-squeeze");
    let s = createGame(content, setup5());
    s.protected = ["governance"];
    s = run(content, s, { type: "revealDriver" });
    assert.equal(s.cond.governance, 2, "driver ignores protection");
    s.phase = "cascades"; s.cascade = { fired: [], done: false, matured: [] };
    s.cond.fire = 2; s.protected = ["water"];
    const w = s.cond.water;
    s = run(content, s, { type: "runCascades" });
    assert.equal(s.cond.water, w - 1, "cascade ignores protection");
  });
  test("deep game: two rounds per era", () => {
    const content = C();
    let s = toSignals(content, createGame(content, setup5({ length: "deep" })));
    let turns = 0;
    while (!s.turn.done) { s = run(content, s, { type: "endTurn" }); turns++; }
    assert.equal(turns, 10);
  });
});

describe("council", () => {
  test("capacity formula", () => {
    const s = createGame(BASE, setup5());
    s.cond.workforce = 2; s.cond.governance = 8; // -2 +1
    assert.equal(baseCapacity(BASE, s), 2);
    s.cond.workforce = 3; s.cond.governance = 4; // -1 -1
    assert.equal(baseCapacity(BASE, s), 1);
    s.cond.workforce = 0; s.cond.governance = 0; // -2 -2 → min 1
    assert.equal(baseCapacity(BASE, s), 1);
    s.cond.workforce = 9; s.cond.governance = 7; // +1 +1
    assert.equal(baseCapacity(BASE, s), 5);
    s.cond.workforce = 5; s.cond.governance = 6;
    assert.equal(baseCapacity(BASE, s), 3);
  });
  test("pooled funding funds, unfunded pledges are lost, budgets enforced", () => {
    const content = C();
    let s = createGame(content, setup5());
    s.cond.workforce = 5; s.cond.governance = 5;
    s = toCouncil(content, s);
    // capacity after driver might have changed; force known capacity
    s.council.capacity = [3, 3, 3, 3, 3];
    const [a, b] = s.council.market;
    const costA = content.strategies.find((x) => x.id === a).cost;
    // pool into A
    let left = costA, seat = 0;
    while (left > 0) { const n = Math.min(3, left); s = run(content, s, { type: "pledge", seat, strategy: a, amount: n }); left -= n; seat++; }
    // seat 4 pledges 1 to B (will be unfunded)
    s = run(content, s, { type: "pledge", seat: 4, strategy: b, amount: 1 });
    // over-budget pledge is clamped
    s = run(content, s, { type: "pledge", seat: 4, strategy: a, amount: 5 });
    assert.ok(s.council.pledges[a][4] <= 2);
    const before = { ...s.cond };
    s = run(content, s, { type: "lockCouncil" });
    assert.ok(s.council.funded.includes(a));
    assert.ok(s.council.unfunded.includes(b));
    const strat = content.strategies.find((x) => x.id === a);
    for (const e of strat.effects) assert.equal(s.cond[e.domain], Math.max(0, Math.min(10, before[e.domain] + e.delta)));
    assert.ok(s.story.some((e) => e.k === "strategy" && e.id === a));
    throwsEngine(() => run(content, s, { type: "pledge", seat: 0, strategy: a, amount: 1 }), /locked/);
  });
  test("delayed effects mature at next era start", () => {
    const content = C();
    content.strategies.forEach((x) => { if (x.id !== "str-seed-network") x.status = "retired"; });
    content.rules.marketSize = 1;
    let s = toCouncil(content, createGame(content, setup5()));
    assert.deepEqual(s.council.market, ["str-seed-network"]);
    s.council.capacity = [5, 5, 5, 5, 5];
    s = run(content, s, { type: "pledge", seat: 0, strategy: "str-seed-network", amount: 5 }, { type: "lockCouncil" });
    const h1 = s.cond.health;
    assert.equal(s.pendingDelayed.length, 1);
    s = run(content, s, { type: "beginHeadline" }, { type: "skipHeadline" }, { type: "beginCascades" }, { type: "runCascades" });
    const hBefore = s.cond.health;
    s = run(content, s, { type: "closeEra" });
    assert.equal(s.era, 1);
    assert.equal(s.cond.health, Math.min(10, hBefore + 2));
    assert.equal(s.matured.length, 1);
    assert.equal(s.pendingDelayed.length, 0);
    assert.ok(h1 >= 0);
  });
});

describe("headline", () => {
  function toHeadline(content) {
    let s = toCouncil(content, createGame(content, setup5()));
    return run(content, s, { type: "lockCouncil" }, { type: "beginHeadline" });
  }
  test("submissions, Lead can't submit, word limit, pick and influence", () => {
    const content = C();
    let s = toHeadline(content);
    throwsEngine(() => run(content, s, { type: "submitHeadline", seat: 0, text: "Lead headline" }), /Lead/);
    throwsEngine(() => run(content, s, { type: "submitHeadline", seat: 1, text: "one two three four five six seven eight nine ten eleven" }), /10 words/);
    s = run(content, s, { type: "submitHeadline", seat: 1, text: "Fire agency splits; states fill the gap" }, { type: "submitHeadline", seat: 2, text: "Snowless winters, thirsty towns" });
    throwsEngine(() => run(content, s, { type: "pickHeadline", seat: 3 }), /no headline/);
    s = run(content, s, { type: "pickHeadline", seat: 2 });
    throwsEngine(() => run(content, s, { type: "placeInfluence", alloc: [{ domain: "water", delta: 3 }] }), /add up/);
    throwsEngine(() => run(content, s, { type: "placeInfluence", alloc: [{ domain: "water", delta: 1 }, { domain: "water", delta: 1 }] }), /different/);
    const w = s.cond.water, h = s.cond.health;
    s = run(content, s, { type: "placeInfluence", alloc: [{ domain: "water", delta: 1 }, { domain: "health", delta: 1 }] });
    assert.equal(s.cond.water, w + 1); assert.equal(s.cond.health, h + 1);
    const t = run(content, toHeadline(content), { type: "submitHeadline", seat: 1, text: "x" }, { type: "pickHeadline", seat: 1 }, { type: "placeInfluence", alloc: [{ domain: "fire", delta: 2 }] });
    assert.ok(t.headline.placed);
    s = run(content, s, { type: "setInsight", text: "Partnership is our real capacity." });
    assert.equal(s.insights[0].text, "Partnership is our real capacity.");
    s = run(content, s, { type: "beginCascades" });
    assert.equal(s.phase, "cascades");
  });
});

describe("cascades, collapse, outcomes", () => {
  test("cascades fire on pre-cascade state, simultaneously", () => {
    const content = C();
    let s = createGame(content, setup5());
    s.phase = "cascades"; s.cascade = { fired: [], done: false, matured: [] };
    s.cond.fire = 2; s.cond.water = 3; s.cond.communities = 5; s.cond.partners = 8; s.cond.governance = 5;
    assert.deepEqual(cascadePreview(content, s).map((c) => c.id).sort(), ["cas-fire-crisis", "cas-partners-thriving"]);
    s = run(content, s, { type: "runCascades" });
    assert.equal(s.cond.water, 2); assert.equal(s.cond.communities, 4); assert.equal(s.cond.governance, 6);
    // water now 2 but its cascade should NOT chain in the same era
    assert.ok(!s.cascade.fired.includes("cas-water-crisis"));
    s = run(content, s, { type: "closeEra" });
    assert.equal(s.rings.length, 1);
    assert.equal(s.phase, "era-open");
    assert.equal(s.lead, 1, "lead rotates");
    assert.deepEqual(s.protected, []);
  });
  test("≥3 domains in Crisis after cascades → collapse, Unraveling", () => {
    const content = C();
    let s = createGame(content, setup5());
    s.phase = "cascades"; s.cascade = { fired: [], done: false, matured: [] };
    s.cond.fire = 1; s.cond.water = 3; s.cond.workforce = 2;
    s = run(content, s, { type: "runCascades" }, { type: "closeEra" });
    assert.equal(s.phase, "over");
    assert.equal(s.collapsed, true);
    assert.equal(s.outcome.tier, "unraveling");
    assert.ok(s.outcome.players.every((p) => !p.winner));
  });
  test("outcome tiers", () => {
    const all = (v) => Object.fromEntries(BASE.domains.map((d) => [d.id, v]));
    assert.equal(outcomeTier(BASE, all(6)).tier, "resilient");
    assert.equal(outcomeTier(BASE, { ...all(7), fire: 2 }).tier, "holding", "crisis blocks resilient");
    assert.equal(outcomeTier(BASE, all(5)).tier, "holding");
    assert.equal(outcomeTier(BASE, all(4)).tier, "unraveling");
    assert.equal(outcomeTier(BASE, all(9), true).tier, "unraveling");
  });
});

describe("mandates", () => {
  test("variant hash is deterministic and in range", () => {
    for (let seat = 1; seat <= 7; seat++) {
      const v = mandateVariant("FRST42", seat, "role-state-forester", 2);
      assert.ok(v === 0 || v === 1);
      assert.equal(v, mandateVariant("FRST42", seat, "role-state-forester", 2));
    }
    const seen = new Set();
    for (let i = 0; i < 40; i++) seen.add(mandateVariant(makeCode(i), 1, "role-mill-owner", 2));
    assert.equal(seen.size, 2, "both variants occur");
  });
  test("progress and winners", () => {
    const content = C();
    const m = { targets: [{ domain: "fire", min: 6 }, { domain: "water", min: 6 }, { domain: "wood", min: 5 }], guardrail: { domain: "communities", min: 4 } };
    const cond = { fire: 6, water: 7, wood: 4, communities: 4 };
    const p = mandateProgress(content, cond, m);
    assert.equal(p.met, 3); assert.equal(p.total, 4); assert.equal(p.fulfilled, false);
    const s = createGame(content, setup5());
    for (const d of content.domains) s.cond[d.id] = 9;
    const r = finalResults(content, s);
    assert.equal(r.tier, "resilient");
    assert.ok(r.players.every((x) => x.fulfilled && x.winner));
    assert.equal(r.players[0].mandate, mandateFor(content, "FRST42", 0, ROLES5[0]));
    assert.ok(r.players[0].future);
  });
});

describe("abilities", () => {
  const ROLES = {
    boost: "role-state-forester", protect: "role-forest-supervisor", cancel: "role-tribal-director",
    capacity: "role-county-commissioner", discount: "role-mill-owner", "refresh-market": "role-ngo-director",
    redraw: "role-fire-scientist", decide: "role-regional-forester", move: "role-water-utility",
  };
  const bigDeck = (content) => { const extra = []; for (const suf of ["b", "c"]) for (const x of content.signals) extra.push({ ...structuredClone(x), id: `${x.id}-${suf}` }); content.signals.push(...extra); return content; };
  const game = (content, roleIds) => createGame(bigDeck(content), { code: "ABCDEF", scenarioId: "scn-thin-margins", length: "standard", players: roleIds.map((roleId, i) => ({ name: `P${i}`, roleId })) });
  const all = Object.values(ROLES);

  test("boost (+choices), once per game", () => {
    const content = C();
    let s = game(content, all);
    throwsEngine(() => run(content, s, { type: "useAbility", seat: 0, domain: "water" }), /allowed/);
    const p = s.cond.partners;
    s = run(content, s, { type: "useAbility", seat: 0, domain: "partners" });
    assert.equal(s.cond.partners, p + 1);
    throwsEngine(() => run(content, s, { type: "useAbility", seat: 0, domain: "partners" }), /Already used/);
  });
  test("protect blocks later signal effects", () => {
    const content = C();
    let s = game(content, all);
    s = run(content, s, { type: "useAbility", seat: 1, domain: "water" });
    assert.deepEqual(s.protected, ["water"]);
  });
  test("cancel (cascade scope) reverts one negative change", () => {
    const content = C();
    let s = game(content, all);
    s.phase = "cascades"; s.cascade = { fired: [], done: false, matured: [] };
    s.cond.fire = 2;
    const w = s.cond.water;
    assert.equal(abilityAvailability(content, s, 2).ok, false);
    s = run(content, s, { type: "runCascades" });
    assert.equal(s.cond.water, w - 1);
    assert.equal(abilityAvailability(content, s, 2).ok, true);
    throwsEngine(() => run(content, s, { type: "useAbility", seat: 2, domain: "fire" }), /lowered/);
    s = run(content, s, { type: "useAbility", seat: 2, domain: "water" });
    assert.equal(s.cond.water, w);
  });
  test("cancel (driver / signal scope)", () => {
    const content = withDriver(C(), "drv-budget-squeeze");
    content.roles[2].ability.effect = { type: "cancel", scope: "driver" };
    let s = game(content, all);
    s = run(content, s, { type: "revealDriver" });
    s = run(content, s, { type: "useAbility", seat: 2, domain: "governance" });
    assert.equal(s.cond.governance, 4);
    const c2 = withDriver(C(), "drv-budget-squeeze");
    c2.roles[2].ability.effect = { type: "cancel", scope: "signal" };
    let t = toSignals(c2, game(c2, all));
    t.hands[0] = ["sig-fuel-work-slips"];
    const f = t.cond.fire, cm = t.cond.communities;
    t = run(c2, t, { type: "playSignal", seat: 0, card: "sig-fuel-work-slips" });
    t = run(c2, t, { type: "useAbility", seat: 2, domain: "communities" });
    assert.equal(t.cond.communities, cm);
    assert.equal(t.cond.fire, Math.max(0, f - 2));
  });
  test("capacity, discount, refresh-market (Council only)", () => {
    const content = C();
    content.strategies.find((x) => x.id === "str-mass-timber-hub").status = "active";
    content.rules.marketSize = 5;
    let s = game(content, all);
    throwsEngine(() => run(content, s, { type: "useAbility", seat: 3 }), /Council/);
    s = toCouncil(content, s);
    const cap = s.council.capacity[3];
    s = run(content, s, { type: "useAbility", seat: 3 });
    assert.equal(s.council.capacity[3], cap + 2);
    // discount: ensure a wood-tagged strategy is in market
    if (!s.council.market.includes("str-mass-timber-hub")) { s.council.market[0] = "str-mass-timber-hub"; s.council.pledges["str-mass-timber-hub"] = s.players.map(() => 0); }
    const other = s.council.market.find((id) => !(content.strategies.find((x) => x.id === id).tags || []).includes("wood"));
    throwsEngine(() => run(content, s, { type: "useAbility", seat: 4, strategy: other }), /wood/);
    s = run(content, s, { type: "useAbility", seat: 4, strategy: "str-mass-timber-hub" });
    assert.equal(s.council.discounts["str-mass-timber-hub"], 2);
    // refresh-market
    const before = s.council.market.slice();
    const replace = before.filter((id) => id !== "str-mass-timber-hub").slice(0, 2);
    throwsEngine(() => run(content, s, { type: "useAbility", seat: 5, strategies: before.slice(0, 3) }), /1–2/);
    s = run(content, s, { type: "useAbility", seat: 5, strategies: replace });
    for (const id of replace) assert.ok(!s.council.market.includes(id));
    assert.equal(s.council.market.length, before.length);
    for (const id of s.council.market) assert.ok(s.council.pledges[id]);
  });
  test("a discount after pledging hands the surplus back (QA N7) and needs an eligible strategy", () => {
    const content = C();
    content.strategies.find((x) => x.id === "str-mass-timber-hub").status = "active";
    let s = toCouncil(content, game(content, all));
    const others = s.council.market.filter((id) => id !== "str-mass-timber-hub" && !(content.strategies.find((x) => x.id === id).tags || []).includes("wood"));
    // no wood strategy in the market: the mill owner's discount is not ready
    s.council.market = others.slice(0, 4);
    assert.equal(abilityAvailability(content, s, 4).ok, false);
    assert.match(abilityAvailability(content, s, 4).reason, /wood/);
    s.council.market.push("str-mass-timber-hub");
    s.council.pledges["str-mass-timber-hub"] = s.players.map(() => 0);
    assert.equal(abilityAvailability(content, s, 4).ok, true);
    s.council.capacity = s.players.map(() => 7);
    s = run(content, s, { type: "pledge", seat: 0, strategy: "str-mass-timber-hub", amount: 4 }, { type: "pledge", seat: 1, strategy: "str-mass-timber-hub", amount: 3 });
    assert.equal(effectiveCost(content, s, "str-mass-timber-hub"), 7);
    s = run(content, s, { type: "useAbility", seat: 4, strategy: "str-mass-timber-hub" });
    assert.equal(effectiveCost(content, s, "str-mass-timber-hub"), 5);
    // 7 pledged, cost 5: two points go back, largest pledge first, ties to the later seat
    assert.deepEqual(s.council.pledges["str-mass-timber-hub"].slice(0, 2), [3, 2]);
    const entry = s.story[s.story.length - 1];
    assert.deepEqual(entry.refunded, [{ seat: 0, amount: 1 }, { seat: 1, amount: 1 }]);
    // the refunded capacity can be pledged elsewhere, and Lock funds the card at its new cost
    s = run(content, s, { type: "pledge", seat: 0, strategy: others[0], amount: 1 });
    assert.equal(s.council.pledges[others[0]][0], 1);
    s = run(content, s, { type: "lockCouncil" });
    assert.ok(s.council.funded.includes("str-mass-timber-hub"));
  });
  test("decide overrides the vote", () => {
    const content = withDriver(C(), "drv-budget-squeeze");
    let s = run(content, game(content, all), { type: "revealDriver" }, { type: "vote", seat: 0, option: 0 }, { type: "vote", seat: 1, option: 0 });
    s = run(content, s, { type: "useAbility", seat: 7, option: 1 });
    assert.equal(s.driver.chosen, 1);
    assert.equal(s.driver.decidedBy, 7);
  });
  test("redraw from the Far horizon", () => {
    const content = C();
    let s = game(content, all);
    const old = s.hands[6].slice();
    s = run(content, s, { type: "useAbility", seat: 6 });
    assert.equal(s.hands[6].length, 3);
    const far = new Set(content.signals.filter((x) => x.horizon === "far").map((x) => x.id));
    assert.ok(s.hands[6].every((id) => far.has(id)), "all far (3 far cards exist)");
    assert.ok(old.every((id) => s.out.includes(id)));
  });
  test("move up to amount", () => {
    const content = C();
    let s = game(content, all);
    s.cond.wood = 5; s.cond.water = 9;
    s = run(content, s, { type: "useAbility", seat: 8, from: "wood", to: "water", amount: 2 });
    assert.equal(s.cond.wood, 4); assert.equal(s.cond.water, 10, "moves only what the destination can receive: points are conserved");
    let t = game(C(), all);
    t.cond.wood = 1;
    t = run(content, t, { type: "useAbility", seat: 8, from: "wood", to: "water", amount: 2 });
    assert.equal(t.cond.wood, 0, "only the 1 point that exists moves");
    let u = game(C(), all);
    u.cond.wood = 0;
    throwsEngine(() => run(content, u, { type: "useAbility", seat: 8, from: "wood", to: "water", amount: 2 }), /nothing to move/);
  });
});

describe("history & purity", () => {
  test("reduce never mutates its input", () => {
    const s = createGame(BASE, setup5());
    const snap = JSON.stringify(s);
    reduce(BASE, s, { type: "revealDriver" });
    assert.equal(JSON.stringify(s), snap);
  });
  test("undo restores previous state; replay reproduces state", () => {
    let h = startHistory(BASE, setup5());
    h = dispatch(BASE, h, { type: "revealDriver" });
    h = dispatch(BASE, h, { type: "vote", seat: 0, option: 1 });
    const mid = h.state;
    h = dispatch(BASE, h, { type: "resolveDilemma" });
    h = undo(h);
    assert.deepEqual(h.state, mid);
    const r = replay(BASE, h.setup, h.log);
    assert.deepEqual(r.state, h.state);
  });
});

describe("full game", () => {
  function autoplay(content, setup, pick = 0) {
    let h = startHistory(content, setup);
    const d = (a) => { h = dispatch(content, h, a); };
    let guard = 0;
    while (h.state.phase !== "over" && guard++ < 500) {
      const s = h.state;
      switch (s.phase) {
        case "era-open": d({ type: "revealDriver" }); break;
        case "driver":
          if (s.driver.chosen == null) { s.players.forEach((_, i) => d({ type: "vote", seat: i, option: (i + pick) % 2 })); d({ type: "resolveDilemma", tieBreak: 0 }); }
          else d({ type: "beginSignals" });
          break;
        case "signals": {
          const t = s.turn;
          if (t.done) { d({ type: "beginCouncil" }); break; }
          const seat = t.order[t.pos];
          if (t.step === "choose" && s.hands[seat].length) { d({ type: "playSignal", seat, card: s.hands[seat][0] }); break; }
          if (t.step === "secondary") {
            const tg = secondaryTargets(content, s);
            if (!tg.anyValid) { d({ type: "resolveSecondary", skip: true }); break; }
            if (tg.type === "move") {
              const from = Object.keys(tg.from).find((x) => !tg.from[x]);
              const to = Object.keys(tg.to).find((x) => !tg.to[x] && x !== from);
              d({ type: "resolveSecondary", from, to });
            } else d({ type: "resolveSecondary", domain: Object.keys(tg.domain).find((x) => !tg.domain[x]) });
            break;
          }
          d({ type: "endTurn" });
          break;
        }
        case "council":
          if (!s.council.locked) {
            const id = s.council.market[0];
            s.players.forEach((_, i) => d({ type: "pledge", seat: i, strategy: id, amount: 2 }));
            d({ type: "lockCouncil" });
          } else d({ type: "beginHeadline" });
          break;
        case "headline": {
          const hl = s.headline;
          const author = (s.lead + 1) % s.players.length;
          if (!hl.subs[author] && hl.pick == null) d({ type: "submitHeadline", seat: author, text: "Forests hold the line" });
          else if (hl.pick == null) d({ type: "pickHeadline", seat: author });
          else if (!hl.placed) {
            const low = content.domains.map((x) => x.id).sort((a, b) => s.cond[a] - s.cond[b])[0];
            d({ type: "placeInfluence", alloc: [{ domain: low, delta: Math.min(2, 10 - s.cond[low]) }].concat(s.cond[low] >= 9 ? [{ domain: content.domains.map((x) => x.id).find((x) => x !== low && s.cond[x] < 10), delta: 1 }] : []) });
            d({ type: "setInsight", text: "Pool capacity early" });
          }
          else d({ type: "beginCascades" });
          break;
        }
        case "cascades": d(s.cascade.done ? { type: "closeEra" } : { type: "runCascades" }); break;
      }
    }
    return h;
  }
  test("a 5-player standard game runs start to finish deterministically", () => {
    const h = autoplay(BASE, setup5());
    assert.equal(h.state.phase, "over");
    assert.ok(h.state.rings.length >= 1 && h.state.rings.length <= 3);
    assert.ok(["resilient", "holding", "unraveling"].includes(h.state.outcome.tier));
    const h2 = autoplay(BASE, setup5());
    assert.deepEqual(h2.state, h.state);
    const kinds = new Set(h.state.story.map((e) => e.k));
    for (const k of ["driver", "dilemma", "signal", "strategy", "headline", "influence"]) assert.ok(kinds.has(k), k);
  });
  test("many seeds complete without errors", () => {
    for (let i = 0; i < 30; i++) {
      const code = makeCode(i * 104729);
      const h = autoplay(BASE, setup5({ code, scenarioId: i % 2 ? "scn-rebuild-together" : "scn-thin-margins", length: i % 3 ? "standard" : "deep" }), i);
      assert.equal(h.state.phase, "over", code);
    }
  });
});

// ---------------------------------------------------------------------------
// Designer balance rules (content/design.json): capacity scaling, outcome floors, market, legacy, cascades
// ---------------------------------------------------------------------------
const DESIGN_RULES = {
  handSize: 3, capacityBase: 4, capacityBaseByPlayers: { 3: 6, 4: 5, 5: 4, 6: 3, 7: 2 },
  capacityModifiers: { Crisis: -2, Strained: -1, Stable: 0, Thriving: 1, Transformed: 1 }, capacityMin: 1,
  councilSeconds: 300, headlineSeconds: 120, collapseCrisisCount: 3,
  outcome: { resilient: 6.5, resilientFloor: 6, holding: 5.0, holdingFloor: 3 }, outcomeDeep: { resilientFloor: 7 },
  headlineInfluence: 2, marketSize: 5, marketRefresh: "fresh", farDelayed: "legacy", cascadeMode: "simultaneous",
  signalRounds: { standard: 1, deep: 2 },
};
const D = (patch = {}) => { const c = C(); c.rules = { ...structuredClone(DESIGN_RULES), ...patch }; return c; };
const seats = (n) => ["role-state-forester", "role-forest-supervisor", "role-tribal-director", "role-county-commissioner", "role-mill-owner", "role-ngo-director", "role-fire-scientist", "role-regional-forester"].slice(0, n).map((roleId, i) => ({ name: `P${i}`, roleId }));
const gameN = (content, n, over = {}) => createGame(content, { code: "FRST42", scenarioId: "scn-thin-margins", length: "standard", players: seats(n), ...over });

describe("design rules", () => {
  test("capacityBaseByPlayers with capacityBase fallback", () => {
    const c = D();
    assert.equal(capacityBaseFor(c, 3), 6);
    assert.equal(capacityBaseFor(c, 5), 4);
    assert.equal(capacityBaseFor(c, 7), 2);
    assert.equal(capacityBaseFor(c, 8), 4, "falls back to capacityBase");
    const s = gameN(c, 3);
    s.cond.workforce = 5; s.cond.governance = 7; // Stable 0, Thriving +1
    assert.equal(baseCapacity(c, s), 7);
    const s7 = gameN(c, 7);
    s7.cond.workforce = 2; s7.cond.governance = 3; // Crisis −2, Strained −1 → 2−3 → min 1
    assert.equal(baseCapacity(c, s7), 1);
  });
  test("capacityModifiers keyed by band label, capacityMin", () => {
    const c = D({ capacityModifiers: { Crisis: -3, Strained: 0, Stable: 1, Thriving: 2, Transformed: 3 }, capacityMin: 2 });
    const s = gameN(c, 5);
    s.cond.workforce = 9; s.cond.governance = 7; // +3 +2
    assert.equal(baseCapacity(c, s), 9);
    s.cond.workforce = 1; s.cond.governance = 1; // 4 −6 → min 2
    assert.equal(baseCapacity(c, s), 2);
    // missing labels fall back to the SPEC defaults
    const c2 = D({ capacityModifiers: { Crisis: -2 } });
    assert.equal(rulesOf(c2).capacityModifiers.Thriving, 1);
  });
  test("outcome floors and outcomeDeep", () => {
    const c = D();
    const all = (v) => Object.fromEntries(c.domains.map((d) => [d.id, v]));
    assert.equal(outcomeTier(c, all(7)).tier, "resilient");
    assert.equal(outcomeTier(c, { ...all(7), fire: 5 }).tier, "holding", "below resilientFloor 6");
    assert.equal(outcomeTier(c, { ...all(7), fire: 6, water: 6 }).tier, "resilient", "6.8 index, min 6");
    assert.equal(outcomeTier(c, { ...all(6), wood: 9 }).tier, "holding", "index 6.3 < 6.5");
    assert.equal(outcomeTier(c, { ...all(6), fire: 2 }).tier, "unraveling", "below holdingFloor 3");
    assert.equal(outcomeTier(c, { ...all(5), fire: 3 }).tier, "unraveling", "index 4.8 < 5");
    assert.equal(outcomeTier(c, all(5)).tier, "holding");
    assert.equal(outcomeTier(c, all(9), true).tier, "unraveling", "collapse");
    // Deep: resilientFloor 7
    assert.equal(outcomeTier(c, { ...all(8), fire: 6 }, false, "deep").tier, "holding");
    assert.equal(outcomeTier(c, { ...all(8), fire: 6 }, false, "standard").tier, "resilient");
    assert.equal(outcomeTier(c, all(7), false, "deep").tier, "resilient");
    assert.equal(outcomeRules(c, "deep").resilient, 6.5, "outcomeDeep only overrides the fields it names");
    // finalResults uses the game's length
    const s = gameN(c, 5, { length: "deep" });
    for (const d of c.domains) s.cond[d.id] = 8;
    s.cond.fire = 6;
    assert.equal(finalResults(c, s).tier, "holding");
  });
  test("signalRounds by length", () => {
    assert.equal(gameN(D(), 4).rounds, 1);
    assert.equal(gameN(D(), 4, { length: "deep" }).rounds, 2);
    assert.equal(gameN(D({ signalRounds: { standard: 2, deep: 3 } }), 4).rounds, 2);
  });
  test("marketRefresh fresh: unfunded return to the deck, funded never return", () => {
    const c = D({ marketSize: 3 });
    let s = toCouncil(c, gameN(c, 5));
    const first = s.council.market.slice();
    const fundMe = first[0];
    const cost = c.strategies.find((x) => x.id === fundMe).cost;
    s.council.capacity = [8, 8, 8, 8, 8];
    s = run(c, s, { type: "pledge", seat: 0, strategy: fundMe, amount: cost }, { type: "lockCouncil" });
    assert.deepEqual(s.funded, [fundMe]);
    // play on to the next Council several times with different seeds: funded never reappears
    const seen = new Set();
    for (const code of ["AAAAAA", "BBBBBB", "CCCCCC", "DDDDDD", "EEEEEE", "FFFFFF"]) {
      let t = structuredClone(s);
      t.rng = seedFromCode(code);
      t = run(c, t, { type: "beginHeadline" }, { type: "skipHeadline" }, { type: "beginCascades" }, { type: "runCascades" }, { type: "closeEra" });
      if (t.phase === "over") continue;
      t = run(c, t, { type: "revealDriver" }, { type: "vote", seat: 0, option: 0 }, { type: "resolveDilemma" }, { type: "beginSignals" });
      while (!t.turn.done) t = run(c, t, { type: "endTurn" });
      t = run(c, t, { type: "beginCouncil" });
      assert.ok(!t.council.market.includes(fundMe));
      t.council.market.forEach((id) => seen.add(id));
    }
    assert.ok(first.slice(1).some((id) => seen.has(id)), "an unfunded strategy can be dealt again");
  });
  test("marketRefresh keep: unfunded strategies stay in the market", () => {
    const c = D({ marketSize: 3, marketRefresh: "keep" });
    let s = toCouncil(c, gameN(c, 5));
    const first = s.council.market.slice();
    s = run(c, s, { type: "lockCouncil" }, { type: "beginHeadline" }, { type: "skipHeadline" }, { type: "beginCascades" }, { type: "runCascades" }, { type: "closeEra" });
    s = run(c, s, { type: "revealDriver" }, { type: "vote", seat: 0, option: 0 }, { type: "resolveDilemma" }, { type: "beginSignals" });
    while (!s.turn.done) s = run(c, s, { type: "endTurn" });
    s = run(c, s, { type: "beginCouncil" });
    assert.deepEqual(s.council.market, first);
  });
  test("farDelayed legacy vs final", () => {
    for (const mode of ["legacy", "final"]) {
      const c = D({ farDelayed: mode, marketSize: 1 });
      c.strategies.forEach((x) => { if (x.id !== "str-seed-network") x.status = "retired"; });
      let s = gameN(c, 5);
      s.era = 2; // jump to the Far era
      for (const d of c.domains) s.cond[d.id] = 5;
      s = toCouncil(c, s);
      s.council.capacity = [5, 5, 5, 5, 5];
      s = run(c, s, { type: "pledge", seat: 0, strategy: "str-seed-network", amount: 5 }, { type: "lockCouncil" });
      const h = s.cond.health;
      s = run(c, s, { type: "beginHeadline" }, { type: "skipHeadline" }, { type: "beginCascades" }, { type: "runCascades" });
      const hAfterCascades = s.cond.health;
      s = run(c, s, { type: "closeEra" });
      assert.equal(s.phase, "over");
      if (mode === "legacy") {
        assert.equal(s.cond.health, hAfterCascades, "legacy effects never mature");
        assert.deepEqual(s.legacy.map((x) => x.id), ["str-seed-network"]);
      } else {
        assert.equal(s.cond.health, Math.min(10, hAfterCascades + 2), "final: matures at 2050");
        assert.equal(s.legacy.length, 0);
        assert.ok(s.story.some((e) => e.k === "delayed" && e.id === "str-seed-network"));
      }
      assert.ok(h >= 0);
    }
  });
  test("cascadeMode simultaneous vs sequential; any lte/gte threshold", () => {
    const base = C();
    base.cascades = [
      { id: "cas-a", when: { domain: "fire", lte: 5 }, effects: [{ domain: "water", delta: -1 }], text: "", status: "active" },
      { id: "cas-b", when: { domain: "water", lte: 4 }, effects: [{ domain: "health", delta: -1 }], text: "", status: "active" },
      { id: "cas-c", when: { domain: "wood", gte: 7 }, effects: [{ domain: "climate", delta: -1 }], text: "", status: "active" },
    ];
    const setup = (c) => { const s = gameN(c, 5); s.phase = "cascades"; s.cascade = { fired: [], done: false, matured: [] }; Object.assign(s.cond, { fire: 5, water: 5, health: 5, wood: 7, climate: 5 }); return s; };
    const sim = { ...base, rules: { ...base.rules, cascadeMode: "simultaneous" } };
    let s = run(sim, setup(sim), { type: "runCascades" });
    assert.deepEqual(s.cascade.fired, ["cas-a", "cas-c"], "chronic lte 5 and gte 7 fire; water ≤4 is not checked on the new state");
    assert.equal(s.cond.water, 4); assert.equal(s.cond.health, 5); assert.equal(s.cond.climate, 4);
    const seq = { ...base, rules: { ...base.rules, cascadeMode: "sequential" } };
    let t = run(seq, setup(seq), { type: "runCascades" });
    assert.deepEqual(t.cascade.fired, ["cas-a", "cas-b", "cas-c"]);
    assert.equal(t.cond.health, 4);
  });
  test("points are never silently destroyed: invalid targets are refused with a reason", () => {
    const c = C();
    let s = toSignals(c, gameN(c, 5));
    s.hands[0] = ["sig-seedling-squeeze"]; // remove 1
    s.cond.wood = 0;
    s = run(c, s, { type: "playSignal", seat: 0, card: "sig-seedling-squeeze" });
    assert.equal(secondaryTargets(c, s).domain.wood, "already at 0");
    throwsEngine(() => run(c, s, { type: "resolveSecondary", domain: "wood" }), /already at 0/);
    s = run(c, s, { type: "resolveSecondary", domain: "water" }, { type: "endTurn" });
    // add into a domain at 10
    s.hands[1] = ["sig-fewer-hands"];
    s.cond.partners = 10;
    s = run(c, s, { type: "playSignal", seat: 1, card: "sig-fewer-hands" });
    throwsEngine(() => run(c, s, { type: "resolveSecondary", domain: "partners" }), /already at 10/);
    s = run(c, s, { type: "resolveSecondary", domain: "water" }, { type: "endTurn" });
    // move: from 0 refused, into 10 refused, partial room conserved
    s.hands[2] = ["sig-insurers-exit"]; // move 1
    s.cond.recreation = 0; s.cond.climate = 10; s.cond.wood = 6; s.cond.health = 9;
    s = run(c, s, { type: "playSignal", seat: 2, card: "sig-insurers-exit" });
    throwsEngine(() => run(c, s, { type: "resolveSecondary", from: "recreation", to: "water" }), /nothing to move/);
    throwsEngine(() => run(c, s, { type: "resolveSecondary", from: "wood", to: "climate" }), /already at 10/);
    s = run(c, s, { type: "resolveSecondary", from: "wood", to: "health" });
    assert.equal(s.cond.wood + s.cond.health, 15, "total conserved");
  });
  test("a secondary with no valid target can be skipped", () => {
    const c = C();
    let s = toSignals(c, gameN(c, 5));
    s.hands[0] = ["sig-fewer-hands"]; // add 1, primary workforce
    for (const d of c.domains) s.cond[d.id] = 10;
    s.cond.workforce = 5;
    s = run(c, s, { type: "playSignal", seat: 0, card: "sig-fewer-hands" });
    assert.equal(secondaryTargets(c, s).anyValid, false);
    s = run(c, s, { type: "resolveSecondary", skip: true });
    assert.equal(s.turn.step, "discard");
    assert.ok(s.story.at(-1).secondary.skipped);
  });
  test("headline influence and boost can't push past 10", () => {
    const c = C();
    let s = toCouncil(c, gameN(c, 5));
    s = run(c, s, { type: "lockCouncil" }, { type: "beginHeadline" }, { type: "submitHeadline", seat: 1, text: "x" }, { type: "pickHeadline", seat: 1 });
    s.cond.water = 9;
    throwsEngine(() => run(c, s, { type: "placeInfluence", alloc: [{ domain: "water", delta: 2 }] }), /only take \+1/);
    s = run(c, s, { type: "placeInfluence", alloc: [{ domain: "water", delta: 1 }, { domain: "fire", delta: 1 }] });
    assert.equal(s.cond.water, 10);
  });
  test("a discount never drops a strategy below cost 1", () => {
    const c = D();
    c.strategies.find((x) => x.id === "str-cultural-burning").cost = 2;
    c.strategies.find((x) => x.id === "str-cultural-burning").tags = ["wood"];
    let s = toCouncil(c, gameN(c, 5));
    s.council.market[0] = "str-cultural-burning";
    s.council.pledges["str-cultural-burning"] = [0, 0, 0, 0, 0];
    s = run(c, s, { type: "useAbility", seat: 4, strategy: "str-cultural-burning" });
    assert.equal(effectiveCost(c, s, "str-cultural-burning"), 1);
    const unpledged = run(c, s, { type: "lockCouncil" });
    assert.ok(!unpledged.council.funded.includes("str-cultural-burning"), "needs its 1 pledge");
    s.council.capacity = [3, 3, 3, 3, 3];
    s = run(c, s, { type: "pledge", seat: 0, strategy: "str-cultural-burning", amount: 1 }, { type: "lockCouncil" });
    assert.ok(s.council.funded.includes("str-cultural-burning"));
  });
  test("blocked (protected) signal effects keep their requested change for the story", () => {
    const c = C();
    let s = toSignals(c, gameN(c, 5));
    s.protected = ["water"];
    s.hands[0] = ["sig-snow-that-wasnt"];
    s = run(c, s, { type: "playSignal", seat: 0, card: "sig-snow-that-wasnt" });
    const e = s.story.at(-1).primary[0];
    assert.equal(e.blocked, true); assert.equal(e.delta, -2);
  });
  test("roleSets are validated as warnings", () => {
    const c = C();
    c.roleSets = { 3: ["role-state-forester", "role-nope", "role-mill-owner"] };
    const v = validateContent(c);
    assert.deepEqual(v.errors, []);
    assert.ok(v.warnings.some((w) => /role-nope/.test(w)));
  });
});
