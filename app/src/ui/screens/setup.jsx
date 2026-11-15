import { useState } from "preact/hooks";
import { app, host, useStore, startGame, loadSaved, resumeSaved, endGame } from "../store.js";
import { Tree } from "../tree.jsx";
import { Icon } from "../icons.jsx";
import { Btn } from "../common.jsx";
import { makeCode, fingerprint, active, rulesOf, bandOf, capacityBaseFor, capacityModifier } from "../../engine/index.js";
import { cx, randomEntropy, setHash } from "../util.js";
import { startHostSync } from "../sync.js";

const SECTOR_ORDER = ["state", "federal", "tribal", "local", "ngo", "private", "science"];
const NAMES = ["Ana", "Ben", "Chen", "Dee", "Eli", "Fay", "Gus"];

function balancedRoles(roles, n) {
  const bySector = {};
  for (const r of roles) (bySector[r.sector || "other"] = bySector[r.sector || "other"] || []).push(r);
  const out = [];
  let round = 0;
  while (out.length < n && round < 10) {
    for (const s of [...SECTOR_ORDER, ...Object.keys(bySector).filter((k) => !SECTOR_ORDER.includes(k))]) {
      const list = bySector[s] || [];
      if (list[round] && out.length < n) out.push(list[round].id);
    }
    round++;
  }
  return out;
}

/** Designer-recommended role set for this table size (content.roleSets), else a sector-balanced mix. */
function recommendedRoles(content, roles, n) {
  const ids = content.roleSets && content.roleSets[String(n)];
  const ok = Array.isArray(ids) && ids.length >= n && ids.every((id) => roles.some((r) => r.id === id));
  return ok ? ids.slice(0, n) : balancedRoles(roles, n);
}

// Scenario guidance: content tags "intro" / "realistic" (or this edition's known ids).
const KNOWN_BADGES = { "scn-restoration-economy": "intro", "scn-todays-trajectory": "realistic" };
export function scenarioBadge(s) {
  const tags = s.tags || [];
  if (tags.includes("intro")) return "intro";
  if (tags.includes("realistic")) return "realistic";
  return KNOWN_BADGES[s.id] || null;
}
const BADGE_TEXT = { intro: "Recommended for a first game", realistic: "The realistic one" };

function shuffle(a) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}

export function Setup() {
  const { content, theme, caps, contentSource } = useStore(app);
  const roles = active(content.roles);
  const rank = (x) => ({ intro: 0, realistic: 1 }[scenarioBadge(x)] ?? 2);
  const scenarios = active(content.scenarios).map((x, i) => [x, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map((x) => x[0]);
  const [scenarioId, setScenario] = useState(() => ((scenarios.find((x) => scenarioBadge(x) === "intro") || scenarios[0]) || {}).id);
  const [count, setCount] = useState(Math.min(5, roles.length));
  const [players, setPlayers] = useState(() => {
    const ids = recommendedRoles(content, roles, Math.min(5, roles.length));
    const rest = balancedRoles(roles, 7).filter((id) => !ids.includes(id));
    return NAMES.map((nm, i) => ({ name: "", roleId: ids[i] || rest[i - ids.length] || "" }));
  });
  const [length, setLength] = useState("standard");
  const [autoLock, setAutoLock] = useState(false);
  const [code, setCode] = useState(() => makeCode(randomEntropy()));
  const [tried, setTried] = useState(false);
  const saved = loadSaved();
  const rules = rulesOf(content);

  const seats = players.slice(0, count);
  const roleCounts = {};
  seats.forEach((p) => { if (p.roleId) roleCounts[p.roleId] = (roleCounts[p.roleId] || 0) + 1; });
  const problems = [];
  seats.forEach((p, i) => {
    if (!p.roleId) problems.push({ i, field: "role", msg: `Seat ${i + 1} needs a role.` });
    else if (roleCounts[p.roleId] > 1) problems.push({ i, field: "role", msg: `Seat ${i + 1}: each role can be played once.` });
  });
  if (!scenarioId) problems.push({ msg: "Choose a scenario." });
  const maxPlayers = Math.min(7, roles.length);

  const setP = (i, patch) => setPlayers((ps) => ps.map((p, k) => (k === i ? { ...p, ...patch } : p)));

  const start = () => {
    setTried(true);
    if (problems.length) {
      const first = document.querySelector(".setup [aria-invalid='true']");
      if (first) first.focus();
      return;
    }
    startGame(content, { code, scenarioId, length, autoLock, players: seats.map((p, i) => ({ name: p.name.trim() || NAMES[i], roleId: p.roleId })) });
    if (caps.room) startHostSync(code);
  };

  const scn = scenarios.find((s) => s.id === scenarioId);
  return (
    <main class="setup" id="main">
      <header class="page-head">
        <a href="#" class="back-link"><Icon name="back" size={20} /> Home</a>
        <h1>Set up a game</h1>
        <p class="page-sub">Edition {fingerprint(content)}</p>
      </header>

      {contentSource === "local" ? (
        <p class="notice notice--warn setup-local"><Icon name="alert" size={20} /> <span><strong>This device uses local edits to the cards</strong> (edition {fingerprint(content)}). Phones use the published edition, so their secret mandates won't match unless they import the same file. <a href="#library">Review or reset the edits</a>.</span></p>
      ) : null}
      {saved && saved.state && saved.state.phase === "over" ? (
        <div class="resume resume--inline">
          <p><strong>The last game's debrief is saved</strong> (code {saved.state.code}) until you start this game.</p>
          <div class="resume-actions">
            <Btn onClick={() => { host.set({ skipResume: false }); resumeSaved(content); }}>View the debrief</Btn>
          </div>
        </div>
      ) : null}
      {saved && saved.state && saved.state.phase !== "over" ? (
        <div class="resume resume--inline">
          <p><strong>A game is already in progress</strong> (code {saved.state.code}). Starting a new one replaces it.</p>
          <div class="resume-actions">
            <Btn kind="primary" onClick={() => { resumeSaved(content); if (caps.room) startHostSync(saved.state.code); }}>Resume that game</Btn>
            <Btn kind="quiet" onClick={() => { endGame(); app.set({}); }}>Discard it</Btn>
          </div>
        </div>
      ) : null}

      <section class="setup-section" aria-labelledby="s-scn">
        <h2 id="s-scn" class="section-title"><span class="step-no">1</span> Scenario</h2>
        <div class="scenario-grid" role="radiogroup" aria-labelledby="s-scn">
          {scenarios.map((s) => (
            <button type="button" key={s.id} role="radio" aria-checked={s.id === scenarioId ? "true" : "false"}
              class={cx("scenario-card", s.id === scenarioId && "is-selected")} onClick={() => setScenario(s.id)}>
              <div class="scenario-art"><Tree content={content} cond={s.start} theme={theme} compact idPrefix={"scn-" + s.id} floats={false} title={`Starting conditions for ${s.name}`} /></div>
              <div class="scenario-copy">
                {scenarioBadge(s) ? <span class={cx("scn-badge", `scn-badge--${scenarioBadge(s)}`)}>{BADGE_TEXT[scenarioBadge(s)]}</span> : null}
                <h3>{s.name}</h3>
                <p>{s.summary}</p>
                <p class="scenario-start">
                  {content.domains.map((d) => <span key={d.id} class="mini-cond" title={`${d.name}: ${s.start[d.id]} ${bandOf(content, s.start[d.id]).label}`}>{d.short || d.name} <strong>{s.start[d.id]}</strong></span>)}
                </p>
              </div>
              {s.id === scenarioId ? <span class="check-mark"><Icon name="check" size={22} /></span> : null}
            </button>
          ))}
        </div>
      </section>

      <section class="setup-section" aria-labelledby="s-pl">
        <div class="section-row">
          <h2 id="s-pl" class="section-title"><span class="step-no">2</span> Players and roles</h2>
          <div class="seg" role="group" aria-label="Number of players">
            {Array.from({ length: maxPlayers - 2 }, (_, k) => k + 3).map((n) => (
              <button type="button" key={n} class={cx("seg-btn", n === count && "is-on")} aria-pressed={n === count ? "true" : "false"}
              onClick={() => {
                setCount(n);
                // keep chosen roles valid; adopt the recommended set for the new size if the table still uses the previous one
                const prevRec = recommendedRoles(content, roles, count);
                if (players.slice(0, count).every((p, i) => p.roleId === prevRec[i])) {
                  const ids = recommendedRoles(content, roles, n);
                  setPlayers((ps) => ps.map((p, i) => ({ ...p, roleId: i < n ? ids[i] || p.roleId : p.roleId })));
                }
              }}>{n}</button>
            ))}
          </div>
        </div>
        <p class="section-hint">4–6 players is the sweet spot. Roles are public; each player's mandate stays secret on their phone. Blank names use the grey placeholder.</p>
        <div class="role-tools">
          <Btn icon="users" onClick={() => { const ids = recommendedRoles(content, roles, count); setPlayers((ps) => ps.map((p, i) => ({ ...p, roleId: i < count ? ids[i] || p.roleId : p.roleId }))); }}>Recommended roles for {count}</Btn>
          <Btn icon="reset" onClick={() => { const ids = shuffle(roles.map((r) => r.id)); setPlayers((ps) => ps.map((p, i) => ({ ...p, roleId: ids[i] || "" }))); }}>Deal random roles</Btn>
          {content.roleSets ? <span class="section-hint">Recommended sets are tuned by the game designer for each table size.</span> : null}
        </div>
        <ol class="seat-list">
          {seats.map((p, i) => {
            const nameErr = tried && problems.find((x) => x.i === i && x.field === "name");
            const roleErr = tried && problems.find((x) => x.i === i && x.field === "role");
            const role = roles.find((r) => r.id === p.roleId);
            return (
              <li key={i} class="seat-row">
                <span class="seat-no" aria-hidden="true">{i + 1}</span>
                <div class="field">
                  <label class="field-label" for={`pn-${i}`}>Seat {i + 1} name</label>
                  <input id={`pn-${i}`} class="input" value={p.name} placeholder={NAMES[i]} maxLength={40} aria-invalid={nameErr ? "true" : "false"}
                    onInput={(e) => setP(i, { name: e.currentTarget.value })} />
                </div>
                <div class="field">
                  <label class="field-label" for={`pr-${i}`}>Role</label>
                  <select id={`pr-${i}`} class="input" value={p.roleId} aria-invalid={roleErr ? "true" : "false"} onChange={(e) => setP(i, { roleId: e.currentTarget.value })}>
                    <option value="">Choose a role…</option>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.title} ({r.sector})</option>)}
                  </select>
                </div>
                <p class="seat-ability">{role && role.ability ? <><Icon name="bolt" size={16} /> {role.ability.name}</> : null}</p>
                {(nameErr || roleErr) ? <p class="field-error seat-err" role="alert">{(nameErr || roleErr).msg}</p> : null}
              </li>
            );
          })}
        </ol>
      </section>

      <section class="setup-section setup-split" aria-labelledby="s-len">
        <div>
          <h2 id="s-len" class="section-title"><span class="step-no">3</span> Length</h2>
          <div class="length-opts" role="radiogroup" aria-labelledby="s-len">
            {[["standard", "Standard", "About 75 minutes. One signal round per era."], ["deep", "Deep", "About 110 minutes. Two signal rounds per era."]].map(([id, name, d]) => (
              <button type="button" key={id} role="radio" aria-checked={length === id ? "true" : "false"} class={cx("length-opt", length === id && "is-selected")} onClick={() => setLength(id)}>
                <strong>{name}</strong><span>{d}</span>
              </button>
            ))}
          </div>
          <label class="check check--block">
            <input type="checkbox" checked={autoLock} onChange={(e) => setAutoLock(e.currentTarget.checked)} />
            <span>Lock the Council automatically when its timer runs out</span>
          </label>
          <p class="section-hint">Council timer {Math.round(rules.councilSeconds / 60)} min, headline timer {Math.round(rules.headlineSeconds / 60)} min.</p>
          {(() => {
            if (!scn) return null;
            const base = capacityBaseFor(content, count);
            const cap = Math.max(rules.capacityMin ?? 1, base + capacityModifier(content, scn.start.workforce ?? 5) + capacityModifier(content, scn.start.governance ?? 5));
            return <p class={cx("section-hint", cap <= 1 && "warn-text")}>With {count} players in {scn.name}, each leader starts with about {cap} Capacity per Council (base {base}, adjusted by Workforce and Policy).{cap <= 1 ? " Capacity is very tight at this table size: strategies only happen if almost everyone pools." : ""}</p>;
          })()}
        </div>
        <div>
          <h2 class="section-title"><span class="step-no">4</span> Game code</h2>
          <div class="code-box">
            <span class="code-big" aria-label={`Game code ${code.split("").join(" ")}`}>{code}</span>
            <Btn icon="reset" onClick={() => setCode(makeCode(randomEntropy()))}>New code</Btn>
          </div>
          <p class={cx("sync-note", caps.room ? "is-live" : "is-off")}>
            <Icon name={caps.room ? "wifi" : "wifi-off"} size={20} />
            {caps.room
              ? "Live sync is available: phones that join with this code vote, pledge and send headlines straight to this screen."
              : caps.checked ? "Phones work offline here: players see their mandate, notes and quick rules. You tap in votes and pledges on this screen." : "Checking for live sync…"}
          </p>
        </div>
      </section>

      <div class="setup-go">
        {tried && problems.length ? <p class="field-error" role="alert">{problems.length === 1 ? problems[0].msg : `${problems.length} things to fix before starting.`}</p> : null}
        <Btn kind="primary" size="lg" icon="play" onClick={start}>Start the game</Btn>
        <p class="section-hint">{scn ? `${scn.name}, ${count} players, ${length === "deep" ? "Deep" : "Standard"}.` : ""}</p>
      </div>
    </main>
  );
}

export function goHome() { setHash(""); }
