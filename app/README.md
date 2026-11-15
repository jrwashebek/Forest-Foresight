# Forest Futures — app

A single self-contained HTML file: the big-screen host, the phone companion, the content library
and the rules/about pages. No server. Live sync, shared publishing and downloads light up only when
the claude.ai artifact runtime offers them (`window.claude.use(...)`); everything works without them.

## Build

```sh
npm install                       # dev deps only: esbuild, preact, axe-core, fonts
node build.mjs --content ../content/content.json --out dist/forest-futures.html
```

- `--content` defaults to `../content/content.json` (the published edition). `sample-content.json`
  exists only for unit tests — never ship it.
- The content JSON is validated at build time (errors are printed, not fatal) and embedded as
  `<script type="application/json" id="ff-content">`.
- Fonts (Newsreader + Public Sans, latin variable subsets) are embedded as data URIs so the page works
  offline and on networks that block Google Fonts. `--google-fonts` links Google Fonts instead.
- `--dev` skips minification and adds an inline source map.
- Output is about 745 KB with the full deck (JS ≈ 248 KB, CSS ≈ 93 KB, fonts ≈ 233 KB, content ≈ 170 KB).

## Test

```sh
npm test                               # unit tests (node --test): engine + UI helpers (unique initials), 59 tests
node e2e/play.mjs [--mock] [--shots] [--variants]   # full 5-player Standard game through the UI
node e2e/phones.mjs [--shots]          # host + 2 phones over a mock room: vote, play, pledge, headline; pledge steppers
                                       #   fully visible at 390 px and at 200% zoom (195 px)
node e2e/screens.mjs [--mock]          # static screens + Library edit/validate/import/publish/reset + error panel
node e2e/a11y.mjs                      # axe-core WCAG 2.1 A/AA over every screen state, both themes
node e2e/layout.mjs [--shots]          # layout CI: every step × every Text size (90/100/112/125/140%) × 1920×1080 and
                                       #   1366×768 × 5 and 7 players (long names). Asserts: primary action and seats on
                                       #   screen and uncovered; dilemma options, Pledging for, pledge steppers, headline
                                       #   rows, resolver/influence domains reachable (visible above the pinned bar or by
                                       #   scrolling the panel; options and steppers without scrolling at 90–100%); header
                                       #   parts never overlap or clip; tree column not cut off or overflowing; legend and
                                       #   seat names not truncated; no board text < 14px; tree labels/badges ≥ 14px.
                                       #   Also drives Game menu A+/A−/Reset (focus stays in the dialog).
                                       #   Filters: --players 7 --vp 1366 --sizes 1.25,1.4 --steps council-open
node e2e/fixes.mjs [--shots]           # tree labels ≥ 14px through a game at 1366 and 1920, ability names, Council auto-lock
node e2e/qa-fixes.mjs                  # confirm before Discard/New game, saved debrief reachable, manual copy fallback,
                                       #   phone-first Home, focus at game end + stepper focus (N8), discount refund (N7)
```

The e2e scripts serve `dist/forest-futures.html` over a local HTTP server and drive Chrome
(`/usr/bin/google-chrome`) with Playwright. `--mock` injects `e2e/mock-claude.js`, a stand-in for the
runtime: `room` over BroadcastChannel (join/presence/peers/onPeers/connected/onConnection, 4 KiB
presence check), `downloads`, `user` and `db`. Without `--mock` there is no `window.claude` at all.
Screenshots go to `shots/` (1920×1080 and 1366×768 host, 390×844 phone, Projector and Screen themes).

## Architecture

```
src/engine/            pure, deterministic, no DOM — shared by UI, tests and build
  rng.js               xmur3 hash, mulberry32 (state kept in game state), game codes, mandate variant hash
  content.js           rules defaults, bands, validation (whole content + per item, for the editor), fingerprint
  engine.js            createGame + reduce(content, state, action) → new state; selectors (capacity, outcome, mandates)
  history.js           undo stack + action log; replay(setup, log) rebuilds any game exactly
src/ui/                Preact (bundled by esbuild into one IIFE)
  main.jsx             boot, hash router (#host #play #join #library #rules #about), capability detection
  store.js             tiny stores: app (content, theme, caps, toasts, aria-live), host (history, timer, sync)
  content-store.js     embedded edition → shared db edition (content/live, 10 s timeout) → local edits
  sync.js              live sync: host public state in host presence, phone intents in phone presence
  tree.jsx             the tree cross-section (+ data-table alternative)
  cards.jsx            signal / driver / strategy / role / mandate cards
  screens/             home, setup, board + phases, debrief, phone, library, rules, about
src/styles/            CSS by layer (tokens → base → components → tree → cards → board → screens → phone → library)
```

**State flow.** The UI never mutates game state: it dispatches actions (`revealDriver`, `vote`,
`playSignal`, `resolveSecondary`, `pledge`, `lockCouncil`, `useAbility`, …) through `store.act()`, which
runs the engine reducer, pushes the previous state on the undo stack, autosaves `{setup, log, state}`
to localStorage and announces the change (aria-live). Invalid actions throw `EngineError`; the UI
shows the message as a toast. On reload the host replays the log (falls back to the saved state if
the content changed).

**Rules the engine reads from `content.rules`.** `handSize`, `capacityBase`, `capacityBaseByPlayers`,
`capacityModifiers` (by band label), `capacityMin`, `marketSize`, `marketRefresh` (`fresh` | `keep`),
`farDelayed` (`legacy`: final-era delayed effects never mature and appear in the debrief as Legacy
investments | `final`: they mature at game end), `cascadeMode` (`simultaneous`: every condition checked
on the pre-cascade tree, then effects apply | `sequential`: in order, can chain), `collapseCrisisCount`,
`outcome` {`resilient`, `resilientFloor`, `holding`, `holdingFloor`}, `outcomeDeep` (overrides for Deep
games), `signalRounds` {`standard`, `deep`}, `headlineInfluence`, `councilSeconds`, `headlineSeconds`.
Top-level `roleSets` {"3": [roleIds], …} drives "Recommended roles" in Setup. Scenario tags `intro` /
`realistic` add the Setup badges (this edition's Restoration Economy and Today's Trajectory are
recognised by id).

**Secret mandates.** Variant = `hash("ff-mandate|code|seatNo|roleId") mod variants`, computed on the
phone and again by the host at the end. Mandates are never sent over the network.

**Live sync.** Host presence `{k:"h", c, fp, ph, e, ld, pl, cd, pr, dr/dc/dv, tn/tp/hs, mk/pg/cp/lk,
hl/hp/hx, tk/tr/tg, ak}` (compact keys, ids only; ≈ 0.9 KB, hands are dropped if it would exceed 4 KiB).
Phone presence `{k:"p", st, r, nm, fp, iv, ip, ih, ic}` — vote, pledge vector, headline, play — each with
a timestamp and its context (driver id or era) so stale intents are ignored. The host validates seat,
role and phase, applies new intents through the same reducer (so they are undoable) and acknowledges
them in `ak`. Every phone action also has a host-side fallback (tap votes, steppers, typed headlines,
pass-the-laptop mandate reveal).

## How content flows

1. The content team edits `../content/*.json` and merges `content.json`.
2. `node build.mjs` embeds it as the published edition. The fingerprint (`edition/HASH`) shows on the
   home screen, the host game menu and phones; phones warn when the host's edition differs.
3. In the app, **Content library** edits are saved on that device as local edits (banner + "Reset to
   published edition"). Export with Copy JSON / Download JSON; import with Import JSON (validated, with
   an error list before applying).
4. When the `db` capability is present and `user.canEdit()` is true, **Publish to everyone** writes
   `content/live`; every view tries to load it at start (10 s timeout) unless it has local edits.
5. If the active content has errors, Host and Join show a panel listing them, with links to fix them in
   the library, import a file or reset — the app never crashes on bad content.

## Accessibility

WCAG 2.1 AA target, checked with axe-core (0 violations across 56 screen states in both themes, including
the compact board at 1366×768 and 140% Text size).
Keyboard: everything is a native button/input; the tree's wedges are focusable buttons when a domain
must be picked; dialogs trap focus and close with Esc; Ctrl+Z undoes. Condition changes are announced
via aria-live; the tree has a data-table alternative ("Table view"). Values are always shown as
numbers and band words, never colour alone. `prefers-reduced-motion` disables tweening and floats.

**Rules the UI enforces.** Points are never silently destroyed: add/boost/influence can't target a
domain at 10, remove/move can't take from 0, and a move carries only what the destination can receive
(invalid targets are disabled with a reason; a secondary with no valid target can be skipped). A discount
never drops a strategy below cost 1, and is only "ready" when the market holds a strategy it can lower.
Capacity is never stranded either: a discount applied after pledging hands the surplus back (largest
pledges first, ties to the later seat), records it in the story and says who got it back.

**Big screen.** Root type = viewport scale (20px at 1920×1080) with a 16px floor, times the Game menu's
Text size (90–140%, remembered per device). No text on the board renders below 14px (small sizes are
`max(Xrem, 14px)`). The driver is revealed as a big card, then the dilemma gets the full panel. The
Council pledges for one selected leader at a time ("Pledging for"), so 7 players fit. Every phase's main
action sits in a sticky bar pinned to the bottom of the panel (a direct child of `.phase`); a fade and
"More below" label appear when a panel scrolls. After each step focus moves to the new step's heading and
the step is announced (aria-live); at game end focus moves to the outcome heading and the outcome is announced.

**Fit at every Text size.** `board.jsx` measures the board in rem (viewport ÷ root size, so Text size
counts) through a hidden 10rem probe and sets classes on `.board`: `fit-short` (< 53.5rem tall: 1366×768,
or 1920×1080 from 112%), `fit-tight` (< 45rem tall), `fit-narrow` (< 80rem wide: slimmer tree column) and
`fit-cramped` (< 72rem wide or < 40rem tall: 16.5rem tree column, seats under both columns). The header
collapses step by step until its parts fit side by side (`fitHeader`, `[data-hfit]` 0–6): the phase
checklist becomes "Step 3 of 6 · Council", then other eras lose their years, then shrink to dots, then the
scenario line and the "Code" label go, and so on; nothing in it can overlap. The phase panel and the tree
column are container-query containers (`panel`, `tree`), so cards wrap instead of shrinking. With 6–7
players the seat strip runs under both columns; seat chips show full names when they all fit, otherwise
everyone's first name; ability names wrap onto two lines; each chip shows its phone check code (also listed
in the Game menu). Vote chips use unique initials (Maria Lopez / Mark Lee → MLo / MLe).

**Tree legibility.** The board measures the tree column; when outside labels would render below
14px (Signals and Council, and every phase at 1366×768) it switches to a compact ring: an icon + value
badge on each wedge plus a legend (name, value, band) in page-sized type. When the badges would drop
below 14px it shows a plain ring + legend, and when even that ring would be tiny (1366 at 140%) the legend
alone. The legend goes to one column (sized to its longest name and band) below 30rem. Setup also offers an
optional "Lock the Council automatically when its timer runs out" (default off; stored as `autoLock`).

## Known limits

- The board is designed for 16:9 / 16:10 at 1366 px and up; narrower windows get a stacked layout.
- Abilities are applied when the facilitator taps them (the engine checks timing); a "cancel" can be
  used while the effect it cancels is the latest change in that phase.
