// Deterministic hashing + seeded RNG. No DOM, no Date, no Math.random.

/** xmur3 string hash → returns a generator of 32-bit unsigned seeds. */
export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/** One-shot 32-bit hash of a string. */
export function hash32(str) {
  return xmur3(String(str))();
}

/**
 * mulberry32 step. The RNG state lives in the game state as a plain uint32 so the
 * engine stays pure: next(s) → [float in [0,1), newState].
 */
export function rngNext(s) {
  let t = (s + 0x6d2b79f5) >>> 0;
  const ns = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const v = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [v, ns];
}

/** Small mutable RNG wrapper used inside a single reducer call. */
export class Rng {
  constructor(state) { this.s = state >>> 0; }
  next() { const [v, ns] = rngNext(this.s); this.s = ns; return v; }
  int(n) { return Math.floor(this.next() * n); }
  pick(arr) { return arr.length ? arr[this.int(arr.length)] : undefined; }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = this.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
}

// Game codes: 6 chars, no ambiguous glyphs (0/O, 1/I/L).
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

/** Make a game code from any integer entropy source (caller supplies randomness). */
export function makeCode(entropy) {
  let n = entropy >>> 0;
  let x = xmur3("ff-code-" + n);
  let out = "";
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[x() % CODE_ALPHABET.length];
  return out;
}

export function normalizeCode(code) {
  return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export function seedFromCode(code) {
  return hash32("ff-seed|" + code);
}

/**
 * Mandate variant = hash(code, seatNo, roleId) mod variants.
 * seatNo is the 1-based seat number players see. Host and phone compute the same value;
 * mandates are never transmitted.
 */
export function mandateVariant(code, seatNo, roleId, variants) {
  if (!variants || variants < 1) return 0;
  return hash32(`ff-mandate|${code}|${seatNo}|${roleId}`) % variants;
}

/** 2-character check code shown on a phone's role card and the host's seat chip, so a wrong seat/role
 *  (which would give the phone a different mandate) is easy to spot before play. */
export function seatCheck(code, seatNo, roleId) {
  const h = hash32(`ff-check|${code}|${seatNo}|${roleId}`);
  return CODE_ALPHABET[h % CODE_ALPHABET.length] + CODE_ALPHABET[(h >>> 8) % CODE_ALPHABET.length];
}
