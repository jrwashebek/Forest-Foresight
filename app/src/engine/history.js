// Undo + action log. A game is fully described by (content, setup opts, action log):
// replaying the log reproduces the exact state, so autosave stores { setup, log, state }.
import { createGame, reduce } from "./engine.js";

export function startHistory(content, setup) {
  const state = createGame(content, setup);
  return { setup, state, past: [], log: [] };
}

export function dispatch(content, h, action, limit = 80) {
  const state = reduce(content, h.state, action);
  const past = h.past.concat([h.state]);
  if (past.length > limit) past.splice(0, past.length - limit);
  return { setup: h.setup, state, past, log: h.log.concat([action]) };
}

export function undo(h) {
  if (!h.past.length) return h;
  return { setup: h.setup, state: h.past[h.past.length - 1], past: h.past.slice(0, -1), log: h.log.slice(0, -1) };
}

/** Rebuild a history from setup + log. Throws if the log no longer applies (e.g. content changed). */
export function replay(content, setup, log, limit = 80) {
  let h = startHistory(content, setup);
  for (const a of log) h = dispatch(content, h, a, limit);
  return h;
}
