// Live sync over the optional `room` capability.
// Host = authority: broadcasts compact public state in ITS presence.
// Phones send intents (vote / pledge / headline / play) in THEIR presence, with timestamps.
// Mandates are never sent.
import { lookups, effectiveCost } from "../engine/index.js";
import { app, host, act, hostSave, createStore } from "./store.js";

const TERMINAL = /revoked|not_granted|capability|not_permitted/;
const MAX_PRESENCE = 4000;

function isConnected(ev, room) {
  if (typeof ev === "boolean") return ev;
  if (ev && typeof ev === "object") {
    if (typeof ev.connected === "boolean") return ev.connected;
    if (ev.state) return ev.state === "connected" || ev.state === "open";
  }
  try { return !!room.connected(); } catch { return false; }
}
function isTerminal(ev) {
  return !!(ev && typeof ev === "object" && ev.code && TERMINAL.test(String(ev.code)));
}

/** Diff-patch presence so removed keys are cleared (top-level null removes a field). */
function makePresenceWriter(room) {
  let last = {};
  let lastJson = "";
  return (obj) => {
    const json = JSON.stringify(obj);
    if (json === lastJson) return;
    const patch = { ...obj };
    for (const k of Object.keys(last)) if (!(k in obj)) patch[k] = null;
    try { room.presence(patch); lastJson = json; last = obj; } catch (e) { /* rate limited or closed: try again next change */ }
  };
}

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------
let H = null; // { room, unsubPeers, unsubStore, write, timer }

export function publicState(content, st, { timer, ack } = {}) {
  const L = lookups(content);
  const o = {
    k: "h", v: 1, c: st.code, fp: st.fp, ph: st.phase, e: st.era, ld: st.lead, sc: st.scenarioId,
    pl: st.players.map((p) => [p.name.slice(0, 24), p.roleId, p.abilityUsed ? 1 : 0]),
    cd: L.domainIds.map((id) => st.cond[id]),
    pr: st.protected.slice(),
  };
  if (st.phase === "driver" && st.driver) {
    o.dr = st.driver.id;
    o.dc = st.driver.chosen == null ? -1 : st.driver.chosen;
    o.dv = st.driver.votes.map((v) => (v == null ? -1 : v));
  }
  if (st.phase === "signals" && st.turn) {
    o.tn = st.turn.done ? -1 : st.turn.order[st.turn.pos];
    o.tp = st.turn.step;
    o.hs = st.hands;
  }
  if (st.phase === "council" && st.council) {
    const c = st.council;
    o.mk = c.market.map((id) => [id, effectiveCost(content, st, id)]);
    o.pg = c.market.map((id) => c.pledges[id]);
    o.cp = c.capacity;
    o.lk = c.locked ? 1 : 0;
  }
  if (st.phase === "headline" && st.headline) {
    o.hl = st.headline.subs.map((x) => (x ? 1 : 0));
    o.hp = st.headline.pick == null ? -1 : st.headline.pick;
    if (st.headline.pick != null) o.hx = String(st.headline.subs[st.headline.pick] || "").slice(0, 120);
  }
  if (st.phase === "over" && st.outcome) { o.oc = st.outcome.tier; o.ix = st.outcome.index; }
  if (timer) {
    const rem = timer.running ? Math.max(0, timer.endsAt - Date.now()) : timer.remaining;
    o.tk = timer.kind; o.tr = Math.round(rem); o.tg = timer.running ? 1 : 0;
  }
  if (ack && ack.length) o.ak = ack.map((x) => x || 0);
  // Keep inside the presence budget: drop non-active hands first.
  if (JSON.stringify(o).length > MAX_PRESENCE && o.hs) o.hs = o.hs.map((h, i) => (i === o.tn ? h : []));
  if (JSON.stringify(o).length > MAX_PRESENCE) delete o.hs;
  return o;
}

export async function startHostSync(code) {
  stopHostSync();
  const room = app.get().caps.room;
  if (!room) { host.set({ sync: "unavailable" }); return; }
  host.set({ sync: "connecting" });
  let r;
  try {
    r = await room.join("ff-" + code.toLowerCase());
  } catch (e) {
    host.set({ sync: "unavailable" });
    return;
  }
  const write = makePresenceWriter(r);
  H = { room: r, write, unsubPeers: null, unsubStore: null, pending: 0 };
  try {
    H.unsubConn = r.onConnection && r.onConnection((ev) => {
      if (isTerminal(ev)) { stopHostSync(); host.set({ sync: "unavailable" }); return; }
      host.set({ sync: isConnected(ev, r) ? "live" : "connecting" });
    });
  } catch { /* optional */ }
  H.unsubPeers = r.onPeers((ev) => handlePeers(ev && ev.peers ? ev.peers : r.peers()));
  host.set({ sync: (() => { try { return r.connected() ? "live" : "connecting"; } catch { return "connecting"; } })() });
  const push = () => {
    if (!H) return;
    clearTimeout(H.pending);
    H.pending = setTimeout(() => {
      const { h, timer, ack } = host.get();
      const content = app.get().content;
      if (!h || !H) return;
      H.write(publicState(content, h.state, { timer, ack }));
    }, 80);
  };
  H.unsubStore = host.sub(push);
  push();
}

export function stopHostSync() {
  if (!H) return;
  try { H.unsubPeers && H.unsubPeers(); } catch { /* */ }
  try { H.unsubStore && H.unsubStore(); } catch { /* */ }
  try { typeof H.unsubConn === "function" && H.unsubConn(); } catch { /* */ }
  try { H.room.leave && H.room.leave(); } catch { /* */ }
  H = null;
  host.set({ peers: [], sync: "off" });
}

function handlePeers(peers) {
  const { h } = host.get();
  const content = app.get().content;
  if (!h) return;
  const st = h.state;
  const phones = [];
  for (const p of peers || []) {
    if (p.isMe) continue;
    const pr = p.presence || {};
    if (pr.k !== "p") continue;
    const seat = Number(pr.st) - 1;
    const valid = Number.isInteger(seat) && seat >= 0 && seat < st.players.length;
    const roleOk = valid && st.players[seat].roleId === pr.r;
    phones.push({ peer: p.peer, seat: valid ? seat : null, name: String(pr.nm || "").slice(0, 40), roleOk, fp: pr.fp });
    if (valid && roleOk) applyIntents(content, seat, pr);
  }
  host.set({ peers: phones });
}

function applyIntents(content, seat, pr) {
  const s = host.get();
  const seen = { ...(s.seen[seat] || {}) };
  const ack = s.ack.slice();
  let changed = false;
  const fresh = (key, it) => it && typeof it === "object" && Number.isFinite(it.t) && it.t > (seen[key] || 0);
  const mark = (key, it) => { seen[key] = it.t; ack[seat] = Math.max(ack[seat] || 0, it.t); changed = true; };
  const st = () => host.get().h.state;
  const L = lookups(content);

  if (fresh("v", pr.iv)) {
    const it = pr.iv;
    const cur = st();
    if (cur.phase === "driver" && cur.driver && cur.driver.id === it.d && Number.isInteger(it.o)) act({ type: "vote", seat, option: it.o }, { quiet: true });
    mark("v", it);
  }
  if (fresh("p", pr.ip)) {
    const it = pr.ip;
    const cur = st();
    if (cur.phase === "council" && cur.council && !cur.council.locked && it.e === cur.era && Array.isArray(it.a)) {
      // apply decreases first so increases have room in the budget
      const list = it.a.filter((x) => Array.isArray(x) && cur.council.market.includes(x[0]) && Number.isFinite(x[1]));
      list.sort((a, b) => (a[1] - (cur.council.pledges[a[0]][seat] || 0)) - (b[1] - (cur.council.pledges[b[0]][seat] || 0)));
      for (const [sid, n] of list.slice(0, 8)) act({ type: "pledge", seat, strategy: sid, amount: Math.max(0, Math.min(20, Math.floor(n))) }, { quiet: true });
    }
    mark("p", it);
  }
  if (fresh("h", pr.ih)) {
    const it = pr.ih;
    const cur = st();
    if (cur.phase === "headline" && it.e === cur.era && typeof it.x === "string") act({ type: "submitHeadline", seat, text: it.x.slice(0, 120) }, { quiet: true });
    mark("h", it);
  }
  if (fresh("c", pr.ic)) {
    const it = pr.ic;
    const cur = st();
    if (cur.phase === "signals" && L.signals[it.c] && cur.turn && cur.turn.order[cur.turn.pos] === seat) act({ type: "playSignal", seat, card: it.c }, { quiet: true });
    mark("c", it);
  }
  if (changed) {
    host.set((x) => ({ ...x, seen: { ...x.seen, [seat]: seen }, ack }));
    hostSave();
  }
}

// ---------------------------------------------------------------------------
// Phone
// ---------------------------------------------------------------------------
export const phone = createStore({ status: "off", ps: null, psAt: 0, intents: {}, room: null });
let P = null;

export async function startPhoneSync({ code, seat, roleId, name, fp }) {
  stopPhoneSync();
  const room = app.get().caps.room;
  if (!room) { phone.set({ status: "unavailable" }); return; }
  phone.set({ status: "connecting" });
  let r;
  try { r = await room.join("ff-" + code.toLowerCase()); } catch { phone.set({ status: "unavailable" }); return; }
  const write = makePresenceWriter(r);
  P = { room: r, write, base: { k: "p", st: seat + 1, r: roleId, nm: String(name || "").slice(0, 24), fp } };
  P.write({ ...P.base });
  try {
    P.unsubConn = r.onConnection && r.onConnection((ev) => {
      if (isTerminal(ev)) { stopPhoneSync(); phone.set({ status: "unavailable" }); return; }
      phone.set({ status: isConnected(ev, r) ? "live" : "connecting" });
    });
  } catch { /* */ }
  const onPeers = (peers) => {
    const hostPeer = (peers || []).find((p) => p.presence && p.presence.k === "h" && p.presence.c === code);
    phone.set({ ps: hostPeer ? hostPeer.presence : null, psAt: Date.now(), status: "live" });
  };
  P.unsubPeers = r.onPeers((ev) => onPeers(ev && ev.peers ? ev.peers : r.peers()));
  try { onPeers(r.peers()); } catch { /* */ }
}

export function stopPhoneSync() {
  if (!P) return;
  try { P.unsubPeers && P.unsubPeers(); } catch { /* */ }
  try { typeof P.unsubConn === "function" && P.unsubConn(); } catch { /* */ }
  try { P.room.leave && P.room.leave(); } catch { /* */ }
  P = null;
  phone.set({ status: "off", ps: null });
}

let lastT = 0;
const stamp = () => { lastT = Math.max(Date.now(), lastT + 1); return lastT; };

/** key: iv (vote) | ip (pledge) | ih (headline) | ic (play card) */
export function sendIntent(key, payload) {
  if (!P) return null;
  const it = { t: stamp(), ...payload };
  const intents = { ...phone.get().intents, [key]: it };
  phone.set({ intents });
  P.write({ ...P.base, ...intents });
  return it.t;
}
