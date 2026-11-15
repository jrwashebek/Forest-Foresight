# Forest Futures: balance report (sim v2, 2026-11-14)

## Method
`sim/` (Python, standard library only) implements SPEC §3, including all secondary and ability types.

Bots:
- **random**
- **selfish**: plays for its own mandate only
- **coop**: half own mandate, half shared outcome (weakest domains count most); pools Capacity as a coalition

**mixed** = 2 coop + 2 selfish + 1 random; **seatmix** = 40/40/20 per seat. Content is the team's (98 signals, 16 drivers, 5 scenarios) plus the edits in `balance-edits.md`. 4,000 games per 5-player row. Reproduce: `python3 -I sim/run.py --full`.

## Final rules (design.json)
- **Capacity.** Base 5 for 5 players; `capacityBaseByPlayers` {3:8, 4:7, 5:5, 6:4, 7:2}. Band modifiers per SPEC, minimum 1.
- **Outcome.** Resilient = index ≥ 6.0 and every domain ≥ 5 (`resilientFloor`). Holding = index ≥ 4.5 and no Crisis (`holdingFloor` 3). In Deep games the Resilient floor is 6 (`outcomeDeep`).
- **Cascades.** Chronic: Fire ≤ 3 → Water −1, Communities −1; Climate ≤ 3 → Health −1. Plus 6 Crisis cascades and 4 Thriving cascades that have side effects.
- **Strategies.** 35, costs 2–7, about 0.5 net points per Capacity, 12 trade-offs.
- **Mandates.** Tuned per role: targets 6–9, mostly 7–8; guardrail 4.
- **Unchanged from SPEC.** Hand 3, timers, collapse at 3 Crisis domains, Headline +2, market 5 (dealt fresh each Council). Far-era delayed effects do not mature.

**New keys the app must read:** `resilientFloor`, `holdingFloor`, `outcomeDeep`, `capacityBaseByPlayers`.

## Outcomes (%; Standard length unless noted)
| Table | Res | Hold | Unr (collapse) | Funded per era |
|---|---|---|---|---|
| 5p mixed | **35.2** | **46.3** | **18.5** (4.8) | 3.8/4.1/4.1 |
| 5p seatmix | 38.5 | 36.8 | 24.7 (8.1) | 3.8/4.0/3.9 |
| 5p coop | 93.7 | 6.2 | 0.1 | 4.2/4.6/4.1 |
| 5p selfish | 11.0 | 30.8 | 58.2 (17.7) | 3.3/3.3/2.8 |
| 5p random | 1.0 | 10.6 | 88.4 (57.7) | 3.0/2.4/1.9 |
| 4p / 6p seatmix | 35 / 43 | 39 / 35 | 27 / 22 | ~4.2 / 3.6 |
| 5p Deep seatmix | 41.4 | 39.3 | 19.3 | ~3.8 |

Individual winners: 72% of players at coop-only tables vs 17% at selfish-only. 3- and 7-player games are harsher (27–32% Unraveling).

## Mandate fulfilment, 5p mixed (%)
Forest Supervisor 31 · Fire Director 36 · Research 38 · State Forester 36 · State GNA 39 · Tribal NR 41 · County 37 · Water GM 38 · Mill 36 · Family Forests 35 · Conservation 37 · Recreation 34.

Every ability gets used in 42–98% of games.

## Starting levels for scenario writers
- Mean 4.0–4.5, every domain 3–6, with Fire and Climate at 3–4. Never start a domain at 2 or below.
- Keep Workforce and Policy & Funding at 3–4; each at Stable gives every player +1 Capacity.
- Results by scenario (Res/Hold/Unr): Today's Trajectory 22/49/29 (the hard one), Climate Whiplash 31/47/22, Lean Federal 31/49/20, States & Tribes 38/48/14, Restoration Economy 55/38/7.
- Restoration Economy is still easy even after its governance and climate starts dropped to 4, because its driver pool is optimistic. Use it as the intro scenario.

## After content fixes
v1 compensated for generous content with chronic cascades at ≤ 5, a Resilient floor of 6, capacity base 4 and mandates of mostly 9.

The content fixes:
- 19 same-sign secondaries are now trade-offs (26 of 51 same-sign, was 45)
- every domain's net valence is within ±3 (partners +10 → +3; health and communities −7 → −3)
- every Dilemma option nets 0
- Drivers average −1.1 (was −0.6)

Together they cut the bots' signal gain from +4.1 to +2.9 points per era. Under the v1 rules, mixed tables fell to 10.5% Resilient and 33.5% Unraveling.

I therefore relaxed back toward the SPEC values: thresholds 6.0/4.5, floor 5, chronic cascades at ≤ 3, base 5. I then re-tuned the mandates.

## Notes
1. Bots pick near-optimal cards and pool perfectly, so human tables will likely do worse. Set difficulty through the scenario.
2. After any further content edits, re-run `sim/run.py` and `sim/tune_mandates.py`.
