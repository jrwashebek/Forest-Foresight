#!/usr/bin/env node
// Build Forest Futures into ONE self-contained HTML file.
//   node build.mjs --content <content.json> --out dist/forest-futures.html [--dev]
import { build, transform } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};
// Default: the published edition written by the content team. sample-content.json is for unit tests only.
const contentPath = resolve(arg("content", join(here, "../content/content.json")));
const outPath = resolve(arg("out", join(here, "dist/forest-futures.html")));
const dev = args.includes("--dev");

// 1. Content: parse (fail loudly on bad JSON), re-serialise compactly, escape for <script>.
let content;
try {
  content = JSON.parse(readFileSync(contentPath, "utf8"));
} catch (e) {
  console.error(`✗ Could not read content JSON at ${contentPath}: ${e.message}`);
  process.exit(1);
}
const { validateContent, fingerprint } = await import(join(here, "src/engine/index.js"));
const v = validateContent(content);
if (v.errors.length) {
  console.warn(`! Content has ${v.errors.length} validation errors (the app will show them):`);
  v.errors.slice(0, 15).forEach((e) => console.warn("   - " + e));
}
const contentJson = JSON.stringify(content).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

// 2. JS bundle
const js = await build({
  entryPoints: [join(here, "src/ui/main.jsx")],
  bundle: true,
  format: "iife",
  minify: !dev,
  sourcemap: dev ? "inline" : false,
  target: "es2020",
  jsx: "automatic",
  jsxImportSource: "preact",
  write: false,
  legalComments: "none",
  loader: { ".md": "text" },
  define: { "process.env.NODE_ENV": dev ? '"development"' : '"production"' },
});
const jsText = js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

// 3. CSS (all files in src/styles, in name order)
const cssDir = join(here, "src/styles");
const cssFiles = readdirSync(cssDir).filter((f) => f.endsWith(".css")).sort();
const cssRaw = cssFiles.map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n");
const css = (await transform(cssRaw, { loader: "css", minify: !dev })).code;

// 4. Fonts: embed the variable fonts (latin subset) so the page works offline and behind
//    networks that block Google Fonts. --google-fonts links Google Fonts instead.
const useGoogle = args.includes("--google-fonts");
let fontCss = "";
if (!useGoogle) {
  const f = (pkg, file) => readFileSync(join(here, "node_modules/@fontsource-variable", pkg, "files", file)).toString("base64");
  const face = (family, b64, style, range) => `@font-face{font-family:"${family}";font-style:${style};font-display:swap;font-weight:${range};src:url(data:font/woff2;base64,${b64}) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2190-2199,U+2212,U+2215,U+25A0-25FF,U+2600-26FF,U+FEFF,U+FFFD}`;
  fontCss = [
    face("Newsreader", f("newsreader", "newsreader-latin-wght-normal.woff2"), "normal", "200 800"),
    face("Newsreader", f("newsreader", "newsreader-latin-wght-italic.woff2"), "italic", "200 800"),
    face("Public Sans", f("public-sans", "public-sans-latin-wght-normal.woff2"), "normal", "100 900"),
    face("Public Sans", f("public-sans", "public-sans-latin-wght-italic.woff2"), "italic", "100 900"),
  ].join("");
}
const fontLinks = useGoogle ? `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..800;1,6..72,400..600&family=Public+Sans:ital,wght@0,400..800;1,400..600&display=swap">` : "";

// 5. HTML shell
const title = (content.meta && content.meta.title) || "Forest Futures";
const html = `<!doctype html>
<html lang="en" data-theme="projector">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="description" content="A strategic-foresight game for forest leaders: weak signals, dilemmas, pooled capacity, and a shared forest outcome.">
<title>${title.replace(/</g, "&lt;")}</title>
${fontLinks}
<style>${fontCss}</style>
<style>${css}</style>
</head>
<body>
<div id="app"><p style="font:18px system-ui;padding:2rem">Loading Forest Futures…</p></div>
<noscript><p style="font:18px system-ui;padding:2rem">Forest Futures needs JavaScript to run.</p></noscript>
<script type="application/json" id="ff-content">${contentJson}</script>
<script>${jsText}</script>
</body>
</html>
`;
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html);
const kb = (n) => (n / 1024).toFixed(1) + " KB";
console.log(`✓ ${outPath}`);
console.log(`  total ${kb(html.length)}  (js ${kb(jsText.length)}, css ${kb(css.length)}, fonts ${kb(fontCss.length)}, content ${kb(contentJson.length)})`);
console.log(`  edition ${fingerprint(content)}  ·  ${v.errors.length} errors, ${v.warnings.length} warnings`);
