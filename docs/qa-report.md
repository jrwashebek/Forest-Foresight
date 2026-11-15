# Forest Futures: independent QA and UX review

Build under test: `/home/claude/src/qa/forest-futures.html` (byte-identical to `app/dist/forest-futures.html`, edition `2026.11/31ULF`).
Date: 2026-11-14. Reviewer: independent QA (did not build it).
Harness: `qa/h/` (copies of `mock-claude.js` and `driver.mjs`, plus a REPL daemon that keeps Chrome open so I could drive the UI by hand). Screenshots: `qa/shots/` (178 files).

## Verdict: **SHIP WITH FIXES**

The engine is solid. I hand-drove these games through the UI to the debrief:

- 5-player Standard, Today's Trajectory
- 7-player Standard, Climate Whiplash (forced a System Collapse)
- 3-player Deep, Restoration Economy
- 7-player live-sync game

I found no Blocker:

- No console errors or page errors in any session.
- Undo works across phase and era boundaries, and Ctrl+Z works.
- Reload resumes exactly where you left off, including mid-dilemma votes and mid-resolver.
- If the host page is refreshed, connected phones stay connected.
- All 9 ability types work as written.
- Protection is enforced correctly.
- Phone mandates match the host's final reveal, both offline and live.
- Host presence peaked at 1,151 bytes with 7 players (limit 4,096). No mandate data appears in any presence payload.

Before senior leaders see this, the seven Majors below should be fixed. Most are about what the projector shows. Two are one-click data-loss traps.

**Counts:** Blocker 0 · Major 7 · Minor 17 · Polish 8

---

## Major

### M1. In every game, Dilemma option C is hidden under the sticky action bar
- **Where:** Board → Driver phase, at 1920×1080 and 1366×768. All 16 drivers have 3 options, so this happens in every era of every game.
- **Repro:** Host any game → Reveal the Era Driver.
- **Expected:** All three options, their effects and the vote chips are visible on the projector while the table decides.
- **Actual:**
  - At 1920 the Option C voter chips are at y=851–891. The sticky "Tap a player's initials…" / "Waiting for votes" bar starts at y=770 and covers them.
  - Option C's effects are also hidden.
  - At 1366 the chips sit at y=596 inside a 585 px panel.
  - The room cannot see what option C does. The facilitator has to scroll the right column before recording C votes.
- **Shots:** `shots/134-driver-1920-fold.png`, `shots/155-driver-1366.png`, `shots/42-after-reload-1920.png`
- **Fix:**
  - Lay the dilemma out for 3 options: put effects and chips on one row, or make the options more compact and narrow the driver card.
  - Give the scroll area bottom padding equal to the sticky bar's height, so the bar never sits over content.
  - Add a visible "more below" cue.

### M2. Other phase panels also push key controls below the fold on the big screen
- **Where and what happens:**
  - **(a) Council with 7 players:** seat 7's pledge row ("GU") is cut off behind the "0 of 9 capacity pledged" bar, at both 1920 and 1366.
    - Shots: `shots/68-7p-council-1920.png`, `shots/69-7p-council-1366.png`
  - **(b) System response when 4 or more rules fire:** the only next-step button ("Lay down the … ring" or "Record the collapse") is completely off-screen. The facilitator sees five cascade cards and no way forward. Unlike the driver bar, this action box is not sticky.
    - Shot: `shots/72-cascade-applied-crisis.png`. The button only appears after scrolling: `shots/73-collapse-button-scrolled.png`.
  - **(c) Signal cards:** the "Source …" line, a core part of every card, is hidden under the footer at 1366 and in the dark theme at 1920.
    - Shots: `shots/131-signals-choose-1366.png`, `shots/123-signals-dark-1920.png`
- **Repro:**
  - (a) 7 players → reach the Council.
  - (b) Climate Whiplash with 7 players, let 3+ domains reach Crisis → Apply the system response.
  - (c) 1366 → Signals.
- **Expected:** The next action is always visible, and every seat's row is visible.
- **Fix:**
  - Make the cascades action bar sticky, like the other phases.
  - Use compact pledge rows (smaller row height, or two columns of steppers) when there are 6 or more players.
  - Reserve bottom padding under sticky bars.
  - Run a CI check: for every phase × {5, 7 players} × {1920, 1366}, assert that the primary button and all seat rows are in the viewport.

### M3. One click destroys a game or debrief with no confirmation
- **Where:**
  - Home → "Discard", which sits right next to "Resume game".
  - Debrief → "New game".
- **Repro:**
  1. Start a game. Open the Game menu → Save and exit → Home → click **Discard**. The game is gone immediately: `localStorage ff.host.v1` is removed and there is no undo.
  2. Finish a game. On the debrief, click **New game**. The setup screen opens and the finished game, its debrief and its undo history are deleted. Going back to Home or `#host` does not bring it back.
- **Expected:** A confirm step, like the Game menu's "Abandon game → Yes, abandon it", which already does this correctly (`shots/139-abandon.png`). Ideally also keep the last finished game ("Last debrief…") until a new game actually starts.
- **Actual:** Silent and irreversible. The Insight Log and debrief are the main take-away for leaders. A stray click before "Copy debrief" loses them.
- **Shots:** `shots/137-home-with-saved-game.png` (before), `shots/138-home-discard-confirm.png` (after one click: gone)
- **Fix:**
  - Add an inline confirm to both buttons.
  - For New game, say "Copy the debrief first?".
  - Keep the finished game in a separate slot until "Start the game".

### M4. A phone shows the wrong pledge after the host clamps it
- **Where:** Phone → Council (live sync).
- **Repro:** Mock room, 3 phones. Phones 2 and 3 each press "+" three times on the same cost-3 strategy at about the same moment.
- **Expected:** The host clamps the total to the cost (it does: host pledges are Ben 2, Chen 1). Each phone then shows the amount the host accepted.
- **Actual:** Ben's phone keeps its own optimistic value. It shows stepper **3**, "**4 of 3** pledged" and "You have **0** of 3 left". The host recorded 2 and Ben still has 1 unspent. This did not correct itself after 5+ s. The phone's presence still says 3 (`ip.a: [["str-remote-sensing",3],…]`).
- **Shot:** `shots/98-phone-ben-after-race.png`
- **Fix:**
  - Once an intent is acknowledged (`ak`), render the phone from the host's public pledge vector (`pg`), not from the local intent.
  - Then reset the local intent to match.
  - Show "The host adjusted your pledge to 2" when they differ.

### M5. Big-screen text is below the spec's 20 px base and is hard to read at 6 m
- **Where:** All board phases. SPEC §6.3 says "readable at 6 m"; §7 says "Big-screen base ≥ 20px".
- **Measured:**
  - **At 1920×1080:**

    | Text | Size |
    |---|---|
    | Dilemma option text | 18 px |
    | Signal card body | 16.4 px |
    | Effect chips and arrows | 13 px |
    | Seat-strip role and ability | 15–16 px |
    | Source line | 15 px |
    | Era years | 14.8 px |

  - **Why 1366 is worse:** the board is a scaled 1920 canvas. The root font is 20 px at 1920, 13.3 px at 1366×768 and 10.7 px at 1024×768.
  - **At 1366×768**, which is a very common laptop and projector output:

    | Text | Size |
    |---|---|
    | Panel body | 13 px |
    | Voter initials | 10 px |
    | Seat strip | 11 px |
    | "Lead" tag | 10 px |

- **Shots:** `shots/155-driver-1366.png`, `shots/158-driver-1024x768.png`, `shots/131-signals-choose-1366.png`
- **Expected:** Body text of at least about 20 px on the shared screen at the output resolution actually in use.
- **Fix:**
  - Set a floor on the root scale, e.g. `font-size: max(16px, …)`, and let the layout reflow instead of shrinking.
  - Bump secondary text to ≥ 0.95 rem on the board.
  - Consider a "Large text" toggle in the Game menu for big rooms.

### M6. Keyboard focus is lost after almost every action, and phase changes are not announced
- **Where:** Board, keyboard and screen-reader use.
- **Repro (keyboard only):** Tab to "Reveal the Era Driver" → Enter. Focus is now `<body>`. The same happens after:
  - "Decide: …"
  - "Play “…”"
  - "Apply"
  - "Continue to signals"
  - "Use <ability>" in a dialog
- **What it costs:**
  - The next Tab starts again at "Skip to the active phase".
  - It took 7 Tabs to get back to the voter chips and 17 Tabs to reach "Draw and end turn".
  - Phase transitions are not announced. The aria-live region only reports Condition changes, so a screen-reader user gets no "Signals: Ben's turn".
- **What works:** Dialog Esc, Cancel and Close all return focus to the opener. Dialogs trap focus correctly. Focus rings are visible (3 px magenta). Reduced motion removes all transitions.
- **Expected:** WCAG 2.4.3 focus order. After an action, focus moves to the new step.
- **Fix:**
  - After every `act()` that changes `phase` or `turn.step`, focus `#panel` (it already has `tabIndex=-1`) or the phase `<h2>`.
  - Announce "Era I, Signals, Ben (Forest Supervisor) to play".
  - After a confirmed ability, return focus to the seat's ability button (now "Used") or to the panel.

### M7. If the clipboard is blocked, the debrief cannot be exported
- **Where:**
  - Debrief → "Copy debrief (Markdown)"
  - Library → "Copy JSON"
  - Code: `ui/util.js copyText`, `ui/common.jsx CopyButton`
- **Repro:** Without the `downloads` capability (self-hosted, or signed-out claude.ai viewers), make both `navigator.clipboard.writeText` and `execCommand('copy')` fail. This happens in iframes without clipboard permission.
- **Actual:** The toast says "select the text and copy it manually", but the text is never shown anywhere. The debrief and Insight Log, the product's main output, and any Library edits cannot leave the device.
- **How I found it:** code review plus a simulated clipboard rejection. In headless Chrome the `execCommand` fallback succeeded, so I could not trigger the final fallback directly.
- **Expected:** A manual fallback.
- **Fix:** When copying fails, open a dialog with a read-only `<textarea>` holding the Markdown or JSON, pre-selected, with "Press Ctrl/Cmd+C" instructions.

---

## Minor

### m1. Tree wedges can't be picked until a domain button has been clicked
- **Where:** Signal resolver (add/remove/move/protect) and Headline influence.
- **What happens:**
  - When the resolver opens, `svg.tree--pick` and the "Tap a wedge…" hint are missing. Clicking a wedge does nothing.
  - Both appear only after the first click on a domain button.
- **Cause:** `PhasePanel`'s keyed cleanup (`boardUI.set({pick:null})`) runs after the child's mount effect has set `pick`.
- **Shots:** `shots/13-signals-resolve-add-1920.png` (no hint), `shots/14-signals-resolve-picked-1920.png` (hint appears after the first click)
- **Fix:** Set `pick` in the child after the parent's cleanup, e.g. key the child component or use a layout-effect ordering.

### m2. Move/Add/Remove silently lose or ignore points at 0 and 10
- **Moving into a domain at 10 destroys points.** I checked this against the engine:
  - Signal move Wood 5 → Partners 10 gives Wood 4, Partners 10.
  - The Rally the Public ability Water 4 → Partners 10 gives Water 2, Partners 10.
- **Some actions are silent no-ops:**
  - Move *from* a domain at 0: Apply is enabled, nothing happens, and the story logs a move with no changes.
  - Add to a domain at 10, or Remove from 0: no change and no warning ("Partners stays at 10").
- **Fix:**
  - Cap a move at `min(amount, from, 10 − to)`.
  - Disable "to" domains at 10 and "from" domains at 0 in the resolver and in the ability dialog.
  - Show "no effect: already at 10" before Apply.

### m3. A discount can make a strategy free, and the UI and engine disagree about its cost
- **What happens:**
  - The GNA lead's −2 discount (tag "partners") applied to a cost-2 partners strategy, e.g. Shared Stewardship, gives an effective cost of 0.
  - The engine (`effectiveCost`: `max(0, …)`) then **funds it at Lock with zero pledges**.
  - The card shows "**1** cap" because `StrategyCard` uses `Math.max(1, …)`, and its steppers are disabled.
- **I checked this with the engine:** funded `["str-shared-stewardship"]` with no pledges; Partners 4 → 5.
- **Fix:** Decide the rule (minimum cost 1 is probably intended), then apply it the same way in the engine and the UI.

### m4. An over-long headline typed on the host is wiped
- **Where:** Headline input on the host.
- **Repro:** Type more than 10 words → Tab or Enter.
- **What happens:** The engine rejects it (correct), but `commit()` deletes the draft anyway, so the facilitator's text disappears.
- **Fix:** Keep the draft when the engine rejects it, and show the error inline (`aria-invalid` is already set).

### m5. The collapse debrief says "Shared forest outcome, 2050"
- **Where:** Debrief after a System Collapse.
- **What happens:** It says "Shared forest outcome, 2050" and "Targets by 2050" even though the collapse happened in the Now era (2026–2030).
- **Shot:** `shots/74-collapse-debrief.png`
- **Fix:** Use "System collapse, end of <era> (<years>)".

### m6. The debrief story and the Markdown leave out what abilities did and what protection blocked
- **What's missing:**
  - "Tom Becker used Source Water Protection": which domain?
  - "Maria Lopez used Forest Action Plan": which strategies were swapped?
  - "Order Book": which strategy was discounted?
  - "Field Hearing" or "Ground Truth": which drop was cancelled?
- **Protected effects disappear:** "Stripes are not a good look" shows only "Recreation ▼1". The Forest Health −2 that protection blocked is not shown, which is the very moment leaders will want to discuss.
- **Fix:** Render `entry.domain`, `replaced`/`added`, `strategy` and `changes`, and show blocked effects as "Health −2 (blocked: protected)".

### m7. Seat and role mix-ups on phones are not detected
- **Live sync:**
  - Two phones joined as seat 2. The host showed "5 phones connected" for 4 distinct seats, with no warning.
  - The last vote won silently.
- **Offline:** A player who picks the wrong seat number sees a different mandate from the one the host reveals at the end, with no warning.
- **Fix:**
  - On the host, flag duplicate seats.
  - Show a 2-character check code (from code+seat+role) on both the phone's role card and the host's seat chip, so mismatches can be spotted before play.

### m8. At 7 players everyone has 1 Capacity from the first era
- **Why:** `capacityBaseByPlayers[7] = 2`. With Workforce and Policy at Strained, which is the norm in 4 of 5 scenarios, every leader gets 2 − 1 − 1, clamped to the minimum of **1**.
- **Effect:**
  - The Council becomes "pool 7 tokens"; the steppers are mostly 0/1.
  - Abilities like Philanthropic Match triple one person's budget.
  - The balance report already says 7-player games are harsher.
- **Fix:** A design call. Either raise the base for 7 players, or show a Setup note: "7 players: Capacity is very tight".

### m9. Two key indicators aren't explained on screen
- **What:**
  - Protected domains are marked only by "◆" before the band word and a dashed wedge outline.
  - "Ability available now" is a small red dot on the seat chip.
- **Problem:** Neither is explained on screen or in How to play, and neither is visible at 6 m.
- **Fix:** Show the word "Protected" under the band, and add an "available now" text or a highlight.

### m10. Content wording left over from the physical game
- **"Cube":** 11 signal secondary prompts say "cube(s)", a 2019 physical-game term. For example, `sig-fuels-work-drops-a-third`: "Remove one cube from a domain…". The digital game has no cubes.
- **A prompt the UI doesn't enforce:** `sig-icvcm-forest-label` says "Move 1 between wood and another domain", but the UI lets the facilitator move between any two domains.
- **Fix:** Edit the content; optionally add a validator warning for the word "cube".

### m11. The Library is close to usable for a non-technical lead, but…
- **Error messages:**
  - They expose JSON paths. Example: "`primary.delta` primary delta must be −3…+3 (not 0)" is shown when the value entered was 5.
  - The problems list items don't link to the fields.
- **Effect picker:** The ability "Effect" select shows raw engine ids (`refresh-market`, `cancel`) with no description.
- **"Review due":** The filter doesn't say what it means (>18 months since last review).
- **Unsaved edits:** Switching items or tabs while editing is blocked only by a short toast ("Save or revert your changes first.").
- **Shots:** `shots/105-library-validation.png`, `shots/152-library-ability-editor.png`
- **What works well:**
  - Add, duplicate, retire and restore.
  - The live preview.
  - The banner showing local edits.
  - "Reset to published edition", with an inline confirm.
  - JSON import with an error list, and "Import anyway".
  - Copy JSON → import round trip: 99 signals, the retired card and the new card all survived.
- **Fix:**
  - Use plain-language messages ("Primary change must be between −3 and +3").
  - Make each problem a link that focuses its field.
  - Add a one-line help text per effect type.
  - Add "(not reviewed in 18 months)" to the review filter.
  - Use a proper "Unsaved changes" dialog.

### m12. Library edits are device-local, so the host can silently diverge from phones
- **Problem:**
  - If the lead edits roles or mandates on the host laptop, phones (which use the embedded edition) compute different mandates.
  - Offline, the only cue is the edition hash in the Game menu (e.g. 4PZE0 vs 31ULF). Nothing warns at Setup.
- **Fix:**
  - At Setup: "This device uses local edits; phones will not match unless they import the same file."
  - Show the edition hash on the phone's role card.

### m13. Phone "Live" pill fails contrast
- **What:** The phone header's "Live" pill is #1f7a42 on #ebe5d1, 12.8 px bold. That is **4.24:1**, below the 4.5:1 AA requirement.
- **Found by:** axe, on the phone headline state; the engineer's a11y run did not cover this state.

### m14. On a phone, Home pushes players toward "Host a game"
- **What happens:**
  - At 390 px the Home screen's big green CTA is "Host a game". "Join on your phone" is below the fold. Players opening the shared link will tap Host.
  - After a phone has joined, Home doesn't offer "Back to seat 2". The Join form does prefill the code, though.
- **Shot:** `shots/140-home-390.png`
- **Fix:** On narrow or touch viewports, put Join first, and add "Resume as seat N".

### m15. A finished game can't be found from Home
- **What happens:** Home shows "Game in progress" only for unfinished games. A finished game's debrief is reachable only through "Host a game", which is not obvious.

### m16. Phone at 200% zoom doesn't reflow
- **What:** At a 195 px CSS width, the mandate screen overflows sideways (scrollWidth 300). "at least 8", the "Offline" pill and the header icons are clipped.
- **Standard:** WCAG 1.4.10.
- **Note:** 320 px is fine.
- **Shot:** `shots/125-phone-200pct-mandate.png`

### m17. Screen-reader rough edges on the board
- **Heading:** The signal-turn heading reads "AnaState Forester" (no space between name and role).
- **No h1:** The board has no `h1`.
- **Undo announcement:** Undo is announced twice (toast `role=status` plus the sr-only live region) as "Undid the last step.", without saying *what* was undone.

---

## Polish

### p1. Home hero tree
- **What:** It has stray grey squiggly outlines crossing the wedges. They look like a scribble rather than growth rings.
- **Shots:** `shots/143-home-1920.png`, `shots/140-home-390.png`

### p2. Names are truncated or ambiguous
- **Truncated at 1920 with 5 players:**
  - Headline rows: "James White…", "Alexandra Fe…"
  - Seat chips: "Line Officer's D…", "Forest Action Pl…"
- **Ambiguous:** Pledge rows use 2-letter initials that can collide (Maria Lopez and Mark Lee are both "ML").
- **Shots:** `shots/32-headline-overcount-live.png`, `shots/28-council-pledged-1920.png`

### p3. Effect chip overflows its card
- **What:** At 1366 in the discard view, the "▼1" chip sticks out 7 px past the card's right edge.
- **Shot:** `shots/132-discard-1366.png`

### p4. Toasts cover the Resilience index
- **What:** Toasts ("Philanthropic Match used.") sit over the Resilience index and crisis note at the bottom left for several seconds, at exactly the moment people look at them.
- **Shots:** `shots/68-7p-council-1920.png`, `shots/73-collapse-button-scrolled.png`

### p5. Every game opens with "Unraveling pace" in red
- **Why:** Every scenario starts with an index below 4.5.
- **Problem:** It reads as a verdict before play begins.
- **Fix:** Use "On pace for: Unraveling", and add a one-line tooltip on what the tiers mean.

### p6. Table view column "Now" is ambiguous
- **What:** The column header "Now" means "current", but "Now" is also the first era's name.
- **Fix:** Rename the column to "Current".

### p7. "So what for us now?" placeholder looks like real content
- **What:** The placeholder ("Our partnerships are our real surge capacity…") reads like an already-entered insight.
- **Fix:** Prefix it with "e.g.".

### p8. Signals header hint wraps awkwardly at 1366
- **What:** "Hands are open. Discuss, then choose one signal to play." floats at the top right and wraps awkwardly.
- **Shot:** `shots/131-signals-choose-1366.png`

---

## Rules consistency (on screen vs SPEC vs engine)

**On-screen rules match the engine everywhere I checked:**
- How to play
- The phone's Rules tab
- The Council explanation line
- The final-era legacy note
- Collapse text
- Tie-break flow (`shots/135-tie-state.png`)
- Protect semantics

**Deliberate deviations from SPEC.** These come from `content/balance-report.md`, are shown correctly on screen, and the engine implements them:

| Rule | SPEC | This build |
|---|---|---|
| Capacity base | 3 | 8 / 7 / 5 / 4 / 2 for 3–7 players |
| Holding | index ≥ 4.5 | index ≥ 4.5 and no domain in Crisis |
| Resilient | no domain in Crisis | every domain ≥ 5 (≥ 6 in Deep) |
| Chronic cascades | — | fire at ≤ 3 and climate at ≤ 3 |

Someone should confirm with the client that these replace SPEC §3.

The only places where the engine contradicts what's shown on screen are m2 (move conservation) and m3 (minimum cost after a discount).

## Coverage notes

**Played end to end through the UI:**

| Players | Length | Scenario | Notes |
|---|---|---|---|
| 5 | Standard | realistic (Today's Trajectory) | Hand-driven, every phase screenshotted |
| 7 | Standard | Climate Whiplash | Forced collapse in era I |
| 3 | Deep | Restoration Economy | 2 signal rounds/era verified ("turn 4 of 6, round 2") |
| 7 | Live | — | 1 phone; presence measured |
| 5 | Live | — | 4 phones plus a duplicate seat |

**Abilities:** all 9 types were used: boost, protect, capacity, discount ×2, cancel for driver, signal and cascade, decide, redraw (Far), refresh-market, move.

**Undo:** across the era boundary (ring removed, protection restored) and across Response → Headline (insight kept). Undoing a phone-applied vote is not re-applied from that phone's presence.

**Reload:** mid-dilemma votes and the secondary-resolver step both resumed.

**Phones:**
- Offline join validation works (bad length, bad alphabet, spaces, missing role).
- Offline mandate = host private reveal = host debrief.
- Live:
  - Vote, re-vote, play a signal, pledge, headline (the over-length send is disabled).
  - Late join mid-era.
  - Close and rejoin.
  - Host refresh with 4 phones attached.

**Exports:**
- Debrief Copy produced 16 KB of Markdown: all sections, links and mandates.
- Mock downloads saved `.md` (14.6 KB) and game `.json` (32.8 KB).

**A11y:**
- axe found 0 violations on library validation, debrief, live host and board states. The one failure was on the phone (m13).
- Contrast scan: no failing text in either theme.
- Reduced motion leaves 0 transitions.
- The table view has caption and scope correct.

**Not testable with the mock:**
- The edition-mismatch warning between phone and host. BroadcastChannel only works within one browser context.
- Real clipboard denial (see M7).

---

## Facilitator experience (narrative)

Setup is clear. The scenario cards with mini-trees, "Recommended roles for 5", the game code and the start summary make a first game easy to launch. Each era's opening screen says plainly who leads and what that means. Most phases have one obvious green button, and the phase checklist in the header keeps you oriented.

The friction comes at the moments the room is watching. Every dilemma's third option disappears under the "Waiting for votes" bar, so I had to scroll while the table asked "what does C do?". When four or more cascades fired, there was no visible button to continue. With seven players the last pledge row was cut off.

Text that reads well on a laptop is too small for the back of a room, especially at 1366×768.

The secondary-effect resolver works, but tapping a wedge on the tree didn't respond until I had clicked a button first. The debrief is rich and worth exporting. That is why two unconfirmed buttons, "Discard" on Home and "New game" on the debrief, which can erase it in one click, matter so much.

Fix M1–M7, then rehearse on the real projector before senior leaders see it.

---

## Regression (RC)

**Build:** `qa/forest-futures-rc.html`, byte-identical to `app/dist/forest-futures.html`, edition `2026.11/NHGEP`. Served over local HTTP and run in Chrome through Playwright.
**Harness:** `qa/h-rc/`. It contains a REPL daemon, `mock-claude.js`, the e2e `driver.mjs`, a smarter host policy `smart.js`, and helpers for coverage and font size.
**Screenshots:** `qa/shots-rc/` (85 files).

### Verdict: **SHIP WITH FIXES**

All seven Majors behave as fixed with the original repro steps, except M5, which is only partly fixed. Two new Majors need fixing before a room session:

- N1: the new A+ text-size control breaks the board layout.
- N2: on a 390 px phone, the Council "+" is clipped on some strategy cards.

There were 0 console errors or page errors on any of the 7 pages: 3 hosts, 3 phones and the library.

**Sessions run:**

| Players | Sync | Scenario | Sizes | How it ended |
|---|---|---|---|---|
| 7 | none (no `window.claude`) | Climate Whiplash | 1920, 1366, dark theme | Hand-driven by keyboard and mouse. 4 cascades fired, then System collapse in era I. |
| 5 | mock live sync, 3 phones at 390×844 | Today's Trajectory | 1920 and 1366 | Phones voted, played a signal, pledged (including the M4 race) and sent headlines. Abilities used: protect and refresh-market. Collapsed at the end of era II (Near). Debrief Copy, Download Markdown and Download game JSON all worked. |
| 5 | none, clipboard blocked | Restoration Economy | era I at 1920, era II at 1366, era III at 1920 | Full 3 eras to **Resilient**. Undo used in era III for the m2/m3 checks. |
| 7 | none | Restoration Economy | 1366 | Dilemma and Headline layout checks. |

### Item table

| Item | Result | Note |
|---|---|---|
| **M1** Dilemma option C under the sticky bar | **PASS** | Checked with 7 players at 1920 and 1366 and with 5 players at 1366. All 3 options, their effects and every voter chip are on screen and uncovered. The action bar no longer overlaps (`04`, `43`). **This comes back when A+ is used** (see N1). |
| **M2a** Council with 7 players | **PASS** | The new "Pledging for" selector shows one leader at a time. All steppers and Lock are visible at 1920 and 1366 (`11`, `12`, `12a`). |
| **M2b** 4+ cascades hide the button | **PASS** | 4 rules fired. "Record the collapse" sits in the sticky bar at y=856 (1920) and y=614 (1366) (`18`, `19`). |
| **M2c** Source line on signal cards | **PASS** | Visible at 1366 and in the dark theme at 1920 (`07`, `08`). |
| **M3** One-click data loss | **PASS** | Home → "Discard…" now shows "Discard this game for good? Discard it / Keep it", with focus on Keep it (`93`). Debrief → New game opens a dialog with Copy debrief, Cancel and Go to setup. The debrief stays saved until Start, and Setup and Home both offer it (`22`–`24`). |
| **M4** Phone shows the wrong pledge | **PASS** | Ben's and Chen's phones each pressed "+" 3× on cost-3 Beaver & meadow at the same time. The host accepted Ben 1 and Chen 2. The phones show 1 and 2, "3 of 3 pledged", "2 of 3 left" and "1 of 3 left" (`54`, `55`). |
| **M5** Big-screen type | **PARTIAL** | At 1920 it meets the spec: body and option text 20 px, effects 18 px, the rest ≥16 px. At 1366 it is still below the SPEC's 20 px base: root and body 16 px, effects 14.4, discussion prompt 13.6, era years 12.8. That is up from 13/10/11 px. The intended remedy, A+, breaks the layout (N1). |
| **M6** Focus and announcements | **PASS** (residual N8) | After every action I checked, focus moves to the step's `h2` and the change is announced politely, e.g. "Era I, Signals: Ana Ruiz (Forest Supervisor) to play." Actions checked: Reveal, Open dilemma, Decide, Continue, Play, Apply, Draw, Lock, Write headline, Pick, Place influence, Continue to response, Apply response, confirming an ability. From the new step it took 3 Tabs to reach "Draw and end turn". m17 also passes: the heading reads "Ana Ruiz Forest Supervisor". |
| **M7** Export when the clipboard is blocked | **PASS** | Tested with no `window.claude`, `clipboard.writeText` rejected and `execCommand` returning false. Copy debrief opens "Copy the debrief (Markdown)": a read-only textarea, focused, fully pre-selected, with Ctrl/⌘+C instructions, Select all and Done (`72`). The Markdown is 8.5 KB after a collapse and 16.5 KB after a full game, with all sections. |
| **m2** Move/add/remove at 0 and 10 | **PASS** | The resolver's "Add 1" disables domains at 10 with "(already at 10)". In Rally the Public, "to" domains at 10 are disabled. Moving 2 from Workforce 7 to Water 9 previews "1 point(s) will move: Workforce 7 → 6, Water 9 → 10", and the engine applies exactly that (`87`, `88`). I never had a domain at 0 during a resolver, so the from-0 guard was checked in code only. |
| **m3** Discount makes a strategy free | **PASS** (floor verified in code) | The engine's effective cost and the strategy card both use `max(1, cost − discount)`. In play, GNA −2 on a cost-3 card shows "costs 1, not 3". I could not get a cost-2 partners card into the market alongside the GNA lead, so the cost-2 → 1 floor case was not exercised. See N7. |
| **m4** Over-long headline wiped | **PASS** | A 12-word headline is kept after Tab or Enter. The field shows a red "12/10", sets `aria-invalid`, and a toast says "trim it to 10 or fewer" (`14`). |
| **m6** Debrief omits abilities and blocks | **PASS** | The story now says "Source Water Protection: protected Water & Watersheds for the rest of the era" and "Forest Action Plan: swapped Workforce housing…, Lean operations… for Outdoor access…, Shared Stewardship…". Blocked effects show as "Water ▼1 blocked: protected". |
| **m12** Local edits diverge from phones | **PASS** | After a local role edit, Setup says: "This device uses local edits to the cards (edition 2026.11/1SVAY). Phones use the published edition, so their secret mandates won't match…". The phone role card shows "Card edition 2026.11/NHGEP". |
| **m15** Finished game hard to find | **PASS** | Home shows "Last game: Unraveling … View debrief" (`24`). |
| **Text size A−/A+** | **FAIL** | The control works: 90–140% in steps (112/125/140), remembered in `ff.textsize`, with Reset and an announcement. But at 112% and above the board layout breaks (N1). |
| **About: "What changed from the 2019 edition"** | **PASS** | Present. The text matches `ABOUT-ADDITIONS.md` (`91`). |
| **About: "Keeping this tool current"** | **PASS** | Present. The text matches `ABOUT-ADDITIONS.md`. |
| **Full 5-player game, mock live sync** | **PASS** | 3 phones voted in both eras and the host applied every phone vote. Also from the phones: a signal play, pledges, and headlines that appeared in the host's fields. The phone mandate matches the host's reveal. Exports: `.md` 12.2 KB and game `.json` 34.1 KB through `downloads`, and Copy produced 12.2 KB. **Caveat:** the game collapsed at the end of era II, so the live game never reached era III. The no-sync game below covered all 3 eras. |
| **Full 5-player game, no `window.claude`** | **PASS** | 3 eras to Resilient with no layout breaks: the primary action was on screen at every step, at both sizes, with no page overflow. The manual-copy export works. |

**Other fixes confirmed while testing:**
- m1: wedges can be picked as soon as the resolver opens.
- m5: the collapse heading reads "System collapse, end of the Now era (2026–2030)".
- m8: there is now a 7-player Capacity explanation line.
- m9: the word "Protected" appears under the domain, and "Protected this era: Water" appears by the index.
- p7: the insight placeholder now starts with "e.g.".

### New issues

#### Major

**N1. The text-size control (A+) breaks the board at every step above 100%.**

*Repro:* Game menu → A+ → Close. Measured on the Driver phase.

- **At 1920:**
  - **112%:** the phase checklist is clipped. "Response" is hidden (scrollWidth 550, clientWidth 447) (`40`).
  - **125–140%:** the Code chip sits on top of the checklist, and "Headline"/"Response" overprint the Undo, Hint and Theme icons. Dilemma options B and C drop below the fold, which brings M1 back, though a "More below: scroll" cue does appear. Legend names shrink to "H…", "W…". Seat names shrink to "An…", "Be…" (`36`, `39`).
- **At 1366:**
  - **112%:** the checklist shows only Era, Driver and Signals (`42`).
  - **140%:**
    - The left column is cut off at the left edge ("rest Futures", "y's Trajectory", and legend names down to one letter).
    - The header is jumbled.
    - Option C is off-screen.
    - Option B is half-covered (`38`).

The control exists for big rooms, so facilitators will use it at exactly the moment the room is watching.

*Fix:*
- Let the board header reflow: move the phase checklist to its own row, or collapse it to the current step. Never let the Code chip overlap it.
- Above 100%, switch the dilemma to the compact layout.
- Add text sizes 112%, 125% and 140% to the `e2e/fixes.mjs` layout CI matrix.

**N2. Phone Council: the "+" pledge button is clipped or invisible on strategies with long titles (390×844).**

*Repro:* Live game → Council → open a phone's Table tab.

The stepper is squeezed by the title column, and "+" overflows the stepper box:

| Card | "+" position | Edge it overflows | What a player sees |
|---|---|---|---|
| "Mature & old-growth safeguards" | x 351–381 | stepper ends at 360, card at 374 | only "− 0", no "+" |
| "Lean operations consolidation" | x 358–388 | card ends at 374 | "+" partly cut off by the card edge |
| "Workforce housing partnership" | — | — | "+" half cut off |

(`54`, `57`.)

A tap where the button should be still registered in Playwright. But players cannot see how to pledge to these cards, and pledging is the main thing phones do in the Council. The facilitator can still use the host steppers as a fallback. In the previous build the stepper was squeezed but "+" was visible (`shots/98`).

*Fix:* Give the stepper `flex: none` and a minimum width, or put it on its own row under the title.

#### Minor

**N3. At 1366 and 100%, the header phase checklist is clipped.** "Response" sits behind the Code chip and "Headline" is cut off. During the System response the active pill cannot be seen at all (`12`, `19`, `95`).

**N4. The m7 check codes are invisible on the host in the default setup.**
- The phone says "Check code Q4: the host's seat 1 chip should show the same code".
- But `.seat-check` is `display: none` under `@container (max-width: 10.5rem)`. With 5 players at 1920 each seat chip is about 195 px wide, which is under 210 px, so the code is hidden. It is also hidden with 7 players.
- The Game menu's Live sync list does not show the codes either.
- So the cross-check cannot be done.

*Fix:* Show the codes in the Game menu's phone list, or keep them visible on the chip.

**N5. Initials still collide (p2 not fixed).** Maria Lopez and Mark Lee both show **"MaL"** on voter chips and in pledge rows, and on the phone tally. Recording votes by tapping chips becomes guesswork. Seen with 5 and 7 players (`04`, `43`).

**N6. The seat strip is unreadable with 7 players at 1366.**
- Names are cut to "Ana…", "Che…", "Mar…", "Mar…", so Maria and Mark cannot be told apart. Abilities are cut to "Line …", "Goo…" (`19`).
- At 1920, ability names are cut mid-phrase with no ellipsis: "Rally the", "Stop the", "Source Water" (`86`, `62`).

**N7. A discount applied after pledging strands Capacity.**

*Repro:*
1. In the Council, Ben pledges 3 to River & trail (cost 3).
2. Use Ana's Good Neighbor Agreement on that card.

*Actual:* The card shows "3/1" and Ben shows 0/7 left. The 2 surplus Capacity are lost at Lock unless the facilitator notices and decrements Ben's pledge (`86`).

*Fix:* When a discount is applied, clamp the pledges and refund the excess, then announce it.

**N8. Residual focus losses (M6).** In each case below, focus ends on `<body>`:
- **(a) Game end:** after "Record the collapse" or "Lay down the final ring" → debrief. The outcome ("Unraveling" / "Resilient") is not announced, and the live region still holds the system-response text.
- **(b) Council stepper:** pressing a Council "+" that becomes disabled because the leader's last Capacity was just spent.
- **(c) Game menu:** pressing A+ at 140%. The button becomes disabled and focus escapes the modal dialog.

#### Polish

1. The driver result reads "The table chose **A. Suppress every start .**" with a stray space before the period (`05`).
2. Toasts now cover the Council and Headline timer at the top right (`14`, `86`). This is p4 in a new place.
3. The live region joins two messages with no separator: "Saved …debrief-EDBGNF.mdSaved …game-EDBGNF.json".
4. The manual-copy textarea opens scrolled to the bottom. It should start at the top of the debrief.
5. "1 point(s) will move" should be "1 point will move".
6. The Library banner says "1 item differ"; it should be "differs".
7. Order Book is marked "ready" (the red ability-ready marker) when no wood-tagged strategy is in the market, so its dialog has every option disabled.
8. The resolver's "Tap a wedge…" hint box covers the Fire wedge badge (`09`).
9. The crisis-note icon wraps onto its own line under the Resilience index (`09`, `11`).
10. The compact legend truncates names ("Communiti…", "Recreati…") at 1366.
11. p1: the home hero tree still has dark outline arcs crossing the wedges (`24`, `93`).
12. The new About text uses straight quotes; the rest of the app uses curly quotes. The two sections sit before "This edition", the card sources and Credits, not "after credits" as `ABOUT-ADDITIONS.md` says.

**Design note (not a bug):** Protection blocks positive effects too. Maria's own "Utilities buy fire insurance upstream" (Water +1) was blocked by her own Source Water Protection. This matches the wording "Protect … from Signal effects", but the designer should confirm it is intended.
