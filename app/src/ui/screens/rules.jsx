import { app, useStore } from "../store.js";
import { Icon } from "../icons.jsx";
import { ThemeToggle } from "../common.jsx";
import { rulesOf, bandsOf, outcomeRules, capacityBaseFor } from "../../engine/index.js";

const fmtMod = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");
function capacityText(content) {
  const r = rulesOf(content);
  const by = r.capacityBaseByPlayers;
  const base = by ? `${Object.entries(by).map(([n, v]) => `${v} with ${n} players`).join(", ")}` : `${r.capacityBase}`;
  const mods = bandsOf(content).map((b) => `${b.label} ${fmtMod(r.capacityModifiers[b.label] ?? 0)}`).join(", ");
  return { base, mods, min: r.capacityMin ?? 1 };
}
function outcomeText(content, length) {
  const R = outcomeRules(content, length);
  const bands = bandsOf(content);
  const floor = (f) => (f === bands[0].max + 1 ? "nothing in Crisis" : f > 0 ? `every domain at ${f}+` : "");
  return { R, res: floor(R.resilientFloor), hold: floor(R.holdingFloor) };
}
import { DomainDot } from "../cards.jsx";

export function QuickRules({ content }) {
  const r = rulesOf(content);
  return (
    <div class="quick">
      <h2 class="sub-h">Each era, in order</h2>
      <ol class="quick-steps">
        <li><strong>Era opens.</strong> Long-term strategy effects from last era land.</li>
        <li><strong>Driver and dilemma.</strong> A structural shift hits. Everyone votes on the response; majority wins, the Lead breaks ties.</li>
        <li><strong>Signals.</strong> Lead first, each leader plays one of {r.handSize} open cards: primary effect, then the secondary. For a choice secondary, say aloud how the signal reaches the domain you pick.</li>
        <li><strong>Leadership Council.</strong> Each leader's Capacity = base ({capacityText(content).base}) + Workforce modifier + Policy modifier ({capacityText(content).mods}; minimum {capacityText(content).min}). Pool it. Only fully funded strategies happen; {r.marketRefresh === "keep" ? "unfunded strategies stay in the market." : "the market is dealt fresh each era."}</li>
        <li><strong>Headline of the Era.</strong> All but the Lead write ≤ 10 words; the Lead picks; its author adds +{r.headlineInfluence}. Then the table writes “So what for us now?”</li>
        <li><strong>System response.</strong> Interdependencies fire{r.cascadeMode === "sequential" ? " in order" : ", all checked against the tree before any apply"}, then the era's ring is laid down. {r.collapseCrisisCount}+ domains in Crisis ends the game.</li>
      </ol>
      <h2 class="sub-h">Winning</h2>
      <p>After the Far era the forest's Resilience Index is the mean of all domains. <strong>Resilient</strong>: index ≥ {(+outcomeText(content).R.resilient).toFixed(1)}{outcomeText(content).res ? ` and ${outcomeText(content).res}` : ""} (a collective win{rulesOf(content).outcomeDeep && rulesOf(content).outcomeDeep.resilientFloor != null ? `; Deep games need every domain at ${rulesOf(content).outcomeDeep.resilientFloor}+` : ""}). <strong>Holding</strong>: index ≥ {(+outcomeText(content).R.holding).toFixed(1)}{outcomeText(content).hold ? ` and ${outcomeText(content).hold}` : ""}. Otherwise <strong>Unraveling</strong>, and nobody wins. You win individually if all four conditions of your secret mandate are met and the forest didn't unravel.{r.farDelayed !== "final" ? " Next-era effects bought in the final era are legacy investments: they appear in the debrief but don't change the score." : ""}</p>
      <h2 class="sub-h">Bands</h2>
      <ul class="band-list">{bandsOf(content).map((b) => <li key={b.label}><span class={`band-chip band--${b.label.toLowerCase()}`}>{b.min}–{b.max}</span> {b.label}</li>)}</ul>
      <h2 class="sub-h">Secondary effects</h2>
      <ul class="quick-list">
        <li><strong>+ Add / − Remove:</strong> change a domain you choose (not the primary's).</li>
        <li><strong>⇄ Move:</strong> shift points from one domain to another.</li>
        <li><strong>◈ Protect:</strong> that domain ignores signal effects until the era ends. Drivers and the system response still apply.</li>
      </ul>
    </div>
  );
}

export function Rules() {
  const { content } = useStore(app);
  const r = rulesOf(content);
  return (
    <main class="doc" id="main">
      <header class="page-head">
        <a href="#" class="back-link"><Icon name="back" size={20} /> Home</a>
        <h1>How to play</h1>
        <ThemeToggle />
      </header>
      <div class="doc-grid">
        <article class="doc-main">
          <section>
            <h2 class="section-title">The idea</h2>
            <p class="lede">You are leaders and partners — a State Forester, a Tribal natural resources director, a forest supervisor, a county commissioner and more — steering ten interlocking forest systems from today to 2050. Weak signals from the real world push the systems up or down. Era Drivers force table decisions. Capacity is scarce and depends on the very systems you are trying to protect. Everyone has a secret agenda, but if the forest unravels, nobody wins.</p>
          </section>
          <section>
            <h2 class="section-title">Setting up</h2>
            <ol class="doc-steps">
              <li>The facilitator opens <strong>Host a game</strong> on the shared screen, picks a scenario, enters 3–7 players and their roles, and chooses Standard (about 75 minutes) or Deep (about 110 minutes).</li>
              <li>The host shows a six-character <strong>game code</strong>. Each player opens this page on their phone, chooses <strong>Join</strong>, and enters the code, their seat number and role. The phone reveals a secret <strong>mandate</strong>: three targets and one guardrail.</li>
              <li>No phones? Use <strong>Game menu → Reveal a mandate privately</strong> and pass the laptop around.</li>
            </ol>
          </section>
          <section>
            <h2 class="section-title">Domains and the tree</h2>
            <p>The board is a tree cross-section. Each wedge is a domain; its fill from pith to bark is the domain's Condition from 0 to 10. Every completed era is laid down as a fine growth ring. A wedge in Crisis shows a fire scar.</p>
            <ul class="domain-legend">
              {content.domains.map((d) => <li key={d.id}><DomainDot domain={d} size={20} /><span><strong>{d.name}</strong> {d.description}</span></li>)}
            </ul>
          </section>
          <section>
            <h2 class="section-title">Playing an era</h2>
            <QuickRules content={content} />
          </section>
          <section>
            <h2 class="section-title">Role abilities</h2>
            <p>Every role has one ability, usable once per game at a moment the facilitator confirms. Use the lightning button on a player's seat. Abilities can boost or protect a domain, add Council capacity, discount or swap strategies, cancel a drop as it happens, decide a dilemma outright, redraw a hand, or move points between domains.</p>
          </section>
          <section>
            <h2 class="section-title">Facilitator guide</h2>
            <ul class="doc-tips">
              <li><strong>Make people explain.</strong> The value is in the cross-impact reasoning: “how does insurers leaving the WUI touch Water?” Type the gist into the reasoning box; it appears in the debrief.</li>
              <li><strong>Keep the clock.</strong> Use the Council timer ({Math.round(r.councilSeconds / 60)} min) and headline timer ({Math.round(r.headlineSeconds / 60)} min). Lock even if people are mid-deal; scarcity is the point.</li>
              <li><strong>Watch the Crisis count.</strong> The tree footer shows how many domains are in Crisis. Name it out loud before the Council.</li>
              <li><strong>Undo is safe.</strong> Every step can be undone (Ctrl+Z or the undo button). The game autosaves on this device; a refresh resumes where you were.</li>
              <li><strong>Headlines are newspaper front pages.</strong> Read the candidates aloud in your best broadcast voice before the Lead picks.</li>
              <li><strong>So what for us now?</strong> Push for one line about today's decisions, not the fiction. These lines are the most valuable output.</li>
              <li><strong>Debrief for 15 minutes.</strong> Reveal mandates, walk the story timeline, and leave with Signals to watch and Monday actions. Copy the debrief as Markdown for your notes.</li>
              <li><strong>Read the board.</strong> A wedge's number and band word are its condition; a dashed outline and the word <em>Protected</em> mark a domain that ignores signal effects until the era ends; a fire scar marks Crisis. On a seat, a highlighted ability button marked <em>ready</em> can be used now; the two-letter check code should match the code on that player's phone.</li>
              <li><strong>Text size.</strong> Game menu → Text size makes everything on the big screen larger or smaller for your room; the setting is remembered on this device.</li>
              <li><strong>Accessibility.</strong> Toggle Table view for a data table of every condition. All controls work from the keyboard; changes are announced to screen readers.</li>
            </ul>
          </section>
        </article>
        <aside class="doc-aside">
          <div class="ref-card">
            <h2 class="sub-h">Quick reference</h2>
            <dl class="ref">
              <dt>Players</dt><dd>3–7 (best 4–6) + facilitator</dd>
              <dt>Eras</dt><dd>{content.eras.map((e) => `${e.name} ${e.years}`).join("; ")}</dd>
              <dt>Hand</dt><dd>{r.handSize} open signal cards</dd>
              <dt>Draw weights</dt><dd>{content.eras.map((e) => `${e.name}: ${Object.values(e.weights || {}).map((w) => Math.round(w * 100)).join("/")}`).join("; ")}</dd>
              <dt>Capacity</dt><dd>{r.capacityBaseByPlayers ? `${capacityBaseFor(content, 5)} at 5 players` : r.capacityBase} + modifiers, min {r.capacityMin ?? 1}</dd>
              <dt>Market</dt><dd>{r.marketSize} strategies, cost 2–8</dd>
              <dt>Headline</dt><dd>≤ 10 words, author +{r.headlineInfluence}</dd>
              <dt>Collapse</dt><dd>{r.collapseCrisisCount}+ domains in Crisis after the system response</dd>
              <dt>Resilient</dt><dd>index ≥ {(+outcomeText(content).R.resilient).toFixed(1)}{outcomeText(content).res ? `, ${outcomeText(content).res}` : ""}</dd>
              <dt>Holding</dt><dd>index ≥ {(+outcomeText(content).R.holding).toFixed(1)}{outcomeText(content).hold ? `, ${outcomeText(content).hold}` : ""}</dd>
            </dl>
          </div>
        </aside>
      </div>
    </main>
  );
}
