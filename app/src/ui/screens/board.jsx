import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { app, host, useStore, act, hostUndo, createStore, endGame, toast, setTimer, hostSave, setTextSize, TEXT_SIZES } from "../store.js";
import { Tree, TreeTable, TreeLegend, TREE_VB, LABEL_MIN_UNITS, BADGE_VB, BADGE_UNITS } from "../tree.jsx";
import { Icon } from "../icons.jsx";
import { Btn, Dialog, ThemeToggle, useTicker, fmtClock } from "../common.jsx";
import { RoleCard, MandateView, Effects, StrategyCard } from "../cards.jsx";
import { PhasePanel } from "./phases.jsx";
import {
  lookups, resilienceIndex, outcomeTier, bandOf, abilityAvailability, mandateFor, currentSeat, crisisDomains, rulesOf, seatCheck,
  effectiveCost, pledgedTotal,
} from "../../engine/index.js";
import { cx, setHash, firstNames } from "../util.js";
import { stopHostSync, startHostSync } from "../sync.js";

export const boardUI = createStore({ pick: null, dialog: null, abilitySeat: null, driverStage: null, pledgeSeat: null });

/** Move focus to the active phase's heading (used after actions and dialogs). */
export function focusPanel() {
  requestAnimationFrame(() => {
    const h = document.querySelector("#panel [data-phase-heading]") || document.querySelector("#panel h2");
    if (h) { if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: false }); }
  });
}

/** Collapse the board header level by level until its parts fit side by side (see 50-board.css, [data-hfit]). */
export function fitHeader(el) {
  if (!el) return;
  const MAX = 6;
  const fits = () => {
    const parts = [...el.children].filter((c) => c.getClientRects().length);
    const cs = getComputedStyle(el);
    const gap = parseFloat(cs.columnGap) || 0;
    const need = parts.reduce((a, c) => a + c.getBoundingClientRect().width, 0) + gap * Math.max(0, parts.length - 1);
    const clipped = parts.some((c) => c.scrollWidth > c.clientWidth + 1 && getComputedStyle(c).overflow !== "visible");
    return need <= el.clientWidth + 0.5 && !clipped;
  };
  for (let lv = 0; lv <= MAX; lv++) {
    el.dataset.hfit = String(lv);
    if (fits()) break;
  }
}

export const STEPS = [
  ["era-open", "Era"], ["driver", "Driver"], ["signals", "Signals"], ["council", "Council"], ["headline", "Headline"], ["cascades", "Response"],
];

export function Board() {
  const { content, theme } = useStore(app);
  const hs = useStore(host);
  const ui = useStore(boardUI);
  const st = hs.h.state;
  const L = lookups(content);

  useEffect(() => {
    document.documentElement.classList.add("board-mode");
    const onKey = (e) => {
      const tag = (e.target && e.target.tagName) || "";
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !/INPUT|TEXTAREA|SELECT/.test(tag)) { e.preventDefault(); hostUndo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { document.documentElement.classList.remove("board-mode"); window.removeEventListener("keydown", onKey); };
  }, []);

  const idx = resilienceIndex(content, st.cond);
  const tier = outcomeTier(content, st.cond, false, st.length);
  const crisis = crisisDomains(content, st.cond);
  const era = content.eras[st.era] || {};
  const scn = L.scenarios[st.scenarioId] || {};
  const phaseIdx = STEPS.findIndex(([id]) => id === st.phase);
  const connected = hs.peers.filter((p) => p.seat != null && p.roleOk);
  const pick = ui.pick;
  // "More below" cue when the phase panel overflows
  const panelRef = useRef(null);
  const [moreBelow, setMoreBelow] = useState(false);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const check = () => setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 24);
    el.addEventListener("scroll", check, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    if (ro) { ro.observe(el); if (el.firstElementChild) ro.observe(el.firstElementChild); }
    const mo = new MutationObserver(() => requestAnimationFrame(check));
    mo.observe(el, { childList: true, subtree: true });
    check();
    return () => { el.removeEventListener("scroll", check); ro && ro.disconnect(); mo.disconnect(); };
  }, []);
  // Tree: outside labels when they render at 14px or more; otherwise a ring with value badges + legend;
  // when even the badges would drop below 14px, a plain ring + legend (the legend carries every value).
  // When even a plain ring would be smaller than ~6rem, only the legend is shown.
  const treeRef = useRef(null);
  const measureTree = useRef(null);
  const lastHint = useRef(0);
  const pickOn = useRef(false);
  pickOn.current = !!(pick && pick.prompt);
  const [treeMode, setTreeMode] = useState("labels");
  useEffect(() => {
    const el = treeRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const foot = el.querySelector(".tree-foot");
        // the pick hint only shows with a ring; count it whenever a pick is active so the mode can't flip-flop
        const hint = el.querySelector(".pick-hint");
        if (hint) lastHint.current = hint.offsetHeight + 0.4 * rem;
        const hintH = hint ? lastHint.current : pickOn.current ? lastHint.current || 4.6 * rem : 0;
        const footH = (foot ? foot.offsetHeight + 0.6 * rem : 4.2 * rem) + hintH;
        const w = el.clientWidth, h = el.clientHeight - footH;
        if ((Math.min(w, h) / TREE_VB) * LABEL_MIN_UNITS >= 14) { setTreeMode("labels"); return; }
        const lg = el.querySelector(".tree-legend");
        const rows = w >= 30 * rem ? 5 : 10; // the legend goes to one column below 30rem (see 50-board.css)
        const legendH = lg ? lg.offsetHeight : rows * 1.25 * Math.max(rem, 14) + 0.85 * rem;
        const ring = Math.min(w, h - legendH);
        setTreeMode((ring / BADGE_VB) * BADGE_UNITS >= 14 ? "badges" : ring >= Math.max(6 * rem, 110) ? "ring" : "legend");
      });
    };
    measureTree.current = measure;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const foot = el.querySelector(".tree-foot");
    if (foot) ro.observe(foot);
    measure();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  useEffect(() => { if (measureTree.current) measureTree.current(); }, [pick && pick.prompt, hs.tableView, st.phase]);
  // Board fit: the type scale (viewport × Text size) decides how much room there is, in rem.
  const remProbe = useRef(null);
  const headRef = useRef(null);
  const [fit, setFit] = useState("");
  useEffect(() => {
    const probe = remProbe.current;
    if (!probe || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const rem = probe.offsetWidth / 10 || 16;
      const rw = window.innerWidth / rem, rh = window.innerHeight / rem;
      const f = [rh < 53.5 && "fit-short", rh < 45 && "fit-tight", rw < 80 && "fit-narrow", (rw < 72 || rh < 40) && "fit-cramped"].filter(Boolean).join(" ");
      setFit(f);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(probe);
    window.addEventListener("resize", measure);
    measure();
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  // Header: collapse step by step (phase checklist → "Step 3 of 6 · Council", era years, other eras, labels)
  // until everything fits on one line. Nothing in the header may overlap.
  useLayoutEffect(() => fitHeader(headRef.current), [st.phase, st.era, hs.sync, connected.length, fit, scn.name]);
  useEffect(() => {
    const el = headRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => fitHeader(el)); });
    ro.observe(el);
    if (remProbe.current) ro.observe(remProbe.current);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitHeader(el));
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return (
    <div class={cx("board", `phase-is-${st.phase}`, fit, `tree-is-${hs.tableView ? "table" : treeMode}`, st.players.length >= 6 && "many-seats")}>
      <span class="rem-probe" ref={remProbe} aria-hidden="true" />
      <h1 class="sr-only">{content.meta.title || "Forest Futures"}: host board, {era.name} era</h1>
      <a class="skip" href="#panel">Skip to the active phase</a>
      <header class="board-head" ref={headRef} data-hfit="0">
        <div class="bh-brand">
          <span class="bh-title">{content.meta.title || "Forest Futures"}</span>
          <span class="bh-scn">{scn.name}</span>
        </div>
        <ol class="era-line" aria-label="Eras">
          {content.eras.map((e, i) => (
            <li key={e.id} class={cx("era-step", i < st.era && "is-done", i === st.era && "is-now")} aria-current={i === st.era ? "step" : undefined}>
              <span class="era-dot" aria-hidden="true">{i < st.era ? <Icon name="ring" size={18} /> : null}</span>
              <span class="era-name">{e.name}</span>
              <span class="era-years">{e.years}</span>
            </li>
          ))}
        </ol>
        <ol class="phase-line" aria-label="Phases this era">
          {STEPS.map(([id, label], i) => (
            <li key={id} class={cx("phase-step", i < phaseIdx && "is-done", i === phaseIdx && "is-now")} aria-current={i === phaseIdx ? "step" : undefined}>
              <span>{label}</span>
            </li>
          ))}
        </ol>
        <p class="phase-compact">
          <span class="pc-step">Step {phaseIdx + 1} of {STEPS.length}</span>
          <span class="pc-dot" aria-hidden="true">·</span>
          <span class="sr-only">: </span>
          <strong class="pc-name">{(STEPS[phaseIdx] || [])[1]}</strong>
        </p>
        <div class="bh-tools">
          <button type="button" class="code-chip" onClick={() => boardUI.set({ dialog: "menu" })}>
            <span class="code-chip-k">Code</span>{" "}
            <span class="code-chip-v">{st.code}</span>{" "}
            <span class={cx("sync-dot", `is-${hs.sync}`)} aria-hidden="true" />
            {hs.sync === "live" ? <span class="code-chip-n"><Icon name="phone" size={16} />{connected.length}<span class="sr-only"> phones connected</span></span> : <span class="sr-only">phones offline</span>}
            <span class="sr-only">. Open game menu</span>
          </button>
          <button type="button" class="icon-btn" onClick={hostUndo} disabled={!hs.h.past.length} aria-label="Undo last step" title="Undo (Ctrl+Z)"><Icon name="undo" /></button>
          <button type="button" class="icon-btn" onClick={() => boardUI.set({ dialog: "insights" })} aria-label={`Insight log, ${st.insights.length} entries`} title="Insight log">
            <Icon name="bulb" />{st.insights.length ? <span class="badge">{st.insights.length}</span> : null}
          </button>
          <ThemeToggle />
          <button type="button" class="icon-btn" onClick={() => boardUI.set({ dialog: "menu" })} aria-label="Game menu"><Icon name="menu" /></button>
        </div>
      </header>

      <section class="board-tree" aria-labelledby="tree-h" ref={treeRef}>
        <h2 id="tree-h" class="sr-only">Forest condition</h2>
        {pick && pick.prompt && !hs.tableView && treeMode !== "legend" ? <p class="pick-hint" role="note"><Icon name="info" size={18} /> {pick.prompt}</p> : null}
        {hs.tableView ? (
          <div class="tree-table-wrap"><TreeTable content={content} cond={st.cond} rings={st.rings} start={st.start} protectedDomains={st.protected} /></div>
        ) : (
          <>
            {treeMode !== "legend" ? <Tree content={content} cond={st.cond} rings={st.rings} protectedDomains={st.protected} theme={theme} pick={pick} idPrefix="board" badges={treeMode === "badges"} compact={treeMode === "ring"} /> : null}
            {treeMode !== "labels" ? <TreeLegend content={content} cond={st.cond} protectedDomains={st.protected} theme={theme} /> : null}
          </>
        )}
        <div class="tree-foot">
          <div class="index-block">
            <span class="index-k">Resilience index</span>
            <span class="index-v">{idx.toFixed(1)}</span>
            <span class={cx("index-tier", `tier--${tier.tier}`)} title={`Final outcome in 2050: Resilient = index ${tier.thresholds.resilient}+ with every domain ${tier.thresholds.resilientFloor}+; Holding = index ${tier.thresholds.holding}+ with every domain ${tier.thresholds.holdingFloor}+; otherwise Unraveling.`}>
              <span class="index-pace-k">On pace for</span> {tier.tier === "resilient" ? "Resilient" : tier.tier === "holding" ? "Holding" : "Unraveling"}
            </span>
          </div>
          <p class="crisis-note">
            {crisis.length ? <span class="cn-line"><Icon name="scar" size={18} /><span>{crisis.length} in Crisis: {crisis.map((id) => L.domains[id].short || L.domains[id].name).join(", ")}. {rulesOf(content).collapseCrisisCount} after the system response ends the game.</span></span> : <span>No domain in Crisis.</span>}
            {st.protected.length ? <span class="prot-note cn-line"><Icon name="shield" size={18} /><span>Protected this era: {st.protected.map((id) => L.domains[id].short || L.domains[id].name).join(", ")}</span></span> : null}
          </p>
          <button type="button" class="btn btn--quiet btn--small" aria-pressed={hs.tableView ? "true" : "false"} title={hs.tableView ? "Tree view" : "Table view"} onClick={() => host.set({ tableView: !hs.tableView })}>
            <Icon name={hs.tableView ? "tree" : "table"} size={18} /><span class="tv-label">{hs.tableView ? "Tree view" : "Table view"}</span>
          </button>
        </div>
      </section>

      <section class={cx("board-panel", moreBelow && "has-more")} id="panel" tabIndex={-1} ref={panelRef} aria-label={`${era.name} era, ${(STEPS[phaseIdx] || [])[1] || ""}`}>
        <PhasePanel />
      </section>

      <PlayerStrip />

      <Dialogs />
    </div>
  );
}

/** Seat chips show full names when they fit; otherwise each player's (unique) first name. */
function fitSeatNames(ul) {
  if (!ul) return;
  const seats = [...ul.querySelectorAll(".seat")];
  seats.forEach((li) => { li.dataset.short = "0"; });
  // one style for the whole strip: if any full name would be cut, every chip shows first names
  const over = seats.some((li) => { const n = li.querySelector(".seat-name"); return !!n && n.scrollWidth > n.clientWidth + 1; });
  seats.forEach((li) => { li.dataset.short = over ? "1" : "0"; });
}

function PlayerStrip() {
  const { content } = useStore(app);
  const hs = useStore(host);
  const st = hs.h.state;
  const L = lookups(content);
  const active = currentSeat(st);
  const c = st.council;
  const short = firstNames(st.players.map((p) => p.name));
  const ulRef = useRef(null);
  useLayoutEffect(() => fitSeatNames(ulRef.current));
  useEffect(() => {
    const el = ulRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => fitSeatNames(el)); });
    ro.observe(el);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitSeatNames(el));
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return (
    <section class="board-players" aria-label="Players">
      <ul class="seats" ref={ulRef}>
        {st.players.map((p, i) => {
          const role = L.roles[p.roleId] || {};
          const phones = hs.peers.filter((x) => x.seat === i && x.roleOk);
          const av = abilityAvailability(content, st, i);
          const ab = role.ability || {};
          const check = seatCheck(st.code, i + 1, p.roleId);
          return (
            <li key={i} class={cx("seat", active === i && "is-active", st.lead === i && "is-lead")}>
              {st.lead === i ? <span class="lead-tag" title="Era Lead">Lead</span> : null}
              <div class="seat-top">
                <span class="seat-num" aria-hidden="true">{i + 1}</span>
                <span class="seat-name" title={p.name}>
                  <span class="sn-full" aria-hidden="true">{p.name}</span>
                  <span class="sn-short" aria-hidden="true">{short[i]}</span>
                  <span class="sr-only">{p.name}</span>
                </span>
                {/* narrow chips: the check code moves up next to the name (the role line gives way) */}
                <span class="seat-check seat-check--top" title={`Check code: the phone for seat ${i + 1} should show ${check}`}><span class="sr-only">check code </span>{check}</span>
                {phones.length ? <span class={cx("phone-tag", phones.length > 1 && "is-dup")} title={phones.length > 1 ? `${phones.length} phones joined as seat ${i + 1}` : "Phone connected"}><Icon name="phone" size={16} />{phones.length > 1 ? <span>×{phones.length}</span> : null}<span class="sr-only">{phones.length > 1 ? `${phones.length} phones on this seat` : "phone connected"}</span></span> : null}
              </div>
              <div class="seat-sub">
                <span class="seat-role" title={role.title}>{role.title}</span>
                <span class="seat-check" title={`Check code: the phone for seat ${i + 1} should show ${check}`}><span class="sr-only">check code </span>{check}</span>
              </div>
              <div class="seat-bottom">
                <button type="button" class={cx("ability-btn", p.abilityUsed && "is-used", !p.abilityUsed && av.ok && "is-ready")} disabled={p.abilityUsed}
                  onClick={() => boardUI.set({ dialog: "ability", abilitySeat: i })}
                  aria-label={p.abilityUsed ? `${ab.name || "Ability"} used` : `${ab.name || "Ability"}${av.ok ? ", ready" : ""}: use ${p.name}'s ability`}
                  title={`${ab.name ? `${ab.name}: ${ab.text}` : "Ability"}${p.abilityUsed ? " (used)" : av.ok ? " (ready now)" : ` (${av.reason})`}`}>
                  <Icon name="bolt" size={16} />
                  <span>{p.abilityUsed ? "Used" : ab.name || "Ability"}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Dialogs() {
  const ui = useStore(boardUI);
  const close = () => boardUI.set({ dialog: null });
  return (
    <>
      <MenuDialog open={ui.dialog === "menu"} onClose={close} />
      <InsightsDialog open={ui.dialog === "insights"} onClose={close} />
      <RevealDialog open={ui.dialog === "reveal"} onClose={close} />
      {ui.dialog === "ability" ? <AbilityDialog seat={ui.abilitySeat} onClose={close} /> : null}
    </>
  );
}

function MenuDialog({ open, onClose }) {
  const { content, caps } = useStore(app);
  const hs = useStore(host);
  const st = hs.h.state;
  const [confirm, setConfirm] = useState(false);
  return (
    <Dialog open={open} onClose={onClose} title="Game menu" wide>
      <div class="menu-grid">
        <section>
          <h3 class="sub-h">Players join on their phones</h3>
          <p>Open this page on a phone, choose <strong>Join on your phone</strong>, and enter:</p>
          <p class="code-big code-big--menu">{st.code}</p>
          <p class="muted">Edition {st.fp}. Phones should show the same edition.</p>
          <h3 class="sub-h">Seats and check codes</h3>
          <p class="muted">Each phone shows a check code on its Mandate tab. It should match the code for its seat here and on the seat chip.</p>
          <ul class="peer-list">
            {st.players.map((p, i) => {
              const ph = hs.peers.filter((x) => x.seat === i);
              return (
                <li key={i}>
                  <span class="seat-num">{i + 1}</span> <span class="peer-name">{p.name}</span>
                  <span class="seat-check"><span class="sr-only">check code </span>{seatCheck(st.code, i + 1, p.roleId)}</span>
                  {hs.sync === "live" ? <span>{ph.length ? (ph.some((x) => x.roleOk) ? <strong>phone connected</strong> : <span class="warn-text">phone picked a different role</span>) : <span class="muted">no phone</span>}{ph.length > 1 ? <span class="warn-text"> ({ph.length} phones on this seat)</span> : null}</span> : null}
                </li>
              );
            })}
          </ul>
          <h3 class="sub-h">Live sync</h3>
          {hs.sync === "live" ? <p class="muted">Connected: phones vote, pledge and send headlines live.</p> : (
            <p class="muted">{caps.room ? (hs.sync === "connecting" ? "Connecting…" : "Not connected.") : "Not available here. Phones still show mandates, notes and quick rules; tap votes and pledges in on this screen."}</p>
          )}
          {caps.room && hs.sync !== "live" && hs.sync !== "connecting" ? <Btn icon="wifi" onClick={() => startHostSync(st.code)}>Connect live sync</Btn> : null}
        </section>
        <section>
          <h3 class="sub-h">Text size</h3>
          <p>Make the big screen easier to read from the back of the room.</p>
          <TextSizeControl />
          <h3 class="sub-h">Private mandate reveal</h3>
          <p>No phones? Pass the laptop: each player privately views their mandate.</p>
          <Btn icon="eye" onClick={() => boardUI.set({ dialog: "reveal" })}>Reveal a mandate privately</Btn>
          <h3 class="sub-h">Leave</h3>
          <p>The game saves automatically on this device. Resume from the home screen.</p>
          <div class="btn-row">
            <Btn icon="back" onClick={() => { onClose(); stopHostSync(); host.set({ h: null }); setHash(""); }}>Save and exit</Btn>
            {!confirm ? <Btn kind="danger" icon="trash" onClick={() => setConfirm(true)}>Abandon game</Btn> : (
              <Btn kind="danger" icon="trash" onClick={() => { onClose(); stopHostSync(); endGame(); setHash(""); toast("Game abandoned."); }}>Yes, abandon it</Btn>
            )}
          </div>
        </section>
      </div>
    </Dialog>
  );
}

function TextSizeControl() {
  const { textSize } = useStore(app);
  const i = TEXT_SIZES.indexOf(textSize);
  const ref = useRef(null);
  const moved = useRef(null);
  const go = (v, from) => { moved.current = from; setTextSize(v); };
  // A button that just became disabled (A+ at 140%, A− at 90%) or disappeared (Reset) must not drop focus
  // out of the dialog: hand it to the neighbouring control.
  useLayoutEffect(() => {
    const from = moved.current;
    moved.current = null;
    const box = ref.current;
    if (!from || !box) return;
    const a = document.activeElement;
    if (a && a !== document.body && box.contains(a) && !a.disabled) return;
    const by = (k) => box.querySelector(`[data-k="${k}"]:not([disabled])`);
    const next = from === "plus" ? by("minus") : from === "minus" ? by("plus") : by("plus") || by("minus");
    if (next) next.focus();
  });
  return (
    <div class="textsize" role="group" aria-label="Text size" ref={ref}>
      <Btn data-k="minus" disabled={i <= 0} onClick={() => go(TEXT_SIZES[Math.max(0, i - 1)], "minus")}>A−<span class="sr-only"> smaller text</span></Btn>
      <output class="textsize-v" aria-live="polite">{Math.round(textSize * 100)}%</output>
      <Btn data-k="plus" disabled={i >= TEXT_SIZES.length - 1} onClick={() => go(TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, i + 1)], "plus")}>A+<span class="sr-only"> larger text</span></Btn>
      {textSize !== 1 ? <Btn data-k="reset" kind="quiet" onClick={() => go(1, "reset")}>Reset</Btn> : null}
    </div>
  );
}

function InsightsDialog({ open, onClose }) {
  const { content } = useStore(app);
  const hs = useStore(host);
  const st = hs.h.state;
  const cur = st.insights.find((x) => x.era === st.era);
  const [text, setText] = useState(cur ? cur.text : "");
  useEffect(() => { if (open) setText(cur ? cur.text : ""); }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title="Insight log: “So what for us now?”"
      actions={<><Btn onClick={onClose}>Close</Btn><Btn kind="primary" icon="check" onClick={() => { act({ type: "setInsight", text }); toast("Insight saved."); onClose(); }}>Save insight</Btn></>}>
      {st.insights.length ? (
        <ol class="insight-list">
          {st.insights.map((x) => <li key={x.era}><span class="insight-era">{(content.eras[x.era] || {}).name}</span> {x.text}</li>)}
        </ol>
      ) : <p class="muted">No insights yet. The table adds one line after each Headline of the Era.</p>}
      <label class="field-label" for="ins-now">This era ({(content.eras[st.era] || {}).name})</label>
      <textarea id="ins-now" class="input" rows={3} maxLength={280} value={text} onInput={(e) => setText(e.currentTarget.value)} placeholder="What does this mean for what we do on Monday?" />
    </Dialog>
  );
}

function RevealDialog({ open, onClose }) {
  const { content } = useStore(app);
  const hs = useStore(host);
  const st = hs.h.state;
  const L = lookups(content);
  const [seat, setSeat] = useState(null);
  const [shown, setShown] = useState(false);
  useEffect(() => { if (!open) { setSeat(null); setShown(false); } }, [open]);
  const p = seat != null ? st.players[seat] : null;
  const role = p ? L.roles[p.roleId] : null;
  return (
    <Dialog open={open} onClose={onClose} title="Private mandate reveal">
      {seat == null ? (
        <>
          <p>Who is looking? Everyone else, look away from the screen.</p>
          <div class="reveal-seats">
            {st.players.map((x, i) => <Btn key={i} onClick={() => setSeat(i)}>{i + 1}. {x.name}</Btn>)}
          </div>
        </>
      ) : !shown ? (
        <div class="reveal-gate">
          <p class="reveal-hand">Hand the device to <strong>{p.name}</strong>.</p>
          <Btn kind="primary" icon="eye" onClick={() => setShown(true)} data-autofocus>I'm {p.name}: show my mandate</Btn>
          <Btn kind="quiet" onClick={() => setSeat(null)}>Back</Btn>
        </div>
      ) : (
        <div class="reveal-body">
          <p class="mandate-head">{role.title}: secret mandate</p>
          <MandateView content={content} mandate={mandateFor(content, st.code, seat, p.roleId)} />
          <Btn kind="primary" icon="eye-off" onClick={() => { setShown(false); setSeat(null); }} data-autofocus>Hide and pass back</Btn>
        </div>
      )}
    </Dialog>
  );
}

function AbilityDialog({ seat, onClose }) {
  const { content } = useStore(app);
  const hs = useStore(host);
  const st = hs.h.state;
  const L = lookups(content);
  const p = st.players[seat];
  const role = L.roles[p.roleId] || {};
  const ab = role.ability || {};
  const eff = ab.effect || {};
  const av = abilityAvailability(content, st, seat);
  const [sel, setSel] = useState({ domain: null, from: null, to: null, amount: eff.amount || 1, option: null, strategy: null, strategies: [], horizon: eff.horizon || null });
  const set = (patch) => setSel((s) => ({ ...s, ...patch }));
  const domainsAllowed = eff.choices && eff.choices.length ? eff.choices : L.domainIds;
  const negBatch = st.batch && st.batch.changes ? st.batch.changes.filter((c) => c.applied < 0 && !c.cancelled).map((c) => c.domain) : [];

  const useIt = () => {
    const a = { type: "useAbility", seat };
    if (["boost", "protect", "cancel"].includes(eff.type)) a.domain = sel.domain;
    if (eff.type === "move") Object.assign(a, { from: sel.from, to: sel.to, amount: sel.amount });
    if (eff.type === "decide") a.option = sel.option;
    if (eff.type === "discount") a.strategy = sel.strategy;
    if (eff.type === "refresh-market") a.strategies = sel.strategies;
    if (eff.type === "redraw") a.horizon = sel.horizon;
    if (act(a)) {
      const last = host.get().h.state.story.slice(-1)[0];
      const back = last && last.k === "ability" && last.refunded;
      toast(back
        ? `${ab.name} used. The cost dropped below what was pledged, so ${back.map((r) => `${st.players[r.seat].name} gets ${r.amount} Capacity back`).join(" and ")}.`
        : `${ab.name} used.`, "info", back ? 7000 : 4200);
      onClose(); focusPanel();
    }
  };

  const DomainPick = ({ value, onPick, allowed, label }) => (
    <fieldset class="domain-pick">
      <legend>{label}</legend>
      <div class="domain-grid">
        {content.domains.map((d) => {
          const ok = allowed.includes(d.id);
          return (
            <button type="button" key={d.id} class={cx("domain-btn", value === d.id && "is-selected")} disabled={!ok} aria-pressed={value === d.id ? "true" : "false"} onClick={() => onPick(d.id)} style={{ "--dc": d.color }}>
              <Icon name={d.icon || d.id} size={20} /><span>{d.short || d.name}</span><strong>{st.cond[d.id]}</strong>
            </button>
          );
        })}
      </div>
    </fieldset>
  );

  let body = null, ready = av.ok;
  switch (eff.type) {
    case "boost": case "protect":
      body = <DomainPick label={eff.type === "boost" ? `Add +${eff.delta || 1} to (domains at 10 can't take more)` : "Protect until the end of this era"} value={sel.domain} onPick={(d) => set({ domain: d })} allowed={domainsAllowed.filter((d) => (eff.type === "protect" ? !st.protected.includes(d) : st.cond[d] < 10))} />;
      ready = ready && !!sel.domain; break;
    case "cancel":
      body = <DomainPick label={`Cancel the drop just applied to`} value={sel.domain} onPick={(d) => set({ domain: d })} allowed={negBatch} />;
      ready = ready && !!sel.domain; break;
    case "move":
      body = <>
        <DomainPick label="Move points from (domains at 0 have nothing to move)" value={sel.from} onPick={(d) => set({ from: d })} allowed={L.domainIds.filter((d) => st.cond[d] > 0)} />
        <DomainPick label="…to (domains at 10 can't take more)" value={sel.to} onPick={(d) => set({ to: d })} allowed={L.domainIds.filter((d) => d !== sel.from && st.cond[d] < 10)} />
        {sel.from && sel.to ? (() => {
          const n = Math.min(sel.amount, st.cond[sel.from], 10 - st.cond[sel.to]);
          return <p class="muted">{n} point{n === 1 ? "" : "s"} will move: {L.domains[sel.from].short || L.domains[sel.from].name} {st.cond[sel.from]} → {st.cond[sel.from] - n}, {L.domains[sel.to].short || L.domains[sel.to].name} {st.cond[sel.to]} → {st.cond[sel.to] + n}.</p>;
        })() : null}
        <div class="seg" role="group" aria-label="Points to move">
          {Array.from({ length: eff.amount || 1 }, (_, k) => k + 1).map((n) => <button type="button" key={n} class={cx("seg-btn", sel.amount === n && "is-on")} aria-pressed={sel.amount === n ? "true" : "false"} onClick={() => set({ amount: n })}>{n}</button>)}
        </div>
      </>;
      ready = ready && sel.from && sel.to && sel.from !== sel.to; break;
    case "decide": {
      const d = st.driver ? L.drivers[st.driver.id] : null;
      body = d ? (
        <fieldset class="opt-pick"><legend>Decide the dilemma</legend>
          {d.dilemma.options.map((o, k) => <button type="button" key={k} class={cx("opt-btn", sel.option === k && "is-selected")} aria-pressed={sel.option === k ? "true" : "false"} onClick={() => set({ option: k })}><strong>{String.fromCharCode(65 + k)}. {o.label}</strong><Effects content={content} list={o.effects} short /></button>)}
        </fieldset>
      ) : null;
      ready = ready && sel.option != null; break;
    }
    case "discount": {
      const m = st.council ? st.council.market : [];
      body = <fieldset class="opt-pick"><legend>Discount one strategy by {eff.amount}{eff.tag ? ` (only “${eff.tag}” strategies)` : ""}</legend>
        {m.map((id) => {
          const s = L.strategies[id];
          const cost = effectiveCost(content, st, id);
          const ok = (!eff.tag || (s.tags || []).includes(eff.tag)) && cost > 1;
          const pledged = pledgedTotal(st, id);
          const after = Math.max(1, cost - (eff.amount || 1));
          return <button type="button" key={id} disabled={!ok} class={cx("opt-btn", sel.strategy === id && "is-selected")} aria-pressed={sel.strategy === id ? "true" : "false"} onClick={() => set({ strategy: id })}><strong>{s.title}</strong><span>cost {cost}{ok ? ` → ${after}` : cost <= 1 ? " (already 1)" : ""}{ok && pledged > after ? `; ${pledged - after} pledged Capacity goes back` : ""}</span></button>;
        })}
      </fieldset>;
      ready = ready && !!sel.strategy; break;
    }
    case "refresh-market": {
      const m = st.council ? st.council.market : [];
      body = <fieldset class="opt-pick"><legend>Replace up to {eff.count} strategies</legend>
        {m.map((id) => { const s = L.strategies[id]; const on = sel.strategies.includes(id); return <button type="button" key={id} class={cx("opt-btn", on && "is-selected")} aria-pressed={on ? "true" : "false"} onClick={() => set({ strategies: on ? sel.strategies.filter((x) => x !== id) : sel.strategies.length < (eff.count || 1) ? [...sel.strategies, id] : sel.strategies })}><strong>{s.title}</strong><span>cost {s.cost}</span></button>; })}
      </fieldset>;
      ready = ready && sel.strategies.length > 0; break;
    }
    case "redraw":
      body = eff.horizon ? <p>Discard {p.name}'s hand and draw {rulesOf(content).handSize} {(content.eras.find((e) => e.id === eff.horizon) || {}).name || eff.horizon}-horizon signals.</p> : (
        <div class="seg" role="group" aria-label="Draw from">
          {[...content.eras.map((e) => [e.id, e.name]), [null, "Era mix"]].map(([id, nm]) => <button type="button" key={nm} class={cx("seg-btn", sel.horizon === id && "is-on")} aria-pressed={sel.horizon === id ? "true" : "false"} onClick={() => set({ horizon: id })}>{nm}</button>)}
        </div>
      );
      break;
    case "capacity":
      body = <p>{p.name} gains +{eff.amount} Capacity in this Council.</p>;
      break;
    default: body = null;
  }

  return (
    <Dialog open onClose={onClose} title={`${ab.name || "Ability"}: ${p.name}`}
      actions={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" icon="bolt" disabled={!ready} onClick={useIt}>Use {ab.name}</Btn></>}>
      <p class="ability-text-lg">{ab.text}</p>
      {!av.ok ? <p class="notice"><Icon name="info" size={18} /> {av.reason}</p> : body}
      <p class="muted">Abilities are once per game. The facilitator confirms the moment.</p>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Timer (council / headline)
// ---------------------------------------------------------------------------
export function PhaseTimer({ kind, seconds, onExpire }) {
  const hs = useStore(host);
  const t = hs.timer && hs.timer.kind === kind ? hs.timer : null;
  useTicker(!!(t && t.running), 250);
  const remaining = t ? (t.running ? t.endsAt - Date.now() : t.remaining) : seconds * 1000;
  const up = t && t.running && remaining <= 0;
  const fired = useRef(false);
  useEffect(() => {
    if (up && onExpire && !fired.current) { fired.current = true; onExpire(); }
    if (!up) fired.current = false;
  }, [up]);
  const startT = () => setTimer({ kind, running: true, endsAt: Date.now() + (t ? t.remaining : seconds * 1000), remaining: t ? t.remaining : seconds * 1000 });
  const pause = () => setTimer({ kind, running: false, remaining: Math.max(0, t.endsAt - Date.now()), endsAt: 0 });
  const reset = () => setTimer({ kind, running: false, remaining: seconds * 1000, endsAt: 0 });
  useEffect(() => { hostSave(); }, [t && t.running]);
  return (
    <div class={cx("timer", up && "is-up", t && t.running && "is-running")} role="timer" aria-label={`${kind} timer`}>
      <Icon name="clock" size={22} />
      <span class="timer-v" aria-live="off">{fmtClock(remaining)}</span>
      {up ? <span class="timer-up" role="status">Time's up</span> : null}
      {!t || !t.running ? <button type="button" class="icon-btn" onClick={startT} aria-label="Start timer"><Icon name="play" /></button> : <button type="button" class="icon-btn" onClick={pause} aria-label="Pause timer"><Icon name="pause" /></button>}
      <button type="button" class="icon-btn" onClick={reset} aria-label="Reset timer"><Icon name="reset" /></button>
    </div>
  );
}

export { StrategyCard, RoleCard };
