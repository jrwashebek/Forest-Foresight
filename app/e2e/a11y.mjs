// axe-core (WCAG 2.1 A/AA) over every major screen in both themes. Usage: node e2e/a11y.mjs [--theme screen|projector]
import { serve, launch, newPage, setTheme } from "./lib.mjs";
import { stepHost, phaseOf } from "./driver.mjs";

const srv = await serve();
const browser = await launch();
const results = [];
const themes = process.argv.includes("--theme") ? [process.argv[process.argv.indexOf("--theme") + 1]] : ["projector", "screen"];

async function axe(page, label) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ url: srv.url + "axe.js" });
  await page.waitForTimeout(250);
  const r = await page.evaluate(async () => {
    const res = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
    return res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, targets: v.nodes.slice(0, 3).map((x) => x.target.join(" ") + (x.any[0] ? " :: " + x.any[0].message.slice(0, 140) : "")) }));
  });
  results.push({ label, r });
  console.log(`${r.length ? "✗" : "✓"} ${label}${r.length ? ": " + r.map((v) => `${v.id}(${v.n})`).join(", ") : ""}`);
}

for (const theme of themes) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const { page } = await newPage(ctx, { mock: true, name: "a11y" });
  await page.addInitScript((t) => { try { localStorage.setItem("ff.theme", JSON.stringify(t)); } catch {} }, theme);
  for (const [route, sel] of [["", ".home"], ["#rules", ".doc"], ["#about", ".doc"], ["#library", ".library"], ["#host", ".setup"]]) {
    await page.goto(srv.url + route);
    await page.waitForSelector(sel);
    if (route === "#library") await page.locator(".lib-item").first().click();
    await axe(page, `${theme} ${route || "#home"}`);
  }
  await page.getByRole("button", { name: /Start the game/ }).click();
  await page.waitForSelector(".board");
  const seen = new Set();
  let guard = 0;
  while (guard++ < 300) {
    const ph = await phaseOf(page);
    if (ph === "over") break;
    const sub = ph === "signals" ? ((await page.locator(".resolver").count()) ? "resolve" : (await page.locator(".hand--discard").count()) ? "discard" : "choose")
      : ph === "headline" ? ((await page.locator(".influence").count()) ? "influence" : (await page.locator(".sowhat").count()) ? "sowhat" : "write")
      : ph === "driver" ? ((await page.getByRole("button", { name: /Continue to signals/ }).count()) ? "decided" : "vote")
      : ph === "council" ? ((await page.getByRole("button", { name: /Write the Headline/ }).count()) ? "locked" : "open") : "";
    const key = `${ph}-${sub}`;
    if (!seen.has(key)) { seen.add(key); await axe(page, `${theme} board ${key}`); }
    if (ph === "council" && sub === "open" && !seen.has("ability")) {
      seen.add("ability");
      await page.locator(".seat").nth(3).locator(".ability-btn").click();
      await page.waitForSelector(".dialog");
      await axe(page, `${theme} ability dialog`);
      await page.keyboard.press("Escape");
    }
    if (!seen.has("menu")) {
      seen.add("menu");
      await page.getByRole("button", { name: "Game menu", exact: true }).click();
      await page.waitForSelector(".dialog");
      await axe(page, `${theme} game menu`);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: /Table view/ }).click();
      await axe(page, `${theme} board table view`);
      await page.getByRole("button", { name: /Tree view/ }).click();
    }
    await stepHost(page);
    await page.waitForTimeout(60);
  }
  await page.waitForSelector(".debrief");
  await axe(page, `${theme} debrief`);
  await ctx.close();

  // the compact board at 1366×768 and 140% Text size (collapsed header, legend-only tree, wrapped cards)
  const cctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const { page: cp } = await newPage(cctx, { name: "a11y-140", viewport: { width: 1366, height: 768 } });
  await cp.addInitScript((t) => { try { localStorage.setItem("ff.theme", JSON.stringify(t)); localStorage.setItem("ff.textsize", "1.4"); } catch {} }, theme);
  await cp.goto(srv.url + "#host");
  await cp.waitForSelector(".setup");
  await cp.locator(".seg-btn", { hasText: "7" }).first().click();
  await cp.getByRole("button", { name: /Start the game/ }).click();
  await cp.waitForSelector(".board");
  const want = new Set(["era-open", "driver", "council"]);
  let gg = 0;
  while (want.size && gg++ < 200) {
    const ph = await phaseOf(cp);
    if (want.has(ph) && (ph !== "driver" || (await cp.locator(".options").count()))) { want.delete(ph); await cp.waitForTimeout(300); await axe(cp, `${theme} board 1366 140% ${ph}`); }
    await stepHost(cp);
    await cp.waitForTimeout(60);
  }
  await cctx.close();

  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const { page: ph } = await newPage(pctx, { mock: false, name: "phone", viewport: { width: 390, height: 844 } });
  await ph.addInitScript((t) => { try { localStorage.setItem("ff.theme", JSON.stringify(t)); } catch {} }, theme);
  await ph.goto(srv.url + "#join");
  await ph.waitForSelector(".join");
  await axe(ph, `${theme} phone join`);
  await ph.fill("#j-code", "K7MR2Q");
  await ph.selectOption("#j-role", { index: 1 });
  await ph.getByRole("button", { name: /^Join$/ }).click();
  await ph.locator(".secret-cover").click();
  await axe(ph, `${theme} phone mandate`);
  await ph.getByRole("tab", { name: /Notes/ }).click();
  await axe(ph, `${theme} phone notes`);
  await ph.getByRole("tab", { name: /Rules/ }).click();
  await axe(ph, `${theme} phone rules`);
  await pctx.close();
}

const bad = results.filter((x) => x.r.length);
if (bad.length) {
  const byRule = {};
  for (const b of bad) for (const v of b.r) (byRule[v.id] = byRule[v.id] || { help: v.help, where: [], targets: new Set() }).where.push(b.label), v.targets.forEach((t) => byRule[v.id].targets.add(t));
  console.log("\nViolations by rule:");
  for (const [id, v] of Object.entries(byRule)) {
    console.log(`- ${id}: ${v.help}\n    in: ${[...new Set(v.where)].join("; ")}\n    e.g. ${[...v.targets].slice(0, 6).join("\n         ")}`);
  }
}
console.log(`\n${results.length} pages checked, ${bad.length} with violations.`);
await browser.close();
srv.close();
process.exit(bad.length ? 1 : 0);
