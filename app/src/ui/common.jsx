import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { app, useStore, toast, setTheme } from "./store.js";
import { Icon } from "./icons.jsx";
import { copyText, cx } from "./util.js";

export function Btn({ kind = "secondary", icon, children, class: cls, size, ...rest }) {
  return (
    <button type="button" class={cx("btn", `btn--${kind}`, size && `btn--${size}`, cls)} {...rest}>
      {icon ? <Icon name={icon} size={size === "lg" ? 24 : 20} /> : null}
      {children != null ? <span>{children}</span> : null}
    </button>
  );
}

export function LinkBtn({ href, kind = "secondary", icon, children, ...rest }) {
  return (
    <a href={href} class={cx("btn", `btn--${kind}`)} {...rest}>
      {icon ? <Icon name={icon} size={20} /> : null}
      <span>{children}</span>
    </a>
  );
}

let dlgSeq = 0;
/** Accessible modal dialog with focus trap, Esc to close, focus restore. */
export function Dialog({ open, onClose, title, children, wide, actions, labelledBy, class: cls }) {
  const ref = useRef(null);
  const idRef = useRef("dlg-" + ++dlgSeq);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const el = ref.current;
    const focusables = () => Array.from(el.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    const first = focusables()[0];
    (el.querySelector("[data-autofocus]") || first || el).focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose && onClose(); }
      if (e.key === "Tab") {
        const f = focusables();
        if (!f.length) return;
        const a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    el.addEventListener("keydown", onKey);
    return () => { el.removeEventListener("keydown", onKey); if (prev && prev.focus) try { prev.focus(); } catch { /* */ } };
  }, [open]);
  if (!open) return null;
  return (
    <div class="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div ref={ref} class={cx("dialog", wide && "dialog--wide", cls)} role="dialog" aria-modal="true" aria-labelledby={labelledBy || idRef.current} tabIndex={-1}>
        <header class="dialog-head">
          <h2 id={idRef.current} class="dialog-title">{title}</h2>
          {onClose ? <button type="button" class="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button> : null}
        </header>
        <div class="dialog-body">{children}</div>
        {actions ? <footer class="dialog-foot">{actions}</footer> : null}
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts, announce } = useStore(app);
  return (
    <>
      <div class="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} class={cx("toast", `toast--${t.kind}`)}>
            <Icon name={t.kind === "warn" || t.kind === "error" ? "alert" : "info"} size={20} />
            <span>{t.msg}{/[.!?…:]$/.test(t.msg) ? "" : <span class="sr-only">.</span>}</span>{" "}
          </div>
        ))}
      </div>
      <div class="sr-only" aria-live="polite" aria-atomic="true">{announce}</div>
    </>
  );
}

export function Stepper({ value, min = 0, max = 99, onChange, label, disabled }) {
  const box = useRef(null);
  const pressed = useRef(null);
  // When a press disables the button it came from (the last point of Capacity, or 0), keep focus on the
  // stepper: move it to the other button, or the group itself, instead of letting it fall to <body>.
  useLayoutEffect(() => {
    const k = pressed.current;
    const el = box.current;
    if (!k || !el) return;
    const btn = el.querySelector(`[data-k="${k}"]`);
    if (!btn || !btn.disabled) return;
    pressed.current = null;
    const a = document.activeElement;
    if (a && a !== document.body && a !== btn) return;
    const other = el.querySelector(`[data-k="${k === "inc" ? "dec" : "inc"}"]`);
    if (other && !other.disabled) other.focus(); else el.focus();
  });
  const press = (k, v) => { pressed.current = k; onChange(v); };
  return (
    <span class={cx("stepper", disabled && "is-disabled")} role="group" aria-label={label} ref={box} tabIndex={-1}>
      <button type="button" class="stepper-btn" data-k="dec" aria-label={`Decrease ${label}`} disabled={disabled || value <= min} onClick={() => press("dec", value - 1)}><Icon name="minus" size={18} /></button>
      <output class="stepper-val" aria-live="polite">{value}</output>
      <button type="button" class="stepper-btn" data-k="inc" aria-label={`Increase ${label}`} disabled={disabled || value >= max} onClick={() => press("inc", value + 1)}><Icon name="plus" size={18} /></button>
    </span>
  );
}

export function CopyButton({ text, label = "Copy", done = "Copied", kind = "secondary", icon = "copy", what = "text" }) {
  const [ok, setOk] = useState(false);
  const [manual, setManual] = useState(null);
  const taRef = useRef(null);
  // select everything but keep the caret (and the view) at the top of the text (QA polish 4)
  const selectAll = () => { const ta = taRef.current; if (ta) { ta.focus({ preventScroll: true }); ta.setSelectionRange(0, ta.value.length, "backward"); ta.scrollTop = 0; } };
  useEffect(() => { if (manual != null) setTimeout(selectAll, 50); }, [manual]);
  return (
    <>
      <Btn kind={kind} icon={ok ? "check" : icon} onClick={async () => {
        const t = typeof text === "function" ? text() : text;
        const r = await copyText(t);
        if (r) { setOk(true); setTimeout(() => setOk(false), 2000); toast(done); }
        else setManual(t); // clipboard blocked: show the text so it can be copied by hand
      }}>{ok ? done : label}</Btn>
      <Dialog open={manual != null} onClose={() => setManual(null)} title={`Copy the ${what}`} wide
        actions={<><Btn icon="check" onClick={selectAll}>Select all</Btn><Btn kind="primary" onClick={() => setManual(null)}>Done</Btn></>}>
        <p>This page isn't allowed to use the clipboard here. The {what} is selected below: press <kbd>Ctrl</kbd>+<kbd>C</kbd> (or <kbd>⌘</kbd>+<kbd>C</kbd> on a Mac) to copy it, then paste it into a document or email.</p>
        <label class="sr-only" for="manual-copy">The {what}</label>
        <textarea id="manual-copy" ref={taRef} class="input manual-copy" readOnly rows={16} value={manual || ""} data-autofocus />
      </Dialog>
    </>
  );
}

export function DownloadButton({ filename, data, label = "Download" }) {
  const { caps } = useStore(app);
  if (!caps.downloads) return null;
  return (
    <Btn icon="download" onClick={async () => {
      try {
        const d = typeof data === "function" ? data() : data;
        const r = await caps.downloads.save({ filename, data: d });
        if (r && r.status && r.status !== "saved" && r.status !== "ok") toast(`Download: ${r.status}`);
        else toast(`Saved ${filename}`);
      } catch (e) {
        toast(e && e.code === "declined" ? "Download cancelled." : "Download isn't available right now — use Copy instead.", "warn");
      }
    }}>{label}</Btn>
  );
}

export function useTicker(active, ms = 250) {
  const [, setT] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setT((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
}

export function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Field({ label, hint, error, children, id, class: cls }) {
  return (
    <div class={cx("field", error && "has-error", cls)}>
      <label class="field-label" for={id}>{label}</label>
      {children}
      {hint && !error ? <p class="field-hint">{hint}</p> : null}
      {error ? <p class="field-error" role="alert">{error}</p> : null}
    </div>
  );
}

export function Empty({ icon = "info", title, children }) {
  return (
    <div class="empty">
      <Icon name={icon} size={28} />
      <p class="empty-title">{title}</p>
      {children ? <div class="empty-body">{children}</div> : null}
    </div>
  );
}

export function ThemeToggle() {
  const { theme } = useStore(app);
  const next = theme === "screen" ? "projector" : "screen";
  return (
    <button type="button" class="icon-btn" onClick={() => setTheme(next)}
      aria-label={theme === "screen" ? "Switch to Projector theme (light)" : "Switch to Screen theme (dark)"} title={theme === "screen" ? "Projector theme" : "Screen theme"}>
      <Icon name={theme === "screen" ? "sun" : "moon"} />
    </button>
  );
}
