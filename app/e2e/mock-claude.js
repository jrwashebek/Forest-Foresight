// Injected with page.addInitScript(). A faithful-enough mock of the claude.ai artifact runtime:
// use("room") over BroadcastChannel (join / presence / peers / onPeers / connected / onConnection / leave),
// use("downloads"), use("user"), use("db").
(() => {
  const cfg = window.__ffMockCfg || {};
  window.__ffDownloads = [];
  window.__ffPresenceSizes = [];
  const later = (v, ms = 40) => new Promise((r) => setTimeout(() => r(v), ms));
  const rid = () => Math.random().toString(36).slice(2, 10);

  function makeRoom() {
    return {
      async join(name) {
        if (!/^[a-z0-9][a-z0-9_.-]{0,47}$/.test(name)) { const e = new Error("invalid_argument"); e.code = "invalid_argument"; throw e; }
        await later(null, 20);
        const me = rid();
        const bc = new BroadcastChannel("ffmock-room-" + name);
        let mine = {};
        const others = new Map(); // peer → { presence, updatedAt }
        const subs = new Set();
        const connSubs = new Set();
        let pending = null;
        let delivered = false;
        const snapshot = () => Object.freeze([
          Object.freeze({ peer: me, by: "user-" + me, isMe: true, sameTab: true, kind: "viewer", guest: false, presence: JSON.parse(JSON.stringify(mine)), updatedAt: Date.now() }),
          ...[...others.entries()].map(([peer, v]) => Object.freeze({ peer, by: "user-" + peer, isMe: false, sameTab: false, kind: "viewer", guest: false, presence: v.presence, updatedAt: v.updatedAt })),
        ]);
        const notify = (ev) => {
          if (pending) { pending.joined.push(...(ev.joined || [])); pending.left.push(...(ev.left || [])); pending.updated.push(...(ev.updated || [])); return; }
          pending = { joined: [...(ev.joined || [])], left: [...(ev.left || [])], updated: [...(ev.updated || [])] };
          requestAnimationFrame(() => {
            const p = snapshot();
            const out = delivered ? { peers: p, ...pending } : { peers: p, joined: p, left: [], updated: [] };
            delivered = true;
            pending = null;
            subs.forEach((fn) => { try { fn(out); } catch (e) { console.error(e); } });
          });
        };
        const send = (msg) => bc.postMessage({ ...msg, from: me });
        bc.onmessage = (e) => {
          const m = e.data;
          if (!m || m.from === me) return;
          if (m.type === "hello") { send({ type: "presence", presence: mine }); if (!others.has(m.from)) { others.set(m.from, { presence: {}, updatedAt: Date.now() }); notify({ joined: [m.from] }); } }
          if (m.type === "presence") { const had = others.has(m.from); others.set(m.from, { presence: m.presence, updatedAt: Date.now() }); notify(had ? { updated: [m.from] } : { joined: [m.from] }); }
          if (m.type === "bye") { if (others.delete(m.from)) notify({ left: [m.from] }); }
        };
        send({ type: "hello" });
        window.addEventListener("pagehide", () => send({ type: "bye" }));
        return Object.freeze({
          name,
          presence(patch) {
            const next = { ...mine };
            for (const [k, v] of Object.entries(patch || {})) { if (v === null) delete next[k]; else next[k] = v; }
            const size = JSON.stringify(next).length;
            window.__ffPresenceSizes.push(size);
            if (size > 4096) { const err = new Error("presence too large: " + size); err.code = "invalid_argument"; console.error(err.message); throw err; }
            mine = next;
            send({ type: "presence", presence: mine });
            notify({ updated: [me] });
          },
          peers: () => snapshot(),
          onPeers(fn) { subs.add(fn); notify({}); return () => subs.delete(fn); },
          connected: () => true,
          onConnection(fn) { connSubs.add(fn); setTimeout(() => fn(true), 10); return () => connSubs.delete(fn); },
          emit() { const e = new Error("not_permitted"); e.code = "not_permitted"; throw e; },
          on() { return () => {}; },
          leave() { send({ type: "bye" }); bc.close(); subs.clear(); },
        });
      },
    };
  }

  const dbStore = {};
  const caps = {
    room: cfg.room === false ? null : makeRoom(),
    downloads: { async save({ filename, data }) { window.__ffDownloads.push({ filename, size: String(data).length, head: String(data).slice(0, 200) }); return { status: "saved" }; } },
    user: { async canEdit() { return cfg.canEdit !== false; }, id: () => "mock-user" },
    db: {
      doc(path) {
        return {
          async get() { await later(null, 30); return dbStore[path] ? { data: () => JSON.parse(JSON.stringify(dbStore[path])) } : null; },
          async set(v) { await later(null, 30); dbStore[path] = JSON.parse(JSON.stringify(v)); window.__ffDbWrites = (window.__ffDbWrites || 0) + 1; return { ok: true }; },
          onSnapshot() { return () => {}; },
        };
      },
    },
  };
  window.claude = Object.freeze({ use: (name) => later(caps[name] || null, 60) });
})();
