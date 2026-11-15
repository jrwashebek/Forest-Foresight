import { useEffect, useReducer } from "preact/hooks";
import { dispatch as engineDispatch, undo as engineUndo, replay, startHistory, lookups, EngineError, bandOf } from "../engine/index.js";
import { store as ls } from "./util.js";

export function createStore(init) {
  let s = init;
  const subs = new Set();
  return {
    get: () => s,
    set(p) {
      s = typeof p === "function" ? p(s) : { ...s, ...p };
      subs.forEach((f) => f(s));
    },
    sub(f) { subs.add(f); return () => subs.delete(f); },
  };
}

export function useStore(st) {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => st.sub(force), [st]);
  return st.get();
}

// ---------------------------------------------------------------------------
// App-wide: content, theme, capabilities, toasts, announcements
// ---------------------------------------------------------------------------
export const app = createStore({
  content: null, published: null, contentSource: "embedded", validation: { errors: [], warnings: [] },
  theme: ls.get("ff.theme", "projector"),
  textSize: ls.get("ff.textsize", 1),
  caps: { room: null, downloads: null, user: null, db: null, checked: false },
  canPublish: false,
  toasts: [],
  announce: "",
});

let toastId = 0;
export function toast(msg, kind = "info", ms = 4200) {
  const id = ++toastId;
  app.set((s) => ({ ...s, toasts: [...s.toasts, { id, msg, kind }] }));
  setTimeout(() => app.set((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

let annSeq = 0;
let annQueue = [];
let annTimer = 0;
/** Queue a screen-reader announcement; messages within ~80 ms are joined so none is lost. */
export function announce(msg) {
  if (!msg) return;
  annQueue.push(msg);
  clearTimeout(annTimer);
  annTimer = setTimeout(() => {
    annSeq++;
    // Alternate a zero-width char so identical messages are re-announced.
    app.set({ announce: annQueue.join(" ") + (annSeq % 2 ? "\u200b" : "") });
    annQueue = [];
  }, 80);
}

export const TEXT_SIZES = [0.9, 1, 1.12, 1.25, 1.4];
export function setTextSize(v) {
  const t = TEXT_SIZES.includes(v) ? v : 1;
  app.set({ textSize: t });
  ls.set("ff.textsize", t);
  document.documentElement.style.setProperty("--ts", String(t));
}

export function setTheme(theme) {
  app.set({ theme });
  ls.set("ff.theme", theme);
  document.documentElement.dataset.theme = theme;
}

// ---------------------------------------------------------------------------
// Host game store (history + UI state), autosaved
// ---------------------------------------------------------------------------
export const SAVE_KEY = "ff.host.v1";

export const host = createStore({
  h: null,          // { setup, state, past, log }
  timer: null,      // { kind, endsAt, remaining, running }
  seen: {},         // seat → { v, p, h, c } last applied intent timestamps
  ack: [],          // seat → last processed intent ts
  peers: [],        // phone peers [{seat, name, roleId, fp}]
  sync: "off",      // off | connecting | live | unavailable
  error: null,
  tableView: false,
  skipResume: false, // set by "New game": keep the saved debrief but show Setup
});

export function hostSave() {
  const { h, seen, timer } = host.get();
  if (!h) { ls.del(SAVE_KEY); return; }
  ls.set(SAVE_KEY, { setup: h.setup, log: h.log, state: h.state, seen, timer: timer && { ...timer, running: false }, savedAt: Date.now() });
}

export function loadSaved() {
  return ls.get(SAVE_KEY, null);
}

export function resumeSaved(content) {
  const saved = loadSaved();
  if (!saved || !saved.setup) return false;
  let h;
  try {
    h = replay(content, saved.setup, saved.log || []);
    if (JSON.stringify(h.state) !== JSON.stringify(saved.state)) throw new Error("mismatch");
  } catch {
    // Content changed since the save: keep the saved state, drop undo history.
    h = { setup: saved.setup, state: saved.state, past: [], log: [] };
  }
  host.set({ h, seen: saved.seen || {}, timer: saved.timer || null, ack: [] });
  return true;
}

export function startGame(content, setup) {
  const h = startHistory(content, setup);
  host.set({ h, seen: {}, ack: [], timer: null, error: null, skipResume: false });
  hostSave();
  return h;
}

export function endGame() {
  host.set({ h: null, timer: null, seen: {}, ack: [] });
  ls.del(SAVE_KEY);
}

/** Dispatch a game action. Returns true on success; shows a toast on engine errors. */
export function act(action, { quiet = false } = {}) {
  const content = app.get().content;
  const { h } = host.get();
  if (!h) return false;
  try {
    const next = engineDispatch(content, h, action);
    host.set({ h: next, error: null });
    hostSave();
    describeFx(content, next.state);
    return true;
  } catch (e) {
    if (!quiet) {
      if (e instanceof EngineError) toast(e.message, "warn");
      else { console.error(e); toast("Something went wrong applying that step.", "error"); }
    }
    return false;
  }
}

const ACTION_LABEL = {
  revealDriver: "revealing the Era Driver", vote: "a vote", resolveDilemma: "deciding the dilemma", beginSignals: "starting the signals",
  playSignal: "playing a signal", resolveSecondary: "the secondary effect", setReasoning: "the reasoning", endTurn: "ending the turn",
  beginCouncil: "opening the Council", pledge: "a pledge", lockCouncil: "locking the Council", beginHeadline: "opening the headline",
  submitHeadline: "a headline", pickHeadline: "picking the headline", placeInfluence: "placing influence", skipHeadline: "skipping the headline",
  setInsight: "the insight", beginCascades: "opening the system response", runCascades: "the system response", closeEra: "laying down the ring",
  useAbility: "an ability",
};
export function hostUndo() {
  const { h } = host.get();
  if (!h || !h.past.length) return;
  const last = h.log[h.log.length - 1];
  host.set({ h: engineUndo(h) });
  hostSave();
  // one message (the toast region is a polite live region), naming what was undone
  toast(`Undid ${(last && ACTION_LABEL[last.type]) || "the last step"}.`);
}

function describeFx(content, state) {
  const fx = state.fx;
  if (!fx || !fx.changes || !fx.changes.length) return;
  const L = lookups(content);
  const parts = fx.changes.map((c) => {
    const d = L.domains[c.d];
    if (!d) return "";
    if (c.note === "protected") return `${d.name} is protected, no change`;
    if (c.to === c.from) return `${d.name} stays at ${c.to}`;
    return `${d.name} ${c.to > c.from ? "up" : "down"} ${Math.abs(c.to - c.from)} to ${c.to}, ${bandOf(content, c.to).label}`;
  }).filter(Boolean);
  announce(`${fx.label || "Change"}: ${parts.join("; ")}.`);
}

export function setTimer(t) {
  host.set({ timer: t });
}
