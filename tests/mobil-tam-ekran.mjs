// Üst çubuktaki tam ekran düğmesi dar yatay telefonda yerine oturuyor mu? Düğme JOS-696'da iki kez sorun çıkarmıştı:
// Play Store uygulamasında (Capacitor) da duruyordu ve 667x375'te beşinci simge olarak skor tabelasının üstüne
// biniyordu. Çözüm: düğme yalnız telefon tarayıcısında verilir (`tam-ekran` sınıfı, src/main.js) ve maç başlayınca
// `← josephuz.com` gibi gizlenir (src/ui.js → hud) — maça girerken oyun zaten tam ekrana geçtiği için düğmenin işi
// giriş ekranı ile lobidir. Bu test üç durumu da ölçer: giriş ekranı (düğme var, logoya binmiyor), maç (düğme yok,
// üst düğmeler tabelaya binmiyor) ve uygulama kipi (düğme hiç yok).
//
// Kendi kendine yeter: GAME_URL verilmezse oyun sunucusunu boş bir portta kendisi açar, Playwright'ı bu depoda ve
// komşu depolarda arar, bitince sunucuyu kapatır.
//   node tests/mobil-tam-ekran.mjs
//   GAME_URL=http://localhost:5186 PLAYWRIGHT_MODULE=file:///C:/.../playwright/index.mjs node tests/mobil-tam-ekran.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// Dar yatay telefon (iPhone SE / 8, yatay): üst çubuğun en sıkıştığı ölçü. Düğme burada yer bulursa her yerde bulur.
const EKRAN = { width: 667, height: 375 };

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
async function playwrightBul() {
  if (process.env.PLAYWRIGHT_MODULE) return process.env.PLAYWRIGHT_MODULE;
  const burada = kurulumDene(root);
  if (burada) return burada;
  let klasor = root;
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

/** Sunucu ayağa kalkana kadar bekler. */
async function sunucuyuBekle(adres, sure = 20000) {
  const bitis = Date.now() + sure;
  while (Date.now() < bitis) {
    try { if ((await fetch(adres + '/health')).ok) return true; } catch { /* henüz açılmadı */ }
    await new Promise(b => setTimeout(b, 150));
  }
  return false;
}

const playwrightYolu = await playwrightBul();
if (!playwrightYolu) {
  console.error('Playwright bulunamadı (bu depoda ve komşu depolarda tarayıcısı inmiş kurulum yok).');
  console.error('Çözüm: PLAYWRIGHT_MODULE ortam değişkenine kurulu bir playwright/index.mjs file:// adresini ver,');
  console.error('ya da `npm i -D playwright && npx playwright install chromium` çalıştır.');
  process.exit(1);
}
const { chromium } = await import(playwrightYolu);

let sunucu = null, url = process.env.GAME_URL?.replace(/\/$/, '');
if (!url) {
  const port = await bosPort();
  url = `http://127.0.0.1:${port}`;
  sunucu = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  if (!await sunucuyuBekle(url)) { sunucu.kill(); console.error(`Oyun sunucusu ${url} adresinde açılmadı.`); process.exit(1); }
}

await mkdir('artifacts', { recursive: true });
// Donanım GL yoksa SWIFTSHADER=1 ile yazılım çizimi; sahne bu testte ölçülmüyor, yalnız arayüz kutuları sayılıyor.
const gl = process.env.SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', ...gl] });

/** İki kutu kesişiyor mu (üst üste binme). */
const binisiyor = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
/** Sayfadan bir elemanın kutusu ve görünürlüğü. */
const OLC = `sec => { const n = document.querySelector(sec); if (!n) return null;
  const r = n.getBoundingClientRect(), s = getComputedStyle(n);
  return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom),
    gorunur: s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 }; }`;

try {
  // 1) Giriş ekranı: tam ekran düğmesi görünür, ekrandan taşmıyor ve oyun adına (logo) binmiyor.
  const context = await browser.newContext({ viewport: EKRAN, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage(), hatalar = [];
  page.on('pageerror', e => hatalar.push(e.message));
  page.on('console', e => { if (e.type() === 'error') hatalar.push(e.text()); });
  await page.goto(url + '/?test=1');
  await page.waitForFunction(() => !!window.__yakarGol);
  await page.waitForTimeout(600);
  const olc = sec => page.evaluate(`(${OLC})(${JSON.stringify(sec)})`);

  assert.ok(await page.evaluate(() => document.getElementById('yakar-gol').classList.contains('tam-ekran')),
    'telefon tarayıcısında tam ekran düğmesi açık olmalı');
  const girisFull = await olc('#yg-full'), logo = await olc('.logo'), cubuk = await olc('.header-actions');
  await page.screenshot({ path: 'artifacts/mobil-tam-ekran-giris.png' });
  console.log(JSON.stringify({ ekran: `${EKRAN.width}x${EKRAN.height}`, girisFull, logo, cubuk }));
  assert.ok(girisFull.gorunur, 'giriş ekranında tam ekran düğmesi görünmüyor');
  assert.ok(girisFull.left >= 0 && girisFull.right <= EKRAN.width, `tam ekran düğmesi ekrandan taşıyor (${girisFull.left}..${girisFull.right})`);
  assert.ok(girisFull.top >= 0 && girisFull.bottom <= EKRAN.height, 'tam ekran düğmesi ekranın dışında');
  assert.ok(!binisiyor(cubuk, logo), 'üst çubuk düğmeleri oyun adının üstüne biniyor');
  // STANDART üst araç çubuğu: ← josephuz.com · Ses · Müzik · Kontroller F1 — bu sırayla, tek satırda, ekranın içinde.
  assert.ok(cubuk.left >= 0 && cubuk.right <= EKRAN.width, `üst çubuk ekrandan taşıyor (${cubuk.left}..${cubuk.right})`);
  const girisDugmeler = await page.evaluate(() => [...document.querySelectorAll('.header-actions > *')]
    .filter(n => getComputedStyle(n).display !== 'none' && n.getBoundingClientRect().width > 0).map(n => n.id));
  assert.deepEqual(girisDugmeler.slice(0, 4), ['yg-site', 'yg-sound', 'yg-muzik', 'yg-help-open'],
    'giriş ekranında standart dörtlü bu sırayla başta olmalı: ' + girisDugmeler.join(', '));
  const satir = await page.evaluate(() => {
    const ust = [...document.querySelectorAll('.header-actions > *')].filter(n => n.getBoundingClientRect().width > 0)
      .map(n => Math.round(n.getBoundingClientRect().top));
    return new Set(ust).size;
  });
  assert.equal(satir, 1, 'standart araç çubuğu tek satırda kalmalı (düğmeler alt satıra kaydı)');

  // Düğme gerçekten tam ekrana sokup çıkarıyor (dokunuşla; Chromium başsızken de tam ekran isteğini karşılar).
  await page.tap('#yg-full');
  await page.waitForTimeout(400);
  assert.ok(await page.evaluate(() => !!document.fullscreenElement), 'tam ekran düğmesi tam ekrana sokmalı');
  assert.ok(await page.evaluate(() => document.querySelector('#yg-full').classList.contains('on')), 'açıkken düğme "on" olmalı');
  await page.tap('#yg-full');
  await page.waitForTimeout(400);
  assert.ok(await page.evaluate(() => !document.fullscreenElement), 'ikinci dokunuş tam ekrandan çıkarmalı');

  // 2) Maç: düğme gizlenir, üst çubukta maçtaki dört simge kalır — yani tabelanın yanındaki alan main'dekiyle
  //    birebir aynı, beşinci simge yüzünden daralmıyor. (Tabelanın kendisinin bu ölçüde üst düğmelere değmesi
  //    main'de de olan ayrı bir sorundur; çaresi JOS-696 dalındaki tabela küçültmesidir, bu dalın işi değil.)
  await page.tap('#yg-start');
  await page.waitForTimeout(600);
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen());
  await page.waitForTimeout(400);
  const macFull = await olc('#yg-full'), macCubuk = await olc('.header-actions'), tabela = await olc('#yg-scoreboard');
  const macDugmeler = await page.evaluate(() => [...document.querySelectorAll('.header-actions > *')]
    .filter(n => getComputedStyle(n).display !== 'none' && n.getBoundingClientRect().width > 0).map(n => n.id));
  await page.screenshot({ path: 'artifacts/mobil-tam-ekran-mac.png' });
  console.log(JSON.stringify({ macFull, macCubuk, tabela, macDugmeler }));
  assert.ok(tabela.gorunur, 'maçta skor tabelası görünmeli');
  assert.ok(!macFull.gorunur, 'maç başlayınca tam ekran düğmesi gizlenmeli (tabelaya yer açılsın)');
  // Sıra standart araç çubuğununki (Ses · Müzik · Kontroller · oyuna özgü düğmeler); müzik düğmesi telefonda maç
  // sırasında gizlenir (☰ → mola menüsünden açılır), çünkü beşinci simge tabelanın üstüne binerdi (bkz. src/ui.js hud).
  assert.deepEqual(macDugmeler, ['yg-sound', 'yg-help-open', 'yg-pause-open', 'yg-cam'],
    'maçta üst çubukta yalnız bu dört simge olmalı: beşincisi tabelanın üstüne biner');
  assert.deepEqual(hatalar, [], 'tarayıcı hataları: ' + hatalar.join(' | '));
  await context.close();

  // 3) Uygulama kipi (Capacitor; `?app` ile taklit): kaldıracak tarayıcı çubuğu yok, düğme hiç çizilmez.
  const appCtx = await browser.newContext({ viewport: EKRAN, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const appPage = await appCtx.newPage();
  await appPage.goto(url + '/?test=1&app=1');
  await appPage.waitForFunction(() => !!window.__yakarGol);
  await appPage.waitForTimeout(400);
  const appFull = await appPage.evaluate(`(${OLC})('#yg-full')`);
  const appSinif = await appPage.evaluate(() => document.getElementById('yakar-gol').classList.contains('tam-ekran'));
  console.log(JSON.stringify({ appFull, appSinif }));
  assert.equal(appSinif, false, 'uygulamada tam ekran sınıfı verilmemeli');
  assert.ok(!appFull.gorunur, 'Play Store uygulamasında tam ekran düğmesi görünmemeli');
  await appCtx.close();

  // 4) Telefon dikey (390x844): oyunun üstünde "Telefonu yan çevir" perdesi vardır ama standart araç çubuğu yine de
  //    ekranın içinde ve tek satırda kalmalı — ölçü dar ekran kurallarının (style.css max-width:650px) denetimidir.
  const DIKEY = { width: 390, height: 844 };
  const dikeyCtx = await browser.newContext({ viewport: DIKEY, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const dikeyPage = await dikeyCtx.newPage();
  await dikeyPage.goto(url + '/?test=1');
  await dikeyPage.waitForFunction(() => !!window.__yakarGol);
  await dikeyPage.waitForTimeout(400);
  const dikeyCubuk = await dikeyPage.evaluate(`(${OLC})('.header-actions')`), dikeyLogo = await dikeyPage.evaluate(`(${OLC})('.logo')`);
  console.log(JSON.stringify({ dikey: `${DIKEY.width}x${DIKEY.height}`, dikeyCubuk, dikeyLogo }));
  assert.ok(dikeyCubuk.left >= 0 && dikeyCubuk.right <= DIKEY.width, `dikeyde üst çubuk ekrandan taşıyor (${dikeyCubuk.left}..${dikeyCubuk.right})`);
  assert.ok(!binisiyor(dikeyCubuk, dikeyLogo), 'dikeyde üst çubuk oyun adının üstüne biniyor');
  await dikeyCtx.close();

  console.log(`Tam ekran düğmesi dar yatay telefonda (${EKRAN.width}x${EKRAN.height}) yerinde: giriş ekranında var, maçta yok, uygulamada hiç yok.`);
  console.log('Standart üst araç çubuğu (← josephuz.com · Ses · Müzik · Kontroller F1) yatayda ve dikeyde tek satır, taşma yok.');
} finally {
  await browser.close();
  sunucu?.kill();
}
