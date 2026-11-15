// One default host action for the current phase (used to finish games in tests).
export async function phaseOf(page) {
  if (await page.locator(".debrief").count()) return "over";
  const cls = await page.locator(".board").getAttribute("class");
  return (/phase-is-([\w-]+)/.exec(cls || "") || [])[1];
}
const btn = (page, re) => page.getByRole("button", { name: re }).first();

/** Performs one step. Returns { phase, eraEnded } */
export async function stepHost(page) {
  const ph = await phaseOf(page);
  if (ph === "over") return { phase: ph };
  if (ph === "era-open") { await btn(page, /Reveal the Era Driver/).click(); return { phase: ph }; }
  if (ph === "driver") {
    const c = btn(page, /Continue to signals/);
    if (await c.count()) { await c.click(); return { phase: ph }; }
    const open = btn(page, /Open the dilemma/);
    if (await open.count()) { await open.click(); return { phase: ph }; }
    const opts = page.locator(".option");
    const n = await opts.first().locator("button.voter").count();
    for (let i = 0; i < n; i++) {
      const on = await opts.locator("button.voter").nth(i).getAttribute("aria-pressed");
      // only vote for seats that haven't voted (by checking every option's i-th chip)
      let voted = false;
      for (let k = 0; k < (await opts.count()); k++) if ((await opts.nth(k).locator("button.voter").nth(i).getAttribute("aria-pressed")) === "true") voted = true;
      if (!voted) await opts.nth(i % 2).locator("button.voter").nth(i).click();
      void on;
    }
    const d = btn(page, /^Decide:/);
    if (await d.count()) await d.click(); else await page.locator(".tie button").first().click();
    return { phase: ph };
  }
  if (ph === "signals") {
    const t = btn(page, /Open the Leadership Council/);
    if (await t.count()) { await t.click(); return { phase: ph }; }
    if (await page.locator(".resolver").count()) {
      const skip = btn(page, /Skip this effect/);
      if (await skip.count()) { await skip.click(); return { phase: ph }; }
      const move = (await page.locator(".resolver-title").innerText()).includes("Move");
      await page.locator(".resolver .domain-btn:not([disabled])").nth(0).click();
      if (move) await page.locator(".resolver .domain-btn:not([disabled]):not(.is-selected)").nth(0).click();
      await btn(page, /^Apply$/).click();
      return { phase: ph };
    }
    const draw = btn(page, /draw and end turn/i);
    if (await draw.count()) { await draw.click(); return { phase: ph }; }
    const hits = page.locator(".hand .card-hit");
    if (await hits.count()) { await hits.first().click({ position: { x: 14, y: 14 } }); await btn(page, /^Play “/).click(); }
    else await btn(page, /Pass this turn/).click();
    return { phase: ph };
  }
  if (ph === "council") {
    const h = btn(page, /Write the Headline of the Era/);
    if (await h.count()) { await h.click(); return { phase: ph }; }
    await btn(page, /Lock the Council/).click();
    return { phase: ph };
  }
  if (ph === "headline") {
    const cont = btn(page, /Continue to system response/);
    if (await cont.count()) { await cont.click(); return { phase: ph }; }
    const place = btn(page, /Place influence/);
    if (await place.count()) {
      const ds = page.locator(".influence .domain-btn:not([disabled])");
      await ds.nth(0).click();
      if (!(await place.isEnabled())) await ds.nth(1).click();
      await place.click();
      return { phase: ph };
    }
    const pick = page.locator('button[aria-label^="Pick "]:not([disabled])');
    if (await pick.count()) { await pick.first().click(); return { phase: ph }; }
    const inp = page.locator(".proof-input").first();
    await inp.fill("Forests hold the line"); await inp.press("Enter");
    return { phase: ph };
  }
  if (ph === "cascades") {
    const a = btn(page, /Apply the system response/);
    if (await a.count()) { await a.click(); return { phase: ph }; }
    await page.getByRole("button", { name: /^(Lay down|Record the collapse)/ }).click();
    return { phase: ph, eraEnded: true };
  }
  throw new Error("unknown phase " + ph);
}
