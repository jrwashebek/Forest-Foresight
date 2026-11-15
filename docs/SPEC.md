# FOREST FUTURES — design spec (v0.1, Nov 14 2026)

A digital strategic-foresight game for USDA Forest Service and State forestry agency leaders.
Evolved from *IMPACT: a foresight game – forestry edition* (USFS Strategic Foresight Group / UMN, 2019),
itself adapted from *IMPACT* by Idea Couture with Policy Horizons Canada. Working title "Forest Futures"
(title is an editable content field; we do NOT brand it as IMPACT without permission, but we credit it).

Client decisions (fixed):
1. **Evolve**, don't just reskin: keep weak-signal cards, player-explained cross-impacts, and Headline of an Era;
   add real leadership decisions, leader/partner roles, and shared forest-outcome stakes.
2. **Room + phones**: one big shared screen (host, run by a facilitator) + each player's phone.
3. **Candid but balanced** about the federal context (budget/workforce cuts, restructuring, wildfire governance,
   swings between administrations): include as plausible drivers across a range of futures, neutral and sourced.
4. **Built-in content editor** so a non-technical foresight lead keeps cards/domains/roles current for years.

## 1. What changed from 2019 and why

| 2019 IMPACT | Forest Futures | Why |
|---|---|---|
| Players are "future workers" | Players are **leaders & partners** (State Forester, Tribal Natural Resources Director, Forest Supervisor…) | Leaders practice decisions in their real roles |
| Cubes = unsigned "rate of change" | Each domain has a **Condition** level 0–10 (Crisis→Transformed) | Lets cards be good or bad; makes outcomes legible |
| Pure competition, first to 10/8/6 wins | **Semi-cooperative**: secret mandates + a **shared Forest Outcome gate** | Forest outcomes require coordination; if the system unravels, nobody wins |
| Endless rounds | **Three Eras: Now (2026–30), Near (2031–38), Far (2039–50)** | Maps to current / near-term / future context |
| No decisions, only card plays | **Era Driver + Dilemma** (table decision) and **Leadership Council** (pool Capacity into Strategies) | Decision practice, trade-offs, partnership |
| Capacity unlimited | **Capacity per leader depends on Workforce & Capacity and Policy & Funding** | Federal/agency capacity constrains everyone — candid systems feedback |
| Disruption cards | **Era Drivers** (structural shifts, each with a Dilemma) | Big context shifts with leadership choice |
| Domains incl. Transportation, Food/Ag, Medicine | New set incl. **Fire & Fuels, Policy & Funding, Partnerships & Co-Stewardship, Workforce & Capacity** | Reflects what dominates forestry leadership now |
| Paper headline | Headline of the Era + **"So what for us now?" insight log** → exportable debrief | Turns play into decisions people take back to work |
| Static print deck | **Content library with editor**, review dates, stale-card flags, import/export | Tool stays current for years |

## 2. Domains (10) — ids are fixed keys

Condition 0–10. Bands: 0–2 **Crisis**, 3–4 **Strained**, 5–6 **Stable**, 7–8 **Thriving**, 9–10 **Transformed**.
Condition = how well this system is positioned to sustain forests and the people who depend on them.

| id | name | covers |
|---|---|---|
| `fire` | Fire & Fuels | wildfire risk & behavior, fuels, prescribed & cultural fire, suppression, smoke |
| `health` | Forest Health | biodiversity, insects/disease, invasives, drought stress, reforestation, adaptation |
| `water` | Water & Watersheds | source water, snowpack, streams, floods, post-fire watersheds, aquatic habitat |
| `climate` | Climate & Carbon | carbon storage, carbon markets, emissions, bioenergy, climate policy |
| `wood` | Wood Economy | timber, mills, mass timber, biomass, non-timber products, trade |
| `communities` | Communities & the WUI | rural economies, WUI growth, housing, insurance, equity, community health |
| `recreation` | Recreation & Public Connection | outdoor recreation, access, visitation, wellness, public trust |
| `workforce` | Workforce & Capacity | agency & partner workforce, fire crews, contractors, skills, science/data/tech capacity |
| `governance` | Policy & Funding | budgets, authorities, legislation, litigation, agency structure, federal–state roles |
| `partners` | Partnerships & Co-Stewardship | Tribal co-stewardship, shared stewardship w/ states, Good Neighbor, NGOs, private & family forest owners |

## 3. Game flow

Players 3–7 (best 4–6) + a facilitator running the host screen. Standard ≈ 75 min (1 signal round per era),
Deep ≈ 110 min (2 signal rounds per era).

**Setup**: pick Scenario (sets starting Conditions + Driver pool), players' names & roles (chosen or random),
length. Host shows a **Game Code**. Players open the same link on phones → Join → enter code, seat, role →
phone reveals their **secret Mandate**. (Fallback: private reveal on host screen, pass-the-laptop.)

**Each Era** (Now → Near → Far). Era Lead rotates (like the old Judge).
1. **Era opens** — title card, years, the Lead. Delayed strategy effects from last era mature now.
2. **Driver** — reveal 1 Era Driver from the scenario pool for this era. Apply its effects. Then its
   **Dilemma**: 2 (or 3) response options with different effects; every player votes (phone or aloud);
   majority wins, Lead breaks ties. Apply.
3. **Signals** — each player in turn (Lead first): their 3-card hand is shown on the big screen (hands are
   open — discussion is the point). Choose 1 Signal → apply **primary** effect → resolve **secondary**:
   - fixed: apply it;
   - player-determined (add / remove / move / protect): player chooses domain(s) and must say aloud
     *how* this signal affects that domain (facilitator may type the reasoning → logged).
   Optional discard any; refill to 3 from the era-weighted draw.
   Era weighting (now/near/far): Now 70/25/5, Near 25/55/20, Far 5/35/60.
4. **Leadership Council** — Strategy Market shows 5 strategies (cost 2–8 Capacity). Each player has
   Capacity for this era = base 3 + modifier(workforce) + modifier(governance), min 1, where modifier is
   Crisis −2, Strained −1, Stable 0, Thriving/Transformed +1. Players pledge Capacity (pool across
   players = partnerships). Timer (default 5 min). On Lock: fully funded strategies apply (some effects
   delayed to next era); pledges to unfunded strategies are lost; unspent capacity is lost.
5. **Headline of the Era** — all but the Lead write a headline (≤10 words, 2-min timer) that synthesizes
   the Driver, Signals and Strategies of this era. Lead picks one; its author adds +2 influence (+2 to one
   domain or +1/+1 to two). Then the table writes one line: **"So what for us now?"** → Insight Log.
6. **System response (cascades)** — interdependency rules fire (e.g., Fire in Crisis → Water −1,
   Communities −1). Record this era's **ring** (snapshot of all 10 Conditions).
   If ≥3 domains are in Crisis after cascades → **System Collapse**: game ends, shared outcome = Unraveling.

**Protect**: protected domain ignores Signal effects (not Drivers or cascades) until end of the current era.

**End (after Far)** — Shared **Forest Outcome**: Resilience Index = mean of 10 Conditions.
- **Resilient**: index ≥ 6.0 and no domain in Crisis
- **Holding**: index ≥ 4.5
- **Unraveling**: otherwise (or System Collapse)
Mandates revealed. A Mandate = 3 targets (e.g., health ≥ 8, water ≥ 7, partners ≥ 6) + 1 guardrail
(a domain that must stay ≥ 4). **Fulfilled** = all four met. Individual winners = everyone Fulfilled,
*unless* the outcome is Unraveling (then nobody wins). Resilient also = collective win.
Show "X of 4 conditions met" for everyone. Each role has a "future job" title by outcome
(homage to 2019 "Jobs from the Future").

**Debrief** — tree cross-section with a ring per era, outcome, mandates, story timeline (drivers, dilemma
choices, signals played + player reasoning, strategies funded, headlines, insights), **Signals to watch**
(the signals that "came true", with sources), discussion prompts, Monday actions. Export: copy as text;
download Markdown/JSON if the `downloads` capability is available.

## 4. Card & content types (JSON content model)

Single content object; ships embedded in the page; editable in the Content Library.

```jsonc
{
  "meta": { "title": "Forest Futures", "subtitle": "...", "edition": "2026.11", "updated": "2026-11-14",
            "credits": "...", "notice": "..." },
  "domains": [ { "id": "fire", "name": "Fire & Fuels", "short": "Fire", "color": "#...", "icon": "fire",
                 "description": "...", "examples": "..." } ],
  "bands": [ {"min":0,"max":2,"label":"Crisis"}, ... ],
  "eras": [ { "id": "now", "name": "Now", "years": "2026–2030", "description": "...",
              "weights": { "now": 0.7, "near": 0.25, "far": 0.05 } } ],
  "signals": [ {
      "id": "sig-wildfire-service",            // kebab, stable, unique
      "title": "One flag for wildland fire",     // punchy headline, ≤ 6 words, own words
      "signal": "1–2 sentence real-world signal in our own words (≤ 40 words).",
      "horizon": "now" | "near" | "far",
      "primary":   { "domain": "fire", "delta": 2, "text": "Outcome sentence (≤ 25 words)." },
      "secondary": { "type": "fixed", "domain": "workforce", "delta": -1, "text": "..." }
               //  or { "type": "add"|"remove", "amount": 1, "text": "prompt" }
               //  or { "type": "move", "amount": 1, "text": "prompt" }
               //  or { "type": "protect", "text": "prompt" }
      "prompt": "Leadership question for discussion (optional, ≤ 20 words).",
      "source": { "title": "...", "publisher": "...", "date": "YYYY-MM-DD", "url": "https://..." },
      "tags": ["federal","fire"],                // free tags
      "status": "active" | "retired",
      "reviewed": "2026-11-14",
      "origin": "new" | "2019-updated"            // 2019-updated = a 2019 card refreshed with a new source
  } ],
  "drivers": [ {
      "id": "drv-...", "title": "...", "text": "≤ 40 words", "horizon": "now"|"near"|"far",
      "effects": [ { "domain": "governance", "delta": -2 } ],          // 2–3 effects
      "dilemma": { "prompt": "≤ 30 words",
                   "options": [ { "label": "≤ 5 words", "text": "≤ 25 words",
                                  "effects": [ { "domain": "...", "delta": 1 } ] } ] },  // 2–3 options
      "source": { ... }, "tags": [], "status": "active", "reviewed": "..."
  } ],
  "strategies": [ {
      "id": "str-...", "title": "...", "text": "≤ 30 words", "cost": 2..8,
      "effects": [ { "domain": "fire", "delta": 2 } ],
      "delayed": [ { "domain": "health", "delta": 1 } ],               // applied at next era start
      "kind": "no-regret" | "hedge" | "big-bet" | "trade-off",
      "tags": [], "status": "active", "reviewed": "..."
  } ],
  "roles": [ {
      "id": "role-state-forester", "title": "State Forester", "org": "State forestry agency",
      "sector": "federal"|"state"|"tribal"|"local"|"private"|"ngo"|"science",
      "bio": "≤ 40 words",
      "mandates": [ { "id": "A", "targets": [ {"domain":"partners","min":8}, {"domain":"fire","min":7},
                                               {"domain":"wood","min":6} ],
                      "guardrail": { "domain": "communities", "min": 4 },
                      "why": "≤ 25 words: what this agenda is about" } ],      // 2 variants per role
      "ability": { "name": "...", "text": "Once per game: ...", "effect": { ... machine-readable ... } },
      "future": { "resilient": "future job title", "holding": "...", "unraveling": "..." },
      "status": "active"
  } ],
  "cascades": [ { "id": "cas-...", "when": { "domain": "fire", "lte": 2 },
                  "effects": [ { "domain": "water", "delta": -1 } ], "text": "..." } ],
  "scenarios": [ {
      "id": "scn-...", "name": "...", "summary": "≤ 60 words", "start": { "fire": 3, ... all 10 },
      "drivers": { "now": ["drv-..."], "near": [...], "far": [...] },  // pools; host draws 1 per era
      "tags": [], "status": "active"
  } ],
  "rules": { "handSize": 3, "capacityBase": 3, "councilSeconds": 300, "headlineSeconds": 120,
             "collapseCrisisCount": 3, "outcome": { "resilient": 6.0, "holding": 4.5 },
             "headlineInfluence": 2, "marketSize": 5 },
  "prompts": { "debrief": ["..."], "monday": ["..."] }
}
```

Content targets: ~90 signals (≈30 per horizon; ≈9 primary per domain; ~55% positive primaries);
~15 drivers (5 per horizon) each with a dilemma; ~30 strategies; 12 roles × 2 mandates; ~10 cascades;
5 scenarios; ~10 refreshed 2019 "classics".

### Content-writing rules (all researchers)
- Every signal and driver cites a **real, verifiable source** you actually opened (WebFetch) or saw in search
  results, ideally 2024–2026; far-horizon weak signals may cite research, pilots, patents, prototypes.
  Never invent a URL or a fact. If unsure, drop it.
- Write everything **in your own words**. No quotes > 10 words. Titles playful but professional (the 2019
  deck's wit is a feature: "Wood wheels on the bus go round and round").
- **Candid and balanced** on federal/political context: describe what happened or is proposed, neutrally,
  with sources; show both opportunity and risk across cards; no partisan judgment; never mock officials.
- Keep valence honest: a negative real trend gets a negative primary delta.
- Use the domain ids exactly. Deltas: primary −3..+3 (mostly ±1/±2), fixed secondary −2..+2,
  secondary must target a different domain than primary.

### Role ability effect vocabulary (machine-readable `ability.effect`; engine must implement all)
All abilities are once per game, used at a moment the facilitator confirms.
- `{"type":"boost","delta":1,"choices":["partners","fire"]}` — +delta to one domain chosen from `choices` (or any if omitted)
- `{"type":"protect","choices":["water","health"]}` — protect one chosen domain until end of era (blocks Signal effects)
- `{"type":"capacity","amount":2}` — gain extra Capacity this era (Council phase)
- `{"type":"discount","amount":2,"tag":"partners"}` — reduce one strategy's cost (optionally only strategies with tag)
- `{"type":"cancel","scope":"driver"|"signal"|"cascade"}` — cancel one negative domain effect as it happens
- `{"type":"decide"}` — decide a Dilemma outright (overrides the vote)
- `{"type":"redraw","horizon":"far"}` — discard your hand and draw 3 from a chosen horizon (or the era mix)
- `{"type":"refresh-market","count":2}` — replace up to `count` strategies in the market
- `{"type":"move","amount":2}` — move up to `amount` points from one domain to another

## 5. App architecture

- **One self-contained HTML file** (inline JS/CSS; fonts from Google Fonts allowed; scripts only inline or
  from cdnjs/jsdelivr/unpkg). Runs on claude.ai as a published artifact AND self-hosted anywhere.
- Sandbox: no alert/confirm/prompt, no window.open, no downloads unless `downloads` capability; build
  dialogs in-page; Copy buttons for export; file input for import. Only `#name` hash routing
  (`#host`, `#join`, `#library`, `#rules`, `#about`). localStorage may throw → try/catch.
- **Capabilities** (optional, detected via `await window.claude?.use(name)`; page must fully work when null):
  - `room` → live sync between host and phones. `room.join("ff-" + code)`. Host is authority and broadcasts
    **public state via presence** (anyone can set presence; event topics are admin-only so don't rely on emit).
    Phones set presence `{kind:"player", seat, name, intents:[...]}` (vote, pledge, headline, play-card) with
    timestamps; host applies new intents and validates. Never put mandates in presence.
  - `db` → shared Content Library (editors write, everyone reads) + saved games. Fallback: embedded content
    + localStorage overrides + JSON import/export.
  - `downloads` → debrief & content export files. Fallback: Copy.
  - `sample` (optional, stretch) → "Draft a card from a news item" in the editor.
- **Secret mandates without a server**: Game code encodes a seed. Phone: enter code + seat + role →
  mandate variant = hash(seed, seat, roleId) % variants. Host computes the same for the final reveal.
  Show a content fingerprint (edition + hash) on host and phone; warn on mismatch.
- Host state autosaves (localStorage; db if available); resume after refresh. Undo last action.

## 6. Screens
1. **Home** — title, Host a game, Join on phone, How to play, Content Library, About & sources.
2. **Setup** — scenario picker (cards with summary + starting rings preview), players (names, role pick or
   random, recommended role sets), length, live-sync status, game code.
3. **Board (big screen, 16:9, readable at 6 m)** — the hero visual is a **tree cross-section**: 10 wedges
   (one per domain), Condition drawn as radial fill from pith to bark, band rings as faint guides, past eras
   as fine growth-ring outlines, Crisis shown as a fire-scar notch. Numeric level + band label on every
   wedge (never color alone). Side rail: era timeline (Now→Near→Far), players (name, public role,
   capacity), phase checklist, Insight Log. Bottom/center: the active phase panel.
4. **Phase panels** — Driver reveal + Dilemma vote; Signal turn (3 open cards, play, secondary resolver with
   wedge picking, reasoning field); Council (market, pledge matrix, timer, lock); Headline (timer,
   submissions, pick, influence placement, So-what); Cascades summary.
5. **Debrief** — final tree, outcome, mandates reveal, story, Signals to watch, prompts, export.
6. **Phone** — join; role card + tap-to-reveal mandate; with sync: phase-aware actions (vote, pledge,
   headline, play from hand if active), private progress vs mandate; without sync: mandate, notes,
   headline notepad, quick rules.
7. **Content Library** — tabs (Signals, Drivers, Strategies, Roles, Scenarios, Domains, Cascades, Rules);
   search + filters (horizon, domain, status, review due >18 months); form editor with validation;
   add / duplicate / retire; card preview; import/export JSON; "reset to published edition".
8. **How to play** (rules + quick reference + facilitator guide) and **About & sources**.

## 7. Visual direction
"Field journal meets situation room." Serious, warm, crafted — not a generic dashboard, not cartoonish.
- Two themes: **Projector (light, warm paper)** default for bright rooms; **Screen (dark, forest night)**.
- Type: a characterful serif for headlines & card titles (e.g., Fraunces / Newsreader) — headlines should
  feel like a newspaper front page in Headline of the Era; a highly legible sans for UI (e.g., Public Sans,
  a nod to US government design). Big-screen base ≥ 20px.
- 10 domain hues, earthy and distinguishable (ember, moss, river, slate-teal, timber, clay, sky, ochre,
  plum, sage); each also has a custom line icon (draw our own SVGs; do not copy the 2019 icons).
- Cards: physical presence (subtle paper texture via CSS, corner domain chip, delta badges ▲▼ with
  numbers), horizon marked (Now / Near / Far) with an icon too.
- Motion: purposeful (wedge grows/shrinks with number tick; ring "laid down" at era end); respect
  prefers-reduced-motion.
- Accessibility: WCAG 2.1 AA, keyboard everything, visible focus, aria-live announcements of Condition
  changes, contrast ≥ 4.5:1, data table alternative to the tree chart.
