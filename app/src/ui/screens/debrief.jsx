import { useEffect, useState } from "preact/hooks";
import { app, host, useStore, endGame, hostUndo, announce } from "../store.js";
import { Tree, TreeTable } from "../tree.jsx";
import { Icon } from "../icons.jsx";
import { Btn, CopyButton, DownloadButton, ThemeToggle, Dialog } from "../common.jsx";
import { MandateView, Effects, Effect, SourceLine, HorizonBadge } from "../cards.jsx";
import { lookups } from "../../engine/index.js";
import { debriefMarkdown, storyByEra, signalsToWatch, tierName } from "../export.js";
import { cx, setHash, todayISO } from "../util.js";
import { stopHostSync } from "../sync.js";

const TIER_COPY = {
  resilient: "The forest holds. Conditions are broadly healthy and no system is in Crisis: a collective win for the table.",
  holding: "The forest is holding on. Some systems are strained, but the whole has not unraveled.",
  unraveling: "The system is unraveling. When the whole fails, no individual agenda counts as a win.",
};

function chgText(L, list) {
  return (list || []).filter((c) => c.to !== c.from || c.blocked);
}

export function Debrief() {
  const { content, theme } = useStore(app);
  const hs = useStore(host);
  const st = hs.h.state;
  const L = lookups(content);
  const o = st.outcome;
  const scn = L.scenarios[st.scenarioId] || {};
  useEffect(() => { document.documentElement.classList.remove("board-mode"); }, []);
  // Game end (QA N8a): focus the outcome heading and announce the outcome instead of leaving focus on <body>.
  useEffect(() => {
    const h = document.getElementById("oc-h");
    if (h) h.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    announce(`Game over. ${o.collapsed ? `System collapse at the end of the ${endEra.name} era.` : "Shared forest outcome in 2050:"} ${tierName(o.tier)}, resilience index ${o.index.toFixed(1)}.`);
  }, []);
  const md = () => debriefMarkdown(content, st, { date: todayISO() });
  const json = () => JSON.stringify({ setup: hs.h.setup, log: hs.h.log, state: st }, null, 2);
  const winners = o.players.filter((p) => p.winner);
  const [confirmNew, setConfirmNew] = useState(false);
  const endEra = content.eras[st.era] || {};
  return (
    <main class="debrief" id="main">
      <header class="debrief-bar">
        <span class="bh-title">{content.meta.title}</span>
        <span class="muted">{scn.name}, code {st.code}</span>
        <span class="spacer" />
        {hs.h.past.length ? <Btn kind="quiet" icon="undo" onClick={hostUndo}>Undo last step</Btn> : null}
        <ThemeToggle />
      </header>

      <section class={cx("outcome", `tier--${o.tier}`)} aria-labelledby="oc-h">
        <div class="outcome-tree">
          <Tree content={content} cond={st.cond} rings={st.rings} theme={theme} idPrefix="final" floats={false} />
        </div>
        <div class="outcome-copy">
          <p class="phase-kicker">{o.collapsed ? `System collapse, end of the ${endEra.name} era (${endEra.years})` : "Shared forest outcome, 2050"}</p>
          <h1 id="oc-h" class="outcome-title" tabIndex={-1}>{tierName(o.tier)}</h1>
          <p class="outcome-index"><span class="index-v">{o.index.toFixed(1)}</span> resilience index</p>
          <p class="outcome-text">{o.collapsed ? "Three or more systems fell into Crisis at once and the system collapsed. " : ""}{TIER_COPY[o.tier]}</p>
          <p class="outcome-winners">
            {o.tier === "unraveling" ? "Nobody wins individually." : winners.length ? <>Mandates fulfilled: <strong>{winners.map((w) => w.name).join(", ")}</strong>.</> : "No one fulfilled every condition of their mandate."}
          </p>
          <div class="btn-row">
            <CopyButton text={md} label="Copy debrief (Markdown)" kind="primary" what="debrief (Markdown)" />
            <DownloadButton filename={`forest-futures-debrief-${st.code}.md`} data={md} label="Download Markdown" />
            <DownloadButton filename={`forest-futures-game-${st.code}.json`} data={json} label="Download game JSON" />
          </div>
          <details class="table-details">
            <summary>Conditions by era (table)</summary>
            <TreeTable content={content} cond={st.cond} rings={st.rings} start={st.start} />
          </details>
        </div>
      </section>

      <section class="debrief-section" aria-labelledby="md-h">
        <h2 id="md-h" class="section-title">Mandates revealed</h2>
        <ul class="mandate-grid">
          {o.players.map((p) => {
            const role = L.roles[p.roleId] || {};
            return (
              <li key={p.seat} class={cx("mandate-card", p.fulfilled && "is-fulfilled", p.winner && "is-winner")}>
                <div class="mc-head">
                  <div>
                    <p class="mc-name">{p.name}</p>
                    <p class="mc-role">{role.title}</p>
                  </div>
                  <p class="mc-score"><strong>{p.met}</strong><span>of {p.total}</span></p>
                </div>
                <MandateView content={content} mandate={p.mandate} cond={st.cond} compact targetsLabel={o.collapsed ? `Targets (the game ended in the ${endEra.name} era)` : "Targets by 2050"} />
                <p class="mc-future"><span class="muted">Future job</span> {p.future}</p>
                {p.winner ? <span class="stamp stamp--funded">Fulfilled</span> : p.fulfilled ? <span class="stamp">Fulfilled, but the system unraveled</span> : null}
              </li>
            );
          })}
        </ul>
      </section>

      {st.legacy && st.legacy.length ? (
        <section class="debrief-section" aria-labelledby="legacy-h">
          <h2 id="legacy-h" class="section-title">Legacy investments</h2>
          <p class="section-hint">Funded in the final era. Their long-term effects arrive after 2050, so they don't change the score, but they are part of the future this table chose.</p>
          <ul class="legacy-list">
            {st.legacy.map((x, i) => {
              const s = L.strategies[x.id] || {};
              return (
                <li key={i} class="legacy">
                  <span class={cx("kind", `kind--${s.kind}`)}>{s.kind ? s.kind.replace("-", " ") : ""}</span>
                  <h3 class="watch-title">{s.title || x.id}</h3>
                  <p>{s.text}</p>
                  <p class="legacy-eff"><span class="muted">After 2050</span> <Effects content={content} list={x.effects} /></p>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section class="debrief-section" aria-labelledby="story-h">
        <h2 id="story-h" class="section-title">The story of this future</h2>
        <ol class="timeline">
          {storyByEra(content, st).map((g) => (
            <li key={g.i} class="tl-era">
              <h3 class="tl-era-title">{g.era.name}<span>{g.era.years}</span></h3>
              <ul class="tl-items">
                {g.items.map((e, k) => <StoryItem key={k} e={e} st={st} content={content} L={L} />)}
              </ul>
              {st.insights.find((x) => x.era === g.i) ? <p class="tl-insight"><Icon name="bulb" size={20} /> <strong>So what for us now?</strong> {st.insights.find((x) => x.era === g.i).text}</p> : null}
            </li>
          ))}
        </ol>
      </section>

      <section class="debrief-section" aria-labelledby="watch-h">
        <h2 id="watch-h" class="section-title">Signals to watch</h2>
        <p class="section-hint">Everything that shaped this future is grounded in something already happening. Follow these.</p>
        <ul class="watch-grid">
          {signalsToWatch(content, st).map((w) => (
            <li key={w.item.id} class="watch">
              <HorizonBadge content={content} horizon={w.item.horizon} small />
              <h3 class="watch-title">{w.item.title}{w.kind === "driver" ? <span class="tag">Driver</span> : null}</h3>
              <p>{w.kind === "signal" ? w.item.signal : w.item.text}</p>
              <SourceLine source={w.item.source} />
            </li>
          ))}
        </ul>
      </section>

      <section class="debrief-section debrief-prompts" aria-labelledby="pr-h">
        <div>
          <h2 id="pr-h" class="section-title">Talk it through</h2>
          <ol class="prompt-list">{((content.prompts && content.prompts.debrief) || []).map((q, i) => <li key={i}>{q}</li>)}</ol>
        </div>
        <div>
          <h2 class="section-title">Monday actions</h2>
          <ol class="prompt-list">{((content.prompts && content.prompts.monday) || []).map((q, i) => <li key={i}>{q}</li>)}</ol>
        </div>
      </section>

      <footer class="debrief-foot">
        <Btn kind="primary" icon="play" onClick={() => setConfirmNew(true)}>New game</Btn>
        <Btn icon="back" onClick={() => { stopHostSync(); host.set({ h: null, skipResume: true }); setHash(""); }}>Home</Btn>
      </footer>
      <Dialog open={confirmNew} onClose={() => setConfirmNew(false)} title="Start a new game?"
        actions={<>
          <Btn onClick={() => setConfirmNew(false)}>Cancel</Btn>
          <Btn kind="primary" icon="play" onClick={() => { setConfirmNew(false); stopHostSync(); host.set({ h: null, skipResume: true }); setHash("host"); }}>Go to setup</Btn>
        </>}>
        <p>This debrief stays saved on this device until you press <strong>Start the game</strong> for the next one; you can reopen it from the home screen until then.</p>
        <p><strong>Copy the debrief first?</strong> Starting the next game replaces it.</p>
        <div class="btn-row"><CopyButton text={md} label="Copy debrief (Markdown)" what="debrief (Markdown)" /><DownloadButton filename={`forest-futures-debrief-${st.code}.md`} data={md} label="Download Markdown" /></div>
      </Dialog>
    </main>
  );
}

export function abilityDetail(e, L) {
  const dn = (d) => (L.domains[d] || {}).name || d;
  const sn = (id) => (L.strategies[id] || {}).title || id;
  switch (e.type) {
    case "protect": return `: protected ${dn(e.domain)} for the rest of the era`;
    case "capacity": return `: +${e.amount} Capacity in the Council`;
    case "discount": return `: ${sn(e.strategy)} cost ${e.amount} less${e.refunded ? ` (${e.refunded.reduce((a, r) => a + r.amount, 0)} surplus Capacity returned to pledgers)` : ""}`;
    case "cancel": return `: cancelled the ${e.scope} drop to ${dn(e.domain)}`;
    case "decide": return ": decided the dilemma";
    case "redraw": return `: redrew a hand from ${e.horizon === "mix" ? "the era mix" : `the ${e.horizon} horizon`}`;
    case "refresh-market": return `: swapped ${(e.replaced || []).map(sn).join(", ")} for ${(e.added || []).map(sn).join(", ")}`;
    default: return "";
  }
}

function StoryItem({ e, st, content, L }) {
  const who = e.seat != null && st.players[e.seat] ? st.players[e.seat].name : "";
  const ch = (list) => {
    const l = chgText(L, list);
    return l.length ? <span class="effects">{l.map((c, k) => <Effect key={k} content={content} domain={c.d} delta={c.blocked ? c.delta : c.to - c.from} blocked={c.blocked} short />)}</span> : null;
  };
  switch (e.k) {
    case "driver": return <li class="tl tl--driver"><span class="tl-k">Driver</span><span class="tl-v"><strong>{(L.drivers[e.id] || {}).title}</strong> {ch(e.changes)}</span></li>;
    case "dilemma": { const d = L.drivers[e.id]; const o = d && d.dilemma.options[e.option]; return <li class="tl"><span class="tl-k">Dilemma</span><span class="tl-v">Chose <strong>{o ? o.label : e.option}</strong>{e.decidedBy != null ? ` (decided by ${st.players[e.decidedBy].name})` : ""} {ch(e.changes)}</span></li>; }
    case "signal": { const s = L.signals[e.id]; return <li class="tl"><span class="tl-k">Signal</span><span class="tl-v">{who} played <strong>{s ? s.title : e.id}</strong> {ch([...(e.primary || []), ...((e.secondary && e.secondary.changes) || [])])}{e.secondary && e.secondary.type === "protect" ? <span class="tag">protected {(L.domains[e.secondary.domain] || {}).short}</span> : null}{e.reasoning ? <span class="reason">“{e.reasoning}”</span> : null}</span></li>; }
    case "pass": return <li class="tl"><span class="tl-k">Signal</span><span class="tl-v muted">{who} passed</span></li>;
    case "strategy": return <li class="tl tl--strategy"><span class="tl-k">Funded</span><span class="tl-v"><strong>{(L.strategies[e.id] || {}).title}</strong> by {e.seats.map((x) => st.players[x].name).join(", ")} {ch(e.changes)}</span></li>;
    case "unfunded": return <li class="tl"><span class="tl-k">Unfunded</span><span class="tl-v muted">{(L.strategies[e.id] || {}).title}: {e.pledged} capacity lost</span></li>;
    case "headline": return <li class="tl tl--headline"><span class="tl-k">Headline</span><span class="tl-v"><span class="tl-headline">“{e.text}”</span> {who}</span></li>;
    case "influence": return <li class="tl"><span class="tl-k">Influence</span><span class="tl-v">{ch(e.changes)}</span></li>;
    case "cascade": return <li class="tl"><span class="tl-k">Response</span><span class="tl-v">{(L.cascades[e.id] || {}).text}</span></li>;
    case "delayed": return <li class="tl"><span class="tl-k">Matured</span><span class="tl-v"><strong>{(L.strategies[e.id] || {}).title}</strong> {ch(e.changes)}</span></li>;
    case "ability": { const r = L.roles[(st.players[e.seat] || {}).roleId] || {}; return <li class="tl"><span class="tl-k">Ability</span><span class="tl-v">{who} used <strong>{r.ability ? r.ability.name : e.type}</strong>{abilityDetail(e, L, content)} {ch(e.changes)}</span></li>; }
    case "collapse": return <li class="tl tl--collapse"><span class="tl-k">Collapse</span><span class="tl-v">{e.domains.map((d) => (L.domains[d] || {}).name).join(", ")} in Crisis</span></li>;
    default: return null;
  }
}
