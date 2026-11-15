# Forest Futures content review: facts, currency, neutrality, copyright

*Independent review, 2026-11-14. I opened every source URL with WebFetch. WebSearch was unavailable.*

## Summary counts

| | Signals (98) | Drivers (16) | Total cards (114) |
|---|---|---|---|
| Verified, no change needed | 64 | 13 | **77** |
| Corrected (wording only) | 34 | 3 | **37** |
| Unverifiable (fetch failed) | 0 | 0 | **0** |
| Retired | 0 | 0 | **0** |

- Also corrected: 1 scenario summary (`scn-todays-trajectory`) and 1 strategy (`str-tribal-costewardship`).
- All 110 unique source URLs opened. The arXiv paper was rate-limited at first and read on retry. Every source date matched the card. The only discrepancy was one day on `sig-lumber-tariff-wall` (page metadata says 23 Feb, byline 24 Feb), which I left as is.
- No ids, domains, deltas, horizons or structure were changed. `merge.py` check: **0 errors, 0 warnings**. Backups of the pre-edit files are in `/tmp/review_backup/`.
- **Copyright:** I compared every card against the source passages I retrieved and found no run of 10 or more copied words. One near-paraphrase (`sig-burn-boss-backstop`) was reworded anyway.
- **Tone:** No partisan or mocking wording found in card, role-bio or strategy text. Strategies state both sides of each trade-off. A few judgement calls are listed in section C.

## A. Corrections applied

| id | Problem | Fix applied |
|---|---|---|
| sig-fuels-work-drops-a-third | The 4M→2.6M acre figures come from an outside analysis (Grassroots Wildland Firefighters/Redstone), not agency totals. They cover the Forest Service, not "federal" acres. | Credited to "an outside analysis" and changed to "Forest Service". |
| sig-burn-boss-backstop | Source says it is a *temporary self-insurance pool* created by state law, not a "liability program". The old wording was also close to the source's phrasing. | Now "a temporary, state-run self-insurance pool"; insurance clause paraphrased. |
| sig-boreal-fire-math | Source (USGS) reports results for Alaska only. The eightfold rise is in "parts of the Alaskan Arctic and western Alaska", not "the Arctic" or NW Canada. | Limited to Alaska; "parts of Alaska's Arctic and west". |
| sig-appropriators-hold-line | A budget request does not "cut" anything. The House bill is +2% (CRS: $8.79B vs $8.61B), not "flat". | "would cut"; "raised its total about 2%". |
| sig-fire-borrowing-comeback | $2.9B is the *combined* Forest Service + Interior amount (E&E). | Added "for the Forest Service and Interior". |
| sig-fix-our-forests-parked | Effect text said "community risk-reduction grants". Source describes a community wildfire risk-reduction *program* and does not mention grants. | Now "a new community wildfire risk-reduction program". |
| sig-utility-fire-shield | Source has insurers warning of homeowner cost shifts. The survivor it quotes opposes the limits but does not make that warning. | "insurers warn the costs shift to homeowners, and some fire survivors oppose the limits". |
| sig-for-sale-public-land | The cited source (WPR/KUNC) says the plan drew outrage and ran afoul of Senate rules. It does not call the backlash bipartisan (CBS does, but CBS is not this card's source). | "withdrawn amid public backlash and Senate rules problems". |
| sig-states-take-the-wheel | Used "co-management" for states. The term properly applies to Tribes with legal authority. | "shared management". |
| sig-drone-pilots-join-engine | The FAA waiver (late Oct 2026) allows flights *after* training, not training itself. "Swarms" is not in the source. | Rewritten: waiver "to fly AI-assisted firefighting drones once training ends". |
| sig-pest-edna-traps | Source never calls the traps "cheap". | "simple traps". |
| sig-assisted-migration | The researchers raise late failure as an open question to test, not a finding. Sites are being established, not already planted. | "is testing… including whether trees that look healthy early fail…". |
| sig-forests-to-faucets | The $27M was overall fire *recovery* spending, not specifically sediment cleanup (KSJD). | "spent over $27 million recovering from" the fires. |
| sig-ionized-clouds | Source describes ground-based systems, not "towers". | "ground-based systems". |
| sig-icvcm-forest-label | The label "will soon be applied" to more than 9M *eligible* credits. | Added "eligible". |
| sig-big-buyer-pause | Microsoft has not confirmed it will honor existing deals. The source only says they are expected to continue. | "while existing multi-year deals continue". |
| sig-canopy-maps-v2 | Meta's page does not say the R² figures are measured against lidar. | "raising accuracy (R-squared 0.53 to 0.86)". |
| sig-jet-fuel-woodpile | Fastmarkets says gasification-FT has a *clearer near-term* route. It does not call it the single clearest route. | "Gasification looks nearest to market". |
| sig-pulpwood-long-goodbye | The UGA study measures projected timberland *returns* (land expectation value), not land market values. | "projected returns on pine plantations fall 13-34%". |
| sig-mind-the-workforce-gap | **Out of date:** said the agency "is now relocating" HQ. A federal judge halted the reorganization on Oct 13, 2026, and that order is under appeal (AP/KTAR, Oct 22, which I opened). | "as it planned to move… a plan a court has since paused." Source unchanged (KUOW still supports the 16% figure). |
| sig-think-locally-act-locally | **Out of date:** "USDA is moving…". Same court pause. | "USDA announced plans to…; a court has since paused the plan." The pause comes from AP/KTAR (Oct 22). |
| drv-regions-to-states | **Out of date:** "is closing all nine regional offices" (same court pause). This is a high-visibility "now" driver. | "USDA plans to close… A federal judge paused the plan in October, a ruling now under appeal." The pause comes from AP/KTAR (Oct 22). Removed the one-sided "critics warn" clause, since the card no longer carries USDA's rationale either. |
| sig-housing-the-public-on-public-lands | The source does not say the localities bill is "pending". | Named it: "a separate bill, the HOUSES Act, would let localities…". |
| sig-no-snow-for-old-skiers | PNAS found that *mid-March low snowpack* was 4.4× as likely. The study's figure is not for the whole "snow drought". | "made the West's low mid-March 2026 snowpack 4.4 times as likely". |
| sig-what-could-possibly-go-wrong | **Date error:** the Sept 3, 2026 (Thursday) article says the hikers got stuck Sunday and were rescued Monday, which is Aug 30–31. | "In late August 2026". |
| sig-reality-bites | It is a systematic review of 24 studies. Its only meta-analysis pooled 3 studies. VR showed "no significant differences" from flat-screen nature. | "A 2025 review…"; "generally did no better than flat-screen nature". |
| sig-were-scientists-here-to-help | Pew gives no 2023 figure for scientists, so "steady since 2023" is unsupported. It reports 76% in 2025. | "about the same as a year earlier". |
| sig-public-land-good-for-business | Presented the White House fact sheet's description of land uses as fact. | Attributed: "the White House says this reopens land to…". |
| sig-paperwork-stalls-partners | The source reports stalled or returned funds only for a Wyoming group (Friends of the Bridger-Teton). The Montana groups it mentions report no funding stall. | "A Wyoming friends group says…". |
| sig-grand-ronde-siuslaw | "Pledging" overstates a council member's spoken assurance. Also said "about 18,628", an exact figure. | "say they would manage it actively and keep it open to the public"; dropped "about". |
| sig-cwdg-strings | The suit was filed by 20 states *and D.C.* (NPR). | Added "and D.C.". |
| sig-srs-cliff-again | SRS also pays BLM O&C counties. Source says ">700 counties". | "to over 700 counties". |
| sig-zone-zero | "Not yet in force" was true only as of Sept 9. Office of Administrative Law (OAL) approval may have come since, and I could not confirm it. | Time-stamped: "as of September they awaited state review". |
| sig-climate-migration | "Nearly 15%" was ambiguous. It is 15% of the US population (flood risk). | "nearly 15% of the population within 30 years". |
| sig-sharing-the-sacred-summit | "Lakota interpretation" is too narrow. The signatories include Ihanktonwan (Yankton) Dakota as well as Lakota Tribes of the Great Sioux Nation. | "Visitors learn from Tribal interpreters and stewards…". |
| drv-lean-years | "Ends most research and state and Tribal forestry grants" is imprecise. Daily Montanan: the research and State, Private and Tribal Forestry lines ($620M) are zeroed out completely. | "zeroes out its research and State, Private and Tribal Forestry lines". |
| drv-mass-timber-surge | Source counts more than 2,500 projects "in the country" without naming a region, so "North American" is unsupported. | Dropped "North American"; "by the end of 2025". |
| scn-todays-trajectory | "Far smaller" was loaded and "mid-reorganization" is out of date (court pause). | "about one-sixth smaller after 2025 departures, a court-paused reorganization". |
| str-tribal-costewardship | Said co-stewardship agreements give Tribes "co-management roles". That mixes up the terms: co-management applies only where Tribes hold legal or treaty authority. | "lasting stewardship roles, co-management where law allows". |

## B. Currency notes (checked, no edit needed)

| id | Note |
|---|---|
| drv-record-fire-year | The Sept 5 figure (8.3M acres) is labelled with its date, so it is still accurate. By Oct 16, about 9M acres had burned, Oregon had a record 2.4M, and 20 firefighters had died (KUNC). Could be updated if the designers want the latest figure. |
| sig-fix-our-forests-parked, drv-firesheds-fast-lane | Deseret News (Nov 13, 2026) confirms the bill is still on the Senate calendar. It says nothing on the NDAA and reports that a state leader expects it to be a low priority in the new Congress. |
| sig-lumber-tariff-wall | 35% + 10% matches CFJC (July 22, 2026): "on average… 45 per cent". Notes-r2 warned the rates might change, but I found no change on any page I opened. |
| sig-appropriators-hold-line | The Dec 11 stopgap end date is still ahead. Recheck after Dec 11. |
| sig-roadless-rule-hits-road | Still a proposal as of the source. I opened no newer page. |
| sig-pack-the-lab-or-quit | Court halt and appeal confirmed (AP, Oct 22). |
| scn-climate-whiplash | "Record-strength El Niño" and ">1.5°C" are confirmed by Copernicus (Nov 5, 2026): Niño 3.4 reached an all-time high of 3.21°C, and 2026 is "virtually certain" to exceed 1.5°C. The older Carbon Brief piece (Apr 2026) said only "strong". |

## C. Flags outside the editable fields, or judgement calls (not changed)

| id / field | Issue | Recommendation |
|---|---|---|
| baselineJustification.recreation | "Only 19% of trails met standard" (credited to WyoFile) is not in the WTA source or the briefs, so I could not verify it. | Verify or remove. This field was not in my edit scope. |
| baselineJustification.health | "FIA sites face closure", the Emerald ash borer (EAB) Texas detection, and the Vermont FPR claim were not checked: Fox 4 and Vermont FPR were not opened. Sudden oak death in Minnesota and the research-site closures are confirmed. | Verify the Fox 4 and Vermont sources. |
| baselineJustification.wood / .workforce | "Mills closing in the South and Northeast" (F&W) and "~9,700 firefighters by March" (HPPR) were not opened. Both match the context brief. OPB reports 11,550 by June. | Consider citing the June figure. |
| baselineJustification.communities | "Hundreds of structures" is confirmed by KUNC (Oct 16), not by Newsweek (which gives no count). | Fix the citation. |
| role-tribal-nr-director future.holding | "Treaty Rights Negotiator, Round Twelve" could read as flippant about treaty obligations. | Consider "Treaty Rights Steward, Still at the Table" or similar. |
| sig-public-land-good-for-business | Only source is the White House fact sheet. No Tribal or critic perspective, although Bears Ears was proposed by an inter-Tribal coalition. | Add a balancing source when search is available. |
| drv-policy-pendulum | Source (farmdoc daily) is policy commentary with a viewpoint. The driver text itself is neutral. | Consider a neutral news source. |
| sig-housing-the-public-on-public-lands | The source headline (GearJunkie) is pointed about a named senator. The card text is neutral. | Acceptable as cited. CBS/AP (opened) is a more neutral alternative. |
| Duplicates (balance) | `sig-smoke-gets-in-our-lungs` and `sig-smoke-2050` use the same Nature study. `sig-states-take-the-wheel` and `sig-good-neighbor-540` use the same 540-GNA statistic. Three cards cover the 2025 land-sale episode. | Designers may want to differentiate them. Not a factual error. |
| sig-chestnut-deregulated | Notes-r2 says EPA review and opposition remain. The APHIS page does not mention this, so it is unverified. | Add if a source confirms it. |
