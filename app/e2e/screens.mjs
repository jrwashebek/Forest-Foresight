// Screenshots of non-game screens in both themes at 1920×1080 / 1366×768, phone join at 390×844,
// plus the content-error panel and the Library editor flows (edit, validate, save, import, publish).
// Usage: node e2e/screens.mjs [--mock]
import { serve, launch, newPage, shot, assert, setTheme, root, join } from "./lib.mjs";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const MOCK = process.argv.includes("--mock");
const srv = await serve();
const browser = await launch();
const all = [];

async function capture(route, name, { sizes = [[1920, 1080], [1366, 768]], themes = ["projector", "screen"], prep } = {}) {
  for (const theme of themes) {
    for (const [w, h] of sizes) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const { page, errors } = await newPage(ctx, { mock: MOCK, name, viewport: { width: w, height: h } });
      await page.addInitScript((t) => { try { localStorage.setItem("ff.theme", JSON.stringify(t)); } catch {} }, theme);
      await page.goto(srv.url + route);
      await page.waitForSelector("#main, .board", { timeout: 15000 });
      if (prep) await prep(page);
      await page.waitForTimeout(400);
      await shot(page, `screen-${name}-${theme}-${w}`);
      all.push(...errors);
      await ctx.close();
    }
  }
}

await capture("", "home");
await capture("#host", "setup");
await capture("#rules", "rules");
await capture("#about", "about");
await capture("#join", "join", { sizes: [[390, 844]] });
await capture("#library", "library-signals", { prep: async (p) => { await p.locator(".lib-item").nth(1).click(); } });
await capture("#library", "library-drivers", { themes: ["projector"], prep: async (p) => { await p.getByRole("tab", { name: /Drivers/ }).click(); await p.locator(".lib-item").first().click(); } });
await capture("#library", "library-roles", { themes: ["projector"], sizes: [[1920, 1080]], prep: async (p) => { await p.getByRole("tab", { name: /Roles/ }).click(); await p.locator(".lib-item").first().click(); } });
await capture("#library", "library-rules", { themes: ["projector"], sizes: [[1920, 1080]], prep: async (p) => { await p.getByRole("tab", { name: /Rules/ }).click(); } });

// --- Library behaviour: edit with a validation error, fix, save → local edits banner, reset
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const { page, errors } = await newPage(ctx, { mock: MOCK, name: "library" });
  await page.goto(srv.url + "#library");
  await page.waitForSelector(".library");
  await page.locator(".lib-item").first().click();
  const title = page.getByLabel("Title", { exact: true });
  await title.fill("A title that is far too long for a card");
  const idf = page.getByLabel("ID", { exact: true });
  await idf.fill(await page.locator(".lib-item").nth(1).locator(".lib-id").innerText()); // duplicate id → error
  await page.waitForTimeout(200);
  assert(await page.locator(".problems .is-err").count(), "duplicate id shows an error");
  await shot(page, "screen-library-validation-projector-1920");
  await idf.fill("sig-renamed-ok");
  await title.fill("Renamed for the test");
  await page.getByLabel("Last reviewed").fill("2023-01-15");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForSelector(".banner--local");
  await shot(page, "screen-library-local-banner-projector-1920");
  // filters: review due
  await page.getByLabel("Review due").check();
  const due = await page.locator(".lib-item").count();
  assert(due >= 1, "review-due filter finds stale cards");
  await page.getByLabel("Review due").uncheck();
  // add a new strategy
  await page.getByRole("tab", { name: /Strategies/ }).click();
  await page.getByRole("button", { name: /Add strategy/ }).click();
  await page.getByLabel("Title", { exact: true }).fill("Prescribed fire training exchange");
  await page.getByLabel("Text", { exact: true }).fill("Crews from different agencies train together on live burns.");
  await page.getByRole("button", { name: "Add to library" }).click();
  await page.waitForTimeout(200);
  assert(await page.locator(".lib-item", { hasText: "Prescribed fire training exchange" }).count(), "new strategy listed");
  // retire it
  await page.getByRole("button", { name: /^Retire$/ }).click();
  await page.waitForSelector(".lib-item.is-retired");
  // import a file: invalid JSON then valid content
  const tmp = join(root, "shots", "_import.json");
  writeFileSync(tmp, "{ not json");
  await page.setInputFiles("#lib-import", tmp);
  await page.waitForSelector(".dialog");
  await shot(page, "screen-library-import-error-projector-1920");
  await page.getByRole("button", { name: "Close" }).first().click();
  writeFileSync(tmp, readFileSync(join(root, "sample-content.json")));
  await page.setInputFiles("#lib-import", tmp);
  await page.waitForSelector(".dialog");
  await page.getByRole("button", { name: /Use this content/ }).click();
  await page.waitForTimeout(200);
  // publish (mock db + canEdit)
  if (MOCK) {
    await page.getByRole("button", { name: /Publish to everyone/ }).click();
    await page.waitForFunction(() => window.__ffDbWrites === 1, null, { timeout: 5000 });
    console.log("Published content to mock db");
  }
  // reset to published edition
  if (await page.locator(".banner--local").count()) {
    await page.getByRole("button", { name: /Reset to published edition/ }).click();
    await page.getByRole("button", { name: /Discard edits/ }).click();
    await page.waitForTimeout(200);
    assert(!(await page.locator(".banner--local").count()), "banner gone after reset");
  }
  all.push(...errors);
  await ctx.close();
}

// --- error panel for invalid content
{
  const bad = JSON.parse(readFileSync(join(root, "sample-content.json"), "utf8"));
  bad.signals[0].primary.domain = "lumber";
  bad.signals[2].id = bad.signals[1].id;
  bad.strategies[0].cost = 11;
  mkdirSync(join(root, "shots"), { recursive: true });
  const badPath = join(root, "shots", "_bad-content.json");
  writeFileSync(badPath, JSON.stringify(bad));
  const out = join(root, "shots", "_bad.html");
  execFileSync("node", [join(root, "build.mjs"), "--content", badPath, "--out", out], { stdio: "ignore" });
  const s2 = await serve(out);
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const { page, errors } = await newPage(ctx, { mock: MOCK, name: "bad" });
  await page.goto(s2.url + "#host");
  await page.waitForSelector(".error-panel");
  const n = await page.locator(".error-panel .issue-list li").count();
  assert(n >= 3, "error panel lists problems");
  await shot(page, "screen-content-errors-projector-1920");
  all.push(...errors);
  await ctx.close();
  s2.close();
}

console.log(all.length ? "ERRORS:\n" + all.join("\n") : "Zero console errors.");
await browser.close();
srv.close();
process.exit(all.length ? 1 : 0);
