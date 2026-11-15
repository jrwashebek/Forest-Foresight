// Custom line icons, 24×24, stroke = currentColor. Domain icons are drawn for this project.
const P = {
  // --- domains ---
  fire: <>
    <path d="M12.2 2.8c.6 3.2 4.8 5.3 4.8 10.4A5.1 5.1 0 0 1 12 18.3a5.1 5.1 0 0 1-5-5.1c0-2.4 1.1-4 2.5-5.2.1 1.8.9 2.9 2 3.4-.4-2.9-.2-5.9.7-8.6z" />
    <path d="M12 21.2c-1.5 0-2.6-1.1-2.6-2.6 0-1.4 1.2-2.4 2.6-3.6 1.4 1.2 2.6 2.2 2.6 3.6 0 1.5-1.1 2.6-2.6 2.6z" />
  </>,
  health: <>
    <path d="M12 2.6 7.6 8.4h2.6l-4 5.2h3l-4 5.2h13.6l-4-5.2h3l-4-5.2h2.6z" />
    <path d="M12 18.8v2.8" />
  </>,
  water: <>
    <path d="M12 2.8c3.1 4.1 6.2 7.4 6.2 11.2a6.2 6.2 0 0 1-12.4 0c0-3.8 3.1-7.1 6.2-11.2z" />
    <path d="M8.4 14.8c1.2.9 2.4.9 3.6 0s2.4-.9 3.6 0" />
  </>,
  climate: <>
    <path d="M19.2 12.2a7.2 7.2 0 0 1-12.4 5" />
    <path d="M6.2 20.4v-3.6h3.6" />
    <path d="M4.8 11.8a7.2 7.2 0 0 1 12.4-5" />
    <path d="M17.8 3.6v3.6h-3.6" />
    <path d="M9.4 14.6c0-3 1.9-5 5.2-5.2-.1 3.2-2.1 5.2-5.2 5.2z" />
    <path d="M9.4 14.6 12 12" />
  </>,
  wood: <>
    <circle cx="7.6" cy="15.6" r="3.6" />
    <circle cx="16.4" cy="15.6" r="3.6" />
    <circle cx="12" cy="8.4" r="3.6" />
    <circle cx="7.6" cy="15.6" r="1" />
    <circle cx="16.4" cy="15.6" r="1" />
    <circle cx="12" cy="8.4" r="1" />
  </>,
  communities: <>
    <path d="M2.5 20.5h19" />
    <path d="M3.8 20.5v-8.6l5.7-4.8 5.7 4.8v8.6" />
    <path d="M8 20.5v-4.2h3v4.2" />
    <path d="M18.6 20.5v-3.4" />
    <path d="M18.6 17.1c-1.8 0-2.8-1.4-2.8-3.2s1.3-4.4 2.8-4.4 2.8 2.6 2.8 4.4-1 3.2-2.8 3.2z" />
  </>,
  recreation: <>
    <path d="M2.5 20.5h19" />
    <path d="M4 20.5 12 7l8 13.5" />
    <path d="M12 20.5 9.4 15.4M12 20.5l2.6-5.1" />
    <path d="M12 7V3.4l3.2 1.3L12 6" />
  </>,
  workforce: <>
    <path d="M4.6 15.6a7.4 7.4 0 0 1 14.8 0" />
    <path d="M2.8 15.6h18.4v2.6H2.8z" />
    <path d="M10 8.6v-1.4h4v1.4" />
    <path d="M10 8.6v4.4M14 8.6v4.4" />
  </>,
  governance: <>
    <path d="M3 9.2 12 4l9 5.2z" />
    <path d="M3.5 20.5h17M4.5 17.6h15" />
    <path d="M6.4 10v7.2M10.1 10v7.2M13.9 10v7.2M17.6 10v7.2" />
  </>,
  partners: <>
    <circle cx="7" cy="6.4" r="2.3" />
    <circle cx="17" cy="6.4" r="2.3" />
    <path d="M3.4 20.5v-5a3.6 3.6 0 0 1 7.2 0" />
    <path d="M13.4 15.5a3.6 3.6 0 0 1 7.2 0v5" />
    <path d="M10.6 15.6h2.8" />
    <path d="M12 12.4v-2" />
  </>,
  leaf: <>
    <path d="M5 19c0-8 5-13 14-14-.5 9-5.5 14-14 14z" />
    <path d="M5 19 13 11" />
  </>,
  // --- horizons: growth rings, one per horizon step ---
  "h-now": <><circle cx="12" cy="12" r="3.4" /><circle cx="12" cy="12" r="0.9" fill="currentColor" /></>,
  "h-near": <><circle cx="12" cy="12" r="3.4" /><circle cx="12" cy="12" r="6.6" /><circle cx="12" cy="12" r="0.9" fill="currentColor" /></>,
  "h-far": <><circle cx="12" cy="12" r="3.4" /><circle cx="12" cy="12" r="6.6" /><circle cx="12" cy="12" r="9.8" /><circle cx="12" cy="12" r="0.9" fill="currentColor" /></>,
  // --- ui ---
  shield: <path d="M12 3 19 6v5.2c0 4.4-3 7.9-7 9.8-4-1.9-7-5.4-7-9.8V6z" />,
  scar: <><path d="M12 3c-2 3-4.5 6-4.5 9.5 0 3 2 5.5 4.5 8.5 2.5-3 4.5-5.5 4.5-8.5C16.5 9 14 6 12 3z" /><path d="M12 8.5v8" /></>,
  check: <path d="M5 12.6 9.6 17 19 7.4" />,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  undo: <><path d="M9 14 4.4 9.4 9 4.8" /><path d="M4.6 9.4h9.6a5.8 5.8 0 0 1 0 11.6H11" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5" /></>,
  moon: <path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z" />,
  table: <><rect x="3" y="4.5" width="18" height="15" rx="1.5" /><path d="M3 9.5h18M3 14.5h18M9 4.5v15" /></>,
  tree: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5.5" /><circle cx="12" cy="12" r="2" /><path d="M12 3v4M19.8 16.5l-3.4-1.8" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6" /><path d="M15.5 4.9a3.2 3.2 0 0 1 0 6.2M17.4 14.3c2.2.7 3.6 2.8 3.6 5.7" /></>,
  clock: <><circle cx="12" cy="12" r="8.8" /><path d="M12 7v5.2l3.4 2" /></>,
  phone: <><rect x="6.5" y="2.5" width="11" height="19" rx="2.2" /><path d="M10.5 18.2h3" /></>,
  copy: <><rect x="8.5" y="8.5" width="12" height="12" rx="1.6" /><path d="M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5" /></>,
  download: <><path d="M12 3.5v11.5M7.2 10.4 12 15.2l4.8-4.8" /><path d="M4 16.5v2.5A1.5 1.5 0 0 0 5.5 20.5h13a1.5 1.5 0 0 0 1.5-1.5v-2.5" /></>,
  upload: <><path d="M12 15.5V4M7.2 8.6 12 3.8l4.8 4.8" /><path d="M4 16.5v2.5A1.5 1.5 0 0 0 5.5 20.5h13a1.5 1.5 0 0 0 1.5-1.5v-2.5" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.4 15.4 5.1 5.1" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  trash: <><path d="M4 6.5h16M9.5 6.5V4h5v2.5M6 6.5l1 13.5h10l1-13.5" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  "eye-off": <><path d="M4 4l16 16" /><path d="M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8M6.3 7.6A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="1.8" /><path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7" /></>,
  bulb: <><path d="M9 17.5h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.3v1.4h5v-1.4c0-.9.4-1.7 1.1-2.3A6 6 0 0 0 12 3z" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  back: <path d="M14.5 5.5 8 12l6.5 6.5" />,
  next: <path d="M9.5 5.5 16 12l-6.5 6.5" />,
  link: <><path d="M10 14a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1.2 1.2" /><path d="M14 10a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1.2-1.2" /></>,
  bolt: <path d="M13 2.8 5.5 13.4h5.6L10 21.2l7.6-10.6H12z" />,
  play: <path d="M8 5.5v13l10-6.5z" />,
  pause: <path d="M8 5.5v13M16 5.5v13" />,
  reset: <><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" /><path d="M4.5 4v4.5H9" /></>,
  info: <><circle cx="12" cy="12" r="8.8" /><path d="M12 11v5.5M12 7.6v.2" /></>,
  alert: <><path d="M12 3.5 21.5 20h-19z" /><path d="M12 9.5v5M12 17.2v.2" /></>,
  star: <path d="m12 3.8 2.5 5.3 5.7.7-4.2 3.9 1.1 5.7L12 16.6l-5.1 2.8 1.1-5.7-4.2-3.9 5.7-.7z" />,
  newspaper: <><path d="M4 5.5h13v13.5a1.5 1.5 0 0 0 1.5 1.5H6A2 2 0 0 1 4 18.5z" /><path d="M17 9h3v10a1.5 1.5 0 0 1-3 0" /><path d="M7 9h7M7 12.5h7M7 16h4" /></>,
  compass: <><circle cx="12" cy="12" r="8.8" /><path d="m15.6 8.4-2.2 5-5 2.2 2.2-5z" /></>,
  flag: <><path d="M5.5 21V4" /><path d="M5.5 4.5c4.5-2 8.5 2 13 0v8c-4.5 2-8.5-2-13 0" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  external: <><path d="M14 4h6v6M20 4l-8.5 8.5" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  ring: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /></>,
  cascade: <><path d="M4 5h6v4H4zM10 7h4v5h-4zM14 12h6v4h-6z" /><path d="M7 9v6h7M17 16v3" /></>,
  vote: <><path d="M4 13h16v7H4z" /><path d="M8 13V5.5h8V13" /><path d="m10 9.2 1.5 1.5 3-3" /></>,
  coin: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="5" /></>,
  wifi: <><path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.4a9.5 9.5 0 0 1 13 0M8.6 15.7a5 5 0 0 1 6.8 0" /><circle cx="12" cy="19" r=".9" fill="currentColor" /></>,
  "wifi-off": <><path d="M4 4l16 16M8.6 15.7a5 5 0 0 1 6.8 0M5.5 12.4a9.5 9.5 0 0 1 4-2.3M2.5 9a14 14 0 0 1 4.8-3M13.5 6a14 14 0 0 1 8 3" /><circle cx="12" cy="19" r=".9" fill="currentColor" /></>,
  notes: <><path d="M6 3.5h9l3.5 3.5v13.5H6z" /><path d="M15 3.5V7h3.5M9 11h6.5M9 14.5h6.5M9 18h4" /></>,
  book: <><path d="M4 5.5A2 2 0 0 1 6 3.5h13.5v15H6a2 2 0 0 0-2 2z" /><path d="M4 20.5a2 2 0 0 1 2-2h13.5v2H6" /></>,
};

export const ICON_NAMES = Object.keys(P);
export const DOMAIN_ICONS = ["fire", "health", "water", "climate", "wood", "communities", "recreation", "workforce", "governance", "partners", "leaf"];

export function Icon({ name, size = 24, title, class: cls, className, strokeWidth = 1.8 }) {
  const body = P[name] || P.leaf;
  return (
    <svg class={cls || className || "icon"} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width={strokeWidth} stroke-linecap="round" stroke-linejoin="round" aria-hidden={title ? undefined : "true"} role={title ? "img" : undefined}
      focusable="false">
      {title ? <title>{title}</title> : null}
      {body}
    </svg>
  );
}

/** Raw icon body for embedding inside another SVG (e.g. the tree labels). */
export function IconBody({ name }) {
  return P[name] || P.leaf;
}
