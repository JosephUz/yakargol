// Gösteri kipi dumanı testi (?gosteri=1): içerik klipleri için "kendi kendine oynayan" maç çalışıyor mu?
// Denetlenenler: menü atlanır ve maç başlar, on koltuğun hiçbirinde insan yoktur, arayüz gizlidir, sunucuya hiç
// WebSocket açılmaz ve ölçüm isteği gitmez, ilk saniyelerde ekranda aksiyon olur, kamera topu izler, maç bitince
// yenisi başlar. Adres: GAME_URL (varsayılan http://localhost:5186). Playwright yolu: PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://localhost:5186';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), headless: true, args: ['--disable-gpu-sandbox', ...(process.env.SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'])] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  // Açılan WebSocket'ler ve ölçüm çağrıları sayılır: gösteri kipinde ikisi de olmamalı.
  await ctx.addInitScript(() => {
    window.__sockets = 0; window.__olcum = 0;
    const WS = window.WebSocket;
    window.WebSocket = class extends WS { constructor(...a) { super(...a); window.__sockets++; } };
    const beacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
    if (beacon) navigator.sendBeacon = (u, b) => { window.__olcum++; return beacon(u, b); };
    const fetch0 = window.fetch.bind(window);
    window.fetch = (u, o) => { if (/\/api\/olay|\/presence/.test(String(u))) window.__olcum++; return fetch0(u, o); };
  });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  const game = fn => page.evaluate(fn);

  await page.goto(url + '/?gosteri=1');
  await page.waitForFunction(() => window.__yakarGol && window.__yakarGol.state().started, null, { timeout: 20000 });

  // 1) Menü atlanır, on koltuğu da bot oynar.
  assert.ok(await page.locator('#yg-home').isHidden(), 'giriş ekranı açılmaz');
  assert.ok(await game(() => document.getElementById('yakar-gol').classList.contains('gosteri')), 'gösteri sınıfı eklenir');
  assert.ok(await game(() => window.__yakarGol.state().gosteri), 'gösteri kipi açık');
  assert.equal(await game(() => window.__yakarGol.world().players.length), 10, 'on oyuncu kurulur');
  assert.equal(await game(() => window.__yakarGol.world().players.filter(p => p.human).length), 0, 'hiç insan oyuncu yok');
  assert.ok(await game(() => window.__yakarGol.world().gosteri), 'dünya gösteri işaretli (botlar saldırgan ayarları kullanır)');
  assert.ok(await game(() => window.__yakarGol.world().fireLeft[0] > 5), 'yakar top hakkı bollaştırılır');

  // 2) Arayüz gizli: üst çubuk, skor tabelası, oyuncu kartı, tuş listesi, nişangah, dokunmatik kontroller.
  for (const sel of ['#yakar-gol header', '#yg-scoreboard', '#yg-player', '#yg-controls', '#yg-crosshair', '#yg-touch', '#yg-labels']) {
    assert.ok(await page.locator(sel).isHidden(), `${sel} gizli`);
  }
  assert.ok(await page.locator('#yg-gosteri').isVisible(), 'köşedeki oyun adı görünür');

  // 3) İlk 5 saniyede ekranda aksiyon: başlama beklemesi biter, top santradan uzaklaşır.
  await page.waitForFunction(() => {
    const w = window.__yakarGol.world();
    return w.kickoff === 0 && Math.hypot(w.ball.x, w.ball.z) > 5;
  }, null, { timeout: 5000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'artifacts/gosteri-1-mac.png' });

  // 4) Ne ağ ne ölçüm.
  assert.equal(await game(() => window.__sockets), 0, 'gösteri kipinde sunucuya bağlanılmaz');
  assert.equal(await game(() => window.__olcum), 0, 'gösteri kipinde ölçüm olayı gitmez');

  // 5) Kamera aksiyonu izler: top her karede kadrajda kalır, odak ortalamada topun dibindedir ve kıpırdamadan durmaz.
  // Tek kare yerine 3 saniye örneklenir: top en uzak köşeye giderken kadrajın kenarına yaklaşması testi düşürmesin.
  const ornekler = [];
  for (let i = 0; i < 12; i++) {
    ornekler.push(await game(() => {
      const y = window.__yakarGol, w = y.world(), b = w.ball, s = y.view().project(b.x, 0.4, b.z), o = y.odak();
      return { x: s.x / innerWidth, y: s.y / innerHeight, behind: s.behind, uzak: Math.hypot(o.x - b.x, o.z - b.z), ox: o.x, oz: o.z };
    }));
    await page.waitForTimeout(250);
  }
  for (const s of ornekler) {
    assert.ok(!s.behind, 'top kameranın arkasında kalmaz');
    assert.ok(s.x > 0.02 && s.x < 0.98 && s.y > 0.02 && s.y < 0.98, `top kadrajda kalır (${s.x.toFixed(2)}, ${s.y.toFixed(2)})`);
  }
  const ortalama = ornekler.reduce((n, s) => n + s.uzak, 0) / ornekler.length;
  assert.ok(ortalama < 15, `kamera odağı topu izler (ortalama ${ortalama.toFixed(1)} birim)`);
  const kimildadi = ornekler.some(s => Math.hypot(s.ox - ornekler[0].ox, s.oz - ornekler[0].oz) > 1);
  assert.ok(kimildadi, 'kamera donup kalmaz, aksiyonla birlikte kayar');

  // 6) Girdi kipi bozmaz: tuşa basmak mola / yardım perdesi açmaz, maç akmayı sürdürür.
  const oncekiSure = await game(() => window.__yakarGol.world().time);
  await page.keyboard.press('Escape'); await page.keyboard.press('F1'); await page.mouse.click(640, 360);
  await page.waitForTimeout(600);
  assert.equal(await game(() => window.__yakarGol.state().screen), null, 'girdi perde açmaz');
  assert.ok(await game(() => window.__yakarGol.world().time) > oncekiSure, 'maç girdiden sonra da akar');

  // 7) Maç bitince birkaç saniye sonra yenisi başlar (bitişi elle tetikliyoruz).
  await game(() => { const w = window.__yakarGol.world(); w.time = 299.99; w.score = [3, 1]; w.kickoff = 0; window.__yakarGol.step(2); });
  assert.notEqual(await game(() => window.__yakarGol.world().winner), null, 'maç bitti');
  assert.ok(await page.locator('#yg-results').isHidden(), 'gösteride maç sonu karnesi açılmaz');
  await page.waitForFunction(() => { const w = window.__yakarGol.world(); return w.winner === null && w.time < 5; }, null, { timeout: 15000 });
  assert.equal(await game(() => window.__yakarGol.world().players.filter(p => p.human).length), 0, 'yeni maçta da insan oyuncu yok');
  assert.ok(await game(() => window.__yakarGol.world().gosteri), 'yeni maç da gösteri kipinde');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'artifacts/gosteri-2-yeni-mac.png' });

  assert.deepEqual(errors, [], 'sayfa hatasız');
  console.log('Gösteri kipi dumanı testi geçti.');
} finally {
  await browser.close();
}
