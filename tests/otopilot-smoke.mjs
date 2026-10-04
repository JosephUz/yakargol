// Otopilot dumanı testi (?otopilot=1): içerik videoları için "senin oyuncunu da bot oynayan" gerçek maç çalışıyor mu?
// Denetlenenler: menü atlanır ve maç başlar, senin koltuğun bota verilmiştir (p.human false) ama w.me değişmez,
// gösteri kipi **değildir** (arayüz normal oyundaki gibi durur, maç normal bot ayarlarıyla koşar), oyuncun sahada
// hareket eder ve topla buluşur, omuz kamerasının bakışı topa döner, sunucuya hiç WebSocket açılmaz ve ölçüm isteği
// gitmez, maç bitince karne açılmaz yenisi başlar.
// Adres: GAME_URL (varsayılan http://localhost:5186). Playwright yolu: PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://localhost:5186';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), headless: true, args: ['--disable-gpu-sandbox', ...(process.env.SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'])] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => {
    window.__sockets = 0; window.__olcum = 0;
    const WS = window.WebSocket;
    window.WebSocket = class extends WS { constructor(...a) { super(...a); window.__sockets++; } };
    const beacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
    if (beacon) navigator.sendBeacon = (u, b) => { window.__olcum++; return beacon(u, b); };
    const fetch0 = window.fetch.bind(window);
    window.fetch = (u, o) => { if (String(u).includes('/api/olay')) window.__olcum++; return fetch0(u, o); };
  });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  const game = fn => page.evaluate(fn);

  await page.goto(url + '/?otopilot=1&muzik=0');
  await page.waitForFunction(() => window.__yakarGol && window.__yakarGol.state().started, null, { timeout: 20000 });

  // 1) Menü atlanır; kip otopilottur, gösteri değildir.
  assert.ok(await page.locator('#yg-home').isHidden(), 'giriş ekranı açılmaz');
  const durum = await game(() => window.__yakarGol.state());
  assert.equal(durum.otopilot, true, 'otopilot açık');
  assert.equal(durum.gosteri, false, 'gösteri kipi değil');
  assert.ok(await game(() => !document.getElementById('yakar-gol').classList.contains('gosteri')), 'arayüz normal oyundaki gibi durur');
  assert.ok(await game(() => window.__yakarGol.world().gosteri !== true), 'maç normal bot ayarlarıyla koşar (w.gosteri kurulmaz)');

  // 2) Senin koltuğun bota verilmiştir ama kamera / arayüz hâlâ senin oyuncunu gösterir.
  assert.equal(await game(() => window.__yakarGol.world().players[window.__yakarGol.world().me].human), false, 'senin koltuğunu bot oynar');
  assert.equal(await game(() => window.__yakarGol.world().me), 0, 'izlenen oyuncu değişmez');
  assert.equal(await game(() => window.__yakarGol.world().players.filter(p => p.human).length), 0, 'sahada insan girdisi bekleyen koltuk kalmaz');

  // 3) Oyuncun gerçekten oynuyor: yer değiştirir, topla buluşur ve omuz kamerasının bakışı topa döner.
  const yer0 = await game(() => { const w = window.__yakarGol.world(), p = w.players[w.me]; return { x: p.x, z: p.z }; });
  await game(() => {
    const g = window.__yakarGol;
    // Bakış dönüşü **birikimli** ölçülür: iki uç arasındaki fark, açı bir tam tur dönüp geri gelirse sıfır çıkar.
    window.__s = { kare: 0, hareket: 0, topYakin: 0, donus: 0 };
    let onceki = g.view().yaw;
    window.__sayac = setInterval(() => {
      const w = g.world(), p = w.players[w.me], s = window.__s; s.kare++;
      if (Math.hypot(p.vx, p.vz) > 0.5) s.hareket++;
      if (Math.hypot(w.ball.x - p.x, w.ball.z - p.z) < 6) s.topYakin++;
      const y = g.view().yaw;
      s.donus += Math.abs(Math.atan2(Math.sin(y - onceki), Math.cos(y - onceki)));
      onceki = y;
    }, 50);
  });
  await page.waitForTimeout(30000);
  const say = await game(() => { clearInterval(window.__sayac); return window.__s; });
  const yer1 = await game(() => { const w = window.__yakarGol.world(), p = w.players[w.me]; return { x: p.x, z: p.z }; });
  await page.screenshot({ path: 'artifacts/otopilot-1-mac.png' });
  assert.ok(Math.hypot(yer1.x - yer0.x, yer1.z - yer0.z) > 2, 'oyuncun sahada yer değiştirir');
  assert.ok(say.hareket > say.kare * 0.2, `oyuncun boş durmaz (${say.hareket}/${say.kare} örnekte koşuyor)`);
  assert.ok(say.topYakin > 20, `oyuncun topla buluşur (${say.topYakin} örnekte topun 6 birim yakınında)`);
  const donus = say.donus;
  assert.ok(donus > 1, `omuz kamerasının bakışı topa döner (toplam ${donus.toFixed(2)} rad)`);

  // 4) Ne ağ ne ölçüm.
  assert.equal(await game(() => window.__sockets), 0, 'otopilotta sunucuya bağlanılmaz');
  assert.equal(await game(() => window.__olcum), 0, 'otopilotta ölçüm olayı gitmez');

  // 5) Maç bitince karne açılmaz, yenisi kurulur.
  await game(() => { const w = window.__yakarGol.world(); w.winner = 0; });
  await page.waitForFunction(() => window.__yakarGol.world().winner === null, null, { timeout: 15000 });
  assert.ok(await page.locator('#yg-results').isHidden(), 'karne açılmaz');
  assert.ok(await game(() => window.__yakarGol.state().started), 'yeni maç başlar');
  await page.screenshot({ path: 'artifacts/otopilot-2-yeni-mac.png' });

  assert.deepEqual(errors, [], 'sayfa hatasız');
  console.log(`Otopilot dumanı testi geçti (koşu ${say.hareket}/${say.kare}, top yakını ${say.topYakin}, bakış dönüşü ${donus.toFixed(2)} rad).`);
} finally {
  await browser.close();
}
