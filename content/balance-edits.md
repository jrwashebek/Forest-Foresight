# Balance edits to team content (2026-11-14)

Balance edits by the game designer after simulation (see balance-report.md). Sources, signal text, primary domains and `reviewed` dates are unchanged. Format: id: before → after.

Signals: 19 same-sign secondaries turned into trade-offs (26/51 fixed secondaries are now same-sign, was 45/51), 2 secondaries re-targeted for valence, 5 primary deltas nudged by 1.

Per-domain net (primary + fixed secondary): fire +1→-1, health -7→-3, water -2→+0, climate +0→-1, wood +4→+3, communities -7→-3, recreation -3→-3, workforce -2→-3, governance -2→-3, partners +10→+3

## Signals
- `sig-ten-am-rule-returns` (signals-r1.json, trade-off): secondary health -1 → communities +1; text "Fire-adapted forests lose the low-severity fire that keeps them open, diverse and resilient." → "In the short run, fewer fires reach towns and managed-fire smoke days drop, even as fuels build."
- `sig-burn-boss-backstop` (signals-r1.json, trade-off): secondary partners +1 → governance -1; text "Ranchers, family forest owners and burn associations become everyday partners in fuels work." → "The state now carries the claims risk, so one escaped burn could land on taxpayers and lawmakers."
- `sig-smoke-gets-in-our-lungs` (signals-r1.json, trade-off): secondary communities -1 → governance +1; text "Hospital visits and lost school and work days climb in distant cities and rural towns alike." → "Mounting health costs give fire and air agencies a shared case for prescribed-fire and smoke-readiness funding."
- `sig-for-sale-public-land` (signals-r1.json, trade-off): secondary recreation -1 → communities +1; text "Hunters, anglers and hikers lose familiar public ground near growing towns." → "Sold parcels could open land for housing near crowded towns, the benefit sale backers point to."
- `sig-states-take-the-wheel` (signals-r1.json, trade-off): secondary partners +1 → workforce -1; text "Shared stewardship becomes the default operating model, not a pilot." → "State, county and Tribal staff stretch thin running work on land they do not own."
- `sig-raise-refilled-crews` (signals-r1.json, trade-off): secondary fire +1 → governance -1; text "Fully staffed crews hold more fires at initial attack." → "Permanent raises add a recurring cost that squeezes other programs when budgets stay flat."
- `sig-pack-the-lab-or-quit` (signals-r1.json, trade-off): secondary climate -1 → governance +1; text "Long-term plots and inventory data lapse, weakening carbon and forest-change monitoring." → "USDA projects lower overhead; if the savings hold, some dollars could shift toward field work."
- `sig-nm-tree-deaths-tripled` (signals-r2.json, trade-off): secondary fire -1 → wood +1; text "Standing dead conifers add fuel and complicate firefighter safety for years." → "Salvage and biomass buyers get a pulse of dead timber where mills are close enough."
- `sig-nm-reforestation-center` (signals-r2.json, trade-off): secondary partners +1 → governance -1; text "State, university, federal and NGO partners share seed, science and planting capacity." → "Hardened, climate-matched seedlings cost more, so planting budgets cover fewer acres each year."
- `sig-nm-reforestation-center` (signals-r2.json, valence): primary health +1 → +2
- `sig-southern-pine-beetle-north` (signals-r2.json, valence): primary health -2 → -1
- `sig-shrubland-conversion` (signals-r2.json, trade-off): secondary water -1 → water +1; text "Without forest shade, snow melts earlier and supplies arrive sooner and shorter." → "With fewer trees drawing water, burned basins can yield more runoff for a time, though it arrives earlier."
- `sig-klamath-salmon-return` (signals-r2.json, trade-off): secondary partners +1 → climate -1; text "A Tribally led effort shows co-stewardship can deliver landscape-scale restoration." → "Removing the dams also ended a source of carbon-free hydropower for the region."
- `sig-california-cap-and-invest` (signals-r2.json, trade-off): secondary partners +1 → wood -1; text "Private and Tribal forest owners keep a long-term buyer for verified carbon." → "Forest offset projects pay owners to grow more and harvest later, trimming near-term log supply."
- `sig-canada-sink-flipped` (signals-r2.json, trade-off): secondary wood -1 → wood +1; text "Fire losses shrink harvestable supply and raise forest management costs." → "Shrinking Canadian supply lifts prices for U.S. mills and landowners, even as fire risk grows."
- `sig-mass-timber-data-centers` (signals-r2.json, trade-off): secondary climate +1 → water -1; text "Wood in place of steel and concrete stores carbon and trims embodied emissions." → "The data centers inside these buildings draw heavily on local water and power."
- `sig-pulpwood-long-goodbye` (signals-r2.json, trade-off): secondary partners -1 → climate +1; text "Family forest owners lose income and may sell or convert land." → "Owners who stop thinning may hold trees longer, storing more carbon for now."
- `sig-wood-hits-the-gym` (signals-r2.json, valence): primary wood +2 → +1
- `sig-divided-and-conquered` (signals-r3.json, trade-off): secondary water -1 → communities +1; text "More parcels and driveways fragment headwaters and complicate water-quality protection." → "Some land that changes hands becomes homes and tax base near growing towns."
- `sig-cow-creek-costewardship` (signals-r3.json, valence): secondary fire +1 → health +1; text "Coordinated fuel reduction near communities and cultural sites lowers wildfire risk across ownership lines." → "Thinning and cultural burning restore open, diverse stands across ownership lines."
- `sig-cow-creek-costewardship` (signals-r3.json, valence): primary partners +2 → +1
- `sig-good-neighbor-540` (signals-r3.json, trade-off): secondary wood +1 → recreation -1; text "Partner-run sales add steadier volume for regional mills." → "Revenue-producing timber work can crowd trail and recreation projects off partner work lists."
- `sig-paperwork-stalls-partners` (signals-r3.json, valence): primary partners -1 → -2
- `sig-family-forest-carbon` (signals-r3.json, trade-off): secondary climate +1 → wood -1; text "Improved management on family lands adds verified carbon storage." → "Enrolled owners defer or lighten harvests, so local mills see less wood for a while."
- `sig-zone-zero` (signals-r3.json, trade-off): secondary fire +1 → workforce -1; text "Fewer homes ignite, so crews can focus on the fire rather than structure triage." → "Inspections and enforcement fall to local fire agencies that are already short of staff."
- `sig-sharing-the-sacred-summit` (signals-r3.json, valence): secondary partners +1 → workforce +1; text "Co-stewardship moves Tribes from consultation toward shared decisions from the start." → "Tribal hiring brings new rangers and interpreters with deep knowledge of the place."

## Drivers and dilemmas (every option now nets 0)
- `drv-one-fire-service` option "Back one fire service": fire +1, governance +1, health -1 → fire +1, health -1
- `drv-one-fire-service` option "Keep fire with forests": health +1, wood +1, governance -1 → health +1, governance -1
- `drv-one-fire-service` option "Joint command, no merger": fire +1, partners +1, workforce -1 → fire +1, workforce -1
- `drv-regions-to-states` effects: workforce -1, partners +1, governance -1 → workforce -2, partners +1, governance -1
- `drv-regions-to-states` option "One shared state plan": partners +2, governance -1 → partners +1, governance -1
- `drv-regions-to-states` option "National rules first": governance +1, health +1, partners -1 → governance +1, partners -1
- `drv-regions-to-states` option "Delegate via Good Neighbor": wood +1, workforce +1, health -1 → workforce +1, health -1
- `drv-lean-years` option "Fire readiness first": fire +1, communities +1, recreation -1 → fire +1, communities +1, recreation -2
- `drv-lean-years` option "Keep partners whole": partners +2, fire -1 → partners +1, fire -1
- `drv-lean-years` option "Fees up, sites down": workforce +1, governance +1, recreation -1 → workforce +1, governance +1, recreation -2
- `drv-record-fire-year` option "Suppress every start": communities +1, recreation +1, fire -1 → communities +1, fire -1
- `drv-record-fire-year` option "Reopen the burn window": fire +2, communities -1 → fire +2, communities -1, recreation -1
- `drv-record-fire-year` option "Thin, don't burn": fire +1, wood +1, health -1 → fire +1, health -1
- `drv-timber-push` effects: wood +2, workforce -1 → wood +2, workforce -1, health -1
- `drv-timber-push` option "Chase volume near mills": wood +1, communities +1, fire -1 → wood +1, communities +1, fire -2
- `drv-timber-push` option "Fuels-first sale design": fire +1, health +1, wood -1 → fire +1, health +1, wood -2
- `drv-timber-push` option "Stewardship bundles": partners +1, wood +1, workforce -1 → partners +1, workforce -1
- `drv-firesheds-fast-lane` effects: fire +1, governance +1, partners -1 → fire +1, governance +1, partners -2
- `drv-firesheds-fast-lane` option "Use it to the max": fire +2, partners -1 → fire +2, partners -2
- `drv-firesheds-fast-lane` option "Speed with consent": fire +1, partners +1, workforce -1 → partners +1, workforce -1
- `drv-firesheds-fast-lane` option "Pilot and monitor": health +1, governance +1, fire -1 → governance +1, fire -1
- `drv-policy-pendulum` effects: governance +1, workforce -1 → governance +1, workforce -1, partners -1
- `drv-policy-pendulum` option "Restore what was lost": workforce +2, governance -1 → workforce +2, governance -1, partners -1
- `drv-policy-pendulum` option "Keep what works, fund it": governance +1, partners +1, workforce -1 → governance +1, workforce -1
- `drv-policy-pendulum` option "Lock it into law": governance +2, fire -1 → governance +2, fire -1, workforce -1
- `drv-insurance-retreat` option "Harden homes, certify towns": communities +2, fire -1 → communities +1, fire -1
- `drv-insurance-retreat` option "Treat the landscape": fire +1, communities +1, health -1 → fire +1, health -1
- `drv-insurance-retreat` option "Limit risky building": fire +1, governance +1, communities -1 → fire +1, governance +1, communities -2
- `drv-mass-timber-surge` effects: wood +2, climate +1 → wood +2, climate +1, workforce -1
- `drv-mass-timber-surge` option "Guarantee the supply": wood +1, communities +1, health -1 → wood +1, communities +1, health -2
- `drv-mass-timber-surge` option "Restoration wood only": fire +1, health +1, wood -1 → fire +1, health +1, wood -2
- `drv-mass-timber-surge` option "Let private lands supply": partners +1, climate +1, governance -1 → partners +1, governance -1
- `drv-carbon-boom` effects: climate +2, partners +1, wood -1 → climate +2, partners +1, wood -2
- `drv-carbon-boom` option "Sign the long contracts": climate +2, governance +1, wood -2 → climate +2, wood -2; text "Enroll forests in decades-long carbon contracts that fund staff and restoration." → "Enroll forests in decades-long carbon contracts that pay well but lock in deferred harvest."
- `drv-carbon-boom` option "Credit active care only": climate +1, fire +1, governance -1 → climate +1, fire +1, governance -2
- `drv-carbon-boom` option "Keep forests flexible": wood +1, fire +1, climate -1 → wood +1, climate -1
- `drv-river-runs-short` option "Follow the water money": water +1, partners +1, fire -1 → water +1, fire -1
- `drv-river-runs-short` option "Pool it, treat by risk": fire +1, communities +1, partners -1 → fire +1, partners -1
- `drv-river-runs-short` option "Manage for snow, flow": water +1, health +1, workforce -1 → water +1, workforce -1
- `drv-fire-years` option "Year-round federal force": fire +2, workforce +1, governance -2 → fire +1, workforce +1, governance -2
- `drv-fire-years` option "Community fire networks": partners +2, workforce -1 → partners +1, workforce -1
- `drv-fire-years` option "Let remote fires work": fire +1, health +1, recreation -1 → fire +1, health +1, recreation -2
- `drv-pathogen-arrives` option "Contain at all costs": health +2, wood -1 → health +2, wood -2
- `drv-pathogen-arrives` option "Breed resistant trees": health +1, workforce +1, partners -1 → health +1, partners -1
- `drv-pathogen-arrives` option "Salvage and diversify": wood +1, climate +1, health -1 → wood +1, climate +1, health -2
- `drv-algorithmic-forest` effects: fire +1, workforce +1 → fire +1, workforce +1, governance -1
- `drv-algorithmic-forest` option "Let the model dispatch": fire +2, partners -1 → fire +2, partners -1, workforce -1
- `drv-algorithmic-forest` option "Humans make the call": fire +1, workforce +1, governance -1 → workforce +1, governance -1
- `drv-algorithmic-forest` option "Open the data commons": partners +1, communities +1, governance -1 → partners +1, communities +1, governance -2
- `drv-tribal-co-management` option "Transfer lead authority": partners +2, governance -1 → partners +2, governance -1, workforce -1
- `drv-tribal-co-management` option "Joint boards, shared budgets": partners +1, fire +1, workforce -1 → partners +1, fire +1, workforce -2
- `drv-tribal-co-management` option "Grow agreements gradually": governance +1, partners +1, fire -1 → partners +1, fire -1
- `drv-hand-it-to-states` effects: governance -1, partners +1, recreation -1 → governance -2, partners +1, recreation -1
- `drv-hand-it-to-states` option "Accept, with federal funding": partners +1, wood +1, workforce -1 → partners +1, workforce -1
- `drv-hand-it-to-states` option "Decline, stay a partner": recreation +1, governance +1, partners -1 → governance +1, partners -1
- `drv-hand-it-to-states` option "Accept, allow some sales": communities +2, governance +1, recreation -2 → communities +1, governance +1, recreation -2

## Scenarios
- `scn-restoration-economy` start governance: 6 → 4
- `scn-restoration-economy` start climate: 5 → 4
