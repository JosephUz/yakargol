import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Uygulama simgesi ve açılış ekranı: alevli top (SVG) Playwright'la PNG'ye çizilir ve android/ kaynaklarına yazılır
 * (eski simge, yuvarlak simge, uyarlanabilir simge ön yüzü; açılış görselleri mevcut boyutlarında). store/ altına
 * Play Store için 512 px simge ve 1024x500 tanıtım görseli. Yalnızca simge değişince elle çalıştırılır:
 *   node scripts/icons.mjs   (Playwright ve Chrome gerekir; PLAYWRIGHT ortam değişkeni playwright paketinin yolu)
 */
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const res = path.join(root, 'android', 'app', 'src', 'main', 'res');
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BG = '#193d39';

/** Futbol topu deseni: ortada beşgen, köşeleri yönünde (kenarda kırpılan) beşgenler ve aralarındaki dikişler. */
function patches(cx, cy) {
  const pent = (x, y, r, turn) => '<polygon points="' + [0, 1, 2, 3, 4].map(k => { const a = turn + k * Math.PI * 2 / 5; return (x + Math.cos(a) * r).toFixed(2) + ',' + (y + Math.sin(a) * r).toFixed(2); }).join(' ') + '"/>';
  let out = pent(cx, cy, 7, -Math.PI / 2);
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + k * Math.PI * 2 / 5, c = Math.cos(a), s = Math.sin(a);
    out += pent(cx + c * 20, cy + s * 20, 7, a + Math.PI);
    out += '<line x1="' + (cx + c * 7) + '" y1="' + (cy + s * 7) + '" x2="' + (cx + c * 13) + '" y2="' + (cy + s * 13) + '"/>';
  }
  return out;
}
const ball = `
  <defs>
    <linearGradient id="f" x1="0" y1="1" x2="0.6" y2="0"><stop offset="0" stop-color="#e8321a"/><stop offset=".55" stop-color="#ff7a2e"/><stop offset="1" stop-color="#ffd35c"/></linearGradient>
    <linearGradient id="g" x1="0" y1="1" x2="0.6" y2="0"><stop offset="0" stop-color="#ff9a2e"/><stop offset="1" stop-color="#fff3a0"/></linearGradient>
    <radialGradient id="b" cx=".38" cy=".35" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#f1ead6"/><stop offset="1" stop-color="#c9c0a6"/></radialGradient>
  </defs>
  <path d="M27 74 C 16 50, 38 42, 44 16 C 52 32, 63 30, 67 10 C 82 34, 88 60, 66 80 Z" fill="url(#f)"/>
  <path d="M34 72 C 28 56, 45 50, 50 32 C 56 44, 64 42, 67 30 C 76 48, 76 64, 62 76 Z" fill="url(#g)"/>
  <clipPath id="c"><circle cx="44" cy="62" r="21"/></clipPath>
  <circle cx="44" cy="62" r="21" fill="url(#b)"/>
  <g clip-path="url(#c)" fill="#203e33" stroke="#203e33" stroke-width="1.6" stroke-linecap="round">${patches(44, 62)}</g>
  <circle cx="44" cy="62" r="21" fill="none" stroke="#0f2a27" stroke-opacity=".35" stroke-width="1.2"/>`;
/** frame: 'square' | 'round' | 'none' (uyarlanabilir ön yüz: saydam, içerik ortadaki güvenli alanda). */
const svg = (frame, scale = 1) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  ${frame === 'square' ? `<rect width="100" height="100" rx="22" fill="${BG}"/>` : frame === 'round' ? `<circle cx="50" cy="50" r="50" fill="${BG}"/>` : ''}
  ${frame !== 'none' ? '<circle cx="50" cy="50" r="46" fill="#ffffff08"/>' : ''}
  <g transform="translate(50 50) scale(${scale}) translate(-50 -50)">${ball}</g></svg>`;

const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage();
async function png(html, width, height, file) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<html><body style="margin:0;background:transparent">${html}</body></html>`);
  writeFileSync(file, await page.screenshot({ omitBackground: true }));
}
const box = (inner, w, h, bg = 'transparent') => `<div style="width:${w}px;height:${h}px;background:${bg};display:flex;align-items:center;justify-content:center">${inner}</div>`;

const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(DENSITY)) {
  const dir = path.join(res, 'mipmap-' + d), icon = Math.round(48 * k), fg = Math.round(108 * k);
  await png(box(svg('square', 0.92), icon, icon), icon, icon, path.join(dir, 'ic_launcher.png'));
  await png(box(svg('round', 0.9), icon, icon), icon, icon, path.join(dir, 'ic_launcher_round.png'));
  await png(box(svg('none', 0.62), fg, fg), fg, fg, path.join(dir, 'ic_launcher_foreground.png'));
}
writeFileSync(path.join(res, 'values', 'ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`);

/** Açılış görseli: koyu yeşil zemin, ortada alevli top ve YAKARGOL yazısı; mevcut splash.png boyutları korunur. */
const splash = (w, h) => {
  const s = Math.min(w, h) * 0.34;
  return box(`<div style="text-align:center;font:950 ${s * 0.26}px Segoe UI,Arial,sans-serif;color:#f3ebd7;letter-spacing:-1px">
    <div style="width:${s}px;height:${s}px;margin:0 auto ${s * 0.08}px">${svg('none')}</div>YAKAR<span style="color:#f0ae65">GOL</span></div>`, w, h, BG);
};
for (const dir of readdirSync(res).filter(d => d.startsWith('drawable'))) {
  const file = path.join(res, dir, 'splash.png');
  let head; try { head = readFileSync(file); } catch { continue; }
  const w = head.readUInt32BE(16), h = head.readUInt32BE(20);
  await png(splash(w, h), w, h, file);
}

mkdirSync(path.join(root, 'store'), { recursive: true });
await png(box(svg('square', 0.92).replace('rx="22"', 'rx="0"'), 512, 512), 512, 512, path.join(root, 'store', 'icon-512.png'));
await png(box(`<div style="display:flex;align-items:center;gap:40px;font:950 110px Segoe UI,Arial,sans-serif;color:#f3ebd7;letter-spacing:-4px">
  <div style="width:300px;height:300px">${svg('none')}</div><div>YAKAR<span style="color:#f0ae65">GOL</span>
  <div style="font:800 26px Segoe UI,Arial,sans-serif;letter-spacing:3px;color:#b9cebc;margin-top:6px">5v5 FUTBOL + YAKAR TOP</div></div></div>`, 1024, 500, BG), 1024, 500, path.join(root, 'store', 'feature-1024x500.png'));
await browser.close();
console.log('simgeler hazır');
