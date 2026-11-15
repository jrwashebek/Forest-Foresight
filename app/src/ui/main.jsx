import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { app, host, useStore, setTheme, setTextSize, loadSaved, resumeSaved } from "./store.js";
import { initContent, loadShared, resetToPublished, setLocalContent, structuralOK } from "./content-store.js";
import { Toasts, Btn } from "./common.jsx";
import { Icon } from "./icons.jsx";
import { Home } from "./screens/home.jsx";
import { Setup } from "./screens/setup.jsx";
import { Board } from "./screens/board.jsx";
import { Debrief } from "./screens/debrief.jsx";
import { Phone } from "./screens/phone.jsx";
import { Library } from "./screens/library.jsx";
import { Rules } from "./screens/rules.jsx";
import { About } from "./screens/about.jsx";
import { cap, setHash } from "./util.js";
import { startHostSync } from "./sync.js";
import { validateContent } from "../engine/index.js";

const ROUTES = ["host", "join", "play", "library", "rules", "about"];
const TITLES = { "": "", host: "Host", join: "Join", play: "Player", library: "Content library", rules: "How to play", about: "About and sources" };

function routeOf() {
  const h = (location.hash || "").replace(/^#/, "").toLowerCase();
  return ROUTES.includes(h) ? h : "";
}

function ContentErrors({ allowLibrary = true }) {
  const { validation, contentSource, embedError } = useStore(app);
  const [imp, setImp] = useState(null);
  return (
    <main class="doc" id="main">
      <div class="error-panel" role="alert">
        <Icon name="alert" size={36} />
        <h1>This card edition has problems</h1>
        <p>The game can't start until these are fixed. {contentSource === "local" ? "They come from your local edits on this device." : ""}</p>
        <ul class="issue-list">{validation.errors.slice(0, 30).map((e, i) => <li key={i}>{e}</li>)}</ul>
        {validation.errors.length > 30 ? <p class="muted">…and {validation.errors.length - 30} more.</p> : null}
        <div class="btn-row">
          {allowLibrary && !embedError ? <a class="btn btn--primary" href="#library"><Icon name="edit" size={20} /><span>Fix them in the library</span></a> : null}
          {contentSource === "local" ? <Btn icon="reset" onClick={() => resetToPublished()}>Reset to published edition</Btn> : null}
          <label class="btn btn--secondary">
            <Icon name="upload" size={20} /><span>Import a content file</span>
            <input type="file" accept=".json,application/json" class="sr-only" onChange={async (e) => {
              const f = e.currentTarget.files && e.currentTarget.files[0];
              if (!f) return;
              try { const j = JSON.parse(await f.text()); setLocalContent(j); setImp(validateContent(j).errors.length ? "Imported, but it still has problems." : "Imported."); } catch (err) { setImp(`Couldn't read that file: ${err.message}`); }
            }} />
          </label>
          <a class="btn btn--quiet" href="#">Home</a>
        </div>
        {imp ? <p role="status">{imp}</p> : null}
      </div>
    </main>
  );
}

function Host() {
  const { content, caps, validation } = useStore(app);
  const hs = useStore(host);
  useEffect(() => {
    if (!hs.h && !hs.skipResume && loadSaved()) resumeSaved(content);
  }, []);
  useEffect(() => {
    if (hs.h && caps.room && hs.sync === "off") startHostSync(hs.h.state.code);
  }, [!!hs.h, caps.room]);
  if (!hs.h && validation.errors.length) return <ContentErrors />;
  if (!hs.h) return <Setup />;
  if (hs.h.state.phase === "over") return <Debrief />;
  return <Board />;
}

function App() {
  const { content, theme, validation } = useStore(app);
  const [route, setRoute] = useState(routeOf());
  useEffect(() => {
    const on = () => { setRoute(routeOf()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  useEffect(() => {
    const t = content && content.meta && content.meta.title ? content.meta.title : "Forest Futures";
    document.title = TITLES[route] ? `${TITLES[route]}: ${t}` : t;
    if (route !== "host") document.documentElement.classList.remove("board-mode");
  }, [route, content]);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  let page;
  if (!content || !structuralOK(content)) page = route === "library" && content ? <ContentErrors allowLibrary={false} /> : <ContentErrors allowLibrary={false} />;
  else if (route === "host") page = <Host />;
  else if (route === "join" || route === "play") page = validation.errors.length ? <ContentErrors /> : <Phone route={route} />;
  else if (route === "library") page = <Library />;
  else if (route === "rules") page = <Rules />;
  else if (route === "about") page = <About />;
  else page = <Home />;
  return (
    <>
      {page}
      <Toasts />
    </>
  );
}

async function detectCaps() {
  const names = ["room", "downloads", "user", "db"];
  await Promise.all(names.map(async (n) => {
    const c = await cap(n);
    app.set((s) => ({ ...s, caps: { ...s.caps, [n]: c } }));
    if (n === "user" && c && typeof c.canEdit === "function") {
      try { const ok = await c.canEdit(); app.set({ canPublish: !!ok }); } catch { /* */ }
    }
    if (n === "db" && c) await loadShared(c);
  }));
  app.set((s) => ({ ...s, caps: { ...s.caps, checked: true } }));
}

function boot() {
  try { setTheme(app.get().theme === "screen" ? "screen" : "projector"); } catch { /* */ }
  try { setTextSize(app.get().textSize); } catch { /* */ }
  initContent();
  const root = document.getElementById("app");
  root.textContent = "";
  render(<App />, root);
  detectCaps();
}

boot();
