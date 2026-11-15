import { useEffect, useRef, useState } from "preact/hooks";
import { app, host, useStore, act, toast, announce } from "../store.js";
import { Icon } from "../icons.jsx";
import { Btn, Stepper } from "../common.jsx";
import { SignalCard, DriverCard, StrategyCard, Effects, Effect, secondaryLabel, DomainDot } from "../cards.jsx";
import { boardUI, PhaseTimer, focusPanel } from "./board.jsx";
import {
  lookups, rulesOf, dilemmaTally, currentSeat, effectiveCost, pledgedTotal, seatSpent, cascadePreview, crisisDomains,
  capacityModifier, bandOf, wordCount, capacityBaseFor, secondaryTargets,
} from "../../engine/index.js";
import { cx, playerTokens, firstNames } from "../util.js";

const ROMAN = ["I", "II", "III", "IV", "V", "VI"];
const letter = (k) => String.fromCharCode(65 + k);

/** A short spoken description of where the game is now (announced after each step). */
function describeStep(content, st, stage) {
  const L = lookups(content);
  const era = content.eras[st.era] || {};
  const who = (i) => `${st.players[i].name} (${(L.roles[st.players[i].roleId] || {}).title})`;
  switch (st.phase) {
    case "era-open": return `Era ${ROMAN[st.era]}, ${era.name}, ${era.years}. ${who(st.lead)} leads.`;
    case "driver": {
      const d = L.drivers[st.driver.id];
      if (st.driver.chosen != null) return `The table chose ${d.dilemma.options[st.driver.chosen].label}.`;
      return stage === "dilemma" ? `Dilemma: ${d.dilemma.prompt}` : `Era Driver: ${d.title}.`;
    }
    case "signals": {
      const t = st.turn;
      if (t.done) return "Every leader has played a signal.";
      const seat = t.order[t.pos];
      if (t.step === "secondary") return `${st.players[seat].name}: choose a domain for the secondary effect.`;
      if (t.step === "discard") return `${st.players[seat].name}: discard any cards, then draw.`;
      return `Era ${ROMAN[st.era]}, Signals: ${who(seat)} to play.`;
    }
    case "council": return st.council.locked ? `Council locked. Funded: ${st.council.funded.map((id) => L.strategies[id].title).join(", ") || "nothing"}.` : "Leadership Council: pool capacity into strategies.";
    case "headline": {
      const h = st.headline;
      if (h.pick == null && !h.skipped) return `Headline of the Era: everyone except ${st.players[st.lead].name} writes a headline.`;
      if (h.pick != null && !h.placed) return `Headline picked: ${h.subs[h.pick]}. ${st.players[h.pick].name} places influence.`;
      return "So what for us now? Write one line for the Insight Log.";
    }
    case "cascades": return st.cascade.done ? `System response applied: ${st.cascade.fired.length} rule${st.cascade.fired.length === 1 ? "" : "s"} fired.` : "System response.";
    default: return "";
  }
}

export function PhasePanel() {
  const { content } = useStore(app);
  const hs = useStore(host);
  const ui = useStore(boardUI);
  const st = hs.h.state;
  const stage = st.driver && ui.driverStage && ui.driverStage.key === `${st.era}|${st.driver.id}` ? ui.driverStage.stage : null;
  // after every step: focus the new step's heading and announce it (not on first mount)
  const key = [st.era, st.phase, stage, st.driver && st.driver.chosen, st.turn && `${st.turn.round}.${st.turn.pos}.${st.turn.step}.${st.turn.done}`,
    st.council && st.council.locked, st.headline && `${st.headline.pick}.${st.headline.placed}.${st.headline.skipped}`, st.cascade && st.cascade.done].join("|");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const a = document.activeElement;
    const inDialog = a && a.closest && a.closest(".dialog");
    if (!inDialog) focusPanel();
    announce(describeStep(content, st, stage));
  }, [key]);
  switch (st.phase) {
    case "era-open": return <EraOpen />;
    case "driver": return <DriverPhase />;
    case "signals": return <SignalsPhase />;
    case "council": return <CouncilPhase />;
    case "headline": return <HeadlinePhase />;
    case "cascades": return <CascadesPhase />;
    default: return null;
  }
}

function PhaseHead({ kicker, title, aside, children }) {
  return (
    <header class="phase-head">
      <div>
        {kicker ? <p class="phase-kicker">{kicker}</p> : null}
        <h2 class="phase-title" data-phase-heading tabIndex={-1}>{title}</h2>
        {children}
      </div>
      {aside ? <div class="phase-aside">{aside}</div> : null}
    </header>
  );
}

// ---------------------------------------------------------------------------
function EraOpen() {
  const { content } = useStore(app);
  const st = useStore(host).h.state;
  const L = lookups(content);
  const era = content.eras[st.era] || {};
  const lead = st.players[st.lead];
  return (
    <div class="phase phase--era">
      <p class="era-kicker">Era {ROMAN[st.era] || st.era + 1} of {ROMAN[content.eras.length - 1] || content.eras.length}</p>
      <h2 class="era-title" data-phase-heading tabIndex={-1}>{era.name}<span class="era-title-years">{era.years}</span></h2>
      <p class="era-desc">{era.description}</p>
      <div class="era-lead">
        <Icon name="compass" size={28} />
        <p><strong>{lead.name}</strong> leads this era as {(L.roles[lead.roleId] || {}).title}. The Lead plays the first signal, breaks dilemma ties and picks the Headline of the Era.</p>
      </div>
      {st.matured && st.matured.length ? (
        <div class="matured">
          <h3 class="sub-h">Long-term strategies mature now</h3>
          <ul>
            {st.matured.map((m) => (
              <li key={m.id}><strong>{(L.strategies[m.id] || {}).title}</strong> <span class="effects">{m.changes.map((c, k) => <Effect key={k} content={content} domain={c.d} delta={c.to - c.from || 0} />)}</span></li>
            ))}
          </ul>
        </div>
      ) : null}
      <div class="phase-actions">
        <Btn kind="primary" size="lg" icon="flag" onClick={() => act({ type: "revealDriver" })}>Reveal the Era Driver</Btn>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function DriverPhase() {
  const { content } = useStore(app);
  const hs = useStore(host);
  const ui = useStore(boardUI);
  const st = hs.h.state;
  const L = lookups(content);
  const dr = st.driver;
  const d = L.drivers[dr.id];
  const opts = d.dilemma.options;
  const tally = dilemmaTally(st, opts.length);
  const voted = dr.votes.filter((v) => v != null).length;
  const max = Math.max(...tally);
  const top = tally.map((c, i) => (c === max && max > 0 ? i : -1)).filter((i) => i >= 0);
  const leadVote = dr.votes[st.lead];
  const tie = top.length > 1 && !(leadVote != null && top.includes(leadVote));
  const lead = st.players[st.lead];
  const chosen = dr.chosen;
  const phoneSeats = new Set(hs.peers.filter((p) => p.roleOk).map((p) => p.seat));
  const tokens = playerTokens(st.players.map((p) => p.name));
  // Two moments: the driver is revealed (big card), then the table decides (full-width dilemma).
  const skey = `${st.era}|${dr.id}`;
  const stage = ui.driverStage && ui.driverStage.key === skey ? ui.driverStage.stage : (voted || chosen != null ? "dilemma" : "reveal");
  const setStage = (x) => boardUI.set({ driverStage: { key: skey, stage: x } });

  if (stage === "reveal") {
    return (
      <div class="phase phase--driver phase--reveal">
        <h2 class="sr-only" data-phase-heading tabIndex={-1}>Era Driver: {d.title}</h2>
        <div class="reveal-card"><DriverCard content={content} driver={d} /></div>
        <div class="phase-actions">
          <p class="phase-help">The driver's effects are already on the tree. Next, the table decides how to respond.</p>
          <Btn kind="primary" size="lg" icon="vote" onClick={() => setStage("dilemma")}>Open the dilemma</Btn>
        </div>
      </div>
    );
  }
  return (
    <div class="phase phase--driver phase--dilemma">
      <div class="driver-strip">
        <span class="driver-strip-k">Era Driver</span>
        <strong class="driver-strip-title">{d.title}</strong>
        <Effects content={content} list={d.effects} short />
        <button type="button" class="btn btn--quiet btn--small" onClick={() => setStage("reveal")}>Show the driver card</button>
      </div>
      <div class="dilemma">
        <p class="phase-kicker">Dilemma{chosen == null ? `: ${voted} of ${st.players.length} voted` : ""}</p>
        <h2 class="dilemma-prompt" data-phase-heading tabIndex={-1}>{d.dilemma.prompt}</h2>
        <ol class="options">
          {opts.map((o, k) => (
            <li key={k} class={cx("option", chosen === k && "is-chosen", chosen != null && chosen !== k && "is-not")}>
              <span class="option-letter" aria-hidden="true">{letter(k)}</span>
              <div class="option-body">
                <h3 class="option-label"><span class="sr-only">Option {letter(k)}: </span>{o.label}</h3>
                <p class="option-text">{o.text}</p>
                <div class="option-foot">
                  <Effects content={content} list={o.effects} short />
                  {chosen == null ? (
                    <span class="option-voters" role="group" aria-label={`Record votes for ${o.label}`}>
                      {st.players.map((p, i) => (
                        <button type="button" key={i} class={cx("voter", dr.votes[i] === k && "is-on", st.lead === i && "is-lead")} aria-pressed={dr.votes[i] === k ? "true" : "false"}
                          title={`${p.name}${st.lead === i ? " (Lead)" : ""}${phoneSeats.has(i) ? ", voting by phone" : ""}`}
                          onClick={() => act({ type: "vote", seat: i, option: dr.votes[i] === k ? null : k })}>
                          {tokens[i]}<span class="sr-only"> ({p.name}{st.lead === i ? ", Lead" : ""}) votes {letter(k)}</span>
                        </button>
                      ))}
                    </span>
                  ) : (
                    <span class="option-voters">{dr.votes.map((v, i) => (v === k ? <span key={i} class="voter is-on" title={st.players[i].name}>{tokens[i]}</span> : null))}</span>
                  )}
                </div>
              </div>
              <span class="option-count" aria-label={`${tally[k]} vote${tally[k] === 1 ? "" : "s"}`}>{tally[k]}</span>
            </li>
          ))}
        </ol>
      </div>
      {chosen == null ? (
        <div class="phase-actions">
          <p class="phase-help vote-help">{hs.sync === "live" ? "Phones vote live. " : ""}Tap a player's initials under an option to record their vote; tap again to clear.</p>
          {tie ? (
            <div class="tie">
              <p><strong>Tie.</strong> {lead.name} (Lead) breaks it:</p>
              {top.map((k) => <Btn key={k} kind="primary" onClick={() => act({ type: "resolveDilemma", tieBreak: k })}>{letter(k)}. {opts[k].label}</Btn>)}
            </div>
          ) : (
            <Btn kind="primary" size="lg" icon="vote" disabled={voted === 0} onClick={() => act({ type: "resolveDilemma" })}>
              {voted === 0 ? "Waiting for votes" : `Decide: ${top.length ? opts[top.length === 1 ? top[0] : leadVote].label : ""}`}
            </Btn>
          )}
        </div>
      ) : (
        <div class="phase-actions decided">
          <p class="decided-note"><Icon name="check" size={22} /><span>The table chose <strong>{letter(chosen)}. {opts[chosen].label}</strong>{dr.decidedBy != null ? `, decided by ${st.players[dr.decidedBy].name}'s ability` : ""}.</span></p>
          <Btn kind="primary" size="lg" icon="next" onClick={() => act({ type: "beginSignals" })}>Continue to signals</Btn>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function SignalsPhase() {
  const { content } = useStore(app);
  const hs = useStore(host);
  const st = hs.h.state;
  const L = lookups(content);
  const t = st.turn;
  const [sel, setSel] = useState(null);
  const [discard, setDiscard] = useState([]);
  const [reason, setReason] = useState("");
  const turnKey = `${t.round}-${t.pos}-${t.step}`;
  useEffect(() => { setSel(null); setDiscard([]); if (t.step === "choose") setReason(""); }, [turnKey]);

  if (t.done) {
    const played = st.story.filter((e) => e.era === st.era && e.k === "signal");
    return (
      <div class="phase phase--signals">
        <PhaseHead kicker="Signals" title="Every leader has played" />
        <ul class="played-list">
          {played.map((e, k) => {
            const s = L.signals[e.id];
            return <li key={k}><span class="seat-num">{e.seat + 1}</span> <strong>{st.players[e.seat].name}</strong> played <em>{s ? s.title : e.id}</em>{e.reasoning ? <span class="reason">“{e.reasoning}”</span> : null}</li>;
          })}
        </ul>
        <div class="phase-actions">
          <Btn kind="primary" size="lg" icon="users" onClick={() => act({ type: "beginCouncil" })}>Open the Leadership Council</Btn>
        </div>
      </div>
    );
  }

  const seat = t.order[t.pos];
  const p = st.players[seat];
  const role = L.roles[p.roleId] || {};
  const hand = st.hands[seat];
  const n = t.order.length * st.rounds;
  const k = t.round * t.order.length + t.pos + 1;
  const playedSig = t.card ? L.signals[t.card] : null;
  const sec = playedSig && playedSig.secondary;

  const hint = t.step === "choose" ? "Hands are open: discuss, then choose one signal to play." : t.step === "secondary" ? "Say aloud how this signal reaches the domain you choose." : "Discard any cards you don't want, then draw back to three.";
  const head = (
    <PhaseHead kicker={`Signal turn ${k} of ${n}${st.rounds > 1 ? `, round ${t.round + 1}` : ""}`}
      title={<>{p.name}{" "}<span class="title-role">{role.title}</span></>}>
      {t.step !== "choose" ? <p class="phase-sub phase-sub--one">{hint}</p> : null}
    </PhaseHead>
  );

  if (t.step === "choose") {
    return (
      <div class="phase phase--signals">
        {head}
        <div class="hand" role="group" aria-label={`${p.name}'s hand`}>
          {hand.length ? hand.map((id, i) => (
            <SignalCard key={id} content={content} signal={L.signals[id]} selected={sel === id} onSelect={(x) => setSel(sel === x ? null : x)} idx={i} />
          )) : <p class="muted">No cards left in the deck for this player.</p>}
        </div>
        <div class="phase-actions">
          <p class="phase-help">{hint}</p>
          <Btn kind="quiet" onClick={() => act({ type: "endTurn" })}>Pass this turn</Btn>
          <Btn kind="primary" size="lg" icon="play" disabled={!sel} onClick={() => act({ type: "playSignal", seat, card: sel })}>
            {sel ? `Play “${L.signals[sel].title}”` : "Select a card to play"}
          </Btn>
        </div>
      </div>
    );
  }

  if (t.step === "secondary") {
    return (
      <div class="phase phase--signals">
        {head}
        <SecondaryResolver key={turnKey} seat={seat} playedSig={playedSig} reason={reason} setReason={setReason} />
      </div>
    );
  }

  // discard step
  const entry = st.story.slice().reverse().find((e) => e.k === "signal" && e.seat === seat && e.era === st.era);
  return (
    <div class="phase phase--signals">
      {head}
      <div class="discard-layout">
        <div class="played-summary">
          <p class="phase-kicker">Played</p>
          {playedSig ? <SignalCard content={content} signal={playedSig} played compact /> : <p class="muted">Passed.</p>}
          {playedSig ? (
            <>
              <label class="field-label" for="reason2">Reasoning <span class="muted">(optional)</span></label>
              <textarea id="reason2" class="input" rows={2} maxLength={400} value={reason || (entry && entry.reasoning) || ""} onInput={(e) => setReason(e.currentTarget.value)} placeholder="Why this signal, and how it plays out" />
            </>
          ) : null}
        </div>
        <div class="hand hand--discard" role="group" aria-label="Cards in hand">
          {hand.map((id) => (
            <SignalCard key={id} content={content} signal={L.signals[id]} compact discard={discard.includes(id)}
              onToggleDiscard={(x) => setDiscard((ds) => (ds.includes(x) ? ds.filter((y) => y !== x) : [...ds, x]))} />
          ))}
        </div>
      </div>
      <div class="phase-actions">
        <Btn kind="primary" size="lg" icon="next" onClick={() => act({ type: "endTurn", discard, reasoning: reason || undefined })}>
          {discard.length ? `Discard ${discard.length}, draw and end turn` : "Draw and end turn"}
        </Btn>
      </div>
    </div>
  );
}


const SHORT_WHY = { "already at 10": "at 10", "at 0: nothing to move": "at 0", "already at 0": "at 0", "the primary effect's domain": "primary", "protected this era": "protected", "already protected": "protected" };

function SecondaryResolver({ seat, playedSig, reason, setReason }) {
  const { content } = useStore(app);
  const st = useStore(host).h.state;
  const L = lookups(content);
  const p = st.players[seat];
  const sec = playedSig.secondary;
  const tg = secondaryTargets(content, st);
  const [choice, setChoice] = useState({ domain: null, from: null, to: null });
  const needTwo = sec.type === "move";
  const stageTo = needTwo && choice.from && !choice.to;
  const why = (d) => {
    if (!needTwo) return tg.domain[d] || null;
    if (stageTo || (choice.from && choice.to && d !== choice.from)) return d === choice.from ? null : tg.to[d] || null;
    return tg.from[d] || null;
  };
  const pickDomain = (d) => {
    if (!needTwo) { if (!tg.domain[d]) setChoice({ domain: d }); return; }
    setChoice((c) => {
      if (!c.from || (c.from && c.to)) return tg.from[d] ? c : { from: d, to: null };
      if (d === c.from) return { from: null, to: null };
      return tg.to[d] ? c : { ...c, to: d };
    });
  };
  const selected = needTwo ? [choice.from, choice.to].filter(Boolean) : [choice.domain].filter(Boolean);
  const prompt = needTwo ? (!choice.from ? `Choose the domain to move ${sec.amount || 1} from` : !choice.to ? "Now choose the domain to move it to" : "Ready to apply") : `Choose a domain: ${secondaryLabel(sec).toLowerCase()}`;
  useEffect(() => {
    boardUI.set({ pick: { onPick: pickDomain, selected, disabled: L.domainIds.filter((d) => why(d)), prompt: `Tap a wedge on the tree, or use the buttons. ${prompt}.` } });
  }, [choice.domain, choice.from, choice.to, st.cond]);
  useEffect(() => () => boardUI.set({ pick: null }), []);
  const ready = needTwo ? choice.from && choice.to : !!choice.domain;
  const moving = needTwo && ready ? Math.min(sec.amount || 1, st.cond[choice.from], 10 - st.cond[choice.to]) : 0;
  const apply = () => act(needTwo ? { type: "resolveSecondary", from: choice.from, to: choice.to, reasoning: reason } : { type: "resolveSecondary", domain: choice.domain, reasoning: reason });
  return (
    <>
    <div class="resolve-layout">
      <SignalCard content={content} signal={playedSig} played />
      <div class="resolver">
        <h3 class="resolver-title"><span class="choice-glyph" aria-hidden="true">{sec.type === "add" ? "+" : sec.type === "remove" ? "−" : sec.type === "move" ? "⇄" : "◈"}</span> {secondaryLabel(sec)}</h3>
        {sec.text ? <p class="resolver-prompt">{sec.text}</p> : null}
        {tg.anyValid ? (
          <fieldset class="domain-pick">
            <legend>{prompt}</legend>
            <div class="domain-grid">
              {content.domains.map((d) => {
                const w = why(d.id);
                const on = selected.includes(d.id);
                const tag = needTwo ? (choice.from === d.id ? "from" : choice.to === d.id ? "to" : "") : "";
                return (
                  <button type="button" key={d.id} class={cx("domain-btn", on && "is-selected")} disabled={!!w} aria-pressed={on ? "true" : "false"} onClick={() => pickDomain(d.id)} style={{ "--dc": d.color }} title={w ? `${d.name}: ${w}` : d.name}>
                    <Icon name={d.icon || d.id} size={22} /><span>{d.short || d.name}</span><strong>{st.cond[d.id]}</strong>
                    {w ? <small class="domain-why">{SHORT_WHY[w] || w}<span class="sr-only"> ({w})</span></small> : null}
                    {tag ? <em class="domain-btn-tag">{tag}</em> : null}
                  </button>
                );
              })}
            </div>
            {needTwo && ready ? <p class="move-preview">{moving} point{moving === 1 ? "" : "s"} will move: {L.domains[choice.from].short} {st.cond[choice.from]} → {st.cond[choice.from] - moving}, {L.domains[choice.to].short} {st.cond[choice.to]} → {st.cond[choice.to] + moving}{moving < (sec.amount || 1) ? " (only what the destination can take)" : ""}.</p> : null}
          </fieldset>
        ) : (
          <p class="notice"><Icon name="info" size={18} /> No domain can change ({sec.type === "add" ? "every candidate is at 10 or protected" : sec.type === "remove" ? "every candidate is at 0 or protected" : "no valid pair of domains"}). Skip this effect.</p>
        )}
        <label class="field-label" for="reason">How does this signal affect that domain? <span class="muted">(logged for the debrief)</span></label>
        <textarea id="reason" class="input" rows={2} maxLength={400} value={reason} onInput={(e) => setReason(e.currentTarget.value)} placeholder={`${p.name}'s reasoning, in a sentence`} />
      </div>
    </div>
    {/* a direct child of .phase, so it stays pinned to the bottom of the panel when it scrolls */}
    <div class="phase-actions">
      {ready && needTwo ? <p class="phase-help">{L.domains[choice.from].short} → {L.domains[choice.to].short}, {moving} point{moving === 1 ? "" : "s"}</p> : null}
      {tg.anyValid ? <Btn kind="primary" size="lg" icon="check" disabled={!ready} onClick={apply}>Apply</Btn>
        : <Btn kind="primary" size="lg" icon="next" onClick={() => act({ type: "resolveSecondary", skip: true, reasoning: reason })}>Skip this effect</Btn>}
    </div>
    </>
  );
}

// ---------------------------------------------------------------------------
function CouncilPhase() {
  const { content } = useStore(app);
  const hs = useStore(host);
  const ui = useStore(boardUI);
  const st = hs.h.state;
  const L = lookups(content);
  const c = st.council;
  const rules = rulesOf(content);
  const last = st.era >= content.eras.length - 1;
  const wf = L.domains.workforce, gv = L.domains.governance;
  const mod = (id) => (st.cond[id] == null ? 0 : capacityModifier(content, st.cond[id]));
  const fm = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "±0");
  const totalCap = c.capacity.reduce((a, b) => a + b, 0);
  const totalPledged = c.market.reduce((a, id) => a + pledgedTotal(st, id), 0);
  const names = firstNames(st.players.map((p) => p.name));
  const tokens = playerTokens(st.players.map((p) => p.name));
  const left = (i) => c.capacity[i] - seatSpent(st, i);
  const firstWithCap = st.players.findIndex((_, i) => left(i) > 0);
  const sel = ui.pledgeSeat != null && ui.pledgeSeat < st.players.length ? ui.pledgeSeat : Math.max(0, firstWithCap);
  return (
    <div class="phase phase--council">
      <PhaseHead kicker="Leadership Council" title="Pool capacity into strategies"
        aside={!c.locked ? (
          <div class="timer-col">
            <PhaseTimer kind="council" seconds={rules.councilSeconds}
              onExpire={st.autoLock ? () => { host.set({ timer: null }); if (act({ type: "lockCouncil" })) toast("Time's up: the Council is locked."); } : null} />
            {st.autoLock ? <p class="timer-note">Locks automatically at 0:00</p> : null}
          </div>
        ) : null}>
        <p class="phase-sub">
          Each leader has <strong>{c.base}</strong> Capacity: base {capacityBaseFor(content, st.players.length)} for {st.players.length} players
          {wf ? <>, {wf.short || wf.name} {bandOf(content, st.cond.workforce).label} {fm(mod("workforce"))}</> : null}
          {gv ? <>, {gv.short || gv.name} {bandOf(content, st.cond.governance).label} {fm(mod("governance"))}</> : null}
          {c.base === (rules.capacityMin ?? 1) ? ` (minimum ${rules.capacityMin ?? 1})` : ""}.
          {last ? (rules.farDelayed === "final" ? " Next-era effects land in 2050." : " In this final era, next-era effects become legacy investments: they shape the story, not the 2050 score.") : ""}
        </p>
      </PhaseHead>
      {!c.locked ? (
        <div class="pledge-for" role="group" aria-label="Pledging for">
          <span class="pledge-for-k">Pledging for</span>
          {st.players.map((p, i) => (
            <button type="button" key={i} class={cx("pledge-seat", sel === i && "is-on", left(i) === 0 && "is-spent")} aria-pressed={sel === i ? "true" : "false"} onClick={() => boardUI.set({ pledgeSeat: i })}>
              <span class="ps-name">{names[i]}</span>
              <span class="ps-left">{left(i)}<span class="ps-of">/{c.capacity[i]}</span><span class="sr-only"> capacity left</span></span>
            </button>
          ))}
        </div>
      ) : null}
      <div class="market">
        {c.market.map((id) => {
          const s = L.strategies[id];
          const cost = effectiveCost(content, st, id);
          const tot = pledgedTotal(st, id);
          const disc = c.discounts[id] || 0;
          const cur = c.pledges[id][sel] || 0;
          const room = Math.min(cur + left(sel), cur + (cost - tot));
          return (
            <div class="market-col" key={id}>
              <StrategyCard content={content} strategy={s} pledged={tot} discount={disc} funded={c.locked && c.funded.includes(id)} unfunded={c.locked && !c.funded.includes(id) && tot > 0} compact>
                <div class="pledge-tokens" role="img" aria-label={`${tot} of ${cost} capacity pledged`}>
                  {Array.from({ length: cost }, (_, j) => <span key={j} class={cx("token", j < tot && "is-in")} />)}
                  <span class="pledge-num"><strong>{tot}</strong>/{cost}</span>
                </div>
                {disc ? <p class="pledge-disc"><span class="tag">−{disc} discount: costs {cost}, not {s.cost}</span></p> : null}
                <ul class="contrib" aria-label={`Pledged to ${s.title}`}>
                  {st.players.map((p, i) => ((c.pledges[id][i] || 0) > 0 ? <li key={i} title={p.name}>{tokens[i]} <strong>{c.pledges[id][i]}</strong><span class="sr-only"> from {p.name}</span></li> : null))}

                </ul>
                {!c.locked ? (
                  <div class="pledge-mine">
                    <span class="pledge-who" title={st.players[sel].name}>{tokens[sel]}</span>
                    <Stepper value={cur} min={0} max={Math.max(cur, room)} label={`${st.players[sel].name}'s pledge to ${s.title}`}
                      onChange={(v) => act({ type: "pledge", seat: sel, strategy: id, amount: v })} />
                  </div>
                ) : null}
              </StrategyCard>
            </div>
          );
        })}
      </div>
      {!c.locked ? (
        <div class="phase-actions">
          <p class="phase-help">{totalPledged} of {totalCap} capacity pledged. Only fully funded strategies happen; other pledges and unspent capacity are lost at Lock.</p>
          <Btn kind="primary" size="lg" icon="lock" onClick={() => { host.set({ timer: null }); act({ type: "lockCouncil" }); }}>Lock the Council</Btn>
        </div>
      ) : (
        <div class="phase-actions decided">
          <p class="decided-note">
            <Icon name="check" size={22} />
            <span>
              {c.funded.length ? <>Funded: <strong>{c.funded.map((id) => L.strategies[id].title).join(", ")}</strong>. </> : "Nothing was funded. "}
              {c.lost ? `${c.lost} capacity went unused or was lost.` : "Every point of capacity was put to work."}
            </span>
          </p>
          <Btn kind="primary" size="lg" icon="newspaper" onClick={() => act({ type: "beginHeadline" })}>Write the Headline of the Era</Btn>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function HeadlinePhase() {
  const st = useStore(host).h.state;
  const hl = st.headline;
  return hl.pick == null && !hl.skipped ? <HeadlineWrite /> : <HeadlinePrinted />;
}

function Masthead({ era }) {
  return (
    <div class="masthead">
      <span class="masthead-name">The Long View</span>
      <span class="masthead-date">{era.name} era, {era.years}</span>
    </div>
  );
}

function HeadlineWrite() {
  const { content } = useStore(app);
  const st = useStore(host).h.state;
  const hl = st.headline;
  const rules = rulesOf(content);
  const era = content.eras[st.era] || {};
  const lead = st.players[st.lead];
  const [drafts, setDrafts] = useState({});
  const writers = st.players.map((p, i) => i).filter((i) => i !== st.lead);
  const subs = writers.filter((i) => hl.subs[i]);
  // keep the facilitator's text if it's rejected (e.g. over 10 words) so it can be trimmed, not retyped
  const commit = (i) => {
    if (drafts[i] == null || drafts[i] === (hl.subs[i] || "")) { setDrafts((d) => { const n = { ...d }; delete n[i]; return n; }); return; }
    if (wordCount(drafts[i]) > 10) { toast(`${st.players[i].name}'s headline has ${wordCount(drafts[i])} words: trim it to 10 or fewer.`, "warn"); return; }
    if (act({ type: "submitHeadline", seat: i, text: drafts[i] })) setDrafts((d) => { const n = { ...d }; delete n[i]; return n; });
  };
  return (
    <div class="phase phase--headline">
      <PhaseHead kicker="Headline of the Era" title="Write the front page"
        aside={<PhaseTimer kind="headline" seconds={rules.headlineSeconds} />}>
        <p class="phase-sub">Everyone except {lead.name} (Lead) writes a headline of 10 words or fewer that ties together this era's driver, signals and strategies. {lead.name} picks one.</p>
      </PhaseHead>
      <div class="front">
        <Masthead era={era} />
        <ul class="proofs">
          {writers.map((i) => {
            const p = st.players[i];
            const text = drafts[i] != null ? drafts[i] : hl.subs[i] || "";
            const wc = wordCount(text);
            return (
              <li key={i} class={cx("proof", hl.subs[i] && "has-sub")}>
                <label class="proof-by" for={`hl-${i}`}>{p.name}</label>
                <div class="proof-row">
                  <input id={`hl-${i}`} class="input proof-input" value={text} maxLength={120} placeholder="Type it here, or send it from a phone"
                    onInput={(e) => setDrafts((d) => ({ ...d, [i]: e.currentTarget.value }))}
                    onBlur={() => commit(i)} onKeyDown={(e) => { if (e.key === "Enter") commit(i); }}
                    aria-describedby={`hlc-${i}`} aria-invalid={wc > 10 ? "true" : "false"} />
                  <span id={`hlc-${i}`} class={cx("wc", wc > 10 && "is-over")}>{wc}/10<span class="sr-only"> words</span></span>
                  <Btn kind="primary" disabled={!hl.subs[i] || (drafts[i] != null && drafts[i] !== hl.subs[i])} onClick={() => act({ type: "pickHeadline", seat: i })} aria-label={`Pick ${p.name}'s headline`}>Pick</Btn>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <div class="phase-actions">
        <p class="phase-help">{subs.length} of {writers.length} headlines in.</p>
        <Btn kind="quiet" onClick={() => act({ type: "skipHeadline" })}>Skip the headline</Btn>
      </div>
    </div>
  );
}

function HeadlinePrinted() {
  const { content } = useStore(app);
  const st = useStore(host).h.state;
  const L = lookups(content);
  const hl = st.headline;
  const rules = rulesOf(content);
  const era = content.eras[st.era] || {};
  const inf = rules.headlineInfluence;
  const author = hl.pick != null ? st.players[hl.pick] : null;
  const cur = st.insights.find((x) => x.era === st.era);
  const [alloc, setAlloc] = useState([]);
  const [sowhat, setSowhat] = useState(cur ? cur.text : "");
  const total = alloc.reduce((a, x) => a + x.delta, 0);
  const addAlloc = (d) => setAlloc((al) => {
    const ex = al.find((x) => x.domain === d);
    const sum = al.reduce((a, x) => a + x.delta, 0);
    const roomLeft = 10 - st.cond[d] - (ex ? ex.delta : 0);
    if (ex) return sum < inf && roomLeft > 0 ? al.map((x) => (x.domain === d ? { ...x, delta: x.delta + 1 } : x)) : al.filter((x) => x.domain !== d);
    if (roomLeft <= 0) return al;
    if (sum >= inf) return [{ domain: d, delta: 1 }];
    return [...al, { domain: d, delta: 1 }];
  });
  const placing = author && !hl.placed;
  useEffect(() => {
    if (placing) boardUI.set({ pick: { onPick: addAlloc, selected: alloc.map((x) => x.domain), disabled: [], prompt: `Tap wedges to place ${author.name}'s +${inf}: one wedge twice, or two wedges once each.` } });
    else boardUI.set({ pick: null });
  }, [alloc, placing]);
  useEffect(() => () => boardUI.set({ pick: null }), []);
  return (
    <div class="phase phase--headline">
      <div class="front front--printed">
        <Masthead era={era} />
        {author ? (
          <>
            <h2 class="headline">{hl.subs[hl.pick]}</h2>
            <p class="byline">By {author.name}, {(L.roles[author.roleId] || {}).title}</p>
          </>
        ) : <h2 class="headline headline--none">No headline this era</h2>}
      </div>
      <div class="headline-after">
        {placing ? (
          <div class="influence">
            <h3 class="sub-h">{author.name} adds +{inf} influence</h3>
            <p class="muted">One domain +{inf}, or +1 on {inf} different domains. Tap a domain again to stack.</p>
            <div class="domain-grid">
              {content.domains.map((d) => {
                const a = alloc.find((x) => x.domain === d.id);
                const full = st.cond[d.id] >= 10;
                return (
                  <button type="button" key={d.id} class={cx("domain-btn", a && "is-selected")} disabled={full} aria-pressed={a ? "true" : "false"} onClick={() => addAlloc(d.id)} style={{ "--dc": d.color }} title={full ? `${d.name} is already at 10` : d.name}>
                    <Icon name={d.icon || d.id} size={22} /><span>{d.short || d.name}</span><strong>{st.cond[d.id]}{a ? <em class="plus"> +{a.delta}</em> : null}</strong>
                    {full ? <small class="domain-why">at 10<span class="sr-only"> (already at 10)</span></small> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div class="sowhat">
            <label class="sowhat-label" for="sowhat">So what for us now?</label>
            <p class="muted">The table writes one line for the Insight Log: what this era means for decisions today.</p>
            <textarea id="sowhat" class="input" rows={2} maxLength={280} value={sowhat} onInput={(e) => setSowhat(e.currentTarget.value)} placeholder="e.g. Our partnerships are our real surge capacity: invest in them before the next fire season." />
          </div>
        )}
      </div>
      {/* pinned action bar (direct child of .phase) */}
      {placing ? (
        <div class="phase-actions">
          <p class="phase-help">{total} of +{inf} placed.</p>
          <Btn kind="quiet" disabled={!alloc.length} onClick={() => setAlloc([])}>Clear</Btn>
          <Btn kind="primary" size="lg" icon="check" disabled={total !== inf} onClick={() => { if (act({ type: "placeInfluence", alloc })) setAlloc([]); }}>Place influence</Btn>
        </div>
      ) : (
        <div class="phase-actions">
          <Btn onClick={() => { act({ type: "setInsight", text: sowhat }); toast("Saved to the Insight Log."); }} disabled={!sowhat.trim()} icon="bulb">Save insight</Btn>
          <Btn kind="primary" size="lg" icon="cascade" onClick={() => { if (sowhat.trim() && (!cur || cur.text !== sowhat.trim())) act({ type: "setInsight", text: sowhat }); act({ type: "beginCascades" }); }}>Continue to system response</Btn>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function CascadesPhase() {
  const { content } = useStore(app);
  const hs = useStore(host);
  const st = hs.h.state;
  const L = lookups(content);
  const cs = st.cascade;
  const rules = rulesOf(content);
  const era = content.eras[st.era] || {};
  const last = st.era >= content.eras.length - 1;
  const preview = cascadePreview(content, st);
  const fired = cs.done ? cs.fired.map((id) => L.cascades[id]).filter(Boolean) : preview;
  const crisis = crisisDomains(content, st.cond);
  const collapse = cs.done && crisis.length >= rules.collapseCrisisCount;
  const pending = [];
  const whenText = (w) => {
    const d = L.domains[w.domain];
    const op = w.lte != null ? `at or below ${w.lte}` : w.gte != null ? `at or above ${w.gte}` : w.lt != null ? `below ${w.lt}` : `above ${w.gt}`;
    return `${d ? d.name : w.domain} ${op}`;
  };
  return (
    <div class="phase phase--cascades">
      <PhaseHead kicker="System response" title={cs.done ? "The system responds" : "Interdependencies kick in"}>
        <p class="phase-sub">Domains that are struggling, or thriving, pull on their neighbours. {rulesOf(content).cascadeMode === "sequential" ? "Rules are checked in order, so one effect can trigger the next." : "Every rule is checked against the tree as it stands now, then all effects apply at once."}</p>
      </PhaseHead>
      {pending.length && !cs.done ? (
        <div class="matured">
          <h3 class="sub-h">Long-term strategies mature in 2050</h3>
          <ul>{pending.map((pd) => <li key={pd.id}><strong>{(L.strategies[pd.id] || {}).title}</strong> <Effects content={content} list={pd.effects} /></li>)}</ul>
        </div>
      ) : null}
      {fired.length ? (
        <ul class="cascades">
          {fired.map((c) => (
            <li key={c.id} class={cx("cascade", cs.done && "is-done")}>
              <p class="cascade-when"><Icon name="cascade" size={20} /> {whenText(c.when)}</p>
              <p class="cascade-text">{c.text}</p>
              <Effects content={content} list={c.effects} />
            </li>
          ))}
        </ul>
      ) : <p class="calm">No interdependency rules fire this era. The system holds steady.</p>}
      {cs.done ? (
        <>
          <div class={cx("phase-actions", "era-close-bar", collapse && "is-collapse")}>
            {collapse ? (
              <p class="collapse-note phase-help"><Icon name="scar" size={24} /> <span><strong>{crisis.length} domains are in Crisis.</strong> The system collapses: the game ends and the shared outcome is Unraveling.</span></p>
            ) : (
              <p class="phase-help">{crisis.length ? `${crisis.length} in Crisis. ` : ""}Lay down the {era.name} ring to record this era's conditions{last ? " and see the outcome" : ""}.</p>
            )}
            <Btn kind="primary" size="lg" icon="ring" onClick={() => act({ type: "closeEra" })}>
              {collapse ? "Record the collapse" : last ? "Lay down the final ring" : `Lay down the ${era.name} ring`}
            </Btn>
          </div>
        </>
      ) : (
        <div class="phase-actions">
          <Btn kind="primary" size="lg" icon="cascade" onClick={() => act({ type: "runCascades" })}>Apply the system response</Btn>
        </div>
      )}
    </div>
  );
}

export { DomainDot };
