// Quick smoke: home, setup, start a game, first board screen. Usage: node e2e/smoke.mjs [mock]
import { serve, launch, newPage, shot } from "./lib.mjs";

const mock = process.argv.includes("mock");
const srv = await serve();
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const { page, errors } = await newPage(ctx, { mock, name: "host" });
await page.goto(srv.url);
await page.waitForSelector(".home-title");
await shot(page, "smoke-home");
await page.click('a[href="#host"]');
await page.waitForSelector(".setup");
await shot(page, "smoke-setup");
await page.click("text=Start the game");
await page.waitForSelector(".board");
await page.waitForTimeout(600);
await shot(page, "smoke-board-era");
await page.click("text=Reveal the Era Driver");
await page.waitForTimeout(1200);
await shot(page, "smoke-board-driver");
console.log(errors.length ? errors.join("\n") : "no errors");
await browser.close();
srv.close();
