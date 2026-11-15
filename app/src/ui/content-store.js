// Where content comes from: embedded published edition → shared db edition (content/live) → local edits.
import { app, toast } from "./store.js";
import { validateContent } from "../engine/index.js";
import { store as ls, withTimeout } from "./util.js";

export const LOCAL_KEY = "ff.content.local";
const DB_PATH = "content/live";

export function structuralOK(c) {
  return !!(c && typeof c === "object" && !Array.isArray(c) && c.meta && typeof c.meta === "object" &&
    ["domains", "eras", "signals", "drivers", "strategies", "roles", "scenarios"].every((k) => Array.isArray(c[k])) &&
    c.domains.length > 0 && c.eras.length > 0 && c.domains.every((d) => d && typeof d.id === "string"));
}

export function setContent(content, source) {
  const validation = structuralOK(content) ? validateContent(content) : { errors: validateContent(content).errors.concat(["The content is missing required lists (domains, eras, signals, …)."]), warnings: [] };
  app.set({ content, contentSource: source, validation });
}

export function readEmbedded() {
  try {
    const el = document.getElementById("ff-content");
    if (!el) return { error: "This page has no embedded content." };
    return { content: JSON.parse(el.textContent) };
  } catch (e) {
    return { error: `The embedded content couldn't be read: ${e.message}` };
  }
}

export function initContent() {
  const emb = readEmbedded();
  const published = emb.content || null;
  app.set({ published, publishedSource: "embedded", embedError: emb.error || null });
  const local = ls.get(LOCAL_KEY, null);
  if (local && structuralOK(local)) setContent(local, "local");
  else if (published) setContent(published, "embedded");
  else app.set({ content: null, validation: { errors: [emb.error || "No content."], warnings: [] } });
}

export function setLocalContent(c) {
  const ok = ls.set(LOCAL_KEY, c);
  if (!ok) toast("This browser won't store edits. Export your content to keep it.", "warn", 7000);
  setContent(c, "local");
}

export function resetToPublished() {
  ls.del(LOCAL_KEY);
  const s = app.get();
  if (s.published) setContent(s.published, s.publishedSource || "embedded");
}

function unwrap(snap) {
  if (snap == null) return null;
  let v = snap;
  if (typeof v.data === "function") v = v.data();
  else if (v.value !== undefined && !v.content) v = v.value;
  if (v && typeof v === "string") { try { v = JSON.parse(v); } catch { return null; } }
  if (v && v.content) v = v.content;
  if (v && typeof v === "string") { try { v = JSON.parse(v); } catch { return null; } }
  return v;
}

/** Load the shared edition (10 s timeout). Applies it unless local edits are active. */
export async function loadShared(db) {
  try {
    const doc = db.doc(DB_PATH);
    const snap = await withTimeout(doc.get(), 10000, null);
    const c = unwrap(snap);
    if (!c || !structuralOK(c) || validateContent(c).errors.length) return false;
    app.set({ published: c, publishedSource: "db" });
    if (app.get().contentSource !== "local") setContent(c, "db");
    return true;
  } catch {
    return false;
  }
}

export async function publishContent(content) {
  const db = app.get().caps.db;
  if (!db) return false;
  try {
    const r = await withTimeout(Promise.resolve(db.doc(DB_PATH).set({ v: 1, edition: content.meta.edition, updated: content.meta.updated, content })).then(() => "ok"), 15000, "failed");
    if (r !== "ok") return false;
    app.set({ published: content, publishedSource: "db" });
    ls.del(LOCAL_KEY);
    setContent(content, "db");
    return true;
  } catch {
    return false;
  }
}
