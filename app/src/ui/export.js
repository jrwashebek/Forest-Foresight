import { lookups, bandOf, resilienceIndex } from "../engine/index.js";

const TIER = { resilient: "Resilient", holding: "Holding", unraveling: "Unraveling" };
export const tierName = (t) => TIER[t] || t;

/** Group story entries by era. */
export function storyByEra(content, st) {
  const eras = content.eras.map((e, i) => ({ era: e, i, items: [] }));
  for (const e of st.story) if (e.k !== "start" && eras[e.era]) eras[e.era].items.push(e);
  return eras.filter((x) => x.i <= st.era);
}

export function signalsToWatch(content, st) {
  const L = lookups(content);
  const seen = new Set();
  const out = [];
  for (const e of st.story) {
    if (e.k === "signal" && !seen.has(e.id) && L.signals[e.id]) { seen.add(e.id); out.push({ kind: "signal", item: L.signals[e.id], entry: e }); }
    if (e.k === "driver" && !seen.has(e.id) && L.drivers[e.id]) { seen.add(e.id); out.push({ kind: "driver", item: L.drivers[e.id], entry: e }); }
  }
  return out;
}

function chg(L, list) {
  return (list || []).filter((c) => c.to !== c.from || c.blocked).map((c) => {
    const n = (L.domains[c.d] || {}).name || c.d;
    if (c.blocked) return `${n} ${c.delta > 0 ? "+" : "−"}${Math.abs(c.delta)} (blocked: protected)`;
    return `${n} ${c.to > c.from ? "+" : "−"}${Math.abs(c.to - c.from)}`;
  }).join(", ");
}
function abilityText(e, L) {
  const dn = (d) => (L.domains[d] || {}).name || d;
  const sn = (id) => (L.strategies[id] || {}).title || id;
  switch (e.type) {
    case "protect": return `protected ${dn(e.domain)} for the rest of the era`;
    case "capacity": return `+${e.amount} Capacity in the Council`;
    case "discount": return `${sn(e.strategy)} cost ${e.amount} less${e.refunded ? ` (${e.refunded.reduce((a, r) => a + r.amount, 0)} surplus Capacity returned to pledgers)` : ""}`;
    case "cancel": return `cancelled the ${e.scope} drop to ${dn(e.domain)}`;
    case "decide": return "decided the dilemma";
    case "redraw": return `redrew a hand from ${e.horizon === "mix" ? "the era mix" : `the ${e.horizon} horizon`}`;
    case "refresh-market": return `swapped ${(e.replaced || []).map(sn).join(", ")} for ${(e.added || []).map(sn).join(", ")}`;
    default: return chg(L, e.changes);
  }
}

export function debriefMarkdown(content, st, { date } = {}) {
  const L = lookups(content);
  const o = st.outcome;
  const scn = L.scenarios[st.scenarioId] || {};
  const lines = [];
  const p = (s = "") => lines.push(s);
  p(`# ${content.meta.title || "Forest Futures"}: debrief`);
  p();
  p(`Scenario **${scn.name || st.scenarioId}**, ${st.players.length} players, ${st.length} game, code ${st.code}, edition ${st.fp}${date ? `, played ${date}` : ""}.`);
  p();
  p(o.collapsed ? `## Forest outcome: ${tierName(o.tier)} (system collapse in the ${(content.eras[st.era] || {}).name} era)` : `## Forest outcome: ${tierName(o.tier)}`);
  p();
  p(`Resilience index **${o.index.toFixed(1)}** (mean of ${content.domains.length} domains).${o.collapsed ? " The system collapsed: three or more domains were in Crisis after a system response." : ""}${o.tier === "resilient" ? " A collective win." : ""}`);
  p();
  p(`| Domain | Start | ${st.rings.map((r) => `End of ${(content.eras.find((e) => e.id === r.era) || {}).name || r.era}`).join(" | ")} | Band |`);
  p(`|---|---|${st.rings.map(() => "---").join("|")}|---|`);
  for (const d of content.domains) {
    p(`| ${d.name} | ${st.start[d.id]} | ${st.rings.map((r) => r.cond[d.id]).join(" | ")} | ${bandOf(content, st.cond[d.id]).label} |`);
  }
  p();
  p("## Mandates");
  p();
  for (const r of o.players) {
    const role = L.roles[r.roleId] || {};
    p(`- **${r.name}**, ${role.title}: ${r.met} of ${r.total} conditions met${r.fulfilled ? " (fulfilled)" : ""}${r.winner ? ", **wins**" : ""}. Future job: *${r.future || "n/a"}*.`);
    if (r.mandate && r.mandate.why) p(`  - Agenda: ${r.mandate.why}`);
    for (const c of r.checks) p(`  - ${c.ok ? "[x]" : "[ ]"} ${(L.domains[c.domain] || {}).name} ${c.kind === "guardrail" ? "stays ≥" : "≥"} ${c.min} (ended ${c.value})`);
  }
  p();
  p("## Story");
  for (const g of storyByEra(content, st)) {
    p();
    p(`### ${g.era.name} (${g.era.years})`);
    p();
    for (const e of g.items) {
      const who = e.seat != null && st.players[e.seat] ? st.players[e.seat].name : "";
      if (e.k === "driver") p(`- **Driver:** ${L.drivers[e.id] ? L.drivers[e.id].title : e.id}${chg(L, e.changes) ? ` (${chg(L, e.changes)})` : ""}`);
      else if (e.k === "dilemma") { const d = L.drivers[e.id]; const opt = d && d.dilemma.options[e.option]; p(`- **Dilemma:** chose *${opt ? opt.label : e.option}*${e.decidedBy != null ? ` (decided by ${st.players[e.decidedBy].name})` : ""}${chg(L, e.changes) ? `: ${chg(L, e.changes)}` : ""}`); }
      else if (e.k === "signal") { const s = L.signals[e.id]; p(`- **Signal** (${who}): ${s ? s.title : e.id}${chg(L, [...(e.primary || []), ...((e.secondary && e.secondary.changes) || [])]) ? ` (${chg(L, [...(e.primary || []), ...((e.secondary && e.secondary.changes) || [])])})` : ""}${e.secondary && e.secondary.type === "protect" ? `, protected ${(L.domains[e.secondary.domain] || {}).name}` : ""}${e.reasoning ? `. Reasoning: “${e.reasoning}”` : ""}`); }
      else if (e.k === "pass") p(`- ${who} passed.`);
      else if (e.k === "strategy") p(`- **Strategy funded:** ${(L.strategies[e.id] || {}).title || e.id}, by ${e.seats.map((x) => st.players[x].name).join(", ")}${e.delayed ? " (long-term effects next era)" : ""}`);
      else if (e.k === "unfunded") p(`- Strategy not funded: ${(L.strategies[e.id] || {}).title || e.id} (${e.pledged} pledged and lost)`);
      else if (e.k === "headline") p(`- **Headline** (${who}): “${e.text}”`);
      else if (e.k === "influence") p(`- Headline influence: ${chg(L, e.changes)}`);
      else if (e.k === "cascade") p(`- System response: ${(L.cascades[e.id] || {}).text || e.id}`);
      else if (e.k === "delayed") p(`- Matured: ${(L.strategies[e.id] || {}).title || e.id}${chg(L, e.changes) ? ` (${chg(L, e.changes)})` : ""}`);
      else if (e.k === "ability") p(`- Ability (${who}): ${(L.roles[st.players[e.seat].roleId] || {}).ability?.name || e.type}: ${abilityText(e, L)}${e.changes && e.changes.length && e.type !== "boost" && e.type !== "move" ? ` (${chg(L, e.changes)})` : ""}`);
      else if (e.k === "collapse") p(`- **System collapse:** ${e.domains.map((d) => (L.domains[d] || {}).name).join(", ")} in Crisis.`);
    }
    const ins = st.insights.find((x) => x.era === g.i);
    if (ins) { p(); p(`> **So what for us now?** ${ins.text}`); }
  }
  p();
  if (st.legacy && st.legacy.length) {
    p("## Legacy investments");
    p();
    p("Funded in the final era; their long-term effects arrive after 2050.");
    p();
    for (const x of st.legacy) {
      const s = L.strategies[x.id] || {};
      p(`- **${s.title || x.id}**: ${s.text || ""} (after 2050: ${x.effects.map((e) => `${(L.domains[e.domain] || {}).name} ${e.delta > 0 ? "+" : "−"}${Math.abs(e.delta)}`).join(", ")})`);
    }
    p();
  }
  p("## Signals to watch");
  p();
  for (const w of signalsToWatch(content, st)) {
    const s = w.item.source || {};
    p(`- **${w.item.title}**${w.kind === "driver" ? " (driver)" : ""}: ${w.kind === "signal" ? w.item.signal : w.item.text}${s.url ? ` [${s.publisher || s.title}](${s.url})` : ""}`);
  }
  p();
  p("## Debrief prompts");
  p();
  for (const q of (content.prompts && content.prompts.debrief) || []) p(`- ${q}`);
  p();
  p("## Monday actions");
  p();
  for (const q of (content.prompts && content.prompts.monday) || []) p(`- ${q}`);
  p();
  p(`---`);
  p(`${content.meta.credits || ""}`);
  return lines.join("\n");
}

export function finalIndex(content, st) {
  return resilienceIndex(content, st.cond);
}
