// Shared Playwright helpers: static server, browser, console-error capture, screenshots.
import { createServer } from "node:http";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// Uses a local `playwright` install (npm i -D playwright) or PLAYWRIGHT_PATH if set.
function loadPlaywright() {
  for (const p of [process.env.PLAYWRIGHT_PATH, "playwright", "/opt/npm-tools/node_modules/playwright"]) {
    if (!p) continue;
    try { return require(p); } catch {}
  }
  throw new Error("Playwright not found: run `npm i -D playwright` in app/ or set PLAYWRIGHT_PATH.");
}
export const { chromium } = loadPlaywright();
export const here = dirname(fileURLToPath(import.meta.url));
export const root = join(here, "..");
export const SHOTS = join(root, "shots");
mkdirSync(SHOTS, { recursive: true });

export function serve(file = join(root, "dist/forest-futures.html")) {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      if (req.url.startsWith("/axe.js")) {
        res.writeHead(200, { "content-type": "text/javascript" });
        res.end(readFileSync(join(root, "node_modules/axe-core/axe.min.js")));
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(readFileSync(file));
    });
    srv.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${srv.address().port}/`, close: () => srv.close() }));
  });
}

export async function launch() {
  // CHROME_PATH lets you use an installed Chrome; otherwise Playwright's bundled Chromium is used.
  const executablePath = process.env.CHROME_PATH || (existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined);
  return chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--font-render-hinting=none"] });
}

const MOCK = readFileSync(join(here, "mock-claude.js"), "utf8");

/** New page with error capture. opts: { mock: bool|cfg, viewport, context } */
export async function newPage(ctxOrBrowser, { mock = false, viewport = { width: 1920, height: 1080 }, name = "page" } = {}) {
  const page = await ctxOrBrowser.newPage({ viewport });
  if (viewport && page.viewportSize().width !== viewport.width) await page.setViewportSize(viewport);
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text(); if (!/fonts\.g(oogleapis|static)\.com|net::ERR_(NAME|INTERNET|CONNECTION|TUNNEL|PROXY)|Failed to load resource/.test(t)) errors.push(`[${name}] console: ${t}`); } });
  page.on("pageerror", (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  if (mock) {
    const cfg = typeof mock === "object" ? mock : {};
    await page.addInitScript(`window.__ffMockCfg = ${JSON.stringify(cfg)};`);
    await page.addInitScript(MOCK);
  }
  // Fonts from Google may be unreachable in CI; don't block on them.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => (process.env.FF_FONTS ? r.continue() : r.abort()));
  return { page, errors };
}

export async function shot(page, name) {
  await page.waitForTimeout(150);
  const p = join(SHOTS, name + ".png");
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

export async function waitIdle(page, ms = 120) { await page.waitForTimeout(ms); }

export function assert(cond, msg) { if (!cond) throw new Error("ASSERT: " + msg); }

export async function setTheme(page, theme) {
  const cur = await page.evaluate(() => document.documentElement.dataset.theme);
  if (cur !== theme) {
    const btn = page.locator('button[aria-label^="Switch to"]').first();
    await btn.click();
    await page.waitForTimeout(250);
  }
}

export { existsSync, join };
