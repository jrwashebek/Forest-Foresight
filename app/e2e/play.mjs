// Full host-only playthrough of a 5-player Standard game (setup → 3 eras → debrief), driven through the UI.
// Usage: node e2e/play.mjs [--mock] [--shots] [--variants]   (no window.claude unless --mock)
//   --shots     take screenshots at each phase (1920×1080 projector)
//   --variants  also capture Screen theme and 1366×768 for era 1
import { serve, launch, newPage, shot, assert, setTheme } from "./lib.mjs";

const MOCK = process.argv.includes("--mock");
const SHOTS = process.argv.includes("--shots");
const VARIANTS = process.argv.includes("--variants");
const tag = MOCK ? "mock" : "plain";

const srv = await serve();
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const { page, errors } = await newPage(ctx, { mock: MOCK, name: "host" });
let n = 0;
const pad = (x) => String(x).padStart(2, "0");

async function snap(label, { variants = false } = {}) {
  if (!SHOTS) return;
  n++;
  await page.waitForTimeout(900); // let tree tweens settle
  await shot(page, `host-${pad(n)}-${label}-projector-1920`);
  if (VARIANTS && variants) {
    await setTheme(page, "screen");
    await page.waitForTimeout(500);
    await shot(page, `host-${pad(n)}-${label}-screen-1920`);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForTimeout(500);
    await shot(page, `host-${pad(n)}-${label}-screen-1366`);
    await setTheme(page, "projector");
    await page.waitForTimeout(400);
    await shot(page, `host-${pad(n)}-${label}-projector-1366`);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(300);
  }
}

const phase = async () => {
  if (await page.locator(".debrief").count()) return "over";
  const cls = await page.locator(".board").getAttribute("class");
  return (/phase-is-([\w-]+)/.exec(cls || "") || [])[1];
};
// --- a cooperative test bot: reads the autosaved state + embedded content to make sensible choices
let CONTENT = null;
const state = async () => {
  if (!CONTENT) CONTENT = await page.evaluate(() => JSON.parse(document.getElementById("ff-content").textContent));
  return page.evaluate(() => JSON.parse(localStorage.getItem("ff.host.v1")).state);
};
const sig = (id) => CONTENT.signals.find((x) => x.id === id);
const weight = (st, d) => 11 - st.cond[d]; // weak domains matter most
const effScore = (st, list) => (list || []).reduce((a, e) => a + e.delta * weight(st, e.domain), 0);
const order = (st) => CONTENT.domains.map((d) => d.id).sort((a, b) => st.cond[a] - st.cond[b]);
async function domainIndex(d) { return CONTENT.domains.findIndex((x) => x.id === d); }
const click = async (sel, opts) => { await page.locator(sel).first().click(opts); await page.waitForTimeout(120); };
const btn = (re) => page.getByRole("button", { name: re }).first();

await page.goto(srv.url + "#host");
await page.waitForSelector(".setup");
// fill names
const names = ["Ana Ruiz", "Ben Okafor", "Chen Wu", "Dee Harjo", "Eli Stone"];
for (let i = 0; i < 5; i++) await page.fill(`#pn-${i}`, names[i]);
if (SHOTS) { await shot(page, `host-00-setup-projector-1920`); }
await btn(/Start the game/).click();
await page.waitForSelector(".board");

let era = 0, guard = 0, usedAbilities = false, didUndo = false;
const seen = new Set();
while (guard++ < 400) {
  const ph = await phase();
  if (ph === "over") break;
  const key = `${era}-${ph}`;
  if (ph === "era-open") {
    if (!seen.has(key)) { seen.add(key); await snap(`e${era + 1}-era-open`, { variants: era === 0 }); }
    await btn(/Reveal the Era Driver/).click();
    await page.waitForTimeout(200);
    if (!didUndo) {
      didUndo = true;
      await page.getByRole("button", { name: "Undo last step" }).click();
      await page.waitForTimeout(200);
      assert((await phase()) === "era-open", "undo returns to era-open");
      await btn(/Reveal the Era Driver/).click();
    }
    continue;
  }
  if (ph === "driver") {
    const continueBtn = btn(/Continue to signals/);
    if (await continueBtn.count()) { await snap(`e${era + 1}-driver-decided`); await continueBtn.click(); continue; }
    const openDilemma = btn(/Open the dilemma/);
    if (await openDilemma.count()) { await snap(`e${era + 1}-driver-reveal`, { variants: era === 0 }); await openDilemma.click(); continue; }
    // record votes: the best option for the weakest domains gets 3 votes, the runner-up 2
    const st0 = await state();
    const drv = CONTENT.drivers.find((x) => x.id === st0.driver.id);
    const ranked = drv.dilemma.options.map((o, k) => [effScore(st0, o.effects), k]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
    const options = page.locator(".option");
    for (let i = 0; i < 5; i++) {
      const k = i < 3 ? ranked[0] : ranked[1];
      await options.nth(k).locator("button.voter").nth(i).click();
    }
    await page.waitForTimeout(150);
    await snap(`e${era + 1}-driver-votes`, { variants: era === 0 });
    const decide = btn(/^Decide:/);
    if (await decide.count()) await decide.click();
    else await click(".tie button");
    continue;
  }
  if (ph === "signals") {
    const toCouncil = btn(/Open the Leadership Council/);
    if (await toCouncil.count()) { await snap(`e${era + 1}-signals-done`); await toCouncil.click(); continue; }
    if (await page.locator(".resolver").count()) {
      const skipB = btn(/Skip this effect/);
      if (await skipB.count()) { await skipB.click(); continue; }
      const stR = await state();
      const sc = sig(stR.turn.card).secondary;
      const btns = page.locator(".resolver .domain-btn");
      const ok = async (d) => !(await btns.nth(await domainIndex(d)).isDisabled());
      const asc = order(stR), desc = asc.slice().reverse();
      const pickFirst = async (list) => { for (const d of list) if (await ok(d)) return d; return null; };
      if (sc.type === "move") {
        const from = await pickFirst(desc); await btns.nth(await domainIndex(from)).click();
        const to = await pickFirst(asc.filter((d) => d !== from)); await btns.nth(await domainIndex(to)).click();
      } else {
        const d = await pickFirst(sc.type === "remove" ? desc : asc);
        await btns.nth(await domainIndex(d)).click();
      }
      await page.fill("#reason", "Because partners carry the work when staff are stretched.");
      if (!seen.has(key + "-res")) { seen.add(key + "-res"); await snap(`e${era + 1}-signals-resolve`, { variants: era === 0 }); }
      await btn(/^Apply$/).click();
      continue;
    }
    const draw = btn(/draw and end turn/i);
    if (await draw.count()) {
      if (!seen.has(key + "-disc")) {
        seen.add(key + "-disc");
        const t = page.locator(".discard-toggle input");
        if (await t.count()) await t.first().check();
        await snap(`e${era + 1}-signals-discard`);
      }
      await draw.click();
      continue;
    }
    // choose step
    const hits = page.locator(".hand .card-hit");
    if (await hits.count()) {
      const stC = await state();
      const seat = stC.turn.order[stC.turn.pos];
      const hand = stC.hands[seat];
      const score = (id) => { const x = sig(id); const fx = [x.primary]; if (x.secondary && x.secondary.type === "fixed") fx.push(x.secondary); return effScore(stC, fx) + (x.secondary && x.secondary.type === "add" ? 6 : 0); };
      const best = hand.slice().sort((a, b) => score(b) - score(a))[0];
      await page.locator(`.hand [data-card="${best}"] .card-hit`).click({ position: { x: 14, y: 14 } });
      if (!seen.has(key + "-choose")) { seen.add(key + "-choose"); await snap(`e${era + 1}-signals-choose`, { variants: era === 0 }); }
      await btn(/^Play “/).click();
    } else {
      await btn(/Pass this turn/).click();
    }
    continue;
  }
  if (ph === "council") {
    const toHead = btn(/Write the Headline of the Era/);
    if (await toHead.count()) { await snap(`e${era + 1}-council-locked`); await toHead.click(); continue; }
    if (!usedAbilities) {
      usedAbilities = true;
      // use the first ability that is available in the Council (capacity / discount / refresh-market)
      const ready = page.locator(".seat .ability-btn:has(.avail-dot)");
      const k = await ready.count();
      for (let j = 0; j < k; j++) {
        await ready.nth(j).click();
        await page.waitForSelector(".dialog");
        const dlg = page.locator(".dialog");
        const opt = dlg.locator(".opt-btn:not([disabled])");
        if (await opt.count()) await opt.first().click();
        const use = dlg.getByRole("button", { name: /^Use / });
        if (await use.isEnabled()) {
          if (SHOTS) await shot(page, `host-ability-dialog-projector-1920`);
          await use.click();
          await page.waitForTimeout(200);
          console.log("Used an ability in the Council");
          break;
        }
        await page.keyboard.press("Escape");
      }
    }
    // pledge: pool everyone's capacity into the best-value strategies that can be fully funded
    const stK = await state();
    const market = stK.council.market;
    let pool = stK.council.capacity.reduce((a, b) => a + b, 0);
    const strat = (id) => CONTENT.strategies.find((x) => x.id === id);
    const val = (id) => (effScore(stK, strat(id).effects) + 0.6 * effScore(stK, strat(id).delayed)) / strat(id).cost;
    const chosen = [];
    for (const id of market.slice().sort((a, b) => val(b) - val(a))) {
      const cost = Math.max(0, strat(id).cost - (stK.council.discounts[id] || 0));
      if (cost <= pool && val(id) > 0) { chosen.push(id); pool -= cost; }
    }
    for (let r = 0; r < 5; r++) {
      await page.locator(".pledge-seat").nth(r).click();
      for (const id of chosen) {
        const plus = page.locator(".market-col").nth(market.indexOf(id)).locator('.pledge-mine button[aria-label^="Increase"]');
        for (let g2 = 0; g2 < 10; g2++) {
          if (!(await plus.count()) || (await plus.isDisabled())) break;
          await plus.click();
        }
      }
    }
    await snap(`e${era + 1}-council-pledged`, { variants: era === 0 });
    await btn(/Lock the Council/).click();
    continue;
  }
  if (ph === "headline") {
    const cont = btn(/Continue to system response/);
    if (await cont.count()) {
      await page.fill("#sowhat", `Era ${era + 1}: invest in partnerships before the crisis, not after it.`);
      await snap(`e${era + 1}-headline-sowhat`);
      await cont.click();
      continue;
    }
    const place = btn(/Place influence/);
    if (await place.count()) {
      const stI = await state();
      const low = order(stI);
      const d = page.locator(".influence .domain-btn").nth(await domainIndex(low[0]));
      await d.click(); await d.click();
      if (!(await btn(/Place influence/).isEnabled())) await page.locator(".influence .domain-btn").nth(await domainIndex(low[1])).click();
      await snap(`e${era + 1}-headline-influence`, { variants: era === 0 });
      await place.click();
      continue;
    }
    const inputs = page.locator(".proof-input");
    const k = await inputs.count();
    const heads = ["Fire agency splits; states fill the gap", "Snowless winters leave towns thirsty", "Mill reopens on restoration wood", "Partners outnumber rangers on the ground", "Insurers return to the forest edge"];
    for (let i = 0; i < k; i++) { await inputs.nth(i).fill(heads[(i + era) % heads.length]); await inputs.nth(i).press("Enter"); }
    await page.waitForTimeout(150);
    await snap(`e${era + 1}-headline-write`, { variants: era === 0 });
    await page.locator('button[aria-label^="Pick "]:not([disabled])').first().click();
    continue;
  }
  if (ph === "cascades") {
    const apply = btn(/Apply the system response/);
    if (await apply.count()) { await snap(`e${era + 1}-cascades-preview`); await apply.click(); continue; }
    await snap(`e${era + 1}-cascades-done`, { variants: era === 0 });
    const close = page.getByRole("button", { name: /^(Lay down|Record the collapse)/ });
    await close.click();
    await page.waitForTimeout(300);
    era++;
    continue;
  }
  throw new Error("Unknown phase " + ph);
}
await page.waitForSelector(".debrief");
const outcome = await page.locator(".outcome-title").innerText();
console.log(`Outcome: ${outcome} after ${era} eras`);
if (SHOTS) {
  await page.waitForTimeout(800);
  await shot(page, `host-90-debrief-projector-1920`);
  await page.locator("#md-h").scrollIntoViewIfNeeded();
  await shot(page, `host-91-debrief-mandates-projector-1920`);
  await page.locator("#story-h").scrollIntoViewIfNeeded();
  await shot(page, `host-92-debrief-story-projector-1920`);
  await page.locator("#watch-h").scrollIntoViewIfNeeded();
  await shot(page, `host-93-debrief-watch-projector-1920`);
  await page.evaluate(() => window.scrollTo(0, 0));
  if (VARIANTS) {
    await setTheme(page, "screen");
    await page.waitForTimeout(500);
    await shot(page, `host-90-debrief-screen-1920`);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForTimeout(300);
    await shot(page, `host-90-debrief-screen-1366`);
    await setTheme(page, "projector");
    await page.setViewportSize({ width: 1920, height: 1080 });
  }
}
// export
await page.getByRole("button", { name: /Copy debrief/ }).click();
await page.waitForTimeout(300);
if (MOCK) {
  await page.getByRole("button", { name: /Download Markdown/ }).click();
  await page.waitForTimeout(300);
  const dl = await page.evaluate(() => window.__ffDownloads);
  assert(dl.length === 1 && dl[0].filename.endsWith(".md") && dl[0].head.includes("debrief"), "markdown download via capability");
  console.log("Download capability:", dl[0].filename, dl[0].size, "bytes");
} else {
  assert(!(await page.getByRole("button", { name: /Download Markdown/ }).count()), "no download button without capability");
}
// resume after reload keeps the debrief
await page.reload();
await page.waitForSelector(".debrief");
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "Zero console errors.");
await browser.close();
srv.close();
process.exit(errors.length ? 1 : 0);
