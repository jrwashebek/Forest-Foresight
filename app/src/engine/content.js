// Content model helpers + validation. Pure; shared by engine, UI and editor.
import { hash32 } from "./rng.js";

export const HORIZONS = ["now", "near", "far"];
export const SECONDARY_TYPES = ["fixed", "add", "remove", "move", "protect"];
export const STRATEGY_KINDS = ["no-regret", "hedge", "big-bet", "trade-off"];
export const SECTORS = ["federal", "state", "tribal", "local", "private", "ngo", "science"];
export const ABILITY_TYPES = ["boost", "protect", "capacity", "discount", "cancel", "decide", "redraw", "refresh-market", "move"];
export const CANCEL_SCOPES = ["driver", "signal", "cascade"];
export const STATUSES = ["active", "retired"];

export const DEFAULT_CAPACITY_MODIFIERS = { Crisis: -2, Strained: -1, Stable: 0, Thriving: 1, Transformed: 1 };

export const DEFAULT_RULES = {
  handSize: 3, capacityBase: 3, capacityMin: 1, councilSeconds: 300, headlineSeconds: 120,
  collapseCrisisCount: 3,
  // resilientFloor / holdingFloor: lowest domain level allowed for that tier.
  // When absent, Resilient requires "no domain in Crisis" and Holding has no floor (SPEC v0.1).
  outcome: { resilient: 6.0, holding: 4.5 },
  headlineInfluence: 2, marketSize: 5,
  marketRefresh: "fresh",        // "fresh": new market each Council, unfunded return to the deck | "keep": unfunded stay
  farDelayed: "legacy",          // "legacy": final-era delayed effects never mature (shown in debrief) | "final": mature at game end
  cascadeMode: "simultaneous",   // "simultaneous": all conditions checked on the pre-cascade state | "sequential": in list order, chaining
  signalRounds: { standard: 1, deep: 2 },
};

export const DEFAULT_BANDS = [
  { min: 0, max: 2, label: "Crisis" },
  { min: 3, max: 4, label: "Strained" },
  { min: 5, max: 6, label: "Stable" },
  { min: 7, max: 8, label: "Thriving" },
  { min: 9, max: 10, label: "Transformed" },
];

export function rulesOf(content) {
  const r = (content && content.rules) || {};
  return {
    ...DEFAULT_RULES, ...r,
    outcome: { ...DEFAULT_RULES.outcome, ...(r.outcome || {}) },
    capacityModifiers: { ...DEFAULT_CAPACITY_MODIFIERS, ...(r.capacityModifiers || {}) },
    signalRounds: { ...DEFAULT_RULES.signalRounds, ...(r.signalRounds || {}) },
  };
}

/** Outcome thresholds for a game length (Deep games merge `outcomeDeep`). */
export function outcomeRules(content, length) {
  const r = rulesOf(content);
  const base = { ...r.outcome };
  if (length === "deep" && r.outcomeDeep) Object.assign(base, r.outcomeDeep);
  const bands = bandsOf(content);
  if (base.resilientFloor == null) base.resilientFloor = bands[0].max + 1; // no domain in Crisis
  if (base.holdingFloor == null) base.holdingFloor = 0;
  return base;
}

/** Base capacity before band modifiers: by player count when the rules say so. */
export function capacityBaseFor(content, nPlayers) {
  const r = rulesOf(content);
  const by = r.capacityBaseByPlayers;
  if (by && by[String(nPlayers)] != null && Number.isFinite(+by[String(nPlayers)])) return +by[String(nPlayers)];
  return r.capacityBase;
}

export function bandsOf(content) {
  return content && Array.isArray(content.bands) && content.bands.length ? content.bands : DEFAULT_BANDS;
}

export function bandOf(content, value) {
  const bands = bandsOf(content);
  const v = Math.round(value);
  return bands.find((b) => v >= b.min && v <= b.max) || (v < bands[0].min ? bands[0] : bands[bands.length - 1]);
}

export function bandIndex(content, value) {
  const bands = bandsOf(content);
  return Math.max(0, bands.indexOf(bandOf(content, value)));
}

/** The lowest band is "Crisis" by convention (index 0). */
export function isCrisis(content, value) {
  return bandIndex(content, value) === 0;
}

/** Capacity modifier by band label (rules.capacityModifiers; default Crisis −2 … Thriving/Transformed +1). */
export function capacityModifier(content, value) {
  const mods = rulesOf(content).capacityModifiers;
  const label = bandOf(content, value).label;
  if (mods[label] != null) return +mods[label];
  const i = bandIndex(content, value);
  return [-2, -1, 0, 1, 1][Math.min(i, 4)];
}

export const clamp = (v, lo = 0, hi = 10) => Math.max(lo, Math.min(hi, v));

export function indexBy(arr) {
  const m = Object.create(null);
  for (const x of arr || []) if (x && x.id != null) m[x.id] = x;
  return m;
}

export function active(arr) {
  return (arr || []).filter((x) => x && x.status !== "retired");
}

/** Stable stringify (sorted keys) so fingerprints don't depend on key order. */
export function stableStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
}

export function contentHash(content) {
  return hash32(stableStringify(content)).toString(36).toUpperCase().padStart(7, "0").slice(-5);
}

export function fingerprint(content) {
  const ed = (content && content.meta && content.meta.edition) || "draft";
  return `${ed}/${contentHash(content)}`;
}

export function wordCount(s) {
  return String(s || "").trim().split(/\s+/).filter(Boolean).length;
}

/** Months between two YYYY-MM-DD strings (b defaults to "today" supplied by caller). */
export function monthsBetween(a, b) {
  const pa = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a || "");
  const pb = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b || "");
  if (!pa || !pb) return Infinity;
  return (+pb[1] - +pa[1]) * 12 + (+pb[2] - +pa[2]) + (+pb[3] - +pa[3]) / 31;
}

export function reviewDue(item, today, months = 18) {
  return monthsBetween(item && item.reviewed, today) > months;
}

// ---------------------------------------------------------------------------
// Validation. Each item validator returns [{field, msg, level}] (level "error"|"warn").
// ---------------------------------------------------------------------------

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function isInt(n) { return Number.isInteger(n); }
const fmtN = (n) => (n < 0 ? `−${-n}` : `${n}`);

function ctxOf(content) {
  const domains = new Set((content.domains || []).map((d) => d && d.id));
  const eras = new Set((content.eras || []).map((e) => e && e.id));
  const drivers = new Set((content.drivers || []).map((d) => d && d.id));
  return { domains, eras: eras.size ? eras : new Set(HORIZONS), drivers };
}

function effList(out, field, list, ctx, lo, hi, { required = true, min = 1, max = 6 } = {}) {
  if (list == null && !required) return;
  if (!Array.isArray(list)) { out.push({ field, msg: "must be a list of effects", level: "error" }); return; }
  if (list.length < min) out.push({ field, msg: `needs at least ${min} effect${min > 1 ? "s" : ""}`, level: "error" });
  if (list.length > max) out.push({ field, msg: `has more than ${max} effects`, level: "warn" });
  list.forEach((e, i) => {
    if (!e || !ctx.domains.has(e.domain)) out.push({ field: `${field}[${i}].domain`, msg: `Effect ${i + 1} uses a domain that doesn't exist ("${e && e.domain}")`, level: "error" });
    if (!e || !isInt(e.delta) || e.delta < lo || e.delta > hi || e.delta === 0)
      out.push({ field: `${field}[${i}].delta`, msg: `Each change must be a whole number from ${fmtN(lo)} to +${hi}, not 0`, level: "error" });
  });
}

function req(out, item, field, label = field) {
  const v = item[field];
  if (v == null || (typeof v === "string" && !v.trim())) out.push({ field, msg: `Fill in the ${label}`, level: "error" });
}

function words(out, item, field, max) {
  if (typeof item[field] === "string" && wordCount(item[field]) > max)
    out.push({ field, msg: `The ${field} has ${wordCount(item[field])} words; aim for ${max} or fewer`, level: "warn" });
}

function common(out, item) {
  if (!item.id || !ID_RE.test(item.id)) out.push({ field: "id", msg: "The ID may use only lowercase letters, digits and dashes (like sig-new-card)", level: "error" });
  if (item.status != null && !STATUSES.includes(item.status)) out.push({ field: "status", msg: "status must be active or retired", level: "error" });
  if (item.reviewed != null && !DATE_RE.test(item.reviewed)) out.push({ field: "reviewed", msg: "reviewed must be YYYY-MM-DD", level: "warn" });
}

function source(out, src, required) {
  if (!src) { if (required) out.push({ field: "source", msg: "Add a source: every card cites a real page you have read", level: "error" }); return; }
  if (!src.title) out.push({ field: "source.title", msg: "Add the source's title", level: required ? "error" : "warn" });
  if (!src.url || !/^https?:\/\//.test(src.url)) out.push({ field: "source.url", msg: "The source link must start with http:// or https://", level: required ? "error" : "warn" });
  if (src.date && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(src.date)) out.push({ field: "source.date", msg: "Write the publication date as YYYY-MM-DD", level: "warn" });
}

export function validateSignal(s, ctx) {
  const out = [];
  common(out, s);
  req(out, s, "title"); req(out, s, "signal", "signal text");
  words(out, s, "title", 6); words(out, s, "signal", 40); words(out, s, "prompt", 20);
  if (!ctx.eras.has(s.horizon)) out.push({ field: "horizon", msg: "Choose a horizon (Now, Near or Far)", level: "error" });
  const p = s.primary || {};
  if (!ctx.domains.has(p.domain)) out.push({ field: "primary.domain", msg: "Choose the primary effect's domain", level: "error" });
  if (!isInt(p.delta) || p.delta === 0 || p.delta < -3 || p.delta > 3) out.push({ field: "primary.delta", msg: "Primary change must be a whole number from −3 to +3, not 0", level: "error" });
  if (!p.text) out.push({ field: "primary.text", msg: "Write the primary outcome", level: "error" });
  else if (wordCount(p.text) > 25) out.push({ field: "primary.text", msg: "Primary outcome is over 25 words", level: "warn" });
  const sc = s.secondary;
  if (sc) {
    if (!SECONDARY_TYPES.includes(sc.type)) out.push({ field: "secondary.type", msg: "Choose a secondary type: fixed, add, remove, move or protect", level: "error" });
    if (sc.type === "fixed") {
      if (!ctx.domains.has(sc.domain)) out.push({ field: "secondary.domain", msg: "Choose the secondary effect's domain", level: "error" });
      else if (sc.domain === p.domain) out.push({ field: "secondary.domain", msg: "The secondary effect must use a different domain than the primary", level: "error" });
      if (!isInt(sc.delta) || sc.delta === 0 || sc.delta < -2 || sc.delta > 2) out.push({ field: "secondary.delta", msg: "Secondary change must be a whole number from −2 to +2, not 0", level: "error" });
    }
    if (["add", "remove", "move"].includes(sc.type) && (!isInt(sc.amount) || sc.amount < 1 || sc.amount > 3))
      out.push({ field: "secondary.amount", msg: "Amount must be 1, 2 or 3", level: "error" });
    if (!sc.text) out.push({ field: "secondary.text", msg: "Add the secondary outcome or the prompt for the player", level: "warn" });
  }
  source(out, s.source, true);
  const allText = [s.title, s.signal, p.text, sc && sc.text, s.prompt].join(" ");
  if (/\bcubes?\b/i.test(allText)) out.push({ field: "secondary.text", msg: "Mentions “cube”, a 2019 board-game term. Say “point” or describe the change instead", level: "warn" });
  if (s.origin != null && !["new", "2019-updated"].includes(s.origin)) out.push({ field: "origin", msg: "origin must be new or 2019-updated", level: "warn" });
  return out;
}

export function validateDriver(d, ctx) {
  const out = [];
  common(out, d);
  req(out, d, "title"); req(out, d, "text");
  words(out, d, "text", 40);
  if (!ctx.eras.has(d.horizon)) out.push({ field: "horizon", msg: "Choose a horizon (Now, Near or Far)", level: "error" });
  effList(out, "effects", d.effects, ctx, -3, 3, { min: 1, max: 4 });
  const dl = d.dilemma;
  if (!dl || !dl.prompt) out.push({ field: "dilemma.prompt", msg: "Write the dilemma question", level: "error" });
  else words(out, dl, "prompt", 30);
  const opts = (dl && dl.options) || [];
  if (opts.length < 2 || opts.length > 3) out.push({ field: "dilemma.options", msg: "A dilemma needs 2 or 3 options", level: "error" });
  opts.forEach((o, i) => {
    if (!o.label) out.push({ field: `dilemma.options[${i}].label`, msg: "Give each option a short label", level: "error" });
    effList(out, `dilemma.options[${i}].effects`, o.effects, ctx, -3, 3, { min: 1, max: 4 });
  });
  source(out, d.source, true);
  return out;
}

export function validateStrategy(s, ctx) {
  const out = [];
  common(out, s);
  req(out, s, "title"); req(out, s, "text");
  words(out, s, "text", 30);
  if (!isInt(s.cost) || s.cost < 2 || s.cost > 8) out.push({ field: "cost", msg: "Cost must be a whole number from 2 to 8", level: "error" });
  effList(out, "effects", s.effects, ctx, -3, 3, { min: 1, max: 4 });
  effList(out, "delayed", s.delayed, ctx, -3, 3, { required: false, min: 0, max: 4 });
  if (!STRATEGY_KINDS.includes(s.kind)) out.push({ field: "kind", msg: "Choose a kind: no-regret, hedge, big bet or trade-off", level: "error" });
  return out;
}

export function validateAbility(a, ctx) {
  const out = [];
  if (!a || !a.effect) { out.push({ field: "ability", msg: "Give the role an ability", level: "error" }); return out; }
  const e = a.effect;
  if (!a.name) out.push({ field: "ability.name", msg: "Name the ability", level: "error" });
  if (!ABILITY_TYPES.includes(e.type)) { out.push({ field: "ability.effect.type", msg: `unknown ability type "${e.type}"`, level: "error" }); return out; }
  if (e.choices != null) {
    if (!Array.isArray(e.choices) || !e.choices.length) out.push({ field: "ability.effect.choices", msg: "choices must be a list of domains", level: "error" });
    else e.choices.forEach((c) => { if (!ctx.domains.has(c)) out.push({ field: "ability.effect.choices", msg: `unknown domain "${c}"`, level: "error" }); });
  }
  if (e.type === "boost" && (!isInt(e.delta) || e.delta < 1 || e.delta > 3)) out.push({ field: "ability.effect.delta", msg: "boost delta must be 1…3", level: "error" });
  if (["capacity", "discount", "move"].includes(e.type) && (!isInt(e.amount) || e.amount < 1 || e.amount > 4)) out.push({ field: "ability.effect.amount", msg: "amount must be 1…4", level: "error" });
  if (e.type === "cancel" && !CANCEL_SCOPES.includes(e.scope)) out.push({ field: "ability.effect.scope", msg: "cancel scope must be driver, signal or cascade", level: "error" });
  if (e.type === "redraw" && e.horizon != null && !ctx.eras.has(e.horizon)) out.push({ field: "ability.effect.horizon", msg: "redraw horizon must be an era id", level: "error" });
  if (e.type === "refresh-market" && (!isInt(e.count) || e.count < 1 || e.count > 5)) out.push({ field: "ability.effect.count", msg: "count must be 1…5", level: "error" });
  return out;
}

export function validateRole(r, ctx) {
  const out = [];
  common(out, r);
  req(out, r, "title"); req(out, r, "org", "organisation");
  words(out, r, "bio", 40);
  if (r.sector != null && !SECTORS.includes(r.sector)) out.push({ field: "sector", msg: "unknown sector", level: "warn" });
  const ms = r.mandates || [];
  if (!ms.length) out.push({ field: "mandates", msg: "Add at least one mandate", level: "error" });
  ms.forEach((m, i) => {
    const t = m.targets || [];
    if (t.length !== 3) out.push({ field: `mandates[${i}].targets`, msg: "A mandate needs exactly 3 targets", level: "error" });
    const seen = new Set();
    t.forEach((x, j) => {
      if (!ctx.domains.has(x.domain)) out.push({ field: `mandates[${i}].targets[${j}].domain`, msg: `unknown domain "${x.domain}"`, level: "error" });
      if (seen.has(x.domain)) out.push({ field: `mandates[${i}].targets[${j}].domain`, msg: "Use three different domains for the targets", level: "warn" });
      seen.add(x.domain);
      if (!isInt(x.min) || x.min < 0 || x.min > 10) out.push({ field: `mandates[${i}].targets[${j}].min`, msg: "Each target must be a level from 0 to 10", level: "error" });
    });
    const g = m.guardrail;
    if (!g || !ctx.domains.has(g.domain)) out.push({ field: `mandates[${i}].guardrail.domain`, msg: "Choose the guardrail's domain", level: "error" });
    if (!g || !isInt(g.min) || g.min < 0 || g.min > 10) out.push({ field: `mandates[${i}].guardrail.min`, msg: "The guardrail must be a level from 0 to 10", level: "error" });
  });
  out.push(...validateAbility(r.ability, ctx));
  const f = r.future || {};
  if (!f.resilient || !f.holding || !f.unraveling) out.push({ field: "future", msg: "future job titles for resilient, holding and unraveling are recommended", level: "warn" });
  return out;
}

export function validateCascade(c, ctx) {
  const out = [];
  common(out, c);
  const w = c.when || {};
  if (!ctx.domains.has(w.domain)) out.push({ field: "when.domain", msg: "Choose the domain that triggers this rule", level: "error" });
  const ops = ["lte", "gte", "lt", "gt"].filter((k) => w[k] != null);
  if (ops.length !== 1) out.push({ field: "when", msg: "Choose one condition: at or below, at or above, below or above", level: "error" });
  else if (!isInt(w[ops[0]]) || w[ops[0]] < 0 || w[ops[0]] > 10) out.push({ field: `when.${ops[0]}`, msg: "The threshold must be a level from 0 to 10", level: "error" });
  effList(out, "effects", c.effects, ctx, -3, 3, { min: 1, max: 4 });
  return out;
}

export function validateScenario(s, ctx) {
  const out = [];
  common(out, s);
  req(out, s, "name");
  words(out, s, "summary", 60);
  const st = s.start || {};
  for (const d of ctx.domains) {
    if (!isInt(st[d]) || st[d] < 0 || st[d] > 10) out.push({ field: `start.${d}`, msg: `starting condition for ${d} must be 0…10`, level: "error" });
  }
  const pools = s.drivers || {};
  for (const e of ctx.eras) {
    const pool = pools[e] || [];
    if (!pool.length) out.push({ field: `drivers.${e}`, msg: `no drivers in the ${e} pool (a random active driver of that horizon will be used)`, level: "warn" });
    pool.forEach((id) => { if (!ctx.drivers.has(id)) out.push({ field: `drivers.${e}`, msg: `unknown driver "${id}"`, level: "error" }); });
  }
  return out;
}

export function validateDomain(d) {
  const out = [];
  if (!d.id || !/^[a-z][a-z0-9]*$/.test(d.id)) out.push({ field: "id", msg: "domain id must be a short lowercase key", level: "error" });
  req(out, d, "name");
  if (!d.color || !HEX_RE.test(d.color)) out.push({ field: "color", msg: "color must be a #RRGGBB hex", level: "error" });
  return out;
}

export const KIND_LABEL = { domains: "Domain", signals: "Signal", drivers: "Driver", strategies: "Strategy", roles: "Role", cascades: "Cascade", scenarios: "Scenario" };

export const VALIDATORS = {
  signals: validateSignal, drivers: validateDriver, strategies: validateStrategy,
  roles: validateRole, cascades: validateCascade, scenarios: validateScenario, domains: (d) => validateDomain(d),
};

/** Whole-content validation → { errors: [string], warnings: [string] } */
export function validateContent(content) {
  const errors = [], warnings = [];
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return { errors: ["Content is not a JSON object."], warnings };
  }
  const need = ["meta", "domains", "eras", "signals", "drivers", "strategies", "roles", "scenarios"];
  for (const k of need) if (content[k] == null) errors.push(`Missing top-level "${k}".`);
  if (errors.length) return { errors, warnings };
  for (const k of ["domains", "eras", "signals", "drivers", "strategies", "roles", "scenarios"]) {
    if (!Array.isArray(content[k])) errors.push(`"${k}" must be a list.`);
  }
  if (errors.length) return { errors, warnings };
  if (content.domains.length < 3 || content.domains.length > 16) errors.push(`Need 3–16 domains (found ${content.domains.length}).`);
  if (!content.eras.length) errors.push("Need at least one era.");
  content.eras.forEach((e, i) => {
    if (!e.id) errors.push(`eras[${i}] needs an id.`);
    const w = e.weights || {};
    const sum = Object.values(w).reduce((a, b) => a + (+b || 0), 0);
    if (!(sum > 0)) errors.push(`Era "${e.id}" needs draw weights.`);
  });
  const bands = bandsOf(content);
  let expect = 0;
  for (const b of bands) { if (b.min !== expect) { errors.push("Bands must cover 0–10 without gaps."); break; } expect = b.max + 1; }
  if (expect !== 11 && !errors.includes("Bands must cover 0–10 without gaps.")) errors.push("Bands must cover 0–10 without gaps.");

  const ctx = ctxOf(content);
  const kinds = ["domains", "signals", "drivers", "strategies", "roles", "cascades", "scenarios"];
  for (const kind of kinds) {
    const list = content[kind] || [];
    const seen = new Set();
    list.forEach((item, i) => {
      if (!item || typeof item !== "object") { errors.push(`${kind}[${i}] is not an object.`); return; }
      const label = `${KIND_LABEL[kind]} "${item.id || "#" + (i + 1)}"`;
      if (item.id && seen.has(item.id)) errors.push(`Duplicate id ${label}.`);
      seen.add(item.id);
      for (const p of VALIDATORS[kind](item, ctx)) (p.level === "error" ? errors : warnings).push(`${label}: ${p.field} — ${p.msg}`);
    });
  }
  if (content.roleSets && typeof content.roleSets === "object") {
    const roleIds = new Set((content.roles || []).map((r) => r && r.id));
    for (const [n, ids] of Object.entries(content.roleSets)) {
      if (!Array.isArray(ids)) { warnings.push(`roleSets "${n}" must be a list of role ids.`); continue; }
      if (ids.length !== +n) warnings.push(`roleSets "${n}" lists ${ids.length} roles.`);
      ids.forEach((id) => { if (!roleIds.has(id)) warnings.push(`roleSets "${n}": unknown role "${id}".`); });
    }
  }
  const act = (k) => active(content[k]).length;
  if (act("signals") < 6) errors.push(`Need at least 6 active signals (found ${act("signals")}).`);
  if (act("strategies") < 2) errors.push("Need at least 2 active strategies.");
  if (act("roles") < 3) errors.push("Need at least 3 active roles.");
  if (act("scenarios") < 1) errors.push("Need at least 1 active scenario.");
  if (act("drivers") < 1) errors.push("Need at least 1 active driver.");
  return { errors, warnings };
}
