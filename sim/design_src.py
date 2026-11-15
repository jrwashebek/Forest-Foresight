#!/usr/bin/env python3
"""Single source of truth for Forest Futures design content (roles, strategies, cascades, rules, prompts).

Running this file writes ../content/design.json. The simulator imports build() so tuning
experiments can override numbers without hand-editing JSON.

    python3 -I design_src.py            # write content/design.json
"""
import json, os, copy

REVIEWED = "2026-11-14"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "content", "design.json"))

# ---------------------------------------------------------------- tuning knobs
# Mandate thresholds by target position (1st, 2nd, 3rd) and guardrail.
# Final tuned values (see balance-report.md). Per-role overrides in ROLE_TIER_OVERRIDES.
TIERS = {"t": [8, 7, 6], "g": 4}   # starting tiers; final per-role values below
ROLE_TIER_OVERRIDES = {"role-forest-supervisor": {"A": {"t": [8, 8, 8], "g": 4}, "B": {"t": [7, 7, 6], "g": 4}}, "role-fire-director": {"A": {"t": [8, 7, 7], "g": 4}, "B": {"t": [7, 7, 6], "g": 4}}, "role-research-director": {"A": {"t": [8, 7, 7], "g": 4}, "B": {"t": [8, 7, 6], "g": 4}}, "role-state-forester": {"A": {"t": [9, 7, 9], "g": 4}, "B": {"t": [8, 8, 7], "g": 4}}, "role-state-gna-lead": {"A": {"t": [8, 8, 7], "g": 4}, "B": {"t": [8, 7, 8], "g": 4}}, "role-tribal-nr-director": {"A": {"t": [9, 9, 8], "g": 4}, "B": {"t": [9, 8, 7], "g": 4}}, "role-county-commissioner": {"A": {"t": [9, 8, 6], "g": 4}, "B": {"t": [8, 7, 6], "g": 4}}, "role-water-utility-gm": {"A": {"t": [8, 8, 7], "g": 4}, "B": {"t": [8, 7, 7], "g": 4}}, "role-mill-executive": {"A": {"t": [8, 7, 8], "g": 4}, "B": {"t": [8, 7, 6], "g": 4}}, "role-family-forest-leader": {"A": {"t": [8, 8, 8], "g": 4}, "B": {"t": [8, 8, 6], "g": 4}}, "role-conservation-director": {"A": {"t": [8, 8, 7], "g": 4}, "B": {"t": [8, 7, 7], "g": 4}}, "role-recreation-coalition": {"A": {"t": [8, 7, 6], "g": 4}, "B": {"t": [8, 7, 6], "g": 4}}}
# e.g. {"role-water-utility": {"A": {"t": [7,6,5], "g": 4}}}

RULES = {
    "handSize": 3,
    "capacityBase": 5,
    "capacityBaseByPlayers": {"3": 8, "4": 7, "5": 5, "6": 4, "7": 2},
    "capacityModifiers": {"Crisis": -2, "Strained": -1, "Stable": 0, "Thriving": 1, "Transformed": 1},
    "capacityMin": 1,
    "councilSeconds": 300,
    "headlineSeconds": 120,
    "collapseCrisisCount": 3,
    "outcome": {"resilient": 6.0, "resilientFloor": 5, "holding": 4.5, "holdingFloor": 3},
    "outcomeDeep": {"resilientFloor": 6},
    "headlineInfluence": 2,
    "marketSize": 5,
    "marketRefresh": "fresh",          # new 5 each Council; unfunded return to the deck
    "farDelayed": "legacy",            # delayed effects bought in the Far era do not mature in play
    "cascadeMode": "simultaneous",     # all cascades read the same snapshot, fire once per era
    "signalRounds": {"standard": 1, "deep": 2},
}

# ---------------------------------------------------------------- roles
# mandate spec: (variant, [d1, d2, d3], guardrail, why)
ROLES = [
    dict(id="role-forest-supervisor", title="Forest Supervisor", org="USDA Forest Service — a national forest",
         sector="federal",
         bio=("Line officer for a national forest of a million-plus acres, balancing timber, fire, water, recreation, "
              "grazing, and Tribal consultation under federal law, with a thinner staff and more acres burning each decade."),
         mandates=[("A", ["health", "wood", "water"], "recreation",
                    "Restoration at scale: heal the landscape, keep the work paying for itself, and protect downstream water, without closing the forest to the public."),
                   ("B", ["recreation", "governance", "water"], "workforce",
                    "Multiple use and public trust: a forest people visit, Congress funds, and downstream users rely on.")],
         ability=dict(name="Line Officer's Decision",
                      text="Once per game: you sign the decision memo. Decide one Dilemma outright, overriding the vote.",
                      effect={"type": "decide"}),
         future=dict(resilient="Chief Biocultural Landscape Officer",
                     holding="Forest Supervisor, Still Answering Every Phone",
                     unraveling="Acting Supervisor of Everything")),

    dict(id="role-fire-director", title="Federal Wildland Fire Director",
         org="Federal wildland fire program (Forest Service or a consolidated federal fire service)",
         sector="federal",
         bio=("Leads federal wildland fire for a region: suppression, fuels, prescribed fire, aviation, and crews. "
              "Whether the program stays in the Forest Service or moves to a unified federal fire agency, the job is safe, effective fire on the land."),
         mandates=[("A", ["fire", "workforce", "communities"], "governance",
                    "Fire-adapted landscapes: fewer destructive fires, a seasoned workforce, and communities ready for the smoke and flames that will still come."),
                   ("B", ["workforce", "governance", "fire"], "recreation",
                    "A durable fire organization: stable funding and a career workforce, whatever the org chart says, without losing public trust.")],
         ability=dict(name="Stop the Spread",
                      text="Once per game: initial attack holds. Cancel one negative effect from a System Response cascade as it happens.",
                      effect={"type": "cancel", "scope": "cascade"}),
         future=dict(resilient="Good Fire Commissioner",
                     holding="Year-Round Fire Season Manager",
                     unraveling="Director of Perpetual Megafire Response")),

    dict(id="role-research-director", title="Forest Service Research Station Director",
         org="USDA Forest Service Research & Development",
         sector="federal",
         bio=("Directs a research station's scientists, experimental forests, and inventory data. Turns science into "
              "tools managers actually use, while protecting decades-long monitoring records through budget swings and reorganizations."),
         mandates=[("A", ["climate", "health", "workforce"], "water",
                    "Adaptation science: understand what climate is doing to forests and keep the people and data to act on it."),
                   ("B", ["workforce", "partners", "climate"], "governance",
                    "Science to practice: research embedded with managers, Tribes, and universities, and funded long enough to matter.")],
         ability=dict(name="Horizon Scan",
                      text="Once per game: discard your hand and draw three Signals from the Far horizon.",
                      effect={"type": "redraw", "horizon": "far"}),
         future=dict(resilient="Chief Futures Scientist",
                     holding="Long-Term Plot Defender",
                     unraveling="Archivist of Abandoned Experiments")),

    dict(id="role-state-forester", title="State Forester", org="State forestry agency",
         sector="state",
         bio=("Runs the state forestry agency: fire on state and private land, service forestry for family landowners, "
              "urban forests, and trust lands. Partners with the Forest Service through Shared Stewardship and answers to a governor and legislature."),
         mandates=[("A", ["partners", "fire", "wood"], "communities",
                    "Shared stewardship: one plan across ownerships, fewer catastrophic fires, and a forest economy that pays for the work."),
                   ("B", ["communities", "health", "governance"], "wood",
                    "Keep forests as forests: healthy woods, safe communities, and steady state authority and funding for both.")],
         ability=dict(name="Forest Action Plan",
                      text="Once per game: bring new options to the table. Replace up to two strategies in the Council market.",
                      effect={"type": "refresh-market", "count": 2}),
         future=dict(resilient="Landscape Resilience Commissioner",
                     holding="State Forester, Double Duty",
                     unraveling="Emergency Salvage Coordinator")),

    dict(id="role-state-gna-lead", title="State Fire & Good Neighbor Program Manager",
         org="State forestry agency — fire and cross-boundary programs",
         sector="state",
         bio=("Manages Good Neighbor agreements and cross-boundary fire programs, putting state crews, contractors, and "
              "sale staff to work on federal land and reinvesting receipts in the next restoration project."),
         mandates=[("A", ["fire", "partners", "workforce"], "health",
                    "Cross-boundary work: crews and agreements that treat whole firesheds, not just one ownership at a time."),
                   ("B", ["wood", "workforce", "partners"], "climate",
                    "A Good Neighbor economy: timber receipts and local contractors fund more restoration, without trading away carbon.")],
         ability=dict(name="Good Neighbor Agreement",
                      text="Once per game: shared crews and receipts cut the cost of one Partnership-tagged strategy by 2.",
                      effect={"type": "discount", "amount": 2, "tag": "partners"}),
         future=dict(resilient="All-Lands Restoration Ambassador",
                     holding="Master of Forty Agreements",
                     unraveling="Mutual-Aid Dispatcher, 24/7")),

    dict(id="role-tribal-nr-director", title="Tribal Natural Resources Director",
         org="Natural resources department of a sovereign Tribal Nation",
         sector="tribal",
         bio=("Leads natural resources for a sovereign Tribal Nation: forestry, fisheries, cultural fire, first foods, and "
              "treaty-reserved rights. Negotiates co-stewardship with federal and state agencies government-to-government, grounded in Indigenous knowledge."),
         mandates=[("A", ["partners", "fire", "health"], "water",
                    "Cultural fire and co-stewardship: Tribal authority on the ground and good fire returned to the land."),
                   ("B", ["health", "water", "climate"], "partners",
                    "Homelands and first foods: healthy forests, clean water, and a stable climate for the generations to come.")],
         ability=dict(name="Cultural Fire Knowledge",
                      text="Once per game: practitioners bring generations of knowledge. +2 to Fire & Fuels, Forest Health, or Partnerships.",
                      effect={"type": "boost", "delta": 2, "choices": ["fire", "health", "partners"]}),
         future=dict(resilient="Co-Steward of the Homelands",
                     holding="Treaty Rights Negotiator, Round Twelve",
                     unraveling="Homelands Recovery Director")),

    dict(id="role-county-commissioner", title="County Commissioner",
         org="Board of Commissioners of a forest-dependent county",
         sector="local",
         bio=("Elected commissioner of a rural county that is mostly federal land. Balances road, school, and emergency "
              "budgets tied to timber receipts and federal payments, and lives with the results of every fire season and mill decision."),
         mandates=[("A", ["wood", "communities", "recreation"], "fire",
                    "A working rural economy: mill jobs, visitors, and a tax base that keeps schools and roads open."),
                   ("B", ["communities", "fire", "governance"], "recreation",
                    "A safe, fire-adapted county: hardened homes, evacuation routes, and reliable federal and state partners to pay for them.")],
         ability=dict(name="Field Hearing",
                      text="Once per game: the county brings the delegation to town. Cancel one negative effect of an Era Driver as it happens.",
                      effect={"type": "cancel", "scope": "driver"}),
         future=dict(resilient="Mayor of a Fire-Adapted Boomtown",
                     holding="Commissioner of Patchwork Budgets",
                     unraveling="Last Commissioner Standing")),

    dict(id="role-water-utility-gm", title="Water Utility General Manager", org="Regional municipal water utility",
         sector="local",
         bio=("Runs a water utility serving several hundred thousand people whose drinking water begins on national forest land. "
              "Treats post-fire sediment and shrinking snowpack as ratepayer costs, and invests upstream through watershed partnerships."),
         mandates=[("A", ["water", "fire", "communities"], "health",
                    "Source-water security: fewer fires in the watershed and reservoirs that do not fill with ash."),
                   ("B", ["water", "climate", "partners"], "governance",
                    "Watershed investment: ratepayer dollars and partners restoring the upper basin as snowpack shifts.")],
         ability=dict(name="Source Water Protection",
                      text="Once per game: the utility stands guard. Protect Water, Forest Health, or Fire & Fuels from Signal effects until the era ends.",
                      effect={"type": "protect", "choices": ["water", "health", "fire"]}),
         future=dict(resilient="Watershed Dividend Banker",
                     holding="Reservoir Sediment Manager",
                     unraveling="Bottled-Water Logistics Chief")),

    dict(id="role-mill-executive", title="Mill & Mass Timber Executive",
         org="Family-owned sawmill and mass timber manufacturer",
         sector="private",
         bio=("Operates a family sawmill and a new cross-laminated timber plant. Needs predictable log supply, including "
              "small-diameter restoration wood, skilled workers, and building codes and buyers that favor wood."),
         mandates=[("A", ["wood", "climate", "communities"], "workforce",
                    "Mass timber growth: restoration wood becomes buildings that store carbon and keep a mill town working."),
                   ("B", ["wood", "workforce", "governance"], "fire",
                    "Supply certainty: steady federal and state volume, a trained workforce, and a mill that survives the next fire.")],
         ability=dict(name="Order Book",
                      text="Once per game: a signed purchase order de-risks the deal. Reduce the cost of one Wood-tagged strategy by 2.",
                      effect={"type": "discount", "amount": 2, "tag": "wood"}),
         future=dict(resilient="Mass Timber Skyline Builder",
                     holding="Mill Manager, One Shift",
                     unraveling="Equipment Auctioneer")),

    dict(id="role-family-forest-leader", title="Family Forest Owners Association President",
         org="Statewide family forest owners association",
         sector="private",
         bio=("Volunteer president of an association of family woodland owners — retirees, ranchers, heirs — who together "
              "own much of the state's forest. Champions technical help, fair markets, fire safety, and keeping land in the family."),
         mandates=[("A", ["wood", "climate", "partners"], "health",
                    "Markets for working woodlands: timber and carbon income that make it worth keeping the land as forest."),
                   ("B", ["communities", "fire", "recreation"], "water",
                    "Fire-safe family forests: woodlots the family still enjoys, and neighbors protected when fire comes over the ridge.")],
         ability=dict(name="Ground Truth",
                      text="Once per game: landowners on the ground say 'not here.' Cancel one negative effect of a Signal as it is played.",
                      effect={"type": "cancel", "scope": "signal"}),
         future=dict(resilient="Chair, Cedar & Carbon Cooperative",
                     holding="Weekend Woodlot Warrior",
                     unraveling="Reluctant Subdivision Seller")),

    dict(id="role-conservation-director", title="Conservation Alliance Director",
         org="Regional conservation alliance (NGO coalition)",
         sector="ngo",
         bio=("Leads a coalition of conservation groups focused on old forests, wildlife, and climate refugia. Has sued "
              "agencies and signed collaborative agreements with them, sometimes the same year, and brings philanthropy and scientists to the table."),
         mandates=[("A", ["climate", "health", "water"], "partners",
                    "Climate refugia: intact, connected forests that store carbon and shelter species, built through collaboration rather than litigation."),
                   ("B", ["partners", "recreation", "health"], "climate",
                    "Collaboration over conflict: a broad public that loves these forests and partners who restore them together.")],
         ability=dict(name="Philanthropic Match",
                      text="Once per game: a foundation matches the table. Gain 2 extra Capacity in this era's Council.",
                      effect={"type": "capacity", "amount": 2}),
         future=dict(resilient="Future Generations Trustee",
                     holding="Professional Litigation Avoider",
                     unraveling="Refugia Cartographer")),

    dict(id="role-recreation-coalition", title="Outdoor Recreation Coalition Director",
         org="Coalition of outfitters, user groups, and gateway businesses",
         sector="ngo",
         bio=("Speaks for outfitters, trail groups, gateway-town businesses, and millions of visitors. Pushes for maintained "
              "trails, fair access, and fees that stay local, and needs open, safe, smoke-free forests to keep the recreation economy running."),
         mandates=[("A", ["recreation", "communities", "workforce"], "climate",
                    "Access for all: open trails and staffed sites that welcome everyone and keep gateway towns thriving."),
                   ("B", ["recreation", "water", "governance"], "wood",
                    "A recreation economy that funds stewardship: rivers, trails, and fee dollars working together.")],
         ability=dict(name="Rally the Public",
                      text="Once per game: public attention shifts. Move up to 2 points from one domain to another.",
                      effect={"type": "move", "amount": 2}),
         future=dict(resilient="Experience Concierge for the Public Lands",
                     holding="Trail Triage Coordinator",
                     unraveling="Smoke-Day Indoor Activities Planner")),
]

ROLE_SETS = {
    "3": ["role-state-forester", "role-forest-supervisor", "role-tribal-nr-director"],
    "4": ["role-state-forester", "role-forest-supervisor", "role-tribal-nr-director", "role-county-commissioner"],
    "5": ["role-state-forester", "role-forest-supervisor", "role-tribal-nr-director", "role-water-utility-gm",
          "role-mill-executive"],
    "6": ["role-state-forester", "role-fire-director", "role-tribal-nr-director", "role-county-commissioner",
          "role-mill-executive", "role-conservation-director"],
    "7": ["role-forest-supervisor", "role-state-gna-lead", "role-tribal-nr-director", "role-water-utility-gm",
          "role-mill-executive", "role-family-forest-leader", "role-recreation-coalition"],
}

# ---------------------------------------------------------------- strategies
def S(id, title, text, cost, effects, kind, tags, delayed=None):
    d = dict(id=id, title=title, text=text, cost=cost,
             effects=[{"domain": k, "delta": v} for k, v in effects])
    if delayed:
        d["delayed"] = [{"domain": k, "delta": v} for k, v in delayed]
    d.update(kind=kind, tags=tags, status="active", reviewed=REVIEWED)
    return d

STRATEGIES = [
    # ---- no-regret: worth doing in almost any future; modest, no downside
    S("str-all-lands-fuels", "All-lands fuels treatment",
      "Thin and burn hazardous fuels across federal, state, Tribal, and private land in the firesheds that threaten the most homes and water supplies.",
      5, [("fire", 2)], "no-regret", ["fire", "partners", "state", "federal"], [("water", 1)]),
    S("str-shared-stewardship", "Shared Stewardship compact",
      "State and Forest Service leaders sign joint priorities, share data and staff, and plan treatments together across the whole landscape.",
      2, [("partners", 1)], "no-regret", ["partners", "state", "federal"]),
    S("str-tribal-costewardship", "Tribal co-stewardship agreements",
      "Government-to-government agreements give Tribal Nations co-management roles and fund cultural burning and Indigenous knowledge in planning and monitoring.",
      4, [("partners", 1), ("fire", 1)], "no-regret", ["tribal", "partners", "fire"], [("fire", 1)]),
    S("str-community-defense", "Community wildfire defense",
      "Fund community wildfire protection plans, home hardening, defensible space, and evacuation routes in the highest-risk neighborhoods.",
      3, [("communities", 1)], "no-regret", ["community", "fire"], [("communities", 1)]),
    S("str-conservation-corps", "Conservation corps pipeline",
      "Paid youth, veteran, and Tribal crews with apprenticeships that lead to permanent agency, contractor, and fire jobs.",
      3, [("workforce", 1)], "no-regret", ["workforce", "community", "partners"], [("workforce", 1)]),
    S("str-listen-first", "Listen-first public engagement",
      "Listening sessions, open project dashboards, and youth programs rebuild trust before the next controversial project or fire season.",
      2, [("partners", 1)], "no-regret", ["community", "recreation", "partners"]),
    S("str-good-neighbor", "Good Neighbor expansion",
      "States, counties, and Tribes do restoration and timber work on national forests, reinvesting receipts into the next project.",
      4, [("wood", 1), ("partners", 1)], "no-regret", ["partners", "state", "wood", "tribal"]),
    S("str-workforce-housing", "Workforce housing partnership",
      "Agencies, counties, and nonprofits build housing so seasonal and permanent staff can afford to live near the forests they manage.",
      4, [("workforce", 1), ("communities", 1)], "no-regret", ["workforce", "community", "partners"]),
    S("str-local-contractors", "Local restoration contractors",
      "Multi-year stewardship contracts give local logging and restoration businesses the certainty to hire, buy equipment, and stay.",
      4, [("workforce", 1), ("wood", 1)], "no-regret", ["workforce", "wood", "community"]),
    S("str-river-trail-stewards", "River & trail stewardship partners",
      "Outfitters, user groups, and volunteers adopt trails and river reaches, fixing erosion and reporting problems in exchange for access.",
      3, [("recreation", 1), ("water", 1)], "no-regret", ["recreation", "water", "partners"]),
    S("str-outdoor-access", "Outdoor access & equity",
      "Shuttles, accessible trails, multilingual programs, and school partnerships bring new and underserved visitors to public lands.",
      2, [("recreation", 1)], "no-regret", ["recreation", "community", "partners"]),
    S("str-beaver-meadows", "Beaver & meadow restoration",
      "Low-tech, process-based restoration (beaver dam analogs, wet meadows, riparian buffers) stores water, cools streams, and slows fire.",
      3, [("water", 1)], "no-regret", ["water", "health"], [("water", 1)]),
    # ---- trade-off: efficient on one domain, someone else pays
    S("str-burn-boss-reform", "Burn-boss pipeline & liability reform",
      "Training exchanges, state liability standards, and a burn claims fund put more good fire on the ground, at the cost of more smoke days.",
      3, [("fire", 2), ("communities", -1)], "trade-off", ["fire", "workforce", "state", "policy"]),
    S("str-watershed-fund", "Utility watershed investment fund",
      "Water utilities add a ratepayer charge to co-fund thinning, burning, and restoration in the source watersheds they depend on.",
      3, [("water", 2), ("communities", -1)], "trade-off", ["water", "partners", "finance"]),
    S("str-small-wood-markets", "Small-wood & biomass markets",
      "Incentives for biochar, pellets, and combined heat and power make thinning small trees pay, though burning biomass adds emissions.",
      4, [("wood", 2), ("fire", 1), ("climate", -1)], "trade-off", ["wood", "fire", "climate"]),
    S("str-durable-planning", "Litigation-resilient planning",
      "Invest in strong analysis, early collaboration, and objection resolution so landscape projects hold up in court, at a real cost in staff time.",
      2, [("governance", 2), ("workforce", -1)], "trade-off", ["policy", "partners"]),
    S("str-rec-fee-reinvestment", "Recreation fee reinvestment",
      "Modernize trails and campgrounds, keep fee revenue local, and market gateway towns, bringing more visitors and more wear on fragile sites.",
      2, [("recreation", 2), ("health", -1)], "trade-off", ["recreation", "community"]),
    S("str-family-forest-carbon", "Family forest carbon program",
      "Enroll small landowners in high-integrity carbon programs that pay for deferred harvest and better management, trimming near-term log supply.",
      2, [("climate", 2), ("wood", -1)], "trade-off", ["climate", "finance", "private", "partners"]),
    S("str-fire-workforce", "Year-round fire workforce",
      "Permanent pay, year-round crews, housing, and mental-health support keep experienced firefighters, but compete for scarce budget dollars.",
      4, [("workforce", 2), ("fire", 1), ("governance", -1)], "trade-off", ["workforce", "fire", "federal"]),
    S("str-timber-acceleration", "Accelerated timber output",
      "Raise harvest targets and streamline approvals to boost volume quickly, strengthening mills and county receipts but straining habitat and trail access.",
      3, [("wood", 3), ("health", -1), ("recreation", -1)], "trade-off", ["wood", "federal", "policy"]),
    S("str-old-forest-safeguards", "Mature & old-growth safeguards",
      "Durable protection for old and mature stands and roadless areas, paired with active stewardship around them, reducing some timber supply.",
      4, [("climate", 2), ("health", 1), ("wood", -1)], "trade-off", ["climate", "health", "policy", "partners"]),
    S("str-pest-rapid-response", "Pest early detection & rapid response",
      "Trap networks, detector dogs, and fast strike teams catch invasive insects and diseases early; quarantines restrict log and firewood movement.",
      2, [("health", 2), ("wood", -1)], "trade-off", ["health", "science", "partners"]),
    S("str-post-fire-teams", "Post-fire recovery strike teams",
      "Interagency teams stabilize burned slopes, warn downstream towns of debris flows, and replant with utility and Tribal partners.",
      2, [("water", 1), ("health", 1), ("workforce", -1)], "trade-off", ["water", "health", "partners"]),
    S("str-lean-operations", "Lean operations consolidation",
      "Close or merge offices and shift functions to regional hubs, saving money fast but thinning local staff and visitor services.",
      2, [("governance", 2), ("workforce", -1), ("recreation", -1)], "trade-off", ["federal", "policy"]),
    # ---- hedge: insurance against several futures; pays off later
    S("str-reforestation-surge", "Nursery & reforestation surge",
      "Expand seed collection, nurseries, and planting crews to close the post-fire reforestation backlog with climate-informed stock.",
      4, [("health", 1)], "hedge", ["health", "climate", "partners"], [("health", 1), ("climate", 1)]),
    S("str-remote-sensing", "AI & remote-sensing early warning",
      "Satellites, cameras, and drones with machine-learning detection flag new ignitions, beetle kill, and drought stress early, and share the data openly.",
      3, [("fire", 1)], "hedge", ["tech", "science", "fire"], [("health", 1)]),
    S("str-seed-banking", "Seed banks & assisted migration",
      "Bank genetically diverse seed, test climate-adapted sources in trial plantings, and update seed-zone rules for a warmer future.",
      3, [("health", 1)], "hedge", ["science", "health", "climate"], [("climate", 1)]),
    S("str-science-practice", "Science-to-practice partnerships",
      "Research stations, universities, and extension embed scientists with managers to co-design treatments and monitor what works.",
      3, [("workforce", 1)], "hedge", ["science", "partners", "workforce"], [("health", 1)]),
    S("str-working-forest-finance", "Working-forest conservation finance",
      "Blend Forest Legacy, state, philanthropic, and private capital into easements that keep family and industrial forests working and intact.",
      5, [("partners", 1), ("wood", 1)], "hedge", ["finance", "partners", "wood", "private"], [("climate", 1)]),
    S("str-climate-ready-plans", "Climate-ready forest plans",
      "Revise land management plans around climate scenarios, drought refugia, and carbon, accepting slower project approvals while plans change.",
      4, [("climate", 2), ("health", 1), ("governance", -1)], "hedge", ["climate", "policy", "science"]),
    # ---- big bet: expensive, transformative if it lands, with real risks
    S("str-mass-timber-standard", "Mass timber procurement standard",
      "Public buildings specify mass timber made from restoration wood, giving mills a steady buyer and storing carbon in schools and housing.",
      6, [("wood", 2), ("climate", 1)], "big-bet", ["wood", "climate", "policy"], [("communities", 1)]),
    S("str-stable-budgets", "Stable fire & land budgets",
      "A broad coalition wins predictable multi-year funding so suppression costs stop draining fuels, research, and recreation programs.",
      7, [("governance", 2)], "big-bet", ["policy", "federal", "partners"], [("workforce", 1), ("health", 1)]),
    S("str-wui-compact", "WUI land-use & insurance compact",
      "State codes, county zoning, and insurer discounts reward fire-adapted development: a hard political lift with lasting payoff.",
      6, [("communities", 2), ("governance", -1)], "big-bet", ["community", "policy", "state"], [("fire", 1), ("communities", 1)]),
    S("str-unified-fire-service", "Unified federal fire service",
      "Consolidate federal wildland fire into one agency with common standards and careers: promising efficiency, risking disruption to shared crews and land-management ties.",
      7, [("fire", 2), ("workforce", 1), ("partners", -1), ("governance", -1)], "big-bet", ["fire", "federal", "policy", "workforce"],
      [("fire", 1), ("workforce", 1)]),
    S("str-resilience-bond", "Forest resilience bond",
      "Private investors front the cost of restoration; utilities, agencies, and insurers repay them as avoided-fire benefits arrive.",
      6, [("fire", 1), ("water", 1)], "big-bet", ["finance", "partners", "water", "fire"], [("health", 1), ("partners", 1)]),
]

# ---------------------------------------------------------------- cascades
def C(id, dom, op, val, effects, text):
    return dict(id=id, when={"domain": dom, op: val},
                effects=[{"domain": k, "delta": v} for k, v in effects], text=text)

CASCADES = [
    # chronic pressure from the two upstream drivers: fires while they sit at 3 or below
    C("cas-fire-deficit", "fire", "lte", 3, [("water", -1), ("communities", -1)],
      "A growing fire deficit: big fires keep burning through source watersheds and into towns."),
    C("cas-heat-stress", "climate", "lte", 3, [("health", -1)],
      "Heat and drought outrun adaptation: drought stress and beetles keep killing trees."),
    # crisis contagion
    C("cas-health-crisis", "health", "lte", 2, [("fire", -1), ("climate", -1)],
      "Dead and dying stands become fuel and turn from carbon sink to source."),
    C("cas-water-crisis", "water", "lte", 2, [("communities", -1), ("health", -1)],
      "Ash-choked reservoirs and drying streams hit towns and riparian forests."),
    C("cas-wood-crisis", "wood", "lte", 2, [("workforce", -1), ("communities", -1)],
      "The last mill closes; loggers and the restoration workforce leave with it."),
    C("cas-communities-crisis", "communities", "lte", 2, [("governance", -1), ("recreation", -1)],
      "Rural distress and insurance retreat erode the tax base and the public's patience."),
    C("cas-workforce-crisis", "workforce", "lte", 2, [("fire", -1), ("partners", -1)],
      "No one left to staff crews or keep agreements alive."),
    C("cas-partners-crisis", "partners", "lte", 2, [("governance", -1), ("fire", -1)],
      "Trust collapses into lawsuits and go-it-alone projects."),
    # Thriving: rewards, and success with side effects
    C("cas-partners-thriving", "partners", "gte", 8, [("governance", 1)],
      "A united coalition makes the budget case together and wins."),
    C("cas-wood-boom", "wood", "gte", 8, [("communities", 1), ("climate", -1)],
      "A timber boom pays wages and county bills, and pulls harvest toward older stands."),
    C("cas-recreation-boom", "recreation", "gte", 8, [("partners", 1), ("health", -1)],
      "Record crowds create new champions for the forest, and new wear on fragile places."),
    C("cas-wui-sprawl", "communities", "gte", 8, [("fire", -1)],
      "Thriving towns sprawl deeper into fire country: more homes and ignitions to defend."),
]

# Candidate cascade families explored during tuning (see balance-report.md)
BALANCING = [
    C("cas-wui-sprawl", "communities", "gte", 8, [("fire", -1)],
      "Booming towns sprawl deeper into fire country: more homes and ignitions to defend."),
    C("cas-loved-to-death", "recreation", "gte", 8, [("health", -1)],
      "Record crowds bring user-made trails, invasive seeds, and trampled riparian areas."),
    C("cas-harvest-pressure", "wood", "gte", 8, [("climate", -1)],
      "Hot markets pull harvest toward older stands faster than carbon can recover."),
]
CHRONIC = [
    C("cas-heat-stress", "climate", "lte", 3, [("health", -1)],
      "Chronic heat and drought keep killing trees until the climate trend bends."),
    C("cas-fire-deficit", "fire", "lte", 3, [("water", -1)],
      "A growing fire deficit keeps burning through source watersheds."),
]

PROMPTS = {
    "debrief": [
        "Which Signals in this game are you already seeing in your own work today? Where?",
        "Which strategy would have been worth funding in every era we played? What makes it a no-regret move for us now?",
        "Where did pooling Capacity across roles change the outcome, and where did we leave Capacity on the table?",
        "Which Dilemma vote was hardest? What would you need to know to make that call with confidence in real life?",
        "When Workforce or Policy & Funding fell, how did it constrain everyone? Where are we already feeling that?",
        "Whose mandate conflicted with yours? What would a deal that serves both actually look like?",
        "Which cascade surprised you? What early warning would let us see it coming in time?",
        "Which partner who was not at this table would have changed the game most?",
        "If you could rewrite one Headline of the Era as the future you want, what would it say, and what makes it plausible?",
        "Which of the Signals to Watch should we track as an organization, and who will own watching it?",
    ],
    "monday": [
        "Name one Signal from today you will share with your team this week, and the question you will ask them about it.",
        "Name one no-regret strategy you can start or strengthen within 90 days with the authority and budget you have now.",
        "Name one partner you will call this month to explore pooling capacity, and what you will offer first.",
        "Name one assumption about the next five years that today's game challenged. How will you test it?",
        "Put a date on the calendar to revisit today's Insight Log with your leadership team.",
    ],
}

# ---------------------------------------------------------------- build
def build(tiers=None, overrides=None, rules=None, strategies=None, cascades=None):
    tiers = tiers or TIERS
    overrides = overrides if overrides is not None else ROLE_TIER_OVERRIDES
    roles = []
    for r in ROLES:
        rr = {k: copy.deepcopy(v) for k, v in r.items() if k != "mandates"}
        ms = []
        for (vid, doms, guard, why) in r["mandates"]:
            tt = overrides.get(r["id"], {}).get(vid, tiers)
            tg = sorted(({"domain": d, "min": m} for d, m in zip(doms, tt["t"])), key=lambda t: -t["min"])
            ms.append({"id": vid,
                       "targets": tg,
                       "guardrail": {"domain": guard, "min": tt["g"]},
                       "why": why})
        out = {"id": rr["id"], "title": rr["title"], "org": rr["org"], "sector": rr["sector"], "bio": rr["bio"],
               "mandates": ms, "ability": rr["ability"], "future": rr["future"], "status": "active"}
        roles.append(out)
    return {
        "roles": roles,
        "roleSets": copy.deepcopy(ROLE_SETS),
        "strategies": copy.deepcopy(strategies if strategies is not None else STRATEGIES),
        "cascades": copy.deepcopy(cascades if cascades is not None else CASCADES),
        "rules": copy.deepcopy(rules or RULES),
        "prompts": copy.deepcopy(PROMPTS),
    }


if __name__ == "__main__":
    d = build()
    with open(OUT, "w") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    print("wrote", OUT, "roles", len(d["roles"]), "strategies", len(d["strategies"]), "cascades", len(d["cascades"]))
