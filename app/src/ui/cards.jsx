import { lookups, bandOf } from "../engine/index.js";
import { Icon } from "./icons.jsx";
import { cx, fmtDelta, domainTone } from "./util.js";
import { app, useStore } from "./store.js";

export function DomainDot({ domain, size = 20 }) {
  const { theme } = useStore(app);
  const t = domainTone(domain.color, theme);
  return (
    <span class="ddot" style={{ "--dc": t.edge, "--ds": t.soft, width: size + 8 + "px", height: size + 8 + "px" }} aria-hidden="true">
      <Icon name={domain.icon || domain.id} size={size} />
    </span>
  );
}

/** Domain chip + signed delta: e.g. [icon] Fire ▲2 */
export function Effect({ content, domain, delta, blocked, short = false }) {
  const d = lookups(content).domains[domain];
  if (!d) return <span class="effect effect--bad">Unknown domain “{domain}”</span>;
  const up = delta > 0;
  return (
    <span class={cx("effect", blocked && "effect--blocked")}>
      <DomainDot domain={d} size={16} />
      <span class="effect-name">{short ? d.short || d.name : d.name}</span>
      {delta != null ? (
        <span class={cx("delta", up ? "delta--up" : "delta--down")}>
          <span aria-hidden="true">{up ? "▲" : "▼"}</span>
          <span class="sr-only">{up ? "up" : "down"} </span>{Math.abs(delta)}
        </span>
      ) : null}
      {blocked ? <span class="tag">blocked: protected</span> : null}
    </span>
  );
}

export function Effects({ content, list, short }) {
  if (!list || !list.length) return null;
  return <span class="effects">{list.map((e, i) => <Effect key={i} content={content} domain={e.domain} delta={e.delta} short={short} />)}</span>;
}

export function HorizonBadge({ content, horizon, small }) {
  const era = (content.eras || []).find((e) => e.id === horizon);
  const name = era ? era.name : horizon;
  return (
    <span class={cx("horizon", `horizon--${horizon}`, small && "horizon--small")} title={era ? `${era.name} horizon, ${era.years}` : name}>
      <Icon name={`h-${["now", "near", "far"].includes(horizon) ? horizon : "near"}`} size={small ? 16 : 20} />
      <span>{name}</span>
      {era && !small ? <span class="horizon-years">{era.years}</span> : null}
    </span>
  );
}

const SEC_VERB = { add: "Add", remove: "Remove", move: "Move", protect: "Protect" };

export function secondaryLabel(sec) {
  if (!sec) return "";
  if (sec.type === "fixed") return "";
  if (sec.type === "protect") return "Protect a domain of your choice";
  if (sec.type === "move") return `Move ${sec.amount || 1} between domains you choose`;
  return `${SEC_VERB[sec.type]} ${sec.amount || 1} ${sec.type === "add" ? "to" : "from"} a domain you choose`;
}

export function SourceLine({ source }) {
  if (!source) return null;
  const year = (source.date || "").slice(0, 4);
  return (
    <p class="source">
      <span class="source-k">Source</span>{" "}
      {source.url ? (
        <a href={source.url} target="_blank" rel="noopener noreferrer">{source.publisher || source.title}</a>
      ) : (source.publisher || source.title)}
      {year ? <span>, {year}</span> : null}
    </p>
  );
}

/**
 * Signal card. state: "hand" | "selected" | "played" | "preview"
 */
export function SignalCard({ content, signal, selected, onSelect, played, compact, discard, onToggleDiscard, headingLevel = 3, idx }) {
  const L = lookups(content);
  if (!signal) return null;
  const p = signal.primary || {};
  const sec = signal.secondary;
  const pd = L.domains[p.domain];
  const H = `h${headingLevel}`;
  const clickable = !!onSelect && !played;
  const body = (
    <>
      <div class="card-top">
        <HorizonBadge content={content} horizon={signal.horizon} small={compact} />
        {pd ? <span class="card-corner" style={{ "--dc": pd.color }} aria-hidden="true"><Icon name={pd.icon || pd.id} size={compact ? 18 : 22} /></span> : null}
      </div>
      <H class="card-title">{signal.title}</H>
      <p class="card-signal">{signal.signal}</p>
      {!compact ? <SourceLine source={signal.source} /> : null}
      <div class="card-effect card-effect--primary">
        <Effect content={content} domain={p.domain} delta={p.delta} />
        {!compact ? <p>{p.text}</p> : null}
      </div>
      {sec ? (
        <div class={cx("card-effect", "card-effect--secondary", sec.type !== "fixed" && "is-choice")}>
          {sec.type === "fixed" ? <Effect content={content} domain={sec.domain} delta={sec.delta} /> : (
            <span class="effect effect--choice">
              <span class="choice-glyph" aria-hidden="true">{sec.type === "add" ? "+" : sec.type === "remove" ? "−" : sec.type === "move" ? "⇄" : "◈"}</span>
              <span class="effect-name">{secondaryLabel(sec)}</span>
            </span>
          )}
          {!compact && sec.text ? <p>{sec.text}</p> : null}
        </div>
      ) : null}
      {!compact && signal.prompt ? <p class="card-prompt"><Icon name="compass" size={18} /> <span>{signal.prompt}</span></p> : null}
    </>
  );
  return (
    <article class={cx("card", "signal-card", selected && "is-selected", played && "is-played", compact && "card--compact", discard && "is-discard")}
      style={pd ? { "--dc": pd.color } : undefined} data-card={signal.id}>
      {clickable ? (
        <button type="button" class="card-hit" aria-pressed={selected ? "true" : "false"} onClick={() => onSelect(signal.id)}
          aria-label={`${selected ? "Selected: " : "Select "}${signal.title}${idx != null ? `, card ${idx + 1}` : ""}`} />
      ) : null}
      {body}
      {onToggleDiscard ? (
        <label class="discard-toggle">
          <input type="checkbox" checked={!!discard} onChange={() => onToggleDiscard(signal.id)} />
          <span>Discard this card</span>
        </label>
      ) : null}
    </article>
  );
}

export function DriverCard({ content, driver, compact }) {
  if (!driver) return null;
  return (
    <article class={cx("card", "driver-card", compact && "card--compact")}>
      <div class="card-top">
        <span class="driver-kicker">Era Driver</span>
        <HorizonBadge content={content} horizon={driver.horizon} small />
      </div>
      <h3 class="driver-title">{driver.title}</h3>
      <p class="driver-text">{driver.text}</p>
      <div class="driver-effects"><Effects content={content} list={driver.effects} /></div>
      {!compact ? <SourceLine source={driver.source} /> : null}
    </article>
  );
}

const KIND_LABEL = { "no-regret": "No-regret", hedge: "Hedge", "big-bet": "Big bet", "trade-off": "Trade-off" };
export const kindLabel = (k) => KIND_LABEL[k] || k;

export function CostPips({ cost, filled = 0, discount = 0 }) {
  const eff = Math.max(1, cost - discount);
  return (
    <span class="pips" role="img" aria-label={`Costs ${eff} capacity${discount ? ` (discounted from ${cost})` : ""}, ${Math.min(filled, eff)} pledged`}>
      {Array.from({ length: cost }, (_, i) => (
        <span key={i} class={cx("pip", i < filled && "is-filled", i >= eff && "is-void")} />
      ))}
    </span>
  );
}

export function StrategyCard({ content, strategy, pledged = 0, discount = 0, funded, unfunded, compact, children }) {
  if (!strategy) return null;
  const eff = Math.max(1, strategy.cost - discount);
  return (
    <article class={cx("card", "strategy-card", funded && "is-funded", unfunded && "is-unfunded", compact && "card--compact")}>
      <div class="strategy-head">
        <span class={cx("kind", `kind--${strategy.kind}`)}>{kindLabel(strategy.kind)}</span>
        <span class="strategy-cost" title={`Costs ${eff} capacity`}>
          {compact ? null : <CostPips cost={strategy.cost} filled={pledged} discount={discount} />}
          <span class="cost-num">{eff}</span><span class="cost-k">cap</span>
        </span>
      </div>
      <h3 class="card-title">{strategy.title}</h3>
      {!compact ? <p class="strategy-text">{strategy.text}</p> : null}
      <div class="strategy-effects">
        <Effects content={content} list={strategy.effects} short={compact} />
        {strategy.delayed && strategy.delayed.length ? (
          <span class="delayed"><span class="delayed-k">Next era</span><Effects content={content} list={strategy.delayed} short={compact} /></span>
        ) : null}
      </div>
      {children}
      {funded ? <span class="stamp stamp--funded">Funded</span> : null}
      {unfunded ? <span class="stamp stamp--unfunded">Not funded</span> : null}
    </article>
  );
}

export function RoleCard({ content, role, seat, name, compact }) {
  if (!role) return null;
  return (
    <article class={cx("card", "role-card", compact && "card--compact")}>
      <div class="card-top">
        <span class="role-sector">{role.sector ? role.sector[0].toUpperCase() + role.sector.slice(1) : "Role"}</span>
        {seat != null ? <span class="seat-badge">Seat {seat + 1}</span> : null}
      </div>
      {name ? <p class="role-player">{name}</p> : null}
      <h3 class="card-title">{role.title}</h3>
      <p class="role-org">{role.org}</p>
      {!compact && role.bio ? <p class="role-bio">{role.bio}</p> : null}
      {role.ability ? (
        <div class="ability">
          <p class="ability-name"><Icon name="bolt" size={18} /> {role.ability.name}</p>
          <p class="ability-text">{role.ability.text}</p>
        </div>
      ) : null}
    </article>
  );
}

export function MandateView({ content, mandate, cond, compact, targetsLabel = "Targets by 2050" }) {
  const L = lookups(content);
  if (!mandate) return <p>No mandate for this role.</p>;
  const row = (t, kind) => {
    const d = L.domains[t.domain];
    const v = cond ? cond[t.domain] : null;
    const ok = v != null && v >= t.min;
    return (
      <li class={cx("mandate-row", kind === "guardrail" && "is-guardrail", cond && (ok ? "is-ok" : "is-short"))} key={kind + t.domain}>
        {d ? <DomainDot domain={d} size={18} /> : null}
        <span class="mandate-name">{d ? d.name : t.domain}</span>
        <span class="mandate-min">{kind === "guardrail" ? "stays at or above" : "at least"} <strong>{t.min}</strong></span>
        {cond ? <span class="mandate-now">{ok ? <Icon name="check" size={18} title="met" /> : <span class="sr-only">not met, </span>}now {v}</span> : null}
      </li>
    );
  };
  return (
    <div class={cx("mandate", compact && "mandate--compact")}>
      {mandate.why ? <p class="mandate-why">{mandate.why}</p> : null}
      <p class="mandate-k">{targetsLabel}</p>
      <ul class="mandate-list">{(mandate.targets || []).map((t) => row(t, "target"))}</ul>
      {mandate.guardrail ? <>
        <p class="mandate-k">Guardrail</p>
        <ul class="mandate-list">{row(mandate.guardrail, "guardrail")}</ul>
      </> : null}
    </div>
  );
}

export function BandPill({ content, value }) {
  const b = bandOf(content, value);
  return <span class={cx("band-pill", `band--${(b.label || "").toLowerCase()}`)}>{value} {b.label}</span>;
}

export { fmtDelta };
