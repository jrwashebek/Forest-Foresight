// Small browser helpers. Everything here must survive a hostile sandbox:
// localStorage may throw, clipboard may refuse, window.claude may not exist.

export async function cap(name) {
  try {
    return window.claude && window.claude.use ? await window.claude.use(name) : null;
  } catch {
    return null;
  }
}

export const store = {
  get(key, fallback = null) {
    try {
      const v = window.localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  del(key) {
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

/** Clipboard write — call only from a click handler. Resolves true/false, never throws. */
export async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand && document.execCommand("copy");
    ta.remove();
    return !!ok;
  } catch {
    return false;
  }
}

export const cx = (...a) => a.filter(Boolean).join(" ");

export function reducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

export const fmtDelta = (d) => (d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : "0");
export const arrow = (d) => (d > 0 ? "▲" : d < 0 ? "▼" : "•");

export function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Hex helpers for theme-adjusted domain colours. */
export function mix(hex, toHex, t) {
  const a = parseInt(hex.slice(1), 16), b = parseInt(toHex.slice(1), 16);
  const ch = (x, s) => (x >> s) & 255;
  const m = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return "#" + ((1 << 24) + (m(16) << 16) + (m(8) << 8) + m(0)).toString(16).slice(1);
}

export function domainTone(hex, theme) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || "")) hex = "#7a7a6a";
  return theme === "screen"
    ? { fill: mix(hex, "#ffffff", 0.18), edge: mix(hex, "#ffffff", 0.55), soft: mix(hex, "#0f1b16", 0.55) }
    : { fill: hex, edge: mix(hex, "#000000", 0.35), soft: mix(hex, "#f6f2e4", 0.72) };
}

export function slug(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 48);
}

export function words(s) {
  return String(s || "").trim().split(/\s+/).filter(Boolean).length;
}

export function randomEntropy() {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0];
  } catch {
    return (Date.now() ^ (performance.now() * 1000)) >>> 0;
  }
}

export function withTimeout(promise, ms, fallback = null) {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve(fallback); } }, ms);
    Promise.resolve(promise).then(
      (v) => { if (!done) { done = true; clearTimeout(t); resolve(v); } },
      () => { if (!done) { done = true; clearTimeout(t); resolve(fallback); } },
    );
  });
}

export function setHash(h) {
  if (location.hash !== "#" + h) location.hash = h;
}

/** Short, unique labels for players: initials (AR), lengthened only where two would collide, by the
 *  shortest prefixes of the first and last name that tell them apart (Maria Lopez / Mark Lee → MLo / MLe;
 *  Maria / Mark → Mari / Mark), and as a last resort the seat number (two "Ana Ruiz" → AR1 / AR4). */
export function playerTokens(names) {
  const words = names.map((n) => String(n).trim().split(/\s+/).filter(Boolean));
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
  const make = (w, a, b) => {
    if (!w.length) return "?";
    const first = w[0], last = w.length > 1 ? w[w.length - 1] : "";
    if (!last) return a <= 1 ? first.slice(0, 2).toUpperCase() : cap(first.slice(0, a + 1));
    return (a <= 1 ? first[0].toUpperCase() : cap(first.slice(0, a))) + (b <= 1 ? last[0].toUpperCase() : cap(last.slice(0, b)));
  };
  const base = words.map((w) => make(w, 1, 1));
  const out = base.slice();
  const tries = [[1, 2], [2, 1], [2, 2], [1, 3], [3, 1], [3, 2], [2, 3], [3, 3], [4, 1], [1, 4], [4, 2]];
  const groups = {};
  base.forEach((b, i) => { (groups[b.toUpperCase()] = groups[b.toUpperCase()] || []).push(i); });
  for (const idx of Object.values(groups)) {
    if (idx.length < 2) continue;
    let done = false;
    for (const [a, b] of tries) {
      const cand = idx.map((i) => make(words[i], a, b));
      if (cand.some((c) => c.length > 4)) continue; // chips hold four letters at most
      if (new Set(cand.map((c) => c.toUpperCase())).size === cand.length) { idx.forEach((i, k) => { out[i] = cand[k]; }); done = true; break; }
    }
    if (!done) idx.forEach((i) => { out[i] = base[i] + (i + 1); });
  }
  // a lengthened token could, rarely, equal someone else's: fall back to seat numbers for those
  return out.map((t, i) => (out.findIndex((x) => x.toUpperCase() === t.toUpperCase()) !== i || out.filter((x) => x.toUpperCase() === t.toUpperCase()).length > 1 ? base[i] + (i + 1) : t));
}
export function firstNames(names) {
  const first = names.map((n) => String(n).trim().split(/\s+/)[0] || n);
  return first.map((f, i) => (first.filter((x) => x === f).length > 1 ? names[i] : f));
}
