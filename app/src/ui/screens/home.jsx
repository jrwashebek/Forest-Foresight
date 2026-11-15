import { app, host, useStore, loadSaved, resumeSaved, endGame } from "../store.js";
import { Tree } from "../tree.jsx";
import { Icon } from "../icons.jsx";
import { ThemeToggle } from "../common.jsx";
import { fingerprint, lookups } from "../../engine/index.js";
import { setHash, store as ls } from "../util.js";
import { useMemo, useState } from "preact/hooks";
import { tierName } from "../export.js";

function phoneSession() {
  try { const v = window.sessionStorage.getItem("ff.phone.v1"); if (v) return JSON.parse(v); } catch { /* */ }
  return ls.get("ff.phone.v1", null);
}

/** A decorative finished tree: the scenario's start plus three plausible eras of growth. */
function demoTree(content, scn) {
  const ids = content.domains.map((d) => d.id);
  const step = (n) => Object.fromEntries(ids.map((id, j) => [id, Math.max(1, Math.min(10, Math.round((scn.start[id] ?? 5) + Math.sin(j * 1.9 + n * 1.3) * 1.6 + n * 0.7)))]));
  const rings = content.eras.slice(0, 3).map((e, n) => ({ era: e.id, cond: step(n) }));
  return { rings: rings.slice(0, -1), cond: step(rings.length) };
}

export function Home() {
  const { content, theme } = useStore(app);
  const saved = loadSaved();
  const L = lookups(content);
  const scn = content.scenarios.find((s) => s.status !== "retired") || content.scenarios[0];
  const demo = useMemo(() => demoTree(content, scn), [content, scn]);
  const resumeOk = saved && saved.state && saved.state.phase !== "over";
  const finished = saved && saved.state && saved.state.phase === "over";
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const ps = phoneSession();
  const psRole = ps ? L.roles[ps.roleId] : null;
  const savedScn = saved && saved.state ? L.scenarios[saved.state.scenarioId] : null;
  const savedEra = saved && saved.state ? (content.eras[saved.state.era] || {}).name : "";
  const counts = {
    signals: content.signals.filter((s) => s.status !== "retired").length,
    drivers: content.drivers.filter((s) => s.status !== "retired").length,
    roles: content.roles.filter((s) => s.status !== "retired").length,
  };
  return (
    <main class="home" id="main">
      <div class="home-bar">
        <span class="edition">Edition {fingerprint(content)}</span>
        <ThemeToggle />
      </div>
      <section class="home-hero">
        <div class="home-copy">
          <h1 class="home-title">{content.meta.title || "Forest Futures"}</h1>
          <p class="home-sub">{content.meta.subtitle}</p>
          <p class="home-lede">
            Leaders and partners steer ten interlocking forest systems through three eras, from {content.eras[0]?.years?.slice(0, 4) || "now"} to {content.eras[content.eras.length - 1]?.years?.slice(-4) || "2050"}.
            Read the weak signals, decide the dilemmas, pool scarce capacity, and find out whether the forest holds.
          </p>
          {resumeOk ? (
            <div class="resume">
              <div>
                <p class="resume-title">Game in progress</p>
                <p class="resume-meta">Code {saved.state.code}, {savedScn ? savedScn.name : "scenario"}, {savedEra} era, {saved.state.players.length} players</p>
              </div>
              {!confirmDiscard ? (
                <div class="resume-actions">
                  <button type="button" class="btn btn--primary" onClick={() => { host.set({ skipResume: false }); resumeSaved(content); setHash("host"); }}>Resume game</button>
                  <button type="button" class="btn btn--quiet" onClick={() => setConfirmDiscard(true)}>Discard…</button>
                </div>
              ) : (
                <div class="resume-actions resume-confirm" role="group" aria-label="Confirm discard">
                  <span>Discard this game for good?</span>
                  <button type="button" class="btn btn--danger" onClick={() => { endGame(); setConfirmDiscard(false); app.set({}); }}>Discard it</button>
                  <button type="button" class="btn btn--quiet" onClick={() => setConfirmDiscard(false)} data-autofocus>Keep it</button>
                </div>
              )}
            </div>
          ) : null}
          {finished ? (
            <div class="resume resume--done">
              <div>
                <p class="resume-title">Last game: {tierName(saved.state.outcome ? saved.state.outcome.tier : "")}</p>
                <p class="resume-meta">Code {saved.state.code}, {savedScn ? savedScn.name : "scenario"}, {saved.state.players.length} players. The debrief is kept until the next game starts.</p>
              </div>
              <div class="resume-actions">
                <button type="button" class="btn btn--secondary" onClick={() => { host.set({ skipResume: false }); resumeSaved(content); setHash("host"); }}>View debrief</button>
              </div>
            </div>
          ) : null}
          {ps && psRole ? (
            <a class="resume resume--phone" href="#play">
              <span><strong>Back to your seat</strong><span class="resume-meta">Seat {ps.seat + 1}, {psRole.title}, game {ps.code}</span></span>
              <Icon name="next" size={22} />
            </a>
          ) : null}
          <nav class="home-nav" aria-label="Main">
            <a class="home-link home-link--primary home-link--host" href="#host" onClick={() => { if (finished) host.set({ skipResume: true }); }}>
              <Icon name="tree" size={30} />
              <span><strong>Host a game</strong><span>Run the big screen for 3–7 players</span></span>
            </a>
            <a class="home-link home-link--join" href="#join">
              <Icon name="phone" size={30} />
              <span><strong>Join on your phone</strong><span>Enter the game code, see your secret mandate</span></span>
            </a>
            <a class="home-link" href="#rules">
              <Icon name="book" size={30} />
              <span><strong>How to play</strong><span>Rules, quick reference, facilitator guide</span></span>
            </a>
            <a class="home-link" href="#library">
              <Icon name="notes" size={30} />
              <span><strong>Content library</strong><span>{counts.signals} signals, {counts.drivers} drivers, {counts.roles} roles — edit and publish</span></span>
            </a>
            <a class="home-link" href="#about">
              <Icon name="info" size={30} />
              <span><strong>About and sources</strong><span>Credits and every card's source</span></span>
            </a>
          </nav>
        </div>
        <div class="home-art" aria-hidden="true">
          <Tree content={content} cond={demo.cond} rings={demo.rings} theme={theme} compact idPrefix="home" floats={false} />
        </div>
      </section>
      <footer class="home-foot">
        <p>{content.meta.credits}</p>
      </footer>
    </main>
  );
}
