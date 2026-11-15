import { useEffect, useState } from "preact/hooks";
import { app, useStore, toast } from "../store.js";
import { Icon } from "../icons.jsx";
import { Btn, Stepper, useTicker, fmtClock, ThemeToggle } from "../common.jsx";
import { RoleCard, MandateView, SignalCard, Effects, DomainDot } from "../cards.jsx";
import { QuickRules } from "./rules.jsx";
import { lookups, mandateFor, mandateProgress, fingerprint, CODE_RE, normalizeCode, active, wordCount, bandOf, seatCheck } from "../../engine/index.js";
import { store as ls, cx, setHash } from "../util.js";
import { phone, startPhoneSync, stopPhoneSync, sendIntent } from "../sync.js";

const KEY = "ff.phone.v1";

// A phone's seat lives in sessionStorage (per tab) with a localStorage copy so it survives a closed tab.
function readSession() {
  try { const v = window.sessionStorage.getItem(KEY); if (v) return JSON.parse(v); } catch { /* */ }
  return ls.get(KEY, null);
}
function writeSession(v) {
  try { window.sessionStorage.setItem(KEY, JSON.stringify(v)); } catch { /* */ }
  ls.set(KEY, v);
}

export function Phone({ route }) {
  const [session, setSession] = useState(readSession);
  useEffect(() => { document.documentElement.classList.add("phone-mode"); return () => document.documentElement.classList.remove("phone-mode"); }, []);
  useEffect(() => { setSession(readSession()); }, [route]);
  if (route === "join" || !session) return <JoinForm initial={session} onJoin={(s) => { writeSession(s); setSession(s); setHash("play"); }} />;
  return <PlayerView key={`${session.code}-${session.seat}-${session.roleId}`} session={session} />;
}

function JoinForm({ initial, onJoin }) {
  const { content } = useStore(app);
  const roles = active(content.roles);
  const [code, setCode] = useState(initial ? initial.code : "");
  const [seat, setSeat] = useState(initial ? initial.seat : 0);
  const [roleId, setRole] = useState(initial ? initial.roleId : "");
  const [name, setName] = useState(initial ? initial.name : "");
  const [tried, setTried] = useState(false);
  const codeOk = CODE_RE.test(code);
  const err = !codeOk ? (code.length < 6 ? "Enter all 6 characters of the game code." : "Codes use letters and digits but never O, 0, I, 1 or L.") : !roleId ? "Choose your role." : null;
  const join = (e) => {
    e && e.preventDefault();
    setTried(true);
    if (err) return;
    onJoin({ code, seat, roleId, name: name.trim() });
  };
  return (
    <main class="phone" id="main">
      <header class="phone-head">
        <a href="#" class="back-link"><Icon name="back" size={20} /> Home</a>
        <ThemeToggle />
      </header>
      <form class="join" onSubmit={join} noValidate>
        <h1 class="phone-title">Join a game</h1>
        <p class="muted">The code is on the big screen. Your mandate is worked out on this phone and never sent anywhere.</p>
        <div class="field">
          <label class="field-label" for="j-code">Game code</label>
          <input id="j-code" class="input input--code" value={code} autoComplete="off" autoCapitalize="characters" spellCheck={false} inputMode="text" maxLength={8}
            aria-invalid={tried && !codeOk ? "true" : "false"} aria-describedby="j-code-h"
            onInput={(e) => setCode(normalizeCode(e.currentTarget.value))} />
          <p class="field-hint" id="j-code-h">6 characters, like K7MR2Q</p>
        </div>
        <div class="field">
          <label class="field-label" for="j-seat">Your seat number</label>
          <select id="j-seat" class="input" value={seat} onChange={(e) => setSeat(+e.currentTarget.value)}>
            {Array.from({ length: 7 }, (_, i) => <option key={i} value={i}>Seat {i + 1}</option>)}
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="j-role">Your role</label>
          <select id="j-role" class="input" value={roleId} aria-invalid={tried && !roleId ? "true" : "false"} onChange={(e) => setRole(e.currentTarget.value)}>
            <option value="">Choose the role on the big screen…</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="j-name">Your name <span class="muted">(optional)</span></label>
          <input id="j-name" class="input" value={name} maxLength={24} autoComplete="given-name" onInput={(e) => setName(e.currentTarget.value)} />
        </div>
        {tried && err ? <p class="field-error" role="alert">{err}</p> : null}
        <Btn kind="primary" size="lg" icon="next" type="submit" onClick={join}>Join</Btn>
        <p class="edition-note">Card edition {fingerprint(content)}</p>
      </form>
    </main>
  );
}

function PlayerView({ session }) {
  const { content, caps } = useStore(app);
  const ph = useStore(phone);
  const [tab, setTab] = useState("role");
  const L = lookups(content);
  const role = L.roles[session.roleId];
  const fp = fingerprint(content);
  useEffect(() => {
    if (caps.room) startPhoneSync({ code: session.code, seat: session.seat, roleId: session.roleId, name: session.name, fp });
    return () => stopPhoneSync();
  }, [caps.room, session.code, session.seat, session.roleId]);
  if (!role) {
    return (
      <main class="phone" id="main"><div class="notice"><p>This role isn't in the current card edition.</p><Btn onClick={() => setHash("join")}>Choose again</Btn></div></main>
    );
  }
  const ps = ph.ps;
  const live = !!caps.room;
  const mismatch = ps && ps.fp && ps.fp !== fp;
  const seatMismatch = ps && ps.pl && ps.pl[session.seat] && ps.pl[session.seat][1] !== session.roleId;
  const tabs = [["role", "Mandate", "eye"], ...(live ? [["table", "Table", "users"]] : []), ["notes", "Notes", "notes"], ["rules", "Rules", "book"]];
  return (
    <main class="phone" id="main">
      <header class="phone-head">
        <div class="phone-id">
          <span class="phone-code">{session.code}</span>
          <span class="muted">Seat {session.seat + 1}{session.name ? `, ${session.name}` : ""}</span>
        </div>
        <span class={cx("sync-pill", live ? (ps ? "is-live" : "is-wait") : "is-off")}>
          <Icon name={live ? "wifi" : "wifi-off"} size={16} />
          {live ? (ps ? "Live" : "Looking for host") : "Offline"}
        </span>
        <ThemeToggle />
        <button type="button" class="icon-btn" onClick={() => setHash("join")} aria-label="Change game, seat or role"><Icon name="edit" /></button>
      </header>
      {mismatch ? <p class="notice notice--warn"><Icon name="alert" size={18} /> The host is using card edition {ps.fp}; this phone has {fp}. Reload this page to get the same edition.</p> : null}
      {seatMismatch ? <p class="notice notice--warn"><Icon name="alert" size={18} /> The host has a different role in seat {session.seat + 1}. Check your seat number.</p> : null}
      <div class="phone-body" role="tabpanel" id={`tab-${tab}`} aria-labelledby={`tb-${tab}`}>
        {tab === "role" ? <MandateTab content={content} session={session} role={role} ps={ps} /> : null}
        {tab === "table" ? <TableTab content={content} session={session} ps={ps} status={ph.status} /> : null}
        {tab === "notes" ? <NotesTab session={session} /> : null}
        {tab === "rules" ? <div class="phone-rules"><QuickRules content={content} /></div> : null}
      </div>
      <nav class="phone-tabs" role="tablist" aria-label="Phone sections">
        {tabs.map(([id, label, icon]) => (
          <button type="button" key={id} id={`tb-${id}`} role="tab" aria-selected={tab === id ? "true" : "false"} aria-controls={`tab-${id}`} class={cx("phone-tab", tab === id && "is-on")} onClick={() => setTab(id)}>
            <Icon name={icon} size={22} /><span>{label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}

function condFromPs(content, ps) {
  if (!ps || !Array.isArray(ps.cd)) return null;
  const out = {};
  content.domains.forEach((d, i) => { out[d.id] = ps.cd[i]; });
  return out;
}

function MandateTab({ content, session, role, ps }) {
  const [shown, setShown] = useState(false);
  const mandate = mandateFor(content, session.code, session.seat, session.roleId);
  const cond = condFromPs(content, ps);
  const prog = cond ? mandateProgress(content, cond, mandate) : null;
  return (
    <div class="mandate-tab">
      <RoleCard content={content} role={role} seat={session.seat} name={session.name} />
      <p class="phone-checks">
        <span>Check code <strong>{seatCheck(session.code, session.seat + 1, session.roleId)}</strong><span class="muted">: the host's seat {session.seat + 1} chip and its Game menu should show the same code</span></span>
        <span>Card edition <strong>{fingerprint(content)}</strong></span>
      </p>
      <section class={cx("secret", shown && "is-shown")} aria-labelledby="secret-h">
        <h2 id="secret-h" class="secret-title"><Icon name="lock" size={20} /> Secret mandate</h2>
        {!shown ? (
          <button type="button" class="secret-cover" onClick={() => setShown(true)}>
            <Icon name="eye" size={28} />
            <span>Tap to reveal. Keep your screen to yourself.</span>
          </button>
        ) : (
          <>
            <MandateView content={content} mandate={mandate} cond={cond} />
            {prog ? <p class="secret-progress"><strong>{prog.met} of {prog.total}</strong> conditions met right now</p> : null}
            <Btn kind="quiet" icon="eye-off" onClick={() => setShown(false)}>Hide</Btn>
          </>
        )}
      </section>
      {ps && ps.ph === "over" ? (
        <p class="notice">The game is over: the shared outcome is <strong>{ps.oc}</strong>. {prog ? `You met ${prog.met} of ${prog.total}.` : ""}</p>
      ) : null}
    </div>
  );
}

function Sent({ t, ps, seat }) {
  if (!t) return null;
  const ok = ps && ps.ak && ps.ak[seat] >= t;
  return <p class={cx("sent", ok && "is-ok")} role="status">{ok ? <><Icon name="check" size={18} /> Received by the host</> : "Sending…"}</p>;
}

function TableTab({ content, session, ps, status }) {
  const ph = useStore(phone);
  const L = lookups(content);
  const seat = session.seat;
  const [draft, setDraft] = useState("");
  const [pl, setPl] = useState(null);
  const [adjusted, setAdjusted] = useState(null);
  useTicker(!!(ps && ps.tg), 500);
  useEffect(() => { setPl(null); setAdjusted(null); }, [ps && ps.ph, ps && ps.e]);
  // Once the host has acknowledged our pledge, show what it actually accepted (it clamps to budget/cost).
  const ipAcked = !!(ps && ps.ph === "council" && ph.intents.ip && ph.intents.ip.e === ps.e && ps.ak && (ps.ak[seat] || 0) >= ph.intents.ip.t);
  const serverPledges = ps && ps.mk ? ps.mk.map((m, k) => ((ps.pg || [])[k] || [])[seat] || 0) : [];
  useEffect(() => {
    if (!ipAcked || !pl) return;
    const differs = serverPledges.some((v, k) => v !== pl[k]);
    setPl(null);
    if (differs) {
      setAdjusted(serverPledges.reduce((a, b) => a + b, 0));
      sendIntent("ip", { e: ps.e, a: ps.mk.map((m, k) => [m[0], serverPledges[k]]) }); // keep our presence in step with the host
    }
  }, [ipAcked, JSON.stringify(serverPledges)]);
  if (!ps) {
    return <div class="table-wait"><Icon name="wifi" size={32} /><p>{status === "unavailable" ? "Live sync isn't available on this device. Your mandate, notes and rules still work." : "Waiting for the host screen. Make sure the code matches the big screen."}</p></div>;
  }
  const era = content.eras[ps.e] || {};
  const me = ps.pl && ps.pl[seat];
  if (!me) return <p class="notice">Seat {seat + 1} isn't in this game. Check your seat number.</p>;
  const timer = ps.tk && ps.tr != null ? <PhoneTimer ps={ps} /> : null;
  const it = ph.intents;
  const isLead = ps.ld === seat;
  let body;
  switch (ps.ph) {
    case "driver": {
      const d = L.drivers[ps.dr];
      if (!d) { body = <p>Driver revealed on the big screen.</p>; break; }
      const myVote = ps.dv ? ps.dv[seat] : -1;
      body = (
        <>
          <p class="phase-kicker">Era Driver</p>
          <h2 class="phone-h">{d.title}</h2>
          <p class="phone-p">{d.dilemma.prompt}</p>
          {ps.dc >= 0 ? <p class="notice"><Icon name="check" size={18} /> Decided: <strong>{d.dilemma.options[ps.dc].label}</strong></p> : (
            <div class="phone-options" role="radiogroup" aria-label="Your vote">
              {d.dilemma.options.map((o, k) => (
                <button type="button" key={k} role="radio" aria-checked={myVote === k ? "true" : "false"} class={cx("phone-option", myVote === k && "is-on")}
                  onClick={() => sendIntent("iv", { d: d.id, o: k })}>
                  <span class="option-letter">{String.fromCharCode(65 + k)}</span>
                  <span><strong>{o.label}</strong><span class="phone-option-text">{o.text}</span><Effects content={content} list={o.effects} short /></span>
                </button>
              ))}
            </div>
          )}
          {ps.dc < 0 ? <Sent t={it.iv && it.iv.d === d.id ? it.iv.t : 0} ps={ps} seat={seat} /> : null}
        </>
      );
      break;
    }
    case "signals": {
      const hand = (ps.hs && ps.hs[seat]) || [];
      const mine = ps.tn === seat;
      body = (
        <>
          <p class="phase-kicker">Signals</p>
          <h2 class="phone-h">{ps.tn < 0 ? "All signals played" : mine ? "Your turn: play a signal" : `${(ps.pl[ps.tn] || [])[0]} is playing`}</h2>
          {mine && ps.tp !== "choose" ? <p class="phone-p">Explain how your signal plays out; the facilitator resolves it on the big screen.</p> : null}
          <div class="phone-hand">
            {hand.map((id) => (
              <div key={id} class="phone-card-wrap">
                <SignalCard content={content} signal={L.signals[id]} compact headingLevel={3} />
                {mine && ps.tp === "choose" ? <Btn kind="primary" icon="play" onClick={() => sendIntent("ic", { c: id })}>Play this signal</Btn> : null}
              </div>
            ))}
          </div>
          {mine ? <Sent t={it.ic ? it.ic.t : 0} ps={ps} seat={seat} /> : null}
        </>
      );
      break;
    }
    case "council": {
      const market = ps.mk || [];
      const cap = (ps.cp || [])[seat] || 0;
      const serverMine = market.map((m, k) => ((ps.pg || [])[k] || [])[seat] || 0);
      const mine = pl || serverMine;
      const used = mine.reduce((a, b) => a + b, 0);
      const send = (next) => { setPl(next); sendIntent("ip", { e: ps.e, a: market.map((m, k) => [m[0], next[k]]) }); };
      body = (
        <>
          <p class="phase-kicker">Leadership Council</p>
          <h2 class="phone-h">Pledge your capacity</h2>
          <p class="phone-p">You have <strong>{cap - used}</strong> of {cap} left. {ps.lk ? "The Council is locked." : "Pool with others to fully fund a strategy."}</p>
          <ul class="phone-market">
            {market.map(([id, cost], k) => {
              const s = L.strategies[id];
              const tot = ((ps.pg || [])[k] || []).reduce((a, b) => a + b, 0) - serverMine[k] + mine[k];
              return (
                <li key={id} class="phone-strat">
                  <div class="ps-info">
                    <strong class="ps-title">{s ? s.title : id}</strong>
                    <span class="muted">{tot} of {cost} pledged</span>
                    {s ? <Effects content={content} list={s.effects} short /> : null}
                  </div>
                  {/* the stepper gets its own row so a long title can never squeeze or hide "+" (QA N2) */}
                  <div class="ps-pledge">
                    <span class="ps-pledge-k">Your pledge</span>
                    <Stepper value={mine[k]} min={0} max={Math.min(mine[k] + (cap - used), mine[k] + Math.max(0, cost - tot))} disabled={!!ps.lk} label={`your pledge to ${s ? s.title : id}`}
                      onChange={(v) => send(mine.map((x, j) => (j === k ? v : x)))} />
                  </div>
                </li>
              );
            })}
          </ul>
          {adjusted != null ? <p class="notice notice--warn" role="status"><Icon name="info" size={18} /> The host adjusted your pledges to what was still available ({adjusted} in total).</p> : null}
          <Sent t={it.ip && it.ip.e === ps.e ? it.ip.t : 0} ps={ps} seat={seat} />
        </>
      );
      break;
    }
    case "headline": {
      const wc = wordCount(draft);
      const submitted = ps.hl && ps.hl[seat];
      body = isLead ? (
        <><p class="phase-kicker">Headline of the Era</p><h2 class="phone-h">You're the Lead</h2><p class="phone-p">Read the headlines on the big screen and pick the one that best captures this era.</p></>
      ) : ps.hp >= 0 ? (
        <><p class="phase-kicker">Headline of the Era</p>{ps.hx ? <p class="phone-front">{ps.hx}</p> : <h2 class="phone-h">A headline was picked</h2>}<p class="phone-p">By {(ps.pl[ps.hp] || [])[0]}. Next: the table writes “So what for us now?”</p></>
      ) : (
        <>
          <p class="phase-kicker">Headline of the Era</p>
          <h2 class="phone-h">Write a headline</h2>
          <p class="phone-p">10 words or fewer. Tie together this era's driver, signals and strategies.</p>
          <label class="field-label" for="ph-hl">Your headline</label>
          <textarea id="ph-hl" class="input phone-headline" rows={3} maxLength={120} value={draft} onInput={(e) => setDraft(e.currentTarget.value)} aria-describedby="ph-hl-c" />
          <p id="ph-hl-c" class={cx("wc", wc > 10 && "is-over")}>{wc}/10 words</p>
          <Btn kind="primary" icon="newspaper" disabled={!draft.trim() || wc > 10} onClick={() => { sendIntent("ih", { e: ps.e, x: draft.trim() }); toast("Headline sent."); }}>{submitted ? "Send again" : "Send headline"}</Btn>
          <Sent t={it.ih && it.ih.e === ps.e ? it.ih.t : 0} ps={ps} seat={seat} />
        </>
      );
      break;
    }
    case "over":
      body = <><p class="phase-kicker">Game over</p><h2 class="phone-h">Outcome: {ps.oc}</h2><p class="phone-p">Your mandate is revealed on the big screen. Check the Mandate tab for your score.</p></>;
      break;
    default:
      body = <><p class="phase-kicker">{era.name} era</p><h2 class="phone-h">{ps.ph === "era-open" ? "A new era opens" : "System response"}</h2><p class="phone-p">Watch the big screen.</p></>;
  }
  const cond = condFromPs(content, ps);
  return (
    <div class="table-tab">
      <div class="phone-era"><span>{era.name} era, {era.years}</span>{isLead ? <span class="lead-tag"><Icon name="compass" size={14} />You lead</span> : null}{timer}</div>
      {body}
      {cond ? (
        <details class="phone-cond">
          <summary>Forest conditions now</summary>
          <ul>
            {content.domains.map((d) => <li key={d.id}><DomainDot domain={d} size={16} /> <span>{d.name}</span> <strong>{cond[d.id]}</strong> <span class="muted">{bandOf(content, cond[d.id]).label}</span></li>)}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function PhoneTimer({ ps }) {
  const ph = useStore(phone);
  useTicker(!!ps.tg, 500);
  const rem = ps.tg ? ps.tr - (Date.now() - ph.psAt) : ps.tr;
  return <span class="phone-timer" role="timer"><Icon name="clock" size={16} />{fmtClock(rem)}</span>;
}

function NotesTab({ session }) {
  const key = `ff.phone.notes.${session.code}`;
  const saved = ls.get(key, { notes: "", headline: "" });
  const [notes, setNotes] = useState(saved.notes || "");
  const [hl, setHl] = useState(saved.headline || "");
  useEffect(() => { const t = setTimeout(() => ls.set(key, { notes, headline: hl }), 300); return () => clearTimeout(t); }, [notes, hl]);
  const wc = wordCount(hl);
  return (
    <div class="notes-tab">
      <label class="field-label" for="n-hl">Headline notepad</label>
      <textarea id="n-hl" class="input phone-headline" rows={2} value={hl} onInput={(e) => setHl(e.currentTarget.value)} aria-describedby="n-hl-c" placeholder="Draft your Headline of the Era" />
      <p id="n-hl-c" class={cx("wc", wc > 10 && "is-over")}>{wc}/10 words</p>
      <label class="field-label" for="n-notes">Notes</label>
      <textarea id="n-notes" class="input" rows={10} value={notes} onInput={(e) => setNotes(e.currentTarget.value)} placeholder="Signals to remember, deals to make, what this means for Monday…" />
      <p class="muted">Saved on this phone only.</p>
    </div>
  );
}
