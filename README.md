# Forest Futures

A strategic foresight game for forest leaders. It's played in the room on one big shared screen, run by a facilitator, while each player uses their phone.

Leaders from the USDA Forest Service, state forestry agencies, Tribal nations and their partners play as themselves through three eras: **Now (2026–30)**, **Near (2031–38)** and **Far (2039–50)**. In each era they:

- respond to real-world signals,
- face a leadership dilemma,
- pool scarce capacity into strategies, and
- write the Headline of the Era.

Every player has a secret mandate, but if the forest system unravels, nobody wins.

**Edition 2026.11**: 98 signal cards from 2025–26 sources, 16 era drivers with dilemmas, 35 strategies, 12 roles and 5 scenarios. Content is current as of November 14, 2026.

## Play it

- **Hosted:** open `index.html` in a browser, or serve this repo with GitHub Pages (Settings → Pages → deploy from the `main` branch, root folder).
- **Offline:** the game is one self-contained HTML file (`index.html`, the same as `app/dist/forest-futures.html`). Copy it to a laptop and open it; no internet needed.
- **Phones:** players open the same page, tap **Join**, and enter the game code and their seat to see their secret mandate. Live phone sync (votes, pledges and headlines sent from phones) only works when the game runs as a Claude artifact. Everywhere else, the facilitator enters those on the big screen.

## Repository layout

| Path | What's there |
|---|---|
| `index.html` | The built game, ready to host |
| `app/` | Source (Preact + esbuild), engine, unit tests (`test/`), browser tests (`e2e/`) |
| `content/` | Game content as JSON, `merge.py` (merges and validates content), research notes, the 2019 deck audit, the fact-check log |
| `sim/` | Balance simulator (Python 3, standard library only) |
| `docs/` | Design spec, QA report, About-page text |

## Update the content

Most updates don't need code. Use **Content Library** in the game to edit, add or retire cards. Then export the JSON and commit it.

To rebuild from the content files:

```bash
cd content && python3 -I merge.py --colors ../app/sample-content.json   # writes content.json; must show 0 errors
cd ../app && npm install && npm run build                                 # writes dist/forest-futures.html
cp dist/forest-futures.html ../index.html
npm test                                                                   # engine unit tests
```

After big content changes, re-check the balance:

```bash
cd sim && python3 -I run.py && python3 -I tune_mandates.py
```

Aim for mixed tables to end roughly 25–40% Resilient and 15–25% Unraveling. See `content/balance-report.md`.

Browser tests (`npm run e2e`) need Playwright: run `npm i -D playwright`. Optionally set `CHROME_PATH`.

## Credits

Evolved from *IMPACT: a foresight game – forestry edition* (2019) by the Strategic Foresight Group: David N. Bengston and Lynne M. Westphal (USDA Forest Service, Northern Research Station) and Michael J. Dockry and Jason S. Crabtree (University of Minnesota). That game was itself adapted from *IMPACT*, designed by Idea Couture in collaboration with Policy Horizons Canada.

Signals cite real-world sources (listed in the game under **About & sources**). Their effects in the game are speculative and meant to provoke discussion. This is an independent tool, not an official product of USDA or any agency.
