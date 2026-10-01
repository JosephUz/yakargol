// Dokunmatik dumanı testi: yatay telefon taklidiyle (844x390, dokunmatik) çalışan sunucuya bağlanır; izometrik kamerayla
// başlamayı, joystick'i, kendiliğinden hızlı koşuyu, sağ yarıda bakışı, PAS basılı tutunca yakar top nişanını (joystick'le
// nişan, bırakınca atış), pas / ŞUT dokunuşunu, 🎥 ile omuz kamerasına geçişi ve dik tutunca "yan çevir" uyarısını dener. Dokunuşlar Chrome DevTools (Input.dispatchTouchEvent) ile çoklu parmak.
// Ekran görüntüleri artifacts/ altına. Playwright yolu: PLAYWRIGHT_MODULE ortam değişkeni.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://localhost:5186';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), headless: true, args: [...(process.env.SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'])] });
try {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  const game = fn => page.evaluate(fn);
  const hero = () => game(() => window.__yakarGol.world().players[0]);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  const center = async id => { const b = await page.locator(id).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const giveBall = () => game(() => {
    const w = window.__yakarGol.world(), p = w.players[0];
    Object.assign(p, { energyCd: 0, stun: 0, kickCd: 0, sprint: 0 });
    Object.assign(w.ball, { owner: 0, x: p.x, z: p.z, kind: 'normal' });
    for (const b of w.players.slice(1)) b.stun = 99;
  });

  await page.goto(url + '/?test=1');
  await page.waitForFunction(() => !!window.__yakarGol);
  assert.ok(await game(() => document.getElementById('yakar-gol').classList.contains('touch')), 'dokunmatik kip açılmalı');
  await page.tap('#yg-start');
  await page.waitForTimeout(500);
  await game(() => { window.__yakarGol.world().kickoff = 0; });
  assert.ok(await page.locator('#yg-t-shoot').isVisible());
  assert.ok(!(await page.locator('#yg-controls').isVisible()), 'klavye ipuçları gizli');
  assert.ok(await page.locator('#yg-t-pass.dash').isVisible(), 'topsuzken PAS düğmesi KAY olur');
  assert.equal(await game(() => window.__yakarGol.view().cameraMode), 'iso', 'telefonda izometrik başlar');
  assert.ok(!(await page.locator('#yg-crosshair').isVisible()), 'izometrikte nişangah yok');

  // Joystick: sol yarıda parmak ileri → oyuncu yürür; sonuna kadar itmek hızlı koşturmaz (yalnız KOŞ düğmesi).
  const start = await hero();
  await touch('touchStart', [[150, 260]]);
  for (let i = 1; i <= 4; i++) { await touch('touchMove', [[150, 260 - i * 7]]); await page.waitForTimeout(30); }
  await page.waitForTimeout(400);
  const walked = await hero();
  assert.ok(Math.hypot(walked.x - start.x, walked.z - start.z) > 1, 'joystick oyuncuyu yürütmeli');
  assert.equal(walked.sprint, 0);
  const stickShown = () => game(() => !document.getElementById('yg-stick').hidden);
  assert.ok(await stickShown(), 'joystick parmağın altında belirir');
  await page.screenshot({ path: 'artifacts/t1-stick.png' });
  await touch('touchMove', [[150, 180]]);
  await page.waitForTimeout(700);
  assert.equal((await hero()).sprint, 0, 'joystick kendiliğinden hızlı koşturmaz');

  // İzometrik sabit açıdır: sağ yarıda parmak kaydırmak kamerayı döndürmez (joystick bırakılmadan).
  const yaw = () => game(() => window.__yakarGol.view().camera.rotation.y);
  const y0 = await yaw();
  await touch('touchMove', [[150, 180], [600, 200]]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[150, 180], [600 + i * 12, 200]]); await page.waitForTimeout(20); }
  assert.ok(Math.abs((await yaw()) - y0) < 1e-6, 'izometrik açı sabit kalır');
  await touch('touchEnd', []);
  await page.waitForTimeout(200);
  assert.ok(!(await stickShown()), 'parmak kalkınca joystick kaybolur');

  // PAS basılı: dolum halkası → nişan (ağır çekim) → joystick'le nişan döner (izometrik) → bırakınca yakar top.
  await giveBall();
  await page.waitForTimeout(100);
  assert.ok(!(await page.locator('#yg-t-pass.dash').isVisible()), 'top sendeyken PAS');
  const [px, py] = await center('#yg-t-pass');
  await touch('touchStart', [[px, py]]);
  await page.waitForTimeout(450);
  assert.ok(await page.locator('#yg-charge').isVisible(), 'basılıyken dolum halkası');
  await page.waitForTimeout(800);
  assert.equal(await game(() => window.__yakarGol.state().cine), 'aim');
  const angle = () => game(() => window.__yakarGol.world().players[0].angle);
  const a0 = await angle();
  await touch('touchMove', [[px, py], [150, 260]]);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [[px, py], [150 - i * 10, 260]]); await page.waitForTimeout(30); }
  await page.waitForTimeout(100);
  assert.ok(Math.abs((await angle()) - a0) > 0.3, 'nişanda joystick hedefi çevirir');
  await page.screenshot({ path: 'artifacts/t2-aim.png' });
  await touch('touchEnd', []);
  await page.waitForTimeout(150);
  assert.equal(await game(() => window.__yakarGol.world().ball.kind), 'fire');
  assert.equal(await game(() => window.__yakarGol.world().fireLeft[0]), 4);
  await page.waitForFunction(() => !window.__yakarGol.state().cine, null, { timeout: 8000 });

  // PAS kısa dokunuş: pas; ŞUT dokunuşu: şut.
  await giveBall(); await page.waitForTimeout(100);
  await touch('touchStart', [[px, py]]); await page.waitForTimeout(80); await touch('touchEnd', []);
  await page.waitForTimeout(100);
  assert.notEqual(await game(() => window.__yakarGol.world().ball.owner), 0, 'kısa dokunuş pas');
  assert.equal(await game(() => window.__yakarGol.world().fireLeft[0]), 4, 'pas yakar top hakkı harcamaz');
  await giveBall(); await page.waitForTimeout(100);
  const [sx, sy] = await center('#yg-t-shoot');
  await touch('touchStart', [[sx, sy]]); await page.waitForTimeout(80); await touch('touchEnd', []);
  await page.waitForTimeout(100);
  const shot = await game(() => window.__yakarGol.world().ball);
  assert.equal(shot.owner, null, 'ŞUT dokunuşu şut çeker');
  assert.equal(shot.kind, 'normal');

  // 🎥: omuz kamerasına geçer, nişangah görünür; tekrar basınca izometrik.
  await page.tap('#yg-cam');
  await page.waitForTimeout(150);
  assert.equal(await game(() => window.__yakarGol.view().cameraMode), 'shoulder', '🎥 omuz kamerasına geçer');
  assert.ok(await page.locator('#yg-crosshair').isVisible(), 'omuzda nişangah');
  const s0 = await yaw();
  await touch('touchStart', [[600, 200]]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[600 + i * 12, 200]]); await page.waitForTimeout(20); }
  await touch('touchEnd', []);
  await page.waitForTimeout(80);
  assert.ok(Math.abs((await yaw()) - s0) > 0.1, 'omuzda sağ yarıda kaydırmak bakışı çevirir');
  await page.screenshot({ path: 'artifacts/t2b-shoulder.png' });
  // Kaydırmanın hemen ardından: tarayıcı bu dokunuşun `click`'ini yutar, düğme yine de çalışmalı (bkz. ui.js onTap).
  await page.tap('#yg-cam');
  await page.waitForTimeout(100);
  assert.equal(await game(() => window.__yakarGol.view().cameraMode), 'iso');

  // Top ekran dışındayken kenarda işaret çıkar, ekrana girince kaybolur.
  await game(() => { const w = window.__yakarGol.world(), p = w.players[0]; Object.assign(w.ball, { owner: null, x: 0, z: -38 * Math.sign(p.z || 1), vx: 0, vz: 0 }); });
  await page.waitForTimeout(150);
  assert.ok(await page.locator('#yg-ballmark').isVisible(), 'ekran dışındaki top için kenar işareti');
  await giveBall(); await page.waitForTimeout(150);
  assert.ok(!(await page.locator('#yg-ballmark').isVisible()), 'top görününce işaret kaybolur');

  // ZIPLA düğmesi.
  const [jx, jy] = await center('#yg-t-jump');
  await touch('touchStart', [[jx, jy]]); await page.waitForTimeout(60); await touch('touchEnd', []);
  await page.waitForTimeout(50);
  assert.ok((await hero()).jump > 0, 'ZIPLA düğmesi');
  await page.screenshot({ path: 'artifacts/t3-play.png' });

  // Dik ekran: yan çevir uyarısı. (Maça girerken tam ekrana geçildi; pencere ancak oradan çıkınca boyutlanır.)
  await game(() => document.fullscreenElement && document.exitFullscreen());
  await page.waitForTimeout(150);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  assert.ok(await page.locator('#yg-rotate').isVisible(), 'dik tutunca yan çevir uyarısı');
  assert.deepEqual(errors, []);
  console.log('dokunmatik dumanı testi geçti');
} finally {
  await browser.close();
}
