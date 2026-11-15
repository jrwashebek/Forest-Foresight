import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { app, host, useStore, toast } from "../store.js";
import { Icon, DOMAIN_ICONS } from "../icons.jsx";
import { Btn, Dialog, CopyButton, DownloadButton, ThemeToggle, Empty } from "../common.jsx";
import { SignalCard, DriverCard, StrategyCard, RoleCard, MandateView, Effects, DomainDot, HorizonBadge, kindLabel } from "../cards.jsx";
import { Tree } from "../tree.jsx";
import {
  VALIDATORS, validateContent, fingerprint, reviewDue, SECONDARY_TYPES, STRATEGY_KINDS, SECTORS, ABILITY_TYPES, CANCEL_SCOPES,
  rulesOf, DEFAULT_RULES, wordCount, KIND_LABEL,
} from "../../engine/index.js";
import { cx, todayISO, slug } from "../util.js";
import { setLocalContent, resetToPublished, publishContent } from "../content-store.js";

const TABS = [
  ["signals", "Signals"], ["drivers", "Drivers"], ["strategies", "Strategies"], ["roles", "Roles"],
  ["scenarios", "Scenarios"], ["domains", "Domains"], ["cascades", "Cascades"], ["rules", "Rules & edition"],
];

// ---------------------------------------------------------------------------
// path helpers
const getIn = (o, p) => p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
function setIn(o, p, v) {
  const ks = p.split(".");
  const out = Array.isArray(o) ? o.slice() : { ...(o || {}) };
  let cur = out;
  for (let i = 0; i < ks.length - 1; i++) {
    const k = ks[i];
    cur[k] = Array.isArray(cur[k]) ? cur[k].slice() : { ...(cur[k] || {}) };
    cur = cur[k];
  }
  if (v === undefined) delete cur[ks[ks.length - 1]];
  else cur[ks[ks.length - 1]] = v;
  return out;
}

// ---------------------------------------------------------------------------
// templates for new items
function template(kind, content) {
  const t = todayISO();
  const d0 = content.domains[0] ? content.domains[0].id : "fire";
  const d1 = content.domains[1] ? content.domains[1].id : d0;
  const e0 = content.eras[0] ? content.eras[0].id : "now";
  switch (kind) {
    case "signals": return { id: "sig-new", title: "New signal", signal: "", horizon: e0, primary: { domain: d0, delta: 1, text: "" }, secondary: { type: "fixed", domain: d1, delta: 1, text: "" }, prompt: "", source: { title: "", publisher: "", date: "", url: "" }, tags: [], status: "active", reviewed: t, origin: "new" };
    case "drivers": return { id: "drv-new", title: "New driver", text: "", horizon: e0, effects: [{ domain: d0, delta: -1 }], dilemma: { prompt: "", options: [{ label: "Option A", text: "", effects: [{ domain: d0, delta: 1 }] }, { label: "Option B", text: "", effects: [{ domain: d1, delta: 1 }] }] }, source: { title: "", publisher: "", date: "", url: "" }, tags: [], status: "active", reviewed: t };
    case "strategies": return { id: "str-new", title: "New strategy", text: "", cost: 4, effects: [{ domain: d0, delta: 1 }], delayed: [], kind: "no-regret", tags: [], status: "active", reviewed: t };
    case "roles": return { id: "role-new", title: "New role", org: "", sector: "state", bio: "", mandates: ["A", "B"].map((id) => ({ id, targets: content.domains.slice(0, 3).map((d) => ({ domain: d.id, min: 6 })), guardrail: { domain: d1, min: 4 }, why: "" })), ability: { name: "", text: "Once per game: ", effect: { type: "boost", delta: 1 } }, future: { resilient: "", holding: "", unraveling: "" }, status: "active" };
    case "scenarios": return { id: "scn-new", name: "New scenario", summary: "", start: Object.fromEntries(content.domains.map((d) => [d.id, 5])), drivers: Object.fromEntries(content.eras.map((e) => [e.id, []])), tags: [], status: "active" };
    case "domains": return { id: "newdomain", name: "New domain", short: "New", color: "#6b7a5e", icon: "leaf", description: "", examples: "" };
    case "cascades": return { id: "cas-new", when: { domain: d0, lte: 2 }, effects: [{ domain: d1, delta: -1 }], text: "", status: "active" };
    default: return {};
  }
}

const ABILITY_HELP = {
  boost: "Boost: add to one domain", protect: "Protect: one domain ignores signals this era", capacity: "Capacity: extra Capacity in one Council",
  discount: "Discount: one strategy costs less", cancel: "Cancel: undo one drop as it happens", decide: "Decide: settle a dilemma outright",
  redraw: "Redraw: a new hand from one horizon", "refresh-market": "Refresh: swap strategies in the market", move: "Move: shift points between domains",
};
const titleOf = (kind, x) => (kind === "scenarios" ? x.name : kind === "domains" ? x.name : kind === "cascades" ? x.text || x.id : x.title) || x.id;

// ---------------------------------------------------------------------------
export function Library() {
  const { content, contentSource, published, caps, canPublish, validation } = useStore(app);
  const hs = useStore(host);
  const [tab, setTab] = useState("signals");
  const [selId, setSelId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [q, setQ] = useState("");
  const [fHorizon, setFH] = useState("");
  const [fDomain, setFD] = useState("");
  const [fStatus, setFS] = useState("");
  const [fDue, setFDue] = useState(false);
  const [importRes, setImportRes] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const fileRef = useRef(null);
  const today = todayISO();

  const list = tab === "rules" ? [] : content[tab] || [];
  const original = selId != null ? list.find((x) => x.id === selId) : null;
  const dirty = draft && (isNew || JSON.stringify(draft) !== JSON.stringify(original));

  const [pending, setPending] = useState(null); // navigation waiting on the Unsaved changes dialog
  const doSelect = (id) => {
    const it = list.find((x) => x.id === id);
    setSelId(id); setDraft(it ? JSON.parse(JSON.stringify(it)) : null); setIsNew(false);
  };
  const guard = (nav) => { if (dirty) setPending(nav); else nav(); };
  const select = (id) => guard(() => doSelect(id));
  useEffect(() => { setSelId(null); setDraft(null); setIsNew(false); setQ(""); setFH(""); setFD(""); setFS(""); setFDue(false); }, [tab]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return list.filter((x) => {
      if (qq && !JSON.stringify([x.id, x.title, x.name, x.signal, x.text, x.tags, x.summary]).toLowerCase().includes(qq)) return false;
      if (fHorizon && x.horizon !== fHorizon) return false;
      if (fStatus && (x.status || "active") !== fStatus) return false;
      if (fDue && !reviewDue(x, today)) return false;
      if (fDomain) {
        const ds = new Set();
        if (x.primary) ds.add(x.primary.domain);
        if (x.secondary && x.secondary.domain) ds.add(x.secondary.domain);
        (x.effects || []).forEach((e) => ds.add(e.domain));
        (x.delayed || []).forEach((e) => ds.add(e.domain));
        if (x.when) ds.add(x.when.domain);
        if (!ds.has(fDomain)) return false;
      }
      return true;
    });
  }, [list, q, fHorizon, fDomain, fStatus, fDue, today]);

  const ctx = useMemo(() => ({ domains: new Set(content.domains.map((d) => d.id)), eras: new Set(content.eras.map((e) => e.id)), drivers: new Set(content.drivers.map((d) => d.id)) }), [content]);
  const problems = draft && VALIDATORS[tab] ? VALIDATORS[tab](draft, ctx) : [];
  const idTaken = draft && list.some((x) => x.id === draft.id && (isNew || x.id !== selId));
  if (idTaken) problems.unshift({ field: "id", msg: "This id is already used — ids must be unique.", level: "error" });
  const errors = problems.filter((p) => p.level === "error");

  const save = () => {
    if (errors.length) { toast(`Fix ${errors.length} problem${errors.length > 1 ? "s" : ""} before saving.`, "warn"); return false; }
    let next = list.slice();
    if (isNew) next.push(draft);
    else next = next.map((x) => (x.id === selId ? draft : x));
    // renaming a driver id: update scenario pools
    let c2 = { ...content, [tab]: next, meta: { ...content.meta, updated: today } };
    if (!isNew && tab === "drivers" && selId !== draft.id) {
      c2.scenarios = c2.scenarios.map((s) => ({ ...s, drivers: Object.fromEntries(Object.entries(s.drivers || {}).map(([k, v]) => [k, v.map((id) => (id === selId ? draft.id : id))])) }));
    }
    setLocalContent(c2);
    setSelId(draft.id); setIsNew(false);
    toast("Saved to your local edits.");
    return true;
  };
  const addNew = (base) => guard(() => addNewNow(base));
  const addNewNow = (base) => {
    const t = base ? JSON.parse(JSON.stringify(base)) : template(tab, content);
    let id = base ? `${base.id}-copy` : t.id;
    let n = 2;
    while (list.some((x) => x.id === id)) id = `${base ? base.id + "-copy" : t.id}-${n++}`;
    t.id = id;
    if (base && t.title) t.title = `${t.title} (copy)`;
    if (base && t.name) t.name = `${t.name} (copy)`;
    if ("reviewed" in t) t.reviewed = today;
    setDraft(t); setSelId(null); setIsNew(true);
  };
  const toggleRetire = () => {
    if (!original) return;
    const nd = { ...original, status: original.status === "retired" ? "active" : "retired" };
    setLocalContent({ ...content, [tab]: list.map((x) => (x.id === selId ? nd : x)) });
    setDraft(JSON.parse(JSON.stringify(nd)));
    toast(nd.status === "retired" ? "Retired: it stays in the library but won't be dealt." : "Restored to active.");
  };

  const onImport = async (e) => {
    const f = e.currentTarget.files && e.currentTarget.files[0];
    e.currentTarget.value = "";
    if (!f) return;
    try {
      const text = await f.text();
      const json = JSON.parse(text);
      setImportRes({ json, v: validateContent(json), name: f.name });
    } catch (err) {
      setImportRes({ error: `That file isn't valid JSON (${err.message}).`, name: f.name });
    }
  };

  const doPublish = async () => {
    setPublishing(true);
    const ok = await publishContent(content);
    setPublishing(false);
    toast(ok ? "Published: everyone now loads this edition." : "Publishing failed. Your edits are still saved on this device.", ok ? "info" : "warn");
  };

  const exportJson = () => JSON.stringify(content, null, 2);
  const edCount = useMemo(() => {
    if (!published) return 0;
    let n = 0;
    for (const k of ["signals", "drivers", "strategies", "roles", "scenarios", "domains", "cascades"]) {
      const a = Object.fromEntries((published[k] || []).map((x) => [x.id, JSON.stringify(x)]));
      for (const x of content[k] || []) if (a[x.id] !== JSON.stringify(x)) n++;
    }
    if (JSON.stringify(published.rules) !== JSON.stringify(content.rules) || JSON.stringify(published.meta) !== JSON.stringify(content.meta) || JSON.stringify(published.prompts) !== JSON.stringify(content.prompts)) n++;
    return n;
  }, [content, published]);

  return (
    <main class="library" id="main">
      <header class="page-head">
        <a href="#" class="back-link"><Icon name="back" size={20} /> Home</a>
        <h1>Content library</h1>
        <span class="lib-fp">Edition {fingerprint(content)}</span>
        <ThemeToggle />
      </header>
      {contentSource === "local" ? (
        <div class="banner banner--local" role="region" aria-label="Local edits">
          <Icon name="edit" size={22} />
          <p><strong>You're using your local edits on this device</strong>{edCount ? ` (${edCount} item${edCount > 1 ? "s differ" : " differs"} from the published edition)` : ""}. Export them to share, {canPublish ? "publish them to everyone, " : ""}or go back to the published edition.</p>
          {!confirmReset ? <Btn kind="quiet" icon="reset" onClick={() => setConfirmReset(true)}>Reset to published edition</Btn> : (
            <span class="btn-row"><span>Discard all local edits?</span><Btn kind="danger" onClick={() => { resetToPublished(); setConfirmReset(false); setSelId(null); setDraft(null); toast("Back to the published edition."); }}>Discard edits</Btn><Btn kind="quiet" onClick={() => setConfirmReset(false)}>Keep them</Btn></span>
          )}
        </div>
      ) : null}
      {hs.h && hs.h.state.phase !== "over" ? <p class="notice"><Icon name="info" size={18} /> A game is in progress on this device. Edits apply to new games; retire cards rather than renaming ids mid-game.</p> : null}
      <div class="lib-tools">
        <button type="button" class={cx("issues-btn", validation.errors.length ? "has-errors" : validation.warnings.length ? "has-warnings" : "is-clean")} onClick={() => setShowIssues(true)}>
          <Icon name={validation.errors.length ? "alert" : "check"} size={20} />
          {validation.errors.length ? `${validation.errors.length} errors` : "No errors"}, {validation.warnings.length} suggestions
        </button>
        <span class="spacer" />
        <input ref={fileRef} type="file" accept="application/json,.json" class="sr-only" id="lib-import" aria-label="Import a content JSON file" tabIndex={-1} onChange={onImport} />
        <Btn icon="upload" onClick={() => fileRef.current && fileRef.current.click()}>Import JSON</Btn>
        <CopyButton text={exportJson} label="Copy JSON" what="content JSON" />
        <DownloadButton filename={`forest-futures-content-${(content.meta.edition || "draft").replace(/[^\w.-]/g, "")}.json`} data={exportJson} label="Download JSON" />
        {caps.db && canPublish ? <Btn kind="primary" icon="upload" disabled={publishing || validation.errors.length > 0} onClick={doPublish}>{publishing ? "Publishing…" : "Publish to everyone"}</Btn> : null}
      </div>

      <div class="tabs" role="tablist" aria-label="Content type">
        {TABS.map(([id, label]) => (
          <button type="button" key={id} role="tab" id={`lt-${id}`} aria-selected={tab === id ? "true" : "false"} aria-controls="lib-panel" class={cx("tab", tab === id && "is-on")}
            onClick={() => guard(() => setTab(id))}>
            {label}{id !== "rules" ? <span class="tab-n">{(content[id] || []).length}</span> : null}
          </button>
        ))}
      </div>

      <div class="lib-panel" id="lib-panel" role="tabpanel" aria-labelledby={`lt-${tab}`}>
        {tab === "rules" ? <RulesEditor /> : (
          <div class="lib-split">
            <section class="lib-list" aria-label={`${TABS.find((t) => t[0] === tab)[1]} list`}>
              <div class="lib-filters">
                <label class="sr-only" for="lib-q">Search</label>
                <div class="search"><Icon name="search" size={18} /><input id="lib-q" class="input" type="search" placeholder="Search titles, text, tags" value={q} onInput={(e) => setQ(e.currentTarget.value)} /></div>
                <div class="filter-row">
                  {["signals", "drivers"].includes(tab) ? (
                    <select class="input input--sm" value={fHorizon} onChange={(e) => setFH(e.currentTarget.value)} aria-label="Filter by horizon">
                      <option value="">All horizons</option>
                      {content.eras.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  ) : null}
                  {["signals", "drivers", "strategies", "cascades"].includes(tab) ? (
                    <select class="input input--sm" value={fDomain} onChange={(e) => setFD(e.currentTarget.value)} aria-label="Filter by domain">
                      <option value="">All domains</option>
                      {content.domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  ) : null}
                  {tab !== "domains" ? (
                    <select class="input input--sm" value={fStatus} onChange={(e) => setFS(e.currentTarget.value)} aria-label="Filter by status">
                      <option value="">Any status</option><option value="active">Active</option><option value="retired">Retired</option>
                    </select>
                  ) : null}
                  {["signals", "drivers", "strategies"].includes(tab) ? (
                    <label class="check"><input type="checkbox" checked={fDue} onChange={(e) => setFDue(e.currentTarget.checked)} /> Review due <span class="muted">(not reviewed in 18 months)</span></label>
                  ) : null}
                </div>
              </div>
              <div class="lib-list-head">
                <span>{filtered.length} of {list.length}</span>
                <Btn kind="primary" icon="plus" onClick={() => addNew(null)}>Add {KIND_LABEL[tab].toLowerCase()}</Btn>
              </div>
              <ul class="lib-items">
                {filtered.map((x) => {
                  const ps = VALIDATORS[tab](x, ctx);
                  const ne = ps.filter((p) => p.level === "error").length, nw = ps.length - ne;
                  const due = reviewDue(x, today) && x.reviewed;
                  return (
                    <li key={x.id}>
                      <button type="button" class={cx("lib-item", x.id === selId && !isNew && "is-on", x.status === "retired" && "is-retired")} aria-current={x.id === selId && !isNew ? "true" : undefined} onClick={() => select(x.id)}>
                        <span class="lib-item-title">{titleOf(tab, x)}</span>
                        <span class="lib-item-meta">
                          {x.horizon ? <HorizonBadge content={content} horizon={x.horizon} small /> : null}
                          {tab === "domains" ? <span class="swatch" style={{ background: x.color }} aria-hidden="true" /> : null}
                          <span class="lib-id">{x.id}</span>
                          {x.status === "retired" ? <span class="tag">retired</span> : null}
                          {due ? <span class="tag tag--due">review due</span> : null}
                          {ne ? <span class="tag tag--err">{ne} error{ne > 1 ? "s" : ""}</span> : nw ? <span class="tag tag--warn">{nw} note{nw > 1 ? "s" : ""}</span> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {!filtered.length ? <li><Empty title="Nothing matches">Clear the search or filters, or add a new item.</Empty></li> : null}
              </ul>
            </section>
            <section class="lib-edit" aria-label="Editor">
              {!draft ? <Empty icon="edit" title={`Select a ${KIND_LABEL[tab].toLowerCase()} to edit`}>Or add a new one. Edits are saved on this device until you export or publish them.</Empty> : (
                <>
                  <div class="edit-head">
                    <h2 class="edit-title">{isNew ? `New ${KIND_LABEL[tab].toLowerCase()}` : titleOf(tab, draft)}</h2>
                    <div class="btn-row">
                      {!isNew ? <Btn icon="copy" onClick={() => addNew(original)}>Duplicate</Btn> : null}
                      {!isNew && tab !== "domains" ? <Btn icon={original && original.status === "retired" ? "reset" : "x"} onClick={toggleRetire} disabled={dirty}>{original && original.status === "retired" ? "Restore" : "Retire"}</Btn> : null}
                    </div>
                  </div>
                  <div class="edit-grid">
                    <div class="edit-form">
                      <ItemForm kind={tab} draft={draft} setDraft={setDraft} problems={problems} isNew={isNew} />
                    </div>
                    <div class="edit-preview" aria-label="Live preview">
                      <p class="phase-kicker">Live preview</p>
                      <Preview kind={tab} item={draft} />
                      {problems.length ? (
                        <div class="problems">
                          <p class="problems-title">{errors.length ? `${errors.length} to fix` : "Looks good"}{problems.length - errors.length ? `, ${problems.length - errors.length} suggestion${problems.length - errors.length > 1 ? "s" : ""}` : ""}</p>
                          <ul>{problems.map((p, i) => <li key={i} class={p.level === "error" ? "is-err" : "is-warn"}><button type="button" class="problem-link" onClick={() => focusField(p.field)}>{humanPath(p.field)}</button> {p.msg}</li>)}</ul>
                        </div>
                      ) : <p class="ok-note"><Icon name="check" size={18} /> No problems found.</p>}
                    </div>
                  </div>
                  <div class="edit-actions">
                    <Btn kind="quiet" disabled={!dirty} onClick={() => { if (isNew) { setDraft(null); setIsNew(false); } else setDraft(JSON.parse(JSON.stringify(original))); }}>{isNew ? "Discard" : "Revert"}</Btn>
                    <Btn kind="primary" icon="check" disabled={!dirty} onClick={save}>{isNew ? "Add to library" : "Save changes"}</Btn>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </div>

      <Dialog open={!!importRes} onClose={() => setImportRes(null)} title={`Import ${importRes ? importRes.name : ""}`}
        actions={importRes && !importRes.error ? <>
          <Btn onClick={() => setImportRes(null)}>Cancel</Btn>
          <Btn kind={importRes.v.errors.length ? "danger" : "primary"} onClick={() => { setLocalContent(importRes.json); setImportRes(null); setSelId(null); setDraft(null); toast("Imported as your local edits."); }}>
            {importRes.v.errors.length ? "Import anyway" : "Use this content"}
          </Btn>
        </> : <Btn onClick={() => setImportRes(null)}>Close</Btn>}>
        {importRes && importRes.error ? <p class="field-error">{importRes.error}</p> : importRes ? (
          <>
            <p>{importRes.v.errors.length ? <><strong>{importRes.v.errors.length} problems</strong> must be fixed before this content can be played. You can import it and fix them here.</> : <>This content is valid{importRes.v.warnings.length ? ` with ${importRes.v.warnings.length} suggestions` : ""}. It replaces the content on this device as your local edits.</>}</p>
            {importRes.v.errors.length ? <ul class="issue-list">{importRes.v.errors.slice(0, 40).map((e, i) => <li key={i}>{e}</li>)}</ul> : null}
          </>
        ) : null}
      </Dialog>
      <Dialog open={!!pending} onClose={() => setPending(null)} title="Unsaved changes"
        actions={<>
          <Btn onClick={() => setPending(null)} data-autofocus>Keep editing</Btn>
          <Btn kind="danger" onClick={() => { const nav = pending; setPending(null); setDraft(null); setIsNew(false); nav(); }}>Discard changes</Btn>
          <Btn kind="primary" icon="check" disabled={errors.length > 0} onClick={() => { const nav = pending; if (save()) { setPending(null); nav(); } }}>Save and continue</Btn>
        </>}>
        <p>You changed <strong>{draft ? titleOf(tab, draft) : "this item"}</strong> but haven't saved it.{errors.length ? ` It has ${errors.length} problem${errors.length > 1 ? "s" : ""} to fix before it can be saved.` : ""}</p>
      </Dialog>
      <Dialog open={showIssues} onClose={() => setShowIssues(false)} title="Content check" wide>
        {validation.errors.length ? <><h3 class="sub-h">Errors (block play)</h3><ul class="issue-list">{validation.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></> : <p><Icon name="check" size={18} /> No errors. The game can be played with this content.</p>}
        {validation.warnings.length ? <><h3 class="sub-h">Suggestions</h3><ul class="issue-list issue-list--warn">{validation.warnings.map((e, i) => <li key={i}>{e}</li>)}</ul></> : null}
      </Dialog>
    </main>
  );
}

// ---------------------------------------------------------------------------
const WORDS = { primary: "Primary effect", secondary: "Secondary effect", delta: "change", domain: "domain", text: "text", source: "Source", url: "link",
  date: "date", title: "title", dilemma: "Dilemma", options: "option", effects: "effect", delayed: "next-era effect", mandates: "mandate", targets: "target",
  guardrail: "guardrail", ability: "Ability", effect: "effect", when: "Trigger", start: "Starting condition", cost: "Cost", kind: "Kind", id: "ID",
  signal: "Signal text", prompt: "Prompt", horizon: "Horizon", reviewed: "Last reviewed", amount: "amount", type: "type", choices: "allowed domains",
  name: "Name", summary: "Summary", drivers: "Driver pool", bio: "Bio", org: "Organisation", future: "Future jobs", min: "minimum", why: "why", label: "label",
  status: "Status", origin: "Origin", publisher: "publisher", scope: "scope", tag: "tag", count: "count", lte: "threshold", gte: "threshold", color: "Colour", short: "Short name" };
export function humanPath(field) {
  return String(field).replace(/\[(\d+)\]/g, ".$1").split(".").reduce((out, part, i, arr) => {
    if (/^\d+$/.test(part)) { const prev = arr[i - 1]; out[out.length - 1] += " " + (prev === "options" || prev === "mandates" ? String.fromCharCode(65 + +part) : +part + 1); return out; }
    out.push(WORDS[part] || part);
    return out;
  }, []).join(" › ");
}
function focusField(field) {
  let p = String(field).replace(/\[(\d+)\]/g, ".$1");
  while (p) {
    const el = document.querySelector(`.edit-form [data-path="${p}"]`);
    if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); el.focus(); return; }
    p = p.includes(".") ? p.slice(0, p.lastIndexOf(".")) : "";
  }
}

function msgFor(problems, field) {
  const hit = problems.filter((p) => p.field === field || p.field.startsWith(field + "[") || p.field.startsWith(field + "."));
  return hit.length ? hit.map((p) => p.msg).join("; ") : null;
}

let fid = 0;
function F({ label, hint, error, children, wide }) {
  const id = useMemo(() => "f" + ++fid, []);
  const child = typeof children === "function" ? children(id) : children;
  return (
    <div class={cx("field", error && "has-error", wide && "field--wide")}>
      <label class="field-label" for={id}>{label}</label>
      {child}
      {error ? <p class="field-error">{error}</p> : hint ? <p class="field-hint">{hint}</p> : null}
    </div>
  );
}

function TextF({ label, path, draft, set, problems, hint, area, rows = 2, maxWords, placeholder, type = "text", readOnly }) {
  const v = getIn(draft, path) ?? "";
  const wc = maxWords ? wordCount(v) : 0;
  return (
    <F label={label} hint={maxWords ? `${wc}/${maxWords} words${hint ? `. ${hint}` : ""}` : hint} error={msgFor(problems, path)} wide={area}>
      {(id) => area
        ? <textarea id={id} data-path={path} class="input" rows={rows} value={v} placeholder={placeholder} onInput={(e) => set(path, e.currentTarget.value)} aria-invalid={msgFor(problems, path) ? "true" : "false"} />
        : <input id={id} data-path={path} class="input" type={type} value={v} readOnly={readOnly} placeholder={placeholder} onInput={(e) => set(path, e.currentTarget.value)} aria-invalid={msgFor(problems, path) ? "true" : "false"} />}
    </F>
  );
}
function NumF({ label, path, draft, set, problems, min, max, hint }) {
  const v = getIn(draft, path);
  return (
    <F label={label} hint={hint} error={msgFor(problems, path)}>
      {(id) => <input id={id} data-path={path} class="input input--num" type="number" min={min} max={max} step={1} value={v ?? ""} onInput={(e) => { const n = e.currentTarget.value === "" ? undefined : Math.round(+e.currentTarget.value); set(path, n); }} aria-invalid={msgFor(problems, path) ? "true" : "false"} />}
    </F>
  );
}
function SelF({ label, path, draft, set, problems, options, hint, empty }) {
  const v = getIn(draft, path) ?? "";
  return (
    <F label={label} hint={hint} error={msgFor(problems, path)}>
      {(id) => (
        <select id={id} data-path={path} class="input" value={v} onChange={(e) => set(path, e.currentTarget.value || undefined)} aria-invalid={msgFor(problems, path) ? "true" : "false"}>
          {empty ? <option value="">{empty}</option> : null}
          {options.map(([val, lab]) => <option key={val} value={val}>{lab}</option>)}
        </select>
      )}
    </F>
  );
}
function TagsF({ draft, set, problems }) {
  const v = (draft.tags || []).join(", ");
  return (
    <F label="Tags" hint="Comma-separated, e.g. federal, fire" error={msgFor(problems, "tags")}>
      {(id) => <input id={id} class="input" value={v} onChange={(e) => set("tags", e.currentTarget.value.split(",").map((t) => t.trim()).filter(Boolean))} />}
    </F>
  );
}

function EffectsF({ label, path, draft, set, problems, min = -3, max = 3, content, hint }) {
  const list = getIn(draft, path) || [];
  const upd = (i, patch) => set(path, list.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  const err = msgFor(problems, path);
  return (
    <fieldset class={cx("effects-f", err && "has-error")}>
      <legend class="field-label">{label}</legend>
      {list.map((e, i) => (
        <div class="effect-row" key={i}>
          <select class="input" data-path={`${path}.${i}.domain`} aria-label={`${label} ${i + 1} domain`} value={e.domain} onChange={(ev) => upd(i, { domain: ev.currentTarget.value })}>
            {content.domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <input class="input input--num" data-path={`${path}.${i}.delta`} type="number" min={min} max={max} step={1} aria-label={`${label} ${i + 1} change`} value={e.delta} onInput={(ev) => upd(i, { delta: Math.round(+ev.currentTarget.value) })} />
          <button type="button" class="icon-btn" aria-label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => set(path, list.filter((_, k) => k !== i))}><Icon name="trash" size={18} /></button>
        </div>
      ))}
      <Btn kind="quiet" icon="plus" onClick={() => set(path, [...list, { domain: content.domains[0].id, delta: 1 }])}>Add effect</Btn>
      {err ? <p class="field-error">{err}</p> : hint ? <p class="field-hint">{hint}</p> : null}
    </fieldset>
  );
}

function Group({ title, children }) {
  return <fieldset class="group"><legend class="group-title">{title}</legend><div class="group-body">{children}</div></fieldset>;
}

function ItemForm({ kind, draft, setDraft, problems, isNew }) {
  const { content } = useStore(app);
  const set = (path, v) => setDraft((d) => setIn(d, path, v));
  const P = { draft, set, problems, content };
  const eraOpts = content.eras.map((e) => [e.id, e.name]);
  const domOpts = content.domains.map((d) => [d.id, d.name]);
  const statusF = <SelF label="Status" path="status" {...P} options={[["active", "Active"], ["retired", "Retired"]]} />;
  const sourceG = (
    <Group title="Source">
      <TextF label="Source title" path="source.title" {...P} />
      <TextF label="Publisher" path="source.publisher" {...P} />
      <TextF label="Publication date" path="source.date" {...P} placeholder="YYYY-MM-DD" />
      <TextF label="Source URL" path="source.url" {...P} type="url" placeholder="https://" hint="A real page you opened" />
    </Group>
  );
  const idF = <TextF label="ID" path="id" {...P} hint={isNew ? "Stable, lowercase-kebab" : "Changing an id breaks saved games that use it"} />;
  switch (kind) {
    case "signals": {
      const sec = draft.secondary || {};
      return (
        <>
          <TextF label="Title" path="title" {...P} maxWords={6} />
          {idF}
          <TextF label="Signal" path="signal" {...P} area rows={3} maxWords={40} hint="A real-world signal, in your own words" />
          <SelF label="Horizon" path="horizon" {...P} options={eraOpts} />
          <Group title="Primary effect">
            <SelF label="Domain" path="primary.domain" {...P} options={domOpts} />
            <NumF label="Change" path="primary.delta" {...P} min={-3} max={3} hint="−3 to +3" />
            <TextF label="Outcome" path="primary.text" {...P} area maxWords={25} />
          </Group>
          <Group title="Secondary effect">
            <SelF label="Type" path="secondary.type" {...P} options={SECONDARY_TYPES.map((t) => [t, { fixed: "Fixed", add: "Add (player chooses)", remove: "Remove (player chooses)", move: "Move (player chooses)", protect: "Protect (player chooses)" }[t]])} />
            {sec.type === "fixed" ? <><SelF label="Domain" path="secondary.domain" {...P} options={domOpts} /><NumF label="Change" path="secondary.delta" {...P} min={-2} max={2} hint="−2 to +2" /></> : null}
            {["add", "remove", "move"].includes(sec.type) ? <NumF label="Amount" path="secondary.amount" {...P} min={1} max={3} /> : null}
            <TextF label={sec.type === "fixed" ? "Outcome" : "Prompt to the player"} path="secondary.text" {...P} area />
          </Group>
          <TextF label="Leadership prompt" path="prompt" {...P} area maxWords={20} />
          {sourceG}
          <Group title="Housekeeping">
            <TagsF {...P} />
            {statusF}
            <TextF label="Last reviewed" path="reviewed" {...P} type="date" />
            <SelF label="Origin" path="origin" {...P} options={[["new", "New"], ["2019-updated", "2019 card, refreshed"]]} />
          </Group>
        </>
      );
    }
    case "drivers": {
      const opts = (draft.dilemma && draft.dilemma.options) || [];
      return (
        <>
          <TextF label="Title" path="title" {...P} />
          {idF}
          <TextF label="Text" path="text" {...P} area rows={3} maxWords={40} />
          <SelF label="Horizon" path="horizon" {...P} options={eraOpts} />
          <EffectsF label="Effects" path="effects" {...P} hint="2–3 effects, −3 to +3" />
          <Group title="Dilemma">
            <TextF label="Prompt" path="dilemma.prompt" {...P} area maxWords={30} />
            {opts.map((o, i) => (
              <fieldset class="sub-item" key={i}>
                <legend class="field-label">Option {String.fromCharCode(65 + i)}</legend>
                <TextF label="Label" path={`dilemma.options.${i}.label`} {...P} hint="≤ 5 words" />
                <TextF label="Text" path={`dilemma.options.${i}.text`} {...P} area />
                <EffectsF label="Effects" path={`dilemma.options.${i}.effects`} {...P} />
                {opts.length > 2 ? <Btn kind="quiet" icon="trash" onClick={() => set("dilemma.options", opts.filter((_, k) => k !== i))}>Remove option</Btn> : null}
              </fieldset>
            ))}
            {opts.length < 3 ? <Btn kind="quiet" icon="plus" onClick={() => set("dilemma.options", [...opts, { label: "", text: "", effects: [{ domain: content.domains[0].id, delta: 1 }] }])}>Add option</Btn> : null}
            {msgFor(problems, "dilemma.options") && !opts.length ? <p class="field-error">{msgFor(problems, "dilemma.options")}</p> : null}
          </Group>
          {sourceG}
          <Group title="Housekeeping"><TagsF {...P} />{statusF}<TextF label="Last reviewed" path="reviewed" {...P} type="date" /></Group>
        </>
      );
    }
    case "strategies":
      return (
        <>
          <TextF label="Title" path="title" {...P} />
          {idF}
          <TextF label="Text" path="text" {...P} area maxWords={30} />
          <NumF label="Cost" path="cost" {...P} min={2} max={8} hint="2–8 Capacity" />
          <SelF label="Kind" path="kind" {...P} options={STRATEGY_KINDS.map((k) => [k, kindLabel(k)])} />
          <EffectsF label="Effects" path="effects" {...P} hint="Apply when funded" />
          <EffectsF label="Next-era effects" path="delayed" {...P} hint="Apply at the start of the next era" />
          <Group title="Housekeeping"><TagsF {...P} />{statusF}<TextF label="Last reviewed" path="reviewed" {...P} type="date" /></Group>
        </>
      );
    case "roles": {
      const ms = draft.mandates || [];
      const eff = (draft.ability && draft.ability.effect) || {};
      return (
        <>
          <TextF label="Title" path="title" {...P} />
          {idF}
          <TextF label="Organisation" path="org" {...P} />
          <SelF label="Sector" path="sector" {...P} options={SECTORS.map((s) => [s, s[0].toUpperCase() + s.slice(1)])} />
          <TextF label="Bio" path="bio" {...P} area maxWords={40} />
          {ms.map((m, i) => (
            <Group key={i} title={`Mandate ${m.id || String.fromCharCode(65 + i)}`}>
              <TextF label="Variant id" path={`mandates.${i}.id`} {...P} />
              {(m.targets || []).map((t, j) => (
                <div class="pair" key={j}>
                  <SelF label={`Target ${j + 1}`} path={`mandates.${i}.targets.${j}.domain`} {...P} options={domOpts} />
                  <NumF label="At least" path={`mandates.${i}.targets.${j}.min`} {...P} min={0} max={10} />
                </div>
              ))}
              <div class="pair">
                <SelF label="Guardrail" path={`mandates.${i}.guardrail.domain`} {...P} options={domOpts} />
                <NumF label="Stays at or above" path={`mandates.${i}.guardrail.min`} {...P} min={0} max={10} />
              </div>
              <TextF label="Why" path={`mandates.${i}.why`} {...P} area maxWords={25} />
              {ms.length > 1 ? <Btn kind="quiet" icon="trash" onClick={() => set("mandates", ms.filter((_, k) => k !== i))}>Remove mandate</Btn> : null}
            </Group>
          ))}
          <Btn kind="quiet" icon="plus" onClick={() => set("mandates", [...ms, { id: String.fromCharCode(65 + ms.length), targets: content.domains.slice(0, 3).map((d) => ({ domain: d.id, min: 6 })), guardrail: { domain: content.domains[3].id, min: 4 }, why: "" }])}>Add mandate variant</Btn>
          <Group title="Ability (once per game)">
            <TextF label="Name" path="ability.name" {...P} />
            <TextF label="Player-facing text" path="ability.text" {...P} area />
            <SelF label="What it does" path="ability.effect.type" {...P} options={ABILITY_TYPES.map((t) => [t, ABILITY_HELP[t] || t])} hint="The engine applies this once per game, when the facilitator taps the player's ability." />
            {eff.type === "boost" ? <NumF label="Boost" path="ability.effect.delta" {...P} min={1} max={3} /> : null}
            {["capacity", "discount", "move"].includes(eff.type) ? <NumF label="Amount" path="ability.effect.amount" {...P} min={1} max={4} /> : null}
            {eff.type === "discount" ? <TextF label="Only strategies tagged" path="ability.effect.tag" {...P} hint="Leave blank for any strategy" /> : null}
            {eff.type === "cancel" ? <SelF label="Cancels a drop from" path="ability.effect.scope" {...P} options={CANCEL_SCOPES.map((s) => [s, s])} /> : null}
            {eff.type === "redraw" ? <SelF label="Draw from horizon" path="ability.effect.horizon" {...P} options={eraOpts} empty="Player chooses (or era mix)" /> : null}
            {eff.type === "refresh-market" ? <NumF label="Up to" path="ability.effect.count" {...P} min={1} max={5} /> : null}
            {["boost", "protect"].includes(eff.type) ? (
              <fieldset class="check-grid"><legend class="field-label">Allowed domains (none = any)</legend>
                {content.domains.map((d) => {
                  const ch = eff.choices || [];
                  const on = ch.includes(d.id);
                  return <label key={d.id} class="check"><input type="checkbox" checked={on} onChange={() => { const n = on ? ch.filter((x) => x !== d.id) : [...ch, d.id]; set("ability.effect.choices", n.length ? n : undefined); }} /> {d.name}</label>;
                })}
              </fieldset>
            ) : null}
          </Group>
          <Group title="Future job by outcome">
            <TextF label="Resilient" path="future.resilient" {...P} />
            <TextF label="Holding" path="future.holding" {...P} />
            <TextF label="Unraveling" path="future.unraveling" {...P} />
          </Group>
          <Group title="Housekeeping">{statusF}</Group>
        </>
      );
    }
    case "scenarios":
      return (
        <>
          <TextF label="Name" path="name" {...P} />
          {idF}
          <TextF label="Summary" path="summary" {...P} area rows={3} maxWords={60} />
          <Group title="Starting conditions (0–10)">
            <div class="start-grid">{content.domains.map((d) => <NumF key={d.id} label={d.short || d.name} path={`start.${d.id}`} {...P} min={0} max={10} />)}</div>
          </Group>
          <Group title="Driver pools (one is drawn per era)">
            {content.eras.map((e) => {
              const pool = (draft.drivers && draft.drivers[e.id]) || [];
              return (
                <fieldset key={e.id} class="check-grid"><legend class="field-label">{e.name}</legend>
                  {content.drivers.map((d) => {
                    const on = pool.includes(d.id);
                    return <label key={d.id} class="check"><input type="checkbox" checked={on} onChange={() => set(`drivers.${e.id}`, on ? pool.filter((x) => x !== d.id) : [...pool, d.id])} /> {d.title} <span class="muted">({d.horizon})</span></label>;
                  })}
                  {msgFor(problems, `drivers.${e.id}`) ? <p class="field-hint">{msgFor(problems, `drivers.${e.id}`)}</p> : null}
                </fieldset>
              );
            })}
          </Group>
          <Group title="Housekeeping"><TagsF {...P} />{statusF}</Group>
        </>
      );
    case "domains":
      return (
        <>
          <TextF label="Name" path="name" {...P} />
          <TextF label="ID" path="id" {...P} readOnly={!isNew} hint={isNew ? "Short lowercase key" : "Domain ids are fixed keys used by every card"} />
          <TextF label="Short name" path="short" {...P} hint="Shown on the tree" />
          <F label="Colour" error={msgFor(problems, "color")}>
            {(id) => <div class="color-row"><input id={id} type="color" value={/^#[0-9a-f]{6}$/i.test(draft.color || "") ? draft.color : "#777777"} onInput={(e) => set("color", e.currentTarget.value)} /><input class="input" aria-label="Colour hex" value={draft.color || ""} onInput={(e) => set("color", e.currentTarget.value)} /></div>}
          </F>
          <SelF label="Icon" path="icon" {...P} options={DOMAIN_ICONS.map((i) => [i, i])} />
          <TextF label="Covers" path="description" {...P} area />
          <TextF label="Examples" path="examples" {...P} area />
        </>
      );
    case "cascades": {
      const w = draft.when || {};
      const op = ["lte", "gte", "lt", "gt"].find((k) => w[k] != null) || "lte";
      return (
        <>
          {idF}
          <Group title="When">
            <SelF label="Domain" path="when.domain" {...P} options={domOpts} />
            <F label="Is">{(id) => (
              <select id={id} class="input" value={op} onChange={(e) => { const v = w[op]; const nw = { domain: w.domain }; nw[e.currentTarget.value] = v ?? 2; set("when", nw); }}>
                <option value="lte">at or below</option><option value="gte">at or above</option><option value="lt">below</option><option value="gt">above</option>
              </select>
            )}</F>
            <NumF label="Threshold" path={`when.${op}`} {...P} min={0} max={10} />
          </Group>
          <EffectsF label="Effects" path="effects" {...P} />
          <TextF label="What happens" path="text" {...P} area />
          {statusF}
        </>
      );
    }
    default: return null;
  }
}

function Preview({ kind, item }) {
  const { content, theme } = useStore(app);
  try {
    switch (kind) {
      case "signals": return <SignalCard content={content} signal={item} />;
      case "drivers": return (
        <div class="preview-stack">
          <DriverCard content={content} driver={item} />
          <div class="preview-dilemma">
            <p class="dilemma-prompt dilemma-prompt--sm">{item.dilemma && item.dilemma.prompt}</p>
            <ol class="options options--sm">{((item.dilemma && item.dilemma.options) || []).map((o, k) => <li class="option" key={k}><span class="option-letter">{String.fromCharCode(65 + k)}</span><div class="option-body"><strong class="option-label">{o.label}</strong><p class="option-text">{o.text}</p><Effects content={content} list={o.effects} short /></div></li>)}</ol>
          </div>
        </div>
      );
      case "strategies": return <StrategyCard content={content} strategy={item} />;
      case "roles": return (
        <div class="preview-stack">
          <RoleCard content={content} role={item} />
          {(item.mandates || []).map((m, i) => <div class="preview-mandate" key={i}><p class="sub-h">Mandate {m.id}</p><MandateView content={content} mandate={m} compact /></div>)}
        </div>
      );
      case "scenarios": return (
        <div class="preview-stack">
          <div class="preview-tree"><Tree content={content} cond={Object.fromEntries(content.domains.map((d) => [d.id, Math.max(0, Math.min(10, +((item.start || {})[d.id]) || 0))]))} theme={theme} idPrefix="prev" floats={false} /></div>
          <p>{item.summary}</p>
        </div>
      );
      case "domains": return (
        <div class="preview-domain">
          <DomainDot domain={item} size={40} />
          <p class="card-title">{item.name}</p>
          <p class="muted">{item.description}</p>
        </div>
      );
      case "cascades": return (
        <div class="cascade">
          <p class="cascade-when"><Icon name="cascade" size={20} /> When {(content.domains.find((d) => d.id === (item.when || {}).domain) || {}).name} is {item.when && item.when.lte != null ? `at or below ${item.when.lte}` : item.when && item.when.gte != null ? `at or above ${item.when.gte}` : "…"}</p>
          <p class="cascade-text">{item.text}</p>
          <Effects content={content} list={item.effects} />
        </div>
      );
      default: return null;
    }
  } catch {
    return <p class="muted">Preview unavailable until required fields are filled in.</p>;
  }
}

// ---------------------------------------------------------------------------
function RulesEditor() {
  const { content } = useStore(app);
  const [d, setD] = useState(() => ({ rules: { ...DEFAULT_RULES, ...(content.rules || {}), outcome: { ...DEFAULT_RULES.outcome, ...((content.rules || {}).outcome || {}) } }, meta: { ...content.meta }, prompts: { debrief: [], monday: [], ...(content.prompts || {}) }, eras: content.eras.map((e) => ({ ...e })) }));
  useEffect(() => setD({ rules: { ...DEFAULT_RULES, ...(content.rules || {}), outcome: { ...DEFAULT_RULES.outcome, ...((content.rules || {}).outcome || {}) } }, meta: { ...content.meta }, prompts: { debrief: [], monday: [], ...(content.prompts || {}) }, eras: content.eras.map((e) => ({ ...e })) }), [content]);
  const set = (path, v) => setD((x) => setIn(x, path, v));
  const P = { draft: d, set, problems: [] };
  const num = (label, path, min, max, hint) => <NumF label={label} path={path} {...P} min={min} max={max} hint={hint} />;
  const save = () => {
    const c2 = { ...content, rules: d.rules, meta: { ...d.meta, updated: todayISO() }, prompts: d.prompts, eras: d.eras };
    const v = validateContent(c2);
    if (v.errors.length) { toast(v.errors[0], "warn"); return; }
    setLocalContent(c2);
    toast("Saved to your local edits.");
  };
  return (
    <div class="rules-editor">
      <Group title="Edition">
        <TextF label="Game title" path="meta.title" {...P} />
        <TextF label="Subtitle" path="meta.subtitle" {...P} />
        <TextF label="Edition" path="meta.edition" {...P} hint="e.g. 2027.03 — shown on host and phones" />
        <TextF label="Notice" path="meta.notice" {...P} area />
        <TextF label="Credits" path="meta.credits" {...P} area rows={3} />
      </Group>
      <Group title="Rules">
        {num("Hand size", "rules.handSize", 1, 6)}
        {num("Base capacity", "rules.capacityBase", 1, 8)}
        {num("Strategies in market", "rules.marketSize", 2, 8)}
        {num("Council timer (seconds)", "rules.councilSeconds", 30, 1800)}
        {num("Headline timer (seconds)", "rules.headlineSeconds", 30, 900)}
        {num("Headline influence", "rules.headlineInfluence", 1, 4)}
        {num("Crisis domains for collapse", "rules.collapseCrisisCount", 1, 10)}
        {num("Minimum capacity", "rules.capacityMin", 0, 8)}
        <F label="Signal rounds, Standard">{(id) => <input id={id} class="input input--num" type="number" min="1" max="4" value={(d.rules.signalRounds || {}).standard ?? 1} onInput={(e) => set("rules.signalRounds.standard", Math.round(+e.currentTarget.value))} />}</F>
        <F label="Signal rounds, Deep">{(id) => <input id={id} class="input input--num" type="number" min="1" max="4" value={(d.rules.signalRounds || {}).deep ?? 2} onInput={(e) => set("rules.signalRounds.deep", Math.round(+e.currentTarget.value))} />}</F>
        <SelF label="Strategy market" path="rules.marketRefresh" {...P} options={[["fresh", "Dealt fresh each Council"], ["keep", "Unfunded strategies stay"]]} />
        <SelF label="Final-era next-era effects" path="rules.farDelayed" {...P} options={[["legacy", "Legacy (debrief only)"], ["final", "Land at game end"]]} />
        <SelF label="System response" path="rules.cascadeMode" {...P} options={[["simultaneous", "All rules checked, then applied at once"], ["sequential", "In order, can chain"]]} />
      </Group>
      <Group title="Capacity by table size (blank = base capacity)">
        {["3", "4", "5", "6", "7"].map((n) => (
          <F key={n} label={`${n} players`}>{(id) => <input id={id} class="input input--num" type="number" min="1" max="10" value={(d.rules.capacityBaseByPlayers || {})[n] ?? ""} onInput={(e) => { const v = e.currentTarget.value; const by = { ...(d.rules.capacityBaseByPlayers || {}) }; if (v === "") delete by[n]; else by[n] = Math.round(+v); set("rules.capacityBaseByPlayers", Object.keys(by).length ? by : undefined); }} />}</F>
        ))}
      </Group>
      <Group title="Capacity modifier by band (Workforce and Policy)">
        {(content.bands || []).map((b) => (
          <F key={b.label} label={b.label}>{(id) => <input id={id} class="input input--num" type="number" min="-4" max="4" value={(d.rules.capacityModifiers || {})[b.label] ?? ""} onInput={(e) => set(`rules.capacityModifiers.${b.label}`, Math.round(+e.currentTarget.value))} />}</F>
        ))}
      </Group>
      <Group title="Forest outcome">
        {[["resilient", "Resilient index ≥"], ["resilientFloor", "Resilient: every domain ≥"], ["holding", "Holding index ≥"], ["holdingFloor", "Holding: every domain ≥"]].map(([k, label]) => (
          <F key={k} label={label}>{(id) => <input id={id} class="input input--num" type="number" step={k.endsWith("Floor") ? "1" : "0.1"} min="0" max="10" value={d.rules.outcome[k] ?? ""} onInput={(e) => set(`rules.outcome.${k}`, e.currentTarget.value === "" ? undefined : +e.currentTarget.value)} />}</F>
        ))}
        <F label="Deep games: Resilient floor">{(id) => <input id={id} class="input input--num" type="number" min="0" max="10" value={(d.rules.outcomeDeep || {}).resilientFloor ?? ""} onInput={(e) => set("rules.outcomeDeep", e.currentTarget.value === "" ? undefined : { ...(d.rules.outcomeDeep || {}), resilientFloor: Math.round(+e.currentTarget.value) })} />}</F>
      </Group>
      <Group title="Eras and draw weights">
        {d.eras.map((e, i) => (
          <div class="era-edit" key={e.id}>
            <TextF label={`${e.id}: name`} path={`eras.${i}.name`} {...P} />
            <TextF label="Years" path={`eras.${i}.years`} {...P} />
            {Object.keys(e.weights || {}).map((h) => (
              <F key={h} label={`Weight ${h}`}>{(id) => <input id={id} class="input input--num" type="number" step="0.05" min="0" max="1" value={e.weights[h]} onInput={(ev) => set(`eras.${i}.weights.${h}`, +ev.currentTarget.value)} />}</F>
            ))}
          </div>
        ))}
      </Group>
      <Group title="Debrief prompts">
        <F label="Discussion prompts (one per line)">{(id) => <textarea id={id} class="input" rows={5} value={d.prompts.debrief.join("\n")} onInput={(e) => set("prompts.debrief", e.currentTarget.value.split("\n").filter((x) => x.trim()))} />}</F>
        <F label="Monday actions (one per line)">{(id) => <textarea id={id} class="input" rows={4} value={d.prompts.monday.join("\n")} onInput={(e) => set("prompts.monday", e.currentTarget.value.split("\n").filter((x) => x.trim()))} />}</F>
      </Group>
      <div class="edit-actions"><Btn kind="primary" icon="check" onClick={save}>Save rules and edition</Btn></div>
    </div>
  );
}

export { slug, rulesOf };
