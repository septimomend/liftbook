// Accent color: buttons, links, active tab, rest timer, progress graph. The rest of the
// theme stays dark. Button text: white when it passes 3:1 (labels are large, bold), else near-black.

export const ACCENTS = Object.freeze({
  blue: "#4c8dff",
  orange: "#ff8a3d",
  green: "#2fbf71",
  teal: "#22b8cf",
  purple: "#9b7bff",
  pink: "#ff5fa2",
  red: "#ff5a5f",
  yellow: "#f5c518",
});

const lum = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio of two #rrggbb colors. */
export function contrast(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function accentVars(name) {
  const accent = ACCENTS[name] ?? ACCENTS.blue;
  const accentText = contrast(accent, "#ffffff") >= 3 ? "#ffffff" : "#11151c";
  return { accent, accentText };
}

/** Apply to the page (CSS variables used everywhere the accent appears). */
export function applyAccent(name) {
  const { accent, accentText } = accentVars(name);
  const root = document.documentElement.style;
  root.setProperty("--accent", accent);
  root.setProperty("--accent-text", accentText);
}
