// Regression checks: (1) tree labels render ≥ 14px at 1366×768 and 1920×1080 in every phase,
// (2) ability buttons wrap and expose the full ability name, (3) optional Council auto-lock.
// The layout matrix (every step × Text size × viewport × players) is e2e/layout.mjs.
// Usage: node e2e/fixes.mjs [--shots]
import { serve, launch, newPage, shot, assert } from "./lib.mjs";
import { stepHost, phaseOf } from "./driver.mjs";

const SHOTS = process.argv.includes("--shots");
const srv = await serve();
const browser = await launch();
const errs = [];

async function minLabelPx(page) {
  return page.evaluate(() => {
    const svg = document.querySelector(".board-tree svg.tree");
    if (!svg) return { mode: "table", min: 99 };
    const vb = svg.viewBox.baseVal;
    const r = svg.getBoundingClientRect();
    const scale = Math.min(r.width / vb.width, r.height / vb.height);
    const px = (el) => parseFloat(getComputedStyle(el).fontSize);
    const badges = svg.classList.contains("tree--badges");
    const sizes = [];
    if (badges) {
      svg.querySelectorAll(".tree-badge-val").forEach((t) => sizes.push(px(t) * scale));
      document.querySelectorAll(".tree-legend .tl-name, .tree-legend .tl-band, .tree-legend .tl-val").forEach((t) => sizes.push(px(t)));
    } else {
      svg.querySelectorAll(".tree-name, .tree-band-label, .tree-val").forEach((t) => sizes.push(px(t) * scale));
    }
    return { mode: badges ? "ring" : "labels", min: Math.round(Math.min(...sizes) * 10) / 10 };
  });
}

for (const [w, h] of [[1366, 768], [1920, 1080]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const { page, errors } = await newPage(ctx, { name: `labels-${w}`, viewport: { width: w, height: h } });
  await page.goto(srv.url + "#host");
  await page.waitForSelector(".setup");
  await page.getByRole("button", { name: /Start the game/ }).click();
  await page.waitForSelector(".board");
  const seen = new Set();
  let guard = 0;
  while ((await phaseOf(page)) !== "over" && guard++ < 300) {
    const ph = await phaseOf(page);
    if (!seen.has(ph)) {
      seen.add(ph);
      await page.waitForTimeout(800); // grid transition
      const m = await minLabelPx(page);
      console.log(`${w}×${h} ${ph}: ${m.mode}, smallest tree label ${m.min}px`);
      assert(m.min >= 14, `tree labels ≥ 14px at ${w}×${h} in ${ph} (got ${m.min})`);
      if (SHOTS && (ph === "signals" || ph === "council" || ph === "driver")) await shot(page, `fix-${ph}-${w}`);
    }
    if (ph === "council" && !seen.has("ability-check")) {
      seen.add("ability-check");
      const b = page.locator(".seat .ability-btn").first();
      const name = await b.getAttribute("aria-label");
      const title = await b.getAttribute("title");
      const text = await b.locator("span").first().innerText();
      assert(name.toLowerCase().includes(text.replace(/\s+/g, " ").trim().toLowerCase()), "ability accessible name includes the visible (wrapped) name");
      assert(title && title.length > text.length, "ability title carries the full name and description");
      const lines = await b.locator("span").first().evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
      console.log(`  ability name "${text.replace(/\n/g, " ")}" on ${lines} line(s); title "${title.slice(0, 60)}…"`);
    }
    await stepHost(page);
    await page.waitForTimeout(60);
  }
  errs.push(...errors);
  await ctx.close();
}

// Layout CI (QA M1/M2, N1/N3): moved to e2e/layout.mjs, which runs every step × every Text size (90–140%)
// × 1920/1366 × 5/7 players and also checks the header, the tree column, seat names and text sizes.

// Auto-lock with a fake clock
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const { page, errors } = await newPage(ctx, { name: "autolock" });
  await page.clock.install();
  await page.goto(srv.url + "#host");
  await page.waitForSelector(".setup");
  await page.getByLabel(/Lock the Council automatically/).check();
  await page.getByRole("button", { name: /Start the game/ }).click();
  await page.waitForSelector(".board");
  let g = 0;
  while ((await phaseOf(page)) !== "council" && g++ < 100) { await stepHost(page); await page.waitForTimeout(40); }
  assert(await page.locator(".timer-note").count(), "auto-lock note shown");
  await page.getByRole("button", { name: "Start timer" }).click();
  await page.clock.fastForward("05:02");
  await page.waitForSelector("text=Write the Headline of the Era", { timeout: 5000 });
  console.log("Council auto-locked when the timer ran out");
  if (SHOTS) await shot(page, "fix-autolock-1920");
  errs.push(...errors);
  await ctx.close();
}
// Default off: timer expiry does not lock
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const { page, errors } = await newPage(ctx, { name: "no-autolock" });
  await page.clock.install();
  await page.goto(srv.url + "#host");
  await page.waitForSelector(".setup");
  await page.getByRole("button", { name: /Start the game/ }).click();
  await page.waitForSelector(".board");
  let g = 0;
  while ((await phaseOf(page)) !== "council" && g++ < 100) { await stepHost(page); await page.waitForTimeout(40); }
  await page.getByRole("button", { name: "Start timer" }).click();
  await page.clock.fastForward("05:02");
  await page.waitForSelector("text=Time's up", { timeout: 5000 });
  assert(await page.getByRole("button", { name: /Lock the Council/ }).count(), "still unlocked when auto-lock is off");
  console.log("Default: timer shows Time's up and waits for the facilitator");
  errs.push(...errors);
  await ctx.close();
}
console.log(errs.length ? "ERRORS:\n" + errs.join("\n") : "Zero console errors.");
await browser.close();
srv.close();
process.exit(errs.length ? 1 : 0);
