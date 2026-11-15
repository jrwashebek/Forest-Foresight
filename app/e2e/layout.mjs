// Layout CI for the big screen: every phase step × every Text size (90–140%) × 1920×1080 and 1366×768
// × 5 and 7 players. At each step and size it asserts:
//   - the primary action and every seat are on screen and not covered,
//   - every dilemma option, the "Pledging for" selector, every pledge stepper and every headline Pick
//     is reachable: on screen above the pinned action bar, or after scrolling the phase panel
//     (at 90–100% the dilemma options and pledge steppers must be visible without scrolling, QA M1/M2),
//   - nothing in the header overlaps or is clipped; the tree column is not cut off;
//     legend and seat names are not truncated; the page never scrolls sideways,
//   - no visible board text renders below 14px and tree labels/badges are ≥ 14px.
// It also drives the real Game menu A−/A+ control once (focus must stay in the dialog).
// Usage: node e2e/layout.mjs [--shots] [--players 5,7] [--vp 1920,1366] [--sizes 0.9,1,1.12,1.25,1.4] [--steps a,b]
import { serve, launch, newPage, shot, assert } from "./lib.mjs";
import { stepHost, phaseOf } from "./driver.mjs";

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] ? argv[i + 1].split(",") : d; };
const SHOTS = argv.includes("--shots");
const PLAYERS = opt("players", ["5", "7"]).map(Number);
const VPS = opt("vp", ["1920", "1366"]).map((w) => (w === "1920" ? [1920, 1080] : [1366, 768]));
const SIZES = opt("sizes", ["0.9", "1", "1.12", "1.25", "1.4"]).map(Number);
const ONLY = opt("steps", null);
const NAMES = ["Ana Ruiz", "Ben Okafor", "Chen Wu", "Maria Lopez", "Mark Lee", "Eli Begay", "Fay Thompson"];

const srv = await serve();
const browser = await launch();
const errs = [];
const fails = [];

async function stepName(page) {
  const ph = await phaseOf(page);
  const has = async (sel) => (await page.locator(sel).count()) > 0;
  if (ph === "driver") return (await has(".phase--reveal")) ? "driver-reveal" : (await page.getByRole("button", { name: /Continue to signals/ }).count()) ? "driver-decided" : "driver-dilemma";
  if (ph === "signals") return (await has(".resolver")) ? "signals-resolve" : (await has(".hand--discard")) ? "signals-discard" : (await has(".hand")) ? "signals-choose" : "signals-done";
  if (ph === "council") return (await has(".pledge-for")) ? "council-open" : "council-locked";
  if (ph === "headline") return (await has(".influence")) ? "headline-influence" : (await has(".sowhat")) ? "headline-sowhat" : "headline-write";
  if (ph === "cascades") return (await page.getByRole("button", { name: /Apply the system response/ }).count()) ? "cascades-preview" : "cascades-done";
  return ph;
}

async function setSize(page, ts) {
  await page.evaluate((t) => {
    try { localStorage.setItem("ff.textsize", JSON.stringify(t)); } catch { /* */ }
    document.documentElement.style.setProperty("--ts", String(t));
  }, ts);
  // ResizeObservers → re-render → layout settles: wait until the board's fit state is stable for 3 frames
  await page.evaluate(() => new Promise((resolve) => {
    const sig = () => {
      const b = document.querySelector(".board"), h = document.querySelector(".board-head"), svg = document.querySelector(".board-tree svg");
      return [b && b.className, h && h.dataset.hfit, svg && svg.getAttribute("class"), [...document.querySelectorAll(".seat")].map((x) => x.dataset.short).join("")].join("|");
    };
    let last = sig(), same = 0, n = 0;
    const tick = () => requestAnimationFrame(() => setTimeout(() => {
      const now = sig();
      same = now === last ? same + 1 : 0;
      last = now;
      if ((same >= 3 && n > 3) || n++ > 60) resolve(); else tick();
    }, 20));
    tick();
  }));
}

/** All checks for one step at one size. Returns a list of problems. */
async function audit(page, step, strict) {
  return page.evaluate(({ step, strict }) => {
    const vw = innerWidth, vh = innerHeight, out = [];
    const R = (el) => el.getBoundingClientRect();
    const fmt = (r) => `[x ${Math.round(r.left)}–${Math.round(r.right)}, y ${Math.round(r.top)}–${Math.round(r.bottom)}]`;
    const shown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
    const label = (el) => (el.getAttribute("aria-label") || el.textContent || el.className || el.tagName).replace(/\s+/g, " ").trim().slice(0, 32);
    const hitOk = (el) => {
      const r = R(el);
      // centre plus two inset points (rounded pills don't hit-test at their corners)
      const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + r.width * 0.25, r.top + r.height / 2], [r.right - r.width * 0.25, r.top + r.height / 2]];
      for (const [x, y] of pts) {
        if (x < 0 || y < 0 || x >= vw || y >= vh) return "outside";
        const t = document.elementFromPoint(x, y);
        if (!t || !(t === el || el.contains(t))) return t ? `covered by ${(t.className && t.className.baseVal != null ? t.className.baseVal : t.className) || t.tagName}` : "nothing";
      }
      return null;
    };
    const onScreen = (el, name) => {
      const r = R(el);
      if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) { out.push(`${name} off screen ${fmt(r)}`); return; }
      const h = hitOk(el);
      if (h) out.push(`${name} ${h} ${fmt(r)}`);
    };
    // --- page never scrolls
    const se = document.scrollingElement;
    if (se.scrollWidth > vw + 1) out.push(`page scrolls sideways (${se.scrollWidth} > ${vw})`);
    if (se.scrollHeight > vh + 1) out.push(`page scrolls down (${se.scrollHeight} > ${vh})`);
    // --- header
    const head = document.querySelector(".board-head");
    const parts = [...head.children].filter(shown);
    for (let i = 0; i < parts.length; i++) {
      const a = R(parts[i]);
      if (a.left < -1 || a.right > vw + 1) out.push(`header ${parts[i].className} off screen ${fmt(a)}`);
      if (parts[i].scrollWidth > parts[i].clientWidth + 1 && getComputedStyle(parts[i]).overflow !== "visible") out.push(`header ${parts[i].className} clipped (${parts[i].scrollWidth} > ${parts[i].clientWidth})`);
      for (let j = i + 1; j < parts.length; j++) {
        const b = R(parts[j]);
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(`header ${parts[i].className} overlaps ${parts[j].className}`);
      }
    }
    head.querySelectorAll(".phase-line, .era-line, .bh-brand span, .phase-compact").forEach((el) => {
      // collapsed (visually hidden) parts are 1px wide on purpose
      if (shown(el) && el.clientWidth > 2 && el.scrollWidth > el.clientWidth + 1) out.push(`header text clipped: ${label(el)}`);
    });
    head.querySelectorAll("button").forEach((b) => { if (shown(b)) onScreen(b, `header button "${label(b)}"`); });
    // --- tree column
    const tree = document.querySelector(".board-tree");
    if (tree) {
      const tr = R(tree);
      if (tr.left < -1 || tr.right > vw + 1) out.push(`tree column cut off ${fmt(tr)}`);
      tree.querySelectorAll(".tree-legend, .tree-foot, .tree-foot > *, svg.tree").forEach((el) => {
        if (!shown(el)) return;
        const r = R(el);
        if (r.left < tr.left - 2 || r.right > tr.right + 2) out.push(`tree column: ${el.className.baseVal != null ? el.className.baseVal : el.className} spills out ${fmt(r)} (column ${fmt(tr)})`);
      });
      tree.querySelectorAll(".tl-name").forEach((el) => { if (el.scrollWidth > el.clientWidth + 1) out.push(`legend name truncated: ${label(el)}`); });
      // nothing in the tree column may run under the seats or need its own scrolling
      if (tree.scrollHeight > tree.clientHeight + 1) out.push(`tree column overflows (${tree.scrollHeight} > ${tree.clientHeight})`);
      tree.querySelectorAll(".tree-foot > *, .tree-legend, .pick-hint").forEach((el) => {
        if (!shown(el)) return;
        const r = R(el);
        if (r.bottom > tr.bottom + 1) out.push(`tree column: ${String(el.className).split(" ")[0]} runs below the column (${Math.round(r.bottom)} > ${Math.round(tr.bottom)})`);
      });
    }
    // --- seats
    document.querySelectorAll(".seat").forEach((el, i) => {
      onScreen(el, `seat ${i + 1}`);
      const nm = el.querySelector(".seat-name");
      if (nm && nm.scrollWidth > nm.clientWidth + 1) out.push(`seat ${i + 1} name truncated: ${label(nm)}`);
      const ab = el.querySelector(".ability-btn");
      if (ab) onScreen(ab, `seat ${i + 1} ability`);
    });
    // --- primary action (pinned)
    const panel = document.querySelector("#panel");
    const bars = [...panel.querySelectorAll(".phase-actions")].filter((b) => shown(b) && getComputedStyle(b).position === "sticky");
    const bar = bars[bars.length - 1];
    const prim = [...panel.querySelectorAll(".phase-actions .btn--primary")].filter(shown);
    if (step !== "headline-write") {
      if (!prim.length) out.push("no primary action");
      prim.forEach((b) => onScreen(b, `primary "${label(b)}"`));
    } else if (bar) bar.querySelectorAll(".btn").forEach((b) => onScreen(b, `action "${label(b)}"`));
    // --- reachable inside the phase panel (visible above the pinned bar, or after scrolling the panel)
    const pr = R(panel);
    const visibleIn = (el) => {
      const r = R(el);
      const barTop = bar && !bar.contains(el) ? R(bar).top : pr.bottom;
      const bottom = Math.min(pr.bottom, barTop, vh);
      return r.top >= Math.max(pr.top, 0) - 1 && r.bottom <= bottom + 1 && r.left >= pr.left - 1 && r.right <= Math.min(pr.right, vw) + 1 && !hitOk(el);
    };
    const reach = (el, name, mustBeVisible) => {
      if (visibleIn(el)) return;
      if (mustBeVisible) { out.push(`${name} not visible without scrolling ${fmt(R(el))}`); return; }
      const keep = panel.scrollTop;
      const r = R(el);
      const barTop = bar && !bar.contains(el) ? R(bar).top : pr.bottom;
      const bottom = Math.min(pr.bottom, barTop, vh);
      if (r.bottom > bottom) panel.scrollTop += Math.ceil(r.bottom - bottom) + 2;
      else if (r.top < pr.top) panel.scrollTop -= Math.ceil(pr.top - r.top) + 2;
      const ok = visibleIn(el);
      const r2 = R(el);
      panel.scrollTop = keep;
      if (!ok) out.push(`${name} unreachable ${fmt(r2)} (panel ${fmt(pr)}${bar ? `, bar top ${Math.round(R(bar).top)}` : ""})`);
    };
    if (step === "driver-dilemma") document.querySelectorAll(".option").forEach((el, i) => reach(el, `option ${String.fromCharCode(65 + i)}`, strict));
    if (step === "council-open") {
      document.querySelectorAll(".pledge-seat").forEach((el, i) => reach(el, `pledging-for ${i + 1}`, false));
      document.querySelectorAll(".pledge-mine").forEach((el, i) => {
        reach(el, `pledge stepper ${i + 1}`, strict);
        const card = el.closest(".strategy-card") || el.parentElement;
        el.querySelectorAll(".stepper-btn").forEach((b) => { const r = R(b), c = R(card); if (r.left < c.left - 1 || r.right > c.right + 1) out.push(`pledge stepper ${i + 1} button clipped by its card`); });
      });
    }
    if (step === "headline-write") document.querySelectorAll(".proof").forEach((el, i) => reach(el, `headline row ${i + 1}`, false));
    if (step === "headline-influence") document.querySelectorAll(".influence .domain-btn").forEach((el, i) => reach(el, `influence domain ${i + 1}`, false));
    if (step === "signals-resolve") document.querySelectorAll(".resolver .domain-btn").forEach((el, i) => reach(el, `resolver domain ${i + 1}`, false));
    if (step === "cascades-done") document.querySelectorAll(".era-close-bar .phase-help").forEach((el) => onScreen(el, "era close note"));
    // --- smallest visible text on the board (SVG labels are checked separately)
    const small = [];
    const w = document.createTreeWalker(document.querySelector(".board"), NodeFilter.SHOW_TEXT);
    let t;
    while ((t = w.nextNode())) {
      const s = t.textContent.trim();
      const e = t.parentElement;
      if (!s || !e || e.closest("svg, .sr-only, .scrim") || !shown(e) || e.getBoundingClientRect().width <= 1) continue;
      const fs = parseFloat(getComputedStyle(e).fontSize);
      if (fs < 13.95) small.push(`${s.slice(0, 18)} <${String(e.className).split(" ")[0] || e.tagName}> ${fs.toFixed(1)}px`);
    }
    if (small.length) out.push(`text below 14px: ${[...new Set(small)].slice(0, 6).join("; ")}`);
    // --- tree labels / badges
    const svg = document.querySelector(".board-tree svg.tree");
    if (svg) {
      const vb = svg.viewBox.baseVal, r = R(svg);
      const scale = Math.min(r.width / vb.width, r.height / vb.height);
      const px = [...svg.querySelectorAll(".tree-name, .tree-band-label, .tree-val, .tree-badge-val")].map((x) => parseFloat(getComputedStyle(x).fontSize) * scale);
      if (px.length && Math.min(...px) < 13.95) out.push(`tree labels ${Math.min(...px).toFixed(1)}px`);
    }
    return out;
  }, { step, strict });
}

// The real control, once: A+ up to 140% keeps focus inside the Game menu; A− back down; Reset.
async function textSizeControl(page) {
  await page.getByRole("button", { name: "Game menu", exact: true }).click();
  await page.waitForSelector(".dialog");
  const plus = page.getByRole("button", { name: /larger text/ });
  for (let i = 0; i < 6 && (await plus.isEnabled()); i++) await plus.click();
  const st = await page.evaluate(() => ({ ts: getComputedStyle(document.documentElement).getPropertyValue("--ts").trim(), inDialog: !!document.activeElement.closest(".dialog"), focus: document.activeElement.textContent }));
  assert(st.ts === "1.4", `A+ reaches 140% (got ${st.ts})`);
  assert(st.inDialog, `focus stays in the Game menu after A+ hits 140% (on "${st.focus}")`);
  await page.getByRole("button", { name: /^Reset$/ }).click();
  const st2 = await page.evaluate(() => ({ ts: getComputedStyle(document.documentElement).getPropertyValue("--ts").trim(), inDialog: !!document.activeElement.closest(".dialog") }));
  assert(st2.ts === "1" && st2.inDialog, "Reset returns to 100% and keeps focus in the dialog");
  const minus = page.getByRole("button", { name: /smaller text/ });
  while (await minus.isEnabled()) await minus.click();
  assert(await page.evaluate(() => !!document.activeElement.closest(".dialog")), "focus stays in the Game menu after A− hits 90%");
  await page.getByRole("button", { name: /^Reset$/ }).click();
  await page.keyboard.press("Escape");
  console.log("Game menu text size: A+ to 140%, Reset, A− to 90%: focus stayed in the dialog");
}

let shotsTaken = 0;
for (const players of PLAYERS) {
  for (const [w, h] of VPS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
    const { page, errors } = await newPage(ctx, { name: `layout-${players}p-${w}`, viewport: { width: w, height: h } });
    await page.goto(srv.url + "#host");
    await page.waitForSelector(".setup");
    await page.locator(".seg-btn", { hasText: String(players) }).first().click();
    for (let i = 0; i < players; i++) await page.locator(`#pn-${i}`).fill(NAMES[i]);
    await page.getByRole("button", { name: /Start the game/ }).click();
    await page.waitForSelector(".board");
    if (players === PLAYERS[0] && w === VPS[0][0] && !argv.includes("--no-menu")) await textSizeControl(page);
    const seen = new Set();
    let checks = 0, guard = 0;
    while ((await phaseOf(page)) !== "over" && guard++ < 400) {
      const step = await stepName(page);
      if (!seen.has(step) && (!ONLY || ONLY.includes(step))) {
        seen.add(step);
        await page.waitForTimeout(250);
        for (const ts of SIZES) {
          await setSize(page, ts);
          const probs = await audit(page, step, ts <= 1);
          checks++;
          const tag = `${players}p ${w} ${Math.round(ts * 100)}% ${step}`;
          if (probs.length) {
            fails.push(`${tag}: ${probs.join(" | ")}`);
            if (SHOTS && shotsTaken++ < 60) await shot(page, `layout-fail-${players}p-${w}-${Math.round(ts * 100)}-${step}`);
          } else if (SHOTS && (ts === 1.4 || ts === 1.12 || ts === 1) && ["driver-dilemma", "council-open", "era-open", "signals-choose", "headline-write", "cascades-done", "signals-resolve"].includes(step)) {
            await shot(page, `layout-${players}p-${w}-${Math.round(ts * 100)}-${step}`);
          }
        }
        await setSize(page, 1);
      } else seen.add(step);
      await stepHost(page);
      await page.waitForTimeout(40);
    }
    console.log(`${players} players at ${w}×${h}: ${seen.size} steps × ${SIZES.length} text sizes (${checks} layouts checked)`);
    errs.push(...errors);
    await ctx.close();
  }
}
if (fails.length) console.log(`LAYOUT FAILURES (${fails.length}):\n` + fails.join("\n"));
else console.log("Layout: header, tree column, seats, primary action, options, pledge controls and headline rows fit at every text size.");
console.log(errs.length ? "ERRORS:\n" + errs.join("\n") : "Zero console errors.");
await browser.close();
srv.close();
process.exit(errs.length || fails.length ? 1 : 0);
