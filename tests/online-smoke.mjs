// Çevrim içi dumanı testi: çalışan sunucuya (varsayılan http://localhost:5186) iki başsız Chrome sekmesiyle bağlanır.
// Oda kur → kodla (küçük harf, tiresiz) katıl → koltuk seç → kuran taşır, odayı özel yapar → maç başlar → bir sekmenin
// hareketi öbüründe görünür. Uygulama kipinde (?app) oda düğmeleri "YAKINDA" yazar. Ekran görüntüleri artifacts/ altına.
// Playwright yolu: PLAYWRIGHT_MODULE. SAHTE_KILIT: fare kilidini sahteleyen betik (imleç hapsolmasın), her sekmeye eklenir.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://localhost:5186';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), headless: true, args: ['--mute-audio', ...(process.env.SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'])] });
const errors = [];
const open = async (query = '?test') => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  if (process.env.SAHTE_KILIT) await ctx.addInitScript({ path: process.env.SAHTE_KILIT });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url + '/' + query);
  return page;
};
try {
  const a = await open(), b = await open();
  for (const p of [a, b]) await p.waitForFunction(() => !document.querySelector('#yg-create').disabled, null, { timeout: 8000 });
  // Sayı değişince en çok 2 sn'de bir yayılır.
  await a.waitForFunction(() => /2 çevrim içi/.test(document.querySelector('#yg-online').textContent), null, { timeout: 6000 });

  await a.fill('#yg-nick', 'Ali');
  await a.click('#yg-create');
  await a.waitForSelector('#yg-lobby:not([hidden])');
  const code = (await a.locator('#yg-lobby-code').textContent()).trim();
  assert.match(code, /^[A-Z]{4}-\d$/);

  await b.fill('#yg-nick', 'Ayşe');
  await b.click('#yg-join');
  await b.fill('#yg-code', code.replace('-', '').toLowerCase()); // kprt4 → KPRT-4
  await b.click('#yg-join-go');
  await b.waitForSelector('#yg-lobby:not([hidden])');
  await a.waitForSelector('#yg-seats-1 .seat.taken');
  assert.ok(await b.locator('#yg-lobby-start').isDisabled(), 'kuran olmayan başlatamaz');
  assert.equal((await b.locator('#yg-lobby-start').textContent()).trim(), 'Kuranın başlatması bekleniyor');
  assert.equal(new URL(b.url()).searchParams.get('oda'), code, 'odadayken adres ?oda=KOD');
  assert.match(await b.locator('#yg-seats-0 .seat[data-slot="0"]').textContent(), /Ali kuran/);
  assert.match(await b.locator('#yg-lobby-info').textContent(), /2 insan · 8 bot/);
  // Kuran odayı özel yapar; öbür sekmede ayar kapalı ama görünür.
  await a.click('#yg-lobby-priv');
  await b.waitForFunction(() => /ÖZEL ODA · yalnız kodla/.test(document.querySelector('#yg-lobby-vis').textContent));
  assert.ok(await b.locator('#yg-lobby-pub').isDisabled());

  // Ayşe mavide 3. koltuğa oturur.
  await b.click('#yg-seats-0 .seat[data-slot="2"]');
  await a.waitForFunction(() => document.querySelector('#yg-seats-0 .seat[data-slot="2"]').textContent.includes('Ayşe'));
  // Kuran Ayşe'yi turuncu kaleciye taşır (oyuncuya, sonra koltuğa tıklayarak).
  await a.click('#yg-seats-0 .seat[data-slot="2"]');
  await a.click('#yg-seats-1 .seat[data-slot="9"]');
  await b.waitForFunction(() => document.querySelector('#yg-seats-1 .seat[data-slot="9"]').classList.contains('me'));
  await a.screenshot({ path: 'artifacts/o1-lobby.png' });

  await a.click('#yg-lobby-start');
  for (const p of [a, b]) await p.waitForFunction(() => window.__yakarGol.state().started && window.__yakarGol.state().online);
  assert.equal(await b.evaluate(() => window.__yakarGol.world().me), 9, 'Ayşe turuncu kaleci');
  assert.equal(await a.evaluate(() => window.__yakarGol.world().players[9].name), 'Ayşe');

  // Santrayı Ali (mavi forvet) yapar: sağ tık basılı → herkes için donan nişan, bırakınca yakar pas.
  await a.waitForFunction(() => window.__yakarGol.world().ball.owner === 0, null, { timeout: 5000 });
  await a.mouse.move(640, 300); await a.mouse.down({ button: 'right' });
  await a.waitForFunction(() => window.__yakarGol.state().cine === 'aim', null, { timeout: 4000 });
  await b.waitForFunction(() => window.__yakarGol.state().cine === 'aim', null, { timeout: 2000 });
  assert.match(await b.locator('#yg-cine-who').textContent(), /Ali NİŞAN ALIYOR/);
  await a.mouse.up({ button: 'right' });
  await b.waitForFunction(() => window.__yakarGol.world().fireLeft[0] === 4, null, { timeout: 3000 });
  await b.screenshot({ path: 'artifacts/o2b-fire.png' });
  await b.waitForFunction(() => !window.__yakarGol.state().cine, null, { timeout: 6000 });

  // Ali sağa yürür; Ayşe'nin ekranında da yürür.
  await a.waitForTimeout(500);
  // Kamera topa dönük geçtiği için D yönü sahaya göre değişebilir: yürünen yol iki eksende ölçülür.
  const seen = () => b.evaluate(() => { const p = window.__yakarGol.world().players[0]; return { x: p.x, z: p.z }; });
  const x0 = await seen();
  await a.keyboard.down('KeyD'); await a.waitForTimeout(900); await a.keyboard.up('KeyD');
  await a.waitForTimeout(300);
  const x1 = await seen();
  assert.ok(Math.hypot(x1.x - x0.x, x1.z - x0.z) > 2, 'Ali\'nin hareketi Ayşe\'de görünür');
  await b.screenshot({ path: 'artifacts/o2-match.png' });

  // Mola maçı durdurmaz.
  const t0 = await b.evaluate(() => window.__yakarGol.world().time);
  await b.keyboard.press('Escape'); await b.waitForTimeout(600);
  assert.equal(await b.evaluate(() => window.__yakarGol.state().screen), 'pause');
  const t1 = await b.evaluate(() => window.__yakarGol.world().time);
  assert.ok(t1 > t0 + 0.3, 'molada maç sürer');
  await b.click('#yg-menu');
  await b.waitForSelector('#yg-home:not([hidden])');
  assert.equal(new URL(b.url()).searchParams.get('oda'), null, 'odadan çıkınca ?oda silinir');
  await a.waitForFunction(() => !window.__yakarGol.world().players[9].human, null, { timeout: 4000 });

  // Uygulama kipi: çok oyunculu "Yakında".
  const app = await open('?test&app');
  await app.waitForTimeout(800);
  assert.ok(await app.locator('#yg-create').isDisabled(), 'uygulamada oda kur kapalı');
  assert.match(await app.locator('#yg-create').textContent(), /YAKINDA/);
  await app.screenshot({ path: 'artifacts/o3-app-soon.png' });

  assert.deepEqual(errors, []);
  console.log('çevrim içi dumanı testi geçti');
} finally {
  await browser.close();
}
