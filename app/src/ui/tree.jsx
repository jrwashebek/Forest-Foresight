import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { bandOf, isCrisis } from "../engine/index.js";
import { IconBody, Icon } from "./icons.jsx";
import { domainTone, reducedMotion, cx } from "./util.js";

const R = 330, R0 = 26, BARK = 18;
const HALF = 466;
// label block half-extents (viewBox units): clear the bark by GAP along each wedge's mid-angle
const LHW = 56, LHH = 44, GAP = 10;
const labelR = (a) => R + BARK + GAP + LHW * Math.abs(Math.cos(a)) + LHH * Math.abs(Math.sin(a));
const rOf = (v) => R0 + (R - R0) * (Math.max(0, Math.min(10, v)) / 10);
const pol = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
const f = (n) => Math.round(n * 100) / 100;

function sector(r0, r1, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = pol(r0, a0), [x1, y1] = pol(r1, a0), [x2, y2] = pol(r1, a1), [x3, y3] = pol(r0, a1);
  return `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}A${f(r1)} ${f(r1)} 0 ${large} 1 ${f(x2)} ${f(y2)}L${f(x3)} ${f(y3)}A${f(r0)} ${f(r0)} 0 ${large} 0 ${f(x0)} ${f(y0)}Z`;
}
function arc(r, a0, a1) {
  const [x1, y1] = pol(r, a0), [x2, y2] = pol(r, a1);
  return `M${f(x1)} ${f(y1)}A${f(r)} ${f(r)} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${f(x2)} ${f(y2)}`;
}
/** Wobbly closed ring (deterministic) for wood grain and bark. */
function wobble(r, k, amp = 1, pts = 96) {
  let d = "";
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const rr = r * (1 + amp * (0.011 * Math.sin(3 * a + k * 1.7) + 0.007 * Math.sin(7 * a + k * 0.9) + 0.004 * Math.sin(13 * a + k)));
    const [x, y] = pol(rr, a);
    d += (i ? "L" : "M") + f(x) + " " + f(y);
  }
  return d + "Z";
}
/** Growth ring: an arc inside each wedge at that era's level, joined by short radial steps. */
function steppedRing(values, n, start) {
  const step = (Math.PI * 2) / n;
  let d = "";
  for (let i = 0; i < n; i++) {
    const a0 = start + i * step, a1 = a0 + step, r = rOf(values[i]);
    const [x0, y0] = pol(r, a0), [x1, y1] = pol(r, a1);
    d += (i ? "L" : "M") + f(x0) + " " + f(y0) + "A" + f(r) + " " + f(r) + " 0 0 1 " + f(x1) + " " + f(y1);
  }
  return d + "Z";
}
/** Smooth growth ring through each wedge's value at its mid-angle (cosine-interpolated in angle). */
function growthRing(values, n, start) {
  const step = (Math.PI * 2) / n;
  const pts = n * 18;
  let d = "";
  for (let i = 0; i <= pts; i++) {
    const a = start + (i / pts) * Math.PI * 2;
    const u = (a - start) / step - 0.5;
    const i0 = ((Math.floor(u) % n) + n) % n, i1 = (i0 + 1) % n;
    const t = u - Math.floor(u);
    const s = (1 - Math.cos(Math.PI * t)) / 2;
    // keep the ring inside the wedge's level for most of the wedge: ease only near the boundary
    const tt = t < 0.32 ? 0 : t > 0.68 ? 1 : (t - 0.32) / 0.36;
    const ss = (1 - Math.cos(Math.PI * tt)) / 2;
    const v = values[i0] + (values[i1] - values[i0]) * (0.25 * s + 0.75 * ss);
    const [x, y] = pol(rOf(v), a);
    d += (i ? "L" : "M") + f(x) + " " + f(y);
  }
  return d + "Z";
}

function useTween(target, keys, ms = 950) {
  const [vals, setVals] = useState(target);
  const r = useRef({ cur: target, raf: 0 });
  const sig = keys.map((k) => target[k]).join(",");
  useEffect(() => {
    const st = r.current;
    cancelAnimationFrame(st.raf);
    const from = { ...st.cur };
    if (reducedMotion() || keys.every((k) => from[k] === target[k])) { st.cur = target; setVals(target); return; }
    const t0 = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - t, 3);
      const v = {};
      for (const k of keys) v[k] = (from[k] ?? target[k]) + (target[k] - (from[k] ?? target[k])) * e;
      st.cur = v;
      setVals(v);
      if (t < 1) st.raf = requestAnimationFrame(tick);
    };
    st.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(st.raf);
  }, [sig]);
  return vals;
}

let floatSeq = 0;
function useFloats(cond, keys, enabled) {
  const prev = useRef(cond);
  const [floats, setFloats] = useState([]);
  const sig = keys.map((k) => cond[k]).join(",");
  useEffect(() => {
    const p = prev.current;
    prev.current = cond;
    if (!enabled) return;
    const add = [];
    for (const k of keys) if (p[k] != null && cond[k] !== p[k]) add.push({ id: ++floatSeq, d: k, delta: cond[k] - p[k] });
    if (!add.length) return;
    setFloats((fl) => [...fl.filter((x) => !add.some((a) => a.d === x.d)), ...add]);
    const ids = add.map((a) => a.id);
    setTimeout(() => setFloats((fl) => fl.filter((x) => !ids.includes(x.id))), 2800);
  }, [sig]);
  return floats;
}

/**
 * Tree cross-section.
 * props: content, cond, rings [{era, cond}], protectedDomains, theme, compact (no labels),
 *        pick { onPick(id), disabled: [], selected: [], prompt }, ringLabels (bool), title
 */
/** viewBox width of the fully labelled tree; callers use it to decide when labels would get too small. */
export const TREE_VB = HALF * 2;
export const LABEL_MIN_UNITS = 19; // smallest label font (band, ring label) in viewBox units
/** viewBox width of the badge ring and its value font size (viewBox units); below 14px the board drops the badges. */
export const BADGE_VB = (R + BARK + 8) * 2;
export const BADGE_UNITS = 38;

export function Tree({ content, cond, rings = [], protectedDomains = [], theme = "projector", compact = false, badges = false, pick = null, title, floats: showFloats = true, idPrefix = "t" }) {
  const domains = content.domains;
  const keys = domains.map((d) => d.id);
  const n = domains.length;
  const step = (Math.PI * 2) / n;
  const start = -Math.PI / 2 - step / 2;
  const disp = useTween(cond, keys);
  const floats = useFloats(cond, keys, showFloats && (!compact || badges));
  const tones = useMemo(() => Object.fromEntries(domains.map((d) => [d.id, domainTone(d.color, theme)])), [domains, theme]);
  const grain = useMemo(() => Array.from({ length: 15 }, (_, k) => wobble(R0 + 8 + (k + 1) * ((R - R0 - 8) / 16), k, 1)), []);
  const barkOuter = useMemo(() => wobble(R + BARK, 3, 1.4, 140), []);
  const fissures = useMemo(() => Array.from({ length: 64 }, (_, i) => {
    const a = (i / 64) * Math.PI * 2 + Math.sin(i * 7.3) * 0.03;
    const [x0, y0] = pol(R + 3, a), [x1, y1] = pol(R + BARK * 0.62 + Math.sin(i * 3.1) * 2.5, a + 0.01);
    return `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`;
  }).join(""), []);
  const half = badges ? R + BARK + 8 : compact ? R + BARK + 6 : HALF;
  const RB = R - 50; // badge radius
  // a ring identical to the current fill adds nothing; skip it
  const shownRings = rings.map((rg, k) => ({ rg, k })).filter(({ rg }) => keys.some((id) => (rg.cond[id] ?? 0) !== cond[id]));
  const ringRadii = [2.5, 4.5, 6.5, 8.5].map(rOf);
  const interactive = !!pick;
  const vb = `${-half} ${-half} ${half * 2} ${half * 2}`;
  const gid = `${idPrefix}-shade`;

  const onKey = (e, id) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick.onPick(id); }
  };

  const summary = title || `Forest condition: ${domains.map((d) => `${d.name} ${cond[d.id]} ${bandOf(content, cond[d.id]).label}`).join(", ")}`;

  return (
    <svg class={cx("tree", compact && "tree--compact", badges && "tree--badges", interactive && "tree--pick")} viewBox={vb} role={interactive ? "group" : "img"} aria-label={summary}>
      <defs>
        <radialGradient id={gid} cx="0" cy="0" r={R} gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="var(--heart-shade)" stop-opacity="0.32" />
          <stop offset="0.55" stop-color="var(--heart-shade)" stop-opacity="0.08" />
          <stop offset="1" stop-color="var(--heart-shade)" stop-opacity="0" />
        </radialGradient>
      </defs>
      {/* bark + wood */}
      <path d={barkOuter} class="tree-bark" />
      <path d={fissures} class="tree-fissures" />
      <circle r={R} class="tree-wood" />
      {/* current condition fills */}
      {domains.map((d, i) => {
        const a0 = start + i * step, a1 = a0 + step;
        const r = rOf(disp[d.id] ?? 0);
        return <path key={d.id} d={sector(R0, r, a0, a1)} fill={tones[d.id].fill} class="tree-fill" />;
      })}
      <circle r={R} fill={`url(#${gid})`} class="tree-shade" />
      {grain.map((d, k) => <path key={k} d={d} class="tree-grain" />)}
      {ringRadii.map((r, k) => <circle key={k} r={r} class="tree-band" />)}
      {/* growth fronts */}
      {domains.map((d, i) => {
        const a0 = start + i * step, a1 = a0 + step;
        return <path key={d.id} d={arc(rOf(disp[d.id] ?? 0), a0 + 0.004, a1 - 0.004)} stroke={tones[d.id].edge} class="tree-front" />;
      })}
      {/* rays between wedges */}
      {domains.map((d, i) => {
        const a = start + i * step;
        const [x0, y0] = pol(R0, a), [x1, y1] = pol(R, a);
        return <line key={d.id} x1={f(x0)} y1={f(y0)} x2={f(x1)} y2={f(y1)} class="tree-ray" />;
      })}
      {/* past eras as growth rings */}
      {shownRings.map(({ rg, k }) => (
        <path key={rg.era + k} d={steppedRing(keys.map((id) => rg.cond[id] ?? 0), n, start)} class={cx("tree-ring", `tree-ring--${k}`)} />
      ))}
      {!compact && !badges && shownRings.map(({ rg, k }) => {
        const wi = (k * 4 + 6) % n;
        const a = start + step * (wi + 0.5);
        const v = rg.cond[keys[wi]] ?? 0;
        const [x, y] = pol(rOf(v), a);
        const era = (content.eras || []).find((e) => e.id === rg.era);
        return <text key={"rl" + k} x={f(x)} y={f(y) + 5} class="tree-ring-label" text-anchor="middle">{era ? era.name : rg.era}</text>;
      })}
      {/* fire scars on Crisis wedges */}
      {domains.map((d, i) => {
        if (!isCrisis(content, cond[d.id])) return null;
        const am = start + (i + 0.5) * step, w = step * 0.15;
        const P = (r, a) => pol(r, a).map(f).join(" ");
        const notch = `M${P(R + BARK + 12, am - w * 1.3)}L${P(R + 1, am - w * 0.66)}L${P(R + 1, am + w * 0.66)}L${P(R + BARK + 12, am + w * 1.3)}Z`;
        const charPath = `M${P(R + 1, am - w * 0.66)}Q${P(R - 30, am - w * 0.55)} ${P(R - 60, am + w * 0.06)}Q${P(R - 27, am + w * 0.45)} ${P(R + 1, am + w * 0.66)}`;
        return (
          <g key={"scar" + d.id} class="tree-scar">
            <path d={notch} class="tree-scar-notch" />
            <path d={charPath + "Z"} class="tree-scar-body" />
            <path d={charPath} class="tree-scar-edge" />
          </g>
        );
      })}
      {/* protected outline */}
      {domains.map((d, i) => protectedDomains.includes(d.id) ? (
        <path key={"pr" + d.id} d={sector(R0 + 4, R - 4, start + i * step + 0.02, start + (i + 1) * step - 0.02)} class="tree-protect" />
      ) : null)}
      <circle r={R0} class="tree-pith" />
      <circle r={5} class="tree-pith-dot" />
      {/* pick targets */}
      {interactive && domains.map((d, i) => {
        const a0 = start + i * step, a1 = a0 + step;
        const dis = (pick.disabled || []).includes(d.id);
        const sel = (pick.selected || []).includes(d.id);
        return (
          <path key={"hit" + d.id} d={sector(R0, R + BARK, a0, a1)} class={cx("tree-hit", sel && "is-selected", dis && "is-disabled")}
            role="button" tabIndex={dis ? -1 : 0} aria-disabled={dis ? "true" : undefined} aria-pressed={sel ? "true" : "false"}
            aria-label={`${d.name}, ${cond[d.id]}, ${bandOf(content, cond[d.id]).label}${dis ? ", not available" : ""}`}
            onClick={() => !dis && pick.onPick(d.id)} onKeyDown={(e) => !dis && onKey(e, d.id)} />
        );
      })}
      {/* compact ring: icon + value badge on every wedge */}
      {badges && domains.map((d, i) => {
        const am = start + (i + 0.5) * step;
        const [x, y] = pol(RB, am);
        const v = Math.round(disp[d.id] ?? 0);
        const target = cond[d.id];
        const crisis = isCrisis(content, target);
        const prot = protectedDomains.includes(d.id);
        const sel = interactive && (pick.selected || []).includes(d.id);
        const w = v >= 10 ? 104 : 88;
        return (
          <g key={"bdg" + d.id} transform={`translate(${f(x)} ${f(y)})`} class={cx("tree-badge", crisis && "is-crisis", prot && "is-protected", sel && "is-selected")} aria-hidden="true">
            <rect x={-w / 2} y={-26} width={w} height={52} rx={26} style={{ "--de": tones[d.id].edge }} />
            <g transform={`translate(${-w / 2 + 12} -14) scale(1.17)`} style={{ color: tones[d.id].edge }} class="tree-badge-icon">
              <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><IconBody name={d.icon || d.id} /></g>
            </g>
            <text x={w / 2 - 14} y={14} text-anchor="end" class="tree-badge-val">{v}</text>
          </g>
        );
      })}
      {/* labels */}
      {!compact && !badges && domains.map((d, i) => {
        const am = start + (i + 0.5) * step;
        const [x, y] = pol(labelR(am), am);
        const v = Math.round(disp[d.id] ?? 0);
        const target = cond[d.id];
        const band = bandOf(content, target).label;
        const vw = String(v).length * 25;
        const total = 38 + 8 + vw;
        const s0 = -total / 2;
        const prot = protectedDomains.includes(d.id);
        const crisis = isCrisis(content, target);
        const sel = interactive && (pick.selected || []).includes(d.id);
        return (
          <g key={"lab" + d.id} transform={`translate(${f(x)} ${f(y)})`} class={cx("tree-label", crisis && "is-crisis", sel && "is-selected")} aria-hidden="true">
            <circle cx={s0 + 19} cy={-24} r={20} fill={tones[d.id].soft} stroke={tones[d.id].edge} stroke-width="2" />
            <g transform={`translate(${s0 + 19 - 13} ${-24 - 13}) scale(1.08)`} class="tree-label-icon" style={{ color: tones[d.id].edge }}>
              <g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><IconBody name={d.icon || d.id} /></g>
            </g>
            <text x={s0 + 46} y={-8} class="tree-val">{v}</text>
            <text x={0} y={20} text-anchor="middle" class="tree-name">{d.short || d.name}</text>
            <text x={0} y={44} text-anchor="middle" class="tree-band-label">{band}</text>
            {prot ? <text x={0} y={66} text-anchor="middle" class="tree-prot-label">Protected</text> : null}
          </g>
        );
      })}
      {floats.map((fl) => {
        const i = keys.indexOf(fl.d);
        if (i < 0) return null;
        const am = start + (i + 0.5) * step;
        const [x, y] = badges ? pol(RB, am) : pol(labelR(am), am);
        return (
          <g key={fl.id} transform={badges ? `translate(${f(x)} ${f(y - 40)})` : `translate(${f(x + 52)} ${f(y - 38)})`}>
            <text class={cx("tree-float", fl.delta > 0 ? "is-up" : "is-down")} text-anchor="middle">
              {fl.delta > 0 ? "▲" : "▼"}{Math.abs(fl.delta)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Legend for the compact ring: name, value and band for every domain, in page-sized type. */
export function TreeLegend({ content, cond, protectedDomains = [], theme = "projector" }) {
  return (
    <ul class="tree-legend" aria-hidden="true" style={{ "--rows": Math.ceil(content.domains.length / 2) }}>
      {content.domains.map((d) => {
        const t = domainTone(d.color, theme);
        const crisis = isCrisis(content, cond[d.id]);
        return (
          <li key={d.id} class={cx("tl-row", crisis && "is-crisis")}>
            <span class="tl-dot" style={{ background: t.fill }} />
            <span class="tl-name">{d.short || d.name}{protectedDomains.includes(d.id) ? <Icon name="shield" size={14} class="tl-prot" title="Protected this era" /> : null}</span>
            <strong class="tl-val">{cond[d.id]}</strong>
            <span class="tl-band">{bandOf(content, cond[d.id]).label}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Data-table alternative to the tree. */
export function TreeTable({ content, cond, rings = [], start, protectedDomains = [] }) {
  return (
    <table class="tree-table">
      <caption class="sr-only">Condition of each domain by era</caption>
      <thead>
        <tr>
          <th scope="col">Domain</th>
          {start ? <th scope="col">Start</th> : null}
          {rings.map((r, k) => <th key={k} scope="col">End of {((content.eras || []).find((e) => e.id === r.era) || {}).name || r.era}</th>)}
          <th scope="col">Current</th>
          <th scope="col">Band</th>
        </tr>
      </thead>
      <tbody>
        {content.domains.map((d) => (
          <tr key={d.id}>
            <th scope="row"><span class="swatch" style={{ background: d.color }} aria-hidden="true" />{d.name}{protectedDomains.includes(d.id) ? <span class="tag">protected</span> : null}</th>
            {start ? <td>{start[d.id]}</td> : null}
            {rings.map((r, k) => <td key={k}>{r.cond[d.id]}</td>)}
            <td class="num-strong">{cond[d.id]}</td>
            <td>{bandOf(content, cond[d.id]).label}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
