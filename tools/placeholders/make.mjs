// Regenerates the SVG placeholders: node tools/placeholders/make.mjs
import { mkdirSync, writeFileSync } from "node:fs";
const out = new URL("../../apps/web/public/placeholders/", import.meta.url);
mkdirSync(out, { recursive: true });
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const HUES = [[196, 36], [204, 30], [182, 40], [160, 44], [225, 38], [248, 28], [20, 190], [32, 210], [215, 48], [120, 40], [350, 220], [44, 260], [170, 20], [28, 200], [46, 230]];
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function skyline(r, y, h, fill) {
  let x = 0, d = `M0 900`;
  while (x < 1600) { const w = 30 + r() * 90, t = y - r() * h; d += `L${x | 0} ${t | 0}L${(x + w) | 0} ${t | 0}`; x += w; }
  return `<path d="${d}L1600 900Z" fill="${fill}"/>`;
}
function person(x, y, s, fill) {
  return `<g transform="translate(${x | 0} ${y | 0}) scale(${s.toFixed(2)})" fill="${fill}"><circle cx="0" cy="-58" r="13"/><path d="M-18 0L-14 -40Q0 -52 14 -40L18 0Z"/></g>`;
}
function scene(i, title, people) {
  const r = rng(i * 7919 + 17), [a, b] = HUES[i % HUES.length];
  const sx = 400 + r() * 800, sy = 200 + r() * 120;
  const crowd = Array.from({ length: people }, (_, k) => person(800 + (k - (people - 1) / 2) * (70 + r() * 20), 800 + r() * 40, 1.1 + r() * 0.4, `hsl(${a} 40% 6%)`)).join("");
  const lights = Array.from({ length: 40 }, () => `<circle cx="${(r() * 1600) | 0}" cy="${(430 + r() * 330) | 0}" r="${(1.5 + r() * 3).toFixed(1)}" fill="hsl(${b} 90% 70%)" opacity="${(0.25 + r() * 0.6).toFixed(2)}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${a} 55% 10%)"/><stop offset=".6" stop-color="hsl(${a} 45% 24%)"/><stop offset="1" stop-color="hsl(${b} 60% 38%)"/></linearGradient><radialGradient id="g"><stop offset="0" stop-color="hsl(${b} 95% 78%)" stop-opacity=".9"/><stop offset="1" stop-color="hsl(${b} 95% 60%)" stop-opacity="0"/></radialGradient><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-opacity="0"/><stop offset="1" stop-opacity=".65"/></linearGradient></defs><rect width="1600" height="900" fill="url(#s)"/><circle cx="${sx | 0}" cy="${sy | 0}" r="360" fill="url(#g)"/>${skyline(r, 600, 260, `hsl(${a} 40% 20%)`)}${skyline(r, 700, 240, `hsl(${a} 42% 14%)`)}${lights}${skyline(r, 840, 120, `hsl(${a} 45% 8%)`)}${crowd}<rect y="560" width="1600" height="340" fill="url(#f)"/>${title ? `<text x="70" y="838" font-family="Georgia,serif" font-size="58" fill="#fff" opacity=".92">${esc(title)}</text>` : ""}</svg>`;
}
function portrait(i) {
  const [a, b] = HUES[i % HUES.length], r = rng(i * 104729 + 5), w = 150 + r() * 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600"><defs><radialGradient id="g" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="hsl(${b} 70% 58%)"/><stop offset="1" stop-color="hsl(${a} 55% 14%)"/></radialGradient></defs><rect width="600" height="600" fill="url(#g)"/><g fill="hsl(${a} 45% 9%)"><ellipse cx="300" cy="240" rx="${(88 + r() * 16) | 0}" ry="${(108 + r() * 18) | 0}"/><path d="M${(300 - w) | 0} 600Q${(300 - w) | 0} 390 300 375Q${(300 + w) | 0} 390 ${(300 + w) | 0} 600Z"/></g></svg>`;
}
const TITLES = ["The Sealed Gate", "The Water Ledger", "The Courier's Secret", "The Quiet Ward", "The Missing Years", "Power for the Night", "The Confession", "The Lantern March", "A Voice Beyond the Wall", "The Seed Vault", "The Warden's Offer", "The Price of Truth", "The Broken Promise", "The Long Road", "The Heart of Meridian"];
TITLES.forEach((t, i) => writeFileSync(new URL(`dilemma-${String(i + 1).padStart(2, "0")}.svg`, out), scene(i, t, [7, 3, 1, 3, 2, 4, 1, 12, 4, 1, 1, 9, 1, 11, 10][i])));
writeFileSync(new URL("key-art.svg", out), scene(20, "The Last Civilization", 10));
writeFileSync(new URL("scene.svg", out), scene(22, "", 3));
writeFileSync(new URL("unavailable.svg", out), scene(24, "Image unavailable", 0));
for (let i = 0; i < 10; i++) writeFileSync(new URL(`portrait-${String(i + 1).padStart(2, "0")}.svg`, out), portrait(i));
