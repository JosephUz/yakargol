// Tarayıcı testlerinin ortak kurulumu: Playwright'ı bul, oyun sunucusunu aç. Ortam değişkeni verilmeden de
// çalışsınlar diye ayrı duruyor — Kalite Kapısı testleri çıplak koşturur (`node tests/<ad>.mjs`).
//   PLAYWRIGHT_MODULE=file:///C:/.../playwright/index.mjs  → bu kurulum kullanılır
//   GAME_URL=http://localhost:5186                          → bu adres kullanılır, sunucu açılmaz
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const kok = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** İşletim sisteminin verdiği boş bir port: sabit port başka bir sunucuda açık olabilir. */
const bosPort = () => new Promise((çöz, hata) => {
  const s = createServer();
  s.on('error', hata);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => çöz(port)); });
});

/** Playwright'ın indirdiği tarayıcıların durabileceği klasörler (Git Bash altında LOCALAPPDATA tanımsız gelebiliyor). */
function tarayiciKlasorleri() {
  const adaylar = [];
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) adaylar.push(process.env.PLAYWRIGHT_BROWSERS_PATH);
  for (const e of [process.env.LOCALAPPDATA, process.env.USERPROFILE && path.join(process.env.USERPROFILE, 'AppData', 'Local'),
    process.env.HOME && path.join(process.env.HOME, 'AppData', 'Local')].filter(Boolean)) adaylar.push(path.join(e, 'ms-playwright'));
  if (process.env.HOME) adaylar.push(path.join(process.env.HOME, 'Library', 'Caches', 'ms-playwright'), path.join(process.env.HOME, '.cache', 'ms-playwright'));
  return adaylar;
}

/** Bu Playwright kurulumunun istediği Chromium yapısı inmiş mi (inmemişse test açılışta düşer)? */
function tarayicisiVar(kurulum) {
  try {
    const liste = JSON.parse(readFileSync(path.join(kurulum, '..', 'playwright-core', 'browsers.json'), 'utf8'));
    const chromium = liste.browsers.find(b => b.name === 'chromium');
    return Boolean(chromium) && tarayiciKlasorleri().some(k => existsSync(path.join(k, `chromium-${chromium.revision}`)));
  } catch { return false; }
}

const kurulumDene = klasor => {
  const kurulum = path.join(klasor, 'node_modules', 'playwright'), giris = path.join(kurulum, 'index.mjs');
  return existsSync(giris) && tarayicisiVar(kurulum) ? pathToFileURL(giris).href : null;
};

/**
 * Kullanılacak Playwright modülünün adresi. Bu depodan sonra üst klasörlere ve oradaki kardeş depolara bakılır: dal
 * çalışma kopyaları `C:/ju/_duzeltme/JOS-xxx` altında durduğu için bir değil iki kademe yukarı çıkmak gerekir.
 */
export function playwrightBul() {
  if (process.env.PLAYWRIGHT_MODULE) return process.env.PLAYWRIGHT_MODULE;
  const burada = kurulumDene(kok);
  if (burada) return burada;
  let klasor = kok;
  for (let kademe = 0; kademe < 3; kademe++) {
    const ust = path.dirname(klasor);
    if (ust === klasor) break;
    klasor = ust;
    const ustte = kurulumDene(klasor);
    if (ustte) return ustte;
    let komsular = [];
    try { komsular = readdirSync(klasor, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch { continue; }
    for (const ad of komsular) {
      const bulundu = kurulumDene(path.join(klasor, ad));
      if (bulundu) return bulundu;
    }
  }
  return null;
}

/** Playwright'ı getirir; bulunamazsa ne yapılacağını yazıp çıkar. */
export async function playwright() {
  const yol = playwrightBul();
  if (!yol) {
    console.error('Playwright bulunamadı (bu depoda ve komşu depolarda tarayıcısı inmiş kurulum yok).');
    console.error('Çözüm: PLAYWRIGHT_MODULE ortam değişkenine kurulu bir playwright/index.mjs file:// adresini ver,');
    console.error('ya da `npm i -D playwright && npx playwright install chromium` çalıştır.');
    process.exit(1);
  }
  return import(yol);
}

/** Başsız tarayıcıya verilecek GL seçenekleri: donanım GL yoksa SWIFTSHADER=1 ile yazılım çizimi. */
export const glArgs = () => (process.env.SWIFTSHADER
  ? ['--use-gl=angle', '--use-angle=swiftshader']
  : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist']);

/** Sunucu ayağa kalkana kadar bekler. */
async function sunucuyuBekle(adres, sure = 20000) {
  const bitis = Date.now() + sure;
  while (Date.now() < bitis) {
    try { if ((await fetch(adres + '/health')).ok) return true; } catch { /* henüz açılmadı */ }
    await new Promise(b => setTimeout(b, 150));
  }
  return false;
}

/**
 * Oyun sunucusu: `GAME_URL` verilmişse o adres kullanılır (sunucu açılmaz), yoksa boş bir portta kendisi açılır.
 * Dönen `{ url, kapat }`: `kapat()` yalnız bu testin açtığı sunucuyu öldürür.
 */
export async function oyunSunucusu() {
  const disarida = process.env.GAME_URL?.replace(/\/$/, '');
  if (disarida) return { url: disarida, kapat() { /* bizim açtığımız değil */ } };
  const port = await bosPort(), url = `http://127.0.0.1:${port}`;
  const sunucu = spawn(process.execPath, ['server.mjs'], { cwd: kok, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  if (!await sunucuyuBekle(url)) { sunucu.kill(); console.error(`Oyun sunucusu ${url} adresinde açılmadı.`); process.exit(1); }
  return { url, kapat() { sunucu.kill(); } };
}
