# Platform capabilities (claude.ai artifact runtime, contract 0.2.96) — engineer notes

The page MUST work fully with none of these (self-hosted, signed-out viewers, public links). Light features
up when available.

## Getting a capability
```js
// window.claude carries only `use`. It may not exist (self-hosted). use() resolves later (never within the
// script's first run), or null after ~10 s. Namespaces are frozen: never assign to them.
async function cap(name){ try { return (window.claude && window.claude.use) ? await window.claude.use(name) : null } catch { return null } }
```

## room (live sync) — declare `{room:{}}`
- `const room = await cap("room")` → null if this viewer can't connect. Only signed-in members of the owner's
  org or invited guests connect; public-link and signed-out viewers get null. So phones may have no room.
- `const r = await room.join("ff-" + code)` → NamedRoom. Name grammar `^[a-z0-9][a-z0-9_.-]{0,47}$`.
  Rejects (Promise) with codes: invalid_argument, not_permitted, limit_reached, upstream_error.
- **presence(patch)**: merge into MY presence object; top-level null removes a field; whole merged object
  ≤ **4 KiB JSON**, nesting ≤ 8, strings ≤ 1 KiB, keys plain identifiers. Anyone may set presence (Viewers too).
  Newcomers receive it; cleared when I leave. Rate ~40/s shared with emits — coalesce, send on change.
- **peers()** sync getter → frozen array of Peer `{peer, by, isMe, sameTab, kind:"viewer"|"agent", guest,
  presence, updatedAt}`. **onPeers(fn)** → `{peers, joined, left, updated}` at most once per frame; first
  delivery lists everyone as joined. Store the unsubscribe first.
- `emit/on` topics are **admin-only** (Editors) unless opened to "interact" — do NOT rely on emit.
  Design: host broadcasts public game state in ITS presence; phones send intents in THEIR presence.
- `connected()` sync fn; `onConnection(fn)`. Terminal error codes (revoked, not_granted, capability_*) →
  quietly fall back to offline mode, no editorializing.
- Presence is untrusted: validate everything the host receives (seat range, ids exist, capacity limits).
- Never put secret mandates in presence (everyone receives everything).

## downloads — declare `{downloads:true}`
`const dl = await cap("downloads")`; `await dl.save({filename:"forest-futures-debrief.md", data: string})`
→ resolves `{status}` or rejects `{code}` (declined, rate_limited, unavailable, …). Allowed ext incl.
md, json, txt, csv, html, pdf. Only on explicit click. If null → hide; offer Copy instead.

## user — declare `{user:{}}`
`user.canEdit()` (admin level) → gate "publish content to everyone" in the editor. `user.id()`.

## db — declare `{db:{}, user:{}}` (+ rules)
Shared docs: `db.doc("content/live")` get/set/onSnapshot; signed-in only (null otherwise). Use for the
shared Content Library (editors write, everyone reads) and saved game records. Default rule: signed-in
read, Contributors+ write; we'll set `rules:[{path:"content", read:"view", write:"admin"}]`.
Loading: 10 s timeout then fall back to embedded content. One write at a time per doc.

## Sandbox
No alert/confirm/prompt, no window.open, no <a download>, no print. Clipboard write only from a click
(catch refusal). File inputs work (import). localStorage may throw. Hash routing only as `#name`
(no `#/path`, no query strings) — use `#host`, `#join`, `#library`, `#rules`, `#about`, `#play`.
External scripts only from cdnjs/jsdelivr/unpkg (prefer bundling inline). Fonts via Google Fonts CSS.
No remote images (inline SVG / data: URIs). No fetch to other hosts.
