// QA regressions: M3 (no one-click data loss), M7 (manual copy when clipboard is blocked), m15, m14.
import { serve, launch, newPage, shot, assert } from "./lib.mjs";
import { stepHost, phaseOf } from "./driver.mjs";
const srv = await serve();
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const { page, errors } = await newPage(ctx, { name: "qa" });
// clipboard fully blocked
await page.addInitScript(() => {
  try { Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) } }); } catch {}
  document.execCommand = () => false;
});
await page.goto(srv.url + "#host");
await page.waitForSelector(".setup");
await page.getByRole("button", { name: /Start the game/ }).click();
await page.waitForSelector(".board");
// Save and exit → Home → Discard needs confirmation
await page.getByRole("button", { name: "Game menu", exact: true }).click();
await page.getByRole("button", { name: /Save and exit/ }).click();
await page.waitForSelector(".home");
await page.getByRole("button", { name: /Discard/ }).click();
assert(await page.evaluate(() => !!localStorage.getItem("ff.host.v1")), "first click on Discard keeps the game");
await shot(page, "qa-home-discard-confirm");
await page.getByRole("button", { name: /Keep it/ }).click();
await page.getByRole("button", { name: /Resume game/ }).click();
await page.waitForSelector(".board");
let g = 0;
let stepperChecked = false;
while ((await phaseOf(page)) !== "over" && g++ < 400) {
  // QA N8b: pressing "+" until it disables (the leader's last Capacity) keeps focus on the stepper
  if (!stepperChecked && (await phaseOf(page)) === "council" && (await page.locator(".pledge-for").count())) {
    stepperChecked = true;
    const plus = page.locator(".market-col").first().locator('.pledge-mine button[aria-label^="Increase"]');
    await plus.focus();
    for (let i = 0; i < 12 && (await plus.isEnabled()); i++) { await page.keyboard.press("Enter"); await page.waitForTimeout(60); }
    const f = await page.evaluate(() => ({ tag: document.activeElement.tagName, inStepper: !!document.activeElement.closest(".stepper"), label: document.activeElement.getAttribute("aria-label") }));
    assert(f.inStepper, `focus stays on the stepper after "+" disables (on ${f.tag} ${f.label})`);
    console.log(`N8b: "+" disabled, focus moved to "${f.label}"`);
    await page.keyboard.press("Enter"); // "−": give the point back
  }
  await stepHost(page); await page.waitForTimeout(40);
}
await page.waitForSelector(".debrief");
// QA N8a: at game end focus lands on the outcome heading and the outcome is announced
await page.waitForTimeout(300);
const end = await page.evaluate(() => ({ id: document.activeElement.id, live: [...document.querySelectorAll('[aria-live="polite"][aria-atomic="true"]')].map((x) => x.textContent).join(" "), title: document.querySelector("#oc-h").textContent }));
assert(end.id === "oc-h", `focus on the outcome heading at game end (got #${end.id})`);
assert(end.live.includes("Game over") && end.live.includes(end.title), `outcome announced (live region: "${end.live}")`);
console.log(`N8a: focus on "${end.title}", announced "${end.live.trim()}"`);
await shot(page, "qa-debrief-focus");
// M7: copy falls back to a selectable textarea
await page.getByRole("button", { name: /Copy debrief/ }).first().click();
await page.waitForSelector("#manual-copy");
const md = await page.locator("#manual-copy").inputValue();
assert(md.includes("## Mandates") && md.length > 2000, "manual copy dialog holds the Markdown");
await shot(page, "qa-copy-fallback");
await page.getByRole("button", { name: "Done" }).click();
// M3: New game asks first and keeps the debrief until a new game starts
await page.getByRole("button", { name: /^New game$/ }).click();
await page.waitForSelector(".dialog");
await shot(page, "qa-new-game-confirm");
await page.getByRole("button", { name: /Go to setup/ }).click();
await page.waitForSelector(".setup");
assert(await page.locator("text=The last game's debrief is saved").count(), "setup offers the saved debrief");
await page.goto(srv.url);
await page.waitForSelector(".home");
assert(await page.getByRole("button", { name: /View debrief/ }).count(), "home offers the finished debrief (m15)");
await page.getByRole("button", { name: /View debrief/ }).click();
await page.waitForSelector(".debrief");
console.log("M3/M7/m15 behave as expected");
// m14: phone home puts Join first
const p = await ctx.newPage();
await p.setViewportSize({ width: 390, height: 844 });
await p.goto(srv.url);
await p.waitForSelector(".home");
const first = await p.evaluate(() => { const links = [...document.querySelectorAll(".home-nav a")]; links.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top); return links[0].textContent; });
assert(/Join/.test(first), "Join is first on a phone");
await shot(p, "qa-home-390");
// QA N7: a discount applied after pledging hands the surplus Capacity back (5 players: Mark has Order Book,
// a −2 discount on a "wood" strategy). Codes are seeded so the run is repeatable; a few are tried until a
// wood strategy is in the first market.
let n7 = false;
for (let attempt = 0; attempt < 6 && !n7; attempt++) {
  const c2 = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const { page: q, errors: e2 } = await newPage(c2, { name: `n7-${attempt}` });
  await q.addInitScript((seed) => { let x = seed >>> 0; crypto.getRandomValues = (a) => { for (let i = 0; i < a.length; i++) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; a[i] = x; } return a; }; }, 7001 + attempt * 97);
  await q.goto(srv.url + "#host");
  await q.waitForSelector(".setup");
  await q.getByRole("button", { name: /Start the game/ }).click();
  await q.waitForSelector(".board");
  let k = 0;
  while ((await phaseOf(q)) !== "council" && k++ < 100) { await stepHost(q); await q.waitForTimeout(40); }
  const seat = q.locator(".seat").nth(4);
  if (!(await seat.locator(".ability-btn.is-ready").count())) { errors.push(...e2); await c2.close(); continue; }
  await seat.locator(".ability-btn").click();
  await q.waitForSelector(".dialog");
  const title = (await q.locator(".dialog .opt-btn:not([disabled]) strong").first().innerText()).trim();
  await q.keyboard.press("Escape");
  const col = q.locator(".market-col").filter({ has: q.locator(".card-title", { hasText: title }) });
  const costOf = async () => (await col.locator(".pledge-num").innerText()).split("/").map((x) => +x.trim());
  // fill the card from as many leaders as it takes
  for (let i = 0; i < 5; i++) {
    const [tot, cost] = await costOf();
    if (tot >= cost) break;
    await q.locator(".pledge-seat").nth(i).click();
    const plus = col.locator('.pledge-mine button[aria-label^="Increase"]');
    while ((await plus.isEnabled()) && (await costOf())[0] < (await costOf())[1]) { await plus.click(); await q.waitForTimeout(40); }
  }
  const [before, cost0] = await costOf();
  await seat.locator(".ability-btn").click();
  await q.locator(".dialog .opt-btn", { hasText: title }).click();
  await shot(q, "qa-n7-discount-dialog");
  await q.getByRole("button", { name: /^Use / }).click();
  await q.waitForTimeout(250);
  const [after, cost1] = await costOf();
  const toastText = await q.locator(".toast").last().innerText();
  console.log(`N7: "${title}" ${before}/${cost0} pledged → discount → ${after}/${cost1}; toast: ${toastText}`);
  assert(cost1 === Math.max(1, cost0 - 2), "cost dropped by 2 (never below 1)");
  assert(after === Math.min(before, cost1), `pledges trimmed to the new cost (${after} vs ${cost1})`);
  if (before > cost1) assert(/Capacity back/.test(toastText), "toast says who gets Capacity back");
  await shot(q, "qa-n7-after-discount");
  errors.push(...e2);
  await c2.close();
  n7 = true;
}
assert(n7, "N7: found a game where Order Book could be used");

console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "Zero console errors.");
await browser.close(); srv.close();
process.exit(errors.length ? 1 : 0);
