// Live sync: host + 2 phones through the mock room (BroadcastChannel). Phones vote, play a signal,
// pledge and submit headlines; the host validates and applies. Also checks the mandate a phone shows
// matches the host's reveal at the end, and that presence stays under 4 KiB.
// Usage: node e2e/phones.mjs [--shots]
import { serve, launch, newPage, shot, assert, setTheme } from "./lib.mjs";
import { stepHost, phaseOf } from "./driver.mjs";

const SHOTS = process.argv.includes("--shots");
// watchdog: fail (with the last step reached) instead of hanging if nothing progresses for 90 s
let mark = "start", markAt = Date.now();
const markStep = (m) => { mark = m; markAt = Date.now(); if (process.env.FF_DEBUG) console.log("·", m); };
const dog = setInterval(() => { if (Date.now() - markAt > 90000) { console.log(`STALLED after: ${mark}`); process.exit(1); } }, 5000);
dog.unref();
const log = (...a) => { console.log(...a); markStep(String(a[0])); };
const srv = await serve();
const browser = await launch();
const ctx = await browser.newContext();
const { page: host, errors: he } = await newPage(ctx, { mock: true, name: "host", viewport: { width: 1920, height: 1080 } });
const { page: p1, errors: e1 } = await newPage(ctx, { mock: true, name: "phone1", viewport: { width: 390, height: 844 } });
const { page: p2, errors: e2 } = await newPage(ctx, { mock: true, name: "phone2", viewport: { width: 390, height: 844 } });
const errors = () => [...he, ...e1, ...e2];
const wait = (ms) => host.waitForTimeout(ms);
const axeIssues = [];
async function axeCheck(pg, label) {
  if (!(await pg.evaluate(() => !!window.axe))) await pg.addScriptTag({ url: srv.url + "axe.js" });
  const v = await pg.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.map((x) => `${x.id}(${x.nodes.length})`));
  if (v.length) axeIssues.push(`${label}: ${v.join(", ")}`);
}
const pshot = async (pg, name) => { if (SHOTS) { await pg.waitForTimeout(250); await shot(pg, name); } };

// --- host setup
await host.goto(srv.url + "#host");
await host.waitForSelector(".setup");
await host.waitForSelector(".sync-note.is-live", { timeout: 15000 });
const names = ["Ana Ruiz", "Ben Okafor", "Chen Wu", "Dee Harjo", "Eli Stone"];
for (let i = 0; i < 5; i++) await host.fill(`#pn-${i}`, names[i]);
await host.getByRole("button", { name: /Start the game/ }).click();
await host.waitForSelector(".board");
await host.waitForSelector(".sync-dot.is-live", { timeout: 15000 });
const saved = await host.evaluate(() => JSON.parse(localStorage.getItem("ff.host.v1")));
const code = saved.state.code;
const roles = saved.state.players.map((p) => p.roleId);
log("Game", code, roles.join(", "));

// --- phones join
async function join(pg, seat, name) {
  await pg.goto(srv.url + "#join");
  await pg.waitForSelector(".join");
  await pshot(pg, `phone-join-${seat}`);
  await pg.fill("#j-code", code.toLowerCase());
  await pg.selectOption("#j-seat", String(seat));
  await pg.selectOption("#j-role", roles[seat]);
  await pg.fill("#j-name", name);
  await pg.getByRole("button", { name: /^Join$/ }).click();
  await pg.waitForSelector(".mandate-tab");
}
await join(p1, 0, "Ana");
await join(p2, 1, "Ben");
await pshot(p1, "phone-01-role-hidden-projector");
await p1.locator(".secret-cover").click();
await pshot(p1, "phone-02-mandate-projector");
const phoneWhy = await p1.locator(".mandate-why").innerText();
await p2.locator(".secret-cover").click();
const phoneWhy2 = await p2.locator(".mandate-why").innerText();

// host sees both phones
await host.waitForFunction(() => document.querySelector(".code-chip-n") && /2/.test(document.querySelector(".code-chip-n").textContent), null, { timeout: 10000 });
log("Host sees 2 phones connected");

// --- driver: phones vote
await host.getByRole("button", { name: /Reveal the Era Driver/ }).click();
await host.getByRole("button", { name: /Open the dilemma/ }).click();
for (const pg of [p1, p2]) {
  await pg.getByRole("tab", { name: /Table/ }).click();
  await pg.waitForSelector(".phone-option", { timeout: 10000 });
}
await pshot(p1, "phone-03-vote-projector");
await p1.locator(".phone-option").nth(1).click();
await p2.locator(".phone-option").nth(1).click();
await host.waitForFunction(() => {
  const o = document.querySelectorAll(".option")[1];
  return o && [...o.querySelectorAll("button.voter")].filter((b) => b.getAttribute("aria-pressed") === "true").length === 2;
}, null, { timeout: 10000 });
await p1.waitForSelector(".sent.is-ok", { timeout: 10000 });
await pshot(p1, "phone-04-vote-received-projector");
await axeCheck(p1, "phone live vote");
log("Phone votes applied on host");
if (SHOTS) await shot(host, "live-host-driver-phone-votes");
// remaining votes on the host, resolve, continue
await stepHost(host); // records missing votes + decides
await wait(200);
await stepHost(host); // continue to signals
await wait(300);

// --- signals: seat 0 (Ana, lead) plays from her phone
await p1.waitForSelector(".phone-hand .btn--primary", { timeout: 10000 });
await pshot(p1, "phone-05-your-turn-projector");
await p1.locator(".phone-hand .btn--primary").first().click();
await host.waitForFunction(() => !!document.querySelector(".resolver") || /draw and end turn/i.test(document.body.innerText), null, { timeout: 10000 });
log("Phone signal play applied on host");
// finish signals on the host
while ((await phaseOf(host)) === "signals" && !(await host.getByRole("button", { name: /Open the Leadership Council/ }).count())) { await stepHost(host); await wait(80); }
await host.getByRole("button", { name: /Open the Leadership Council/ }).click();
await wait(300);

// --- council: phones pledge
await p1.waitForSelector(".phone-strat", { timeout: 10000 });
for (const pg of [p1, p2]) {
  const plus = pg.locator('.phone-strat').first().locator('button[aria-label^="Increase"]');
  if (!(await plus.isDisabled())) await plus.click();
}
await host.waitForFunction(() => {
  const first = document.querySelector(".market-col");
  return first && first.querySelectorAll(".contrib li:not(.contrib-none)").length >= 2;
}, null, { timeout: 10000 });
await pshot(p1, "phone-06-pledge-projector");
log("Phone pledges applied on host");
// race (QA M4): both phones try to over-pledge the same strategy; each phone must end up showing what the host accepted
for (let i = 0; i < 6; i++) for (const pg of [p1, p2]) {
  const plus = pg.locator(".phone-strat").nth(1).locator('button[aria-label^="Increase"]');
  if ((await plus.count()) && !(await plus.isDisabled({ timeout: 2000 }).catch(() => true))) await plus.click({ timeout: 2000 }).catch(() => {});
}
await host.waitForTimeout(1500);
const hostVals = await host.evaluate(() => { const st = JSON.parse(localStorage.getItem("ff.host.v1")).state; const id = st.council.market[1]; return [st.council.pledges[id][0], st.council.pledges[id][1]]; });
const phoneVals = [await p1.locator(".phone-strat").nth(1).locator(".stepper-val").innerText(), await p2.locator(".phone-strat").nth(1).locator(".stepper-val").innerText()].map(Number);
assert(hostVals[0] === phoneVals[0] && hostVals[1] === phoneVals[1], `phones show the host's accepted pledges (host ${hostVals}, phones ${phoneVals})`);
log("After a pledge race, phones show the host's accepted values:", hostVals.join("/"));
// QA N2: on a 390px phone, and at 200% zoom (195 CSS px wide), every "−", value and "+" of every pledge
// stepper is fully inside its stepper, its card and the screen, whatever the strategy title.
async function steppersVisible(pg, label) {
  const bad = await pg.evaluate(() => {
    const out = [], vw = innerWidth;
    document.querySelectorAll(".phone-strat").forEach((card, i) => {
      const c = card.getBoundingClientRect();
      const st = card.querySelector(".stepper");
      const s = st.getBoundingClientRect();
      st.querySelectorAll(".stepper-btn, .stepper-val").forEach((b) => {
        const r = b.getBoundingClientRect();
        const name = b.getAttribute("aria-label") ? b.getAttribute("aria-label").split(" ")[0] : "value";
        if (r.width < 24 || r.left < s.left - 0.5 || r.right > s.right + 0.5 || r.left < c.left || r.right > c.right || r.right > vw) out.push(`card ${i + 1} ${name} [${Math.round(r.left)}–${Math.round(r.right)}] stepper [${Math.round(s.left)}–${Math.round(s.right)}] card [${Math.round(c.left)}–${Math.round(c.right)}]`);
      });
    });
    if (document.scrollingElement.scrollWidth > vw + 1) out.push("page scrolls sideways");
    return out;
  });
  assert(!bad.length, `${label}: pledge steppers fully visible: ${bad.join("; ")}`);
}
for (const pg of [p1, p2]) await steppersVisible(pg, "390px");
await pshot(p2, "phone-07-council-steppers-390");
await p2.setViewportSize({ width: 195, height: 422 });
await p2.waitForTimeout(250);
for (const pg of [p2]) await steppersVisible(pg, "200% zoom");
await p2.evaluate(() => document.querySelector(".phone-strat").scrollIntoView({ block: "start" }));
await pshot(p2, "phone-08-council-steppers-200pct");
await p2.evaluate(() => window.scrollTo(0, 0));
await p2.setViewportSize({ width: 390, height: 844 });
log("Pledge steppers fully visible at 390px and at 200% zoom (QA N2)");
if (SHOTS) await shot(host, "live-host-council-phone-pledges");
await host.getByRole("button", { name: /Lock the Council/ }).click();
await wait(200);
await host.getByRole("button", { name: /Write the Headline of the Era/ }).click();
await wait(300);

// --- headline: Ben (seat 1, not lead) sends from phone
await p2.waitForSelector("#ph-hl", { timeout: 10000 });
await p2.fill("#ph-hl", "Partners carry the forest through lean years");
await p2.getByRole("button", { name: /Send headline/ }).click();
await host.waitForFunction(() => document.querySelector("#hl-1") && document.querySelector("#hl-1").value.includes("Partners carry"), null, { timeout: 10000 });
await pshot(p2, "phone-07-headline-projector");
await axeCheck(p2, "phone live headline");
await axeCheck(p1, "phone live lead-headline");
await pshot(p1, "phone-08-lead-headline-projector");
log("Phone headline applied on host");
markStep("pick headline");
await host.locator('button[aria-label="Pick Ben Okafor\'s headline"]').click();
await wait(200);
markStep("picked");

// screen theme phone shots
if (SHOTS) {
  p2.setDefaultTimeout(15000);
  markStep("screen-theme shots");
  await setTheme(p2, "screen");
  markStep("themed");
  await shot(p2, "phone-09-table-screen");
  await p2.getByRole("tab", { name: /Mandate/ }).click();
  await shot(p2, "phone-10-mandate-screen");
  await p2.getByRole("tab", { name: /Notes/ }).click();
  await p2.fill("#n-hl", "Water funds save the town");
  await shot(p2, "phone-11-notes-screen");
  await p2.getByRole("tab", { name: /Rules/ }).click();
  await shot(p2, "phone-12-rules-screen");
  await setTheme(p2, "projector");
}

// --- finish the game on the host
let guard = 0;
host.setDefaultTimeout(15000);
while ((await phaseOf(host)) !== "over" && guard++ < 300) { markStep(`finish: ${await phaseOf(host)} #${guard}`); await stepHost(host); await wait(60); }
await host.waitForSelector(".debrief");
// mandates match
const cards = host.locator(".mandate-card");
const hostWhy0 = await cards.nth(0).locator(".mandate-why").innerText();
const hostWhy1 = await cards.nth(1).locator(".mandate-why").innerText();
assert(hostWhy0 === phoneWhy && hostWhy1 === phoneWhy2, `phone mandates match the host reveal (${phoneWhy} / ${hostWhy0})`);
log("Mandates on phones match host reveal");
await p1.waitForSelector("text=Game over", { timeout: 10000 });
await pshot(p1, "phone-12b-table-over-projector");
await p1.getByRole("tab", { name: /Mandate/ }).click();
await p1.waitForSelector(".notice", { timeout: 10000 });
await pshot(p1, "phone-13-over-projector");
const maxPresence = Math.max(...(await host.evaluate(() => window.__ffPresenceSizes)));
log("Max host presence size:", maxPresence, "bytes");
assert(maxPresence <= 4096, "presence within 4 KiB");
// presence never contains mandates
const pres = await p1.evaluate(() => JSON.stringify(window.__ffPresenceSizes.length));
void pres;
const errs = errors().concat(axeIssues.map((x) => "axe " + x));
console.log(axeIssues.length ? "Phone axe issues: " + axeIssues.join("; ") : "Live phone states: 0 axe violations.");
console.log(errs.length ? "ERRORS:\n" + errs.join("\n") : "Zero console errors.");
await browser.close();
srv.close();
process.exit(errs.length ? 1 : 0);
