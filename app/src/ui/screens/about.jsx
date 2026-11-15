import { app, useStore } from "../store.js";
import { Icon } from "../icons.jsx";
import { ThemeToggle } from "../common.jsx";
import { HorizonBadge } from "../cards.jsx";
import { fingerprint } from "../../engine/index.js";
import ADDITIONS from "../../../ABOUT-ADDITIONS.md";

/** Typographic quotes, as in the rest of the app: "x" → “x”, it's → it’s. */
export function smartQuotes(t) {
  return String(t)
    .replace(/(^|[\s([{\u2014\u2013-])"/g, "$1\u201c").replace(/"/g, "\u201d")
    .replace(/(^|[\s([{\u2014\u2013-])'/g, "$1\u2018").replace(/'/g, "\u2019");
}

/** Renders the About additions verbatim: "## " headings, "- **Lead.** text" bullets, plain paragraphs. */
function MdSections({ md }) {
  const body = md.slice(md.indexOf("\n## ") + 1);
  const sections = body.split(/^## /m).filter((x) => x.trim());
  const inline = (t) => smartQuotes(t).split(/(\*\*[^*]+\*\*)/).map((part, i) => (/^\*\*/.test(part) ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
  return sections.map((sec, k) => {
    const [title, ...lines] = sec.split("\n");
    const items = lines.filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
    const paras = lines.filter((l) => l.trim() && !l.startsWith("- "));
    return (
      <section key={k}>
        <h2 class="section-title">{smartQuotes(title.trim())}</h2>
        {paras.map((p, i) => <p key={"p" + i}>{inline(p)}</p>)}
        {items.length ? <ul class="about-list">{items.map((it, i) => <li key={i}>{inline(it)}</li>)}</ul> : null}
      </section>
    );
  });
}

export function About() {
  const { content, contentSource } = useStore(app);
  const withSource = [
    ...content.signals.map((s) => ({ kind: "Signal", item: s })),
    ...content.drivers.map((d) => ({ kind: "Driver", item: d })),
  ].filter((x) => x.item && x.item.source);
  return (
    <main class="doc" id="main">
      <header class="page-head">
        <a href="#" class="back-link"><Icon name="back" size={20} /> Home</a>
        <h1>About and sources</h1>
        <ThemeToggle />
      </header>
      <div class="doc-grid">
        <article class="doc-main">
          <section>
            <h2 class="section-title">Where this game comes from</h2>
            <p class="lede">{content.meta.title || "Forest Futures"} evolved from <cite>IMPACT: a foresight game – forestry edition</cite> (2019), created by the USDA Forest Service Strategic Foresight Group, Northern Research Station, with the University of Minnesota — David N. Bengston, Lynne M. Westphal, Michael J. Dockry and Jason S. Crabtree.</p>
            <p>That game was itself adapted from <cite>IMPACT</cite>, designed by Idea Couture in collaboration with Policy Horizons Canada. Forest Futures keeps its heart — weak-signal cards, cross-impacts that players must explain, and the Headline of an Era — and adds leadership roles, real dilemmas, pooled capacity, and a shared forest outcome. It is not branded as IMPACT; we credit it with gratitude.</p>
            <p>Every signal and driver card is grounded in a real, cited source. Cards are written in our own words; follow the links below to read the originals. Inclusion of a source is not an endorsement, and the game describes federal and political developments neutrally across a range of plausible futures.</p>
          </section>
          <section>
            <h2 class="section-title">This edition</h2>
            <p>Edition <strong>{fingerprint(content)}</strong>, updated {content.meta.updated}. Loaded from {contentSource === "local" ? "your local edits on this device" : contentSource === "db" ? "the shared library" : "the published edition built into this page"}.</p>
            {content.meta.notice ? <p class="notice">{content.meta.notice}</p> : null}
          </section>
          <section>
            <h2 class="section-title">Credits</h2>
            <p>{content.meta.credits}</p>
          </section>
          {/* ABOUT-ADDITIONS.md: two sections after the credits, before the source list */}
          <MdSections md={ADDITIONS} />
          <section>
            <h2 class="section-title">Card sources ({withSource.length})</h2>
            <ul class="source-list">
              {withSource.map(({ kind, item }) => (
                <li key={item.id}>
                  <div class="source-head">
                    <HorizonBadge content={content} horizon={item.horizon} small />
                    <span class="tag">{kind}</span>
                    <strong>{item.title}</strong>
                    {item.status === "retired" ? <span class="tag">retired</span> : null}
                  </div>
                  <p>
                    <a href={item.source.url} target="_blank" rel="noopener noreferrer">{item.source.title}</a>
                    {item.source.publisher ? `, ${item.source.publisher}` : ""}{item.source.date ? `, ${item.source.date}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </article>
        <aside class="doc-aside">
          <div class="ref-card">
            <h2 class="sub-h">Built for</h2>
            <p>USDA Forest Service and State forestry agency leaders, Tribal and local partners, and anyone practising long-range decisions about forests.</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
