// Tarayıcı dumanı testi: çalışan sunucuya (varsayılan http://localhost:5186) başsız Chrome ile bağlanır, ana akışları dener
// ve artifacts/ klasörüne ekran görüntüsü bırakır. Playwright yolu: PLAYWRIGHT_MODULE ortam değişkeni.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://localhost:5186';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--disable-gpu-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1536, height: 960 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  const game = fn => page.evaluate(fn);
  const hero = () => game(() => window.__yakarGol.world().players[0]);
  const ready = () => game(() => { const w = window.__yakarGol.world(); w.kickoff = 0; w.ball.owner = 0; Object.assign(w.players[0], { kickCd: 0, energyCd: 0, guard: 6, dash: 0, jump: 0, stun: 0, x: -10, z: 10 }); for (const t of w.players.slice(1)) t.energyCd = 99; });

  await page.goto(url + '/?test=1');
  await page.waitForFunction(() => !!window.__yakarGol);
  await page.screenshot({ path: 'artifacts/01-home.png' });

  await page.locator('#yg-start').click();
  await page.waitForTimeout(1500);
  assert.equal(await game(() => window.__yakarGol.world().players.length), 10);
  assert.ok(await page.locator('#yg-scoreboard').isVisible());
  assert.ok(await page.locator('#yg-crosshair').isVisible());
  assert.equal(await page.locator('#yg-camera').count(), 0);
  await page.screenshot({ path: 'artifacts/02-game.png' });

  const before = await hero();
  await page.keyboard.down('KeyD'); await page.waitForTimeout(300); await page.keyboard.up('KeyD');
  const after = await hero();
  assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > 0.3);

  await page.keyboard.press('Space'); await page.waitForTimeout(80);
  assert.ok((await hero()).jump > 0);

  // V: izometrik kamera (nişangah gizlenir), tekrar V: omuz.
  assert.equal(await game(() => window.__yakarGol.view().cameraMode), 'shoulder', 'masaüstünde omuzla başlar');
  await page.keyboard.press('KeyV'); await page.waitForTimeout(120);
  assert.equal(await game(() => window.__yakarGol.view().cameraMode), 'iso');
  assert.ok(!(await page.locator('#yg-crosshair').isVisible()), 'izometrikte nişangah yok');
  await page.screenshot({ path: 'artifacts/02b-iso.png' });
  // İzometrikte fare kilitlenmez: imlecin gösterdiği noktaya şut (bakılan yöne değil).
  await game(() => { const w = window.__yakarGol.world(), p = w.players[0]; w.kickoff = 0; Object.assign(p, { x: 0, z: 5, kickCd: 0, charge: 0 }); Object.assign(w.ball, { owner: 0, x: 0, z: 5, vx: 0, vz: 0 }); for (const b of w.players.slice(1)) b.stun = 3; });
  await page.waitForTimeout(150);
  const spot = await game(() => window.__yakarGol.view().project(-8, 0, -4));
  await page.mouse.move(spot.x, spot.y); await page.waitForTimeout(100);
  await page.mouse.down(); await page.waitForTimeout(50); await page.mouse.up(); await page.waitForTimeout(50);
  const kicked = await game(() => window.__yakarGol.world().ball);
  assert.equal(kicked.owner, null, 'izometrikte tıklama şut çeker');
  assert.ok(Math.abs(Math.atan2(kicked.vx, kicked.vz) - Math.atan2(-8, -9)) < 0.05, 'şut fareyle seçilen noktaya gider');
  await page.keyboard.press('KeyV'); await page.waitForTimeout(120);
  assert.equal(await game(() => window.__yakarGol.view().cameraMode), 'shoulder');

  // Sağ tık top sendeyken kısa: pas (yakar top hakkı ve enerji harcanmaz).
  const cinema = () => game(() => window.__yakarGol.state().cine);
  await ready();
  assert.equal(await page.locator('#yg-fire-left').textContent(), '5 / 5');
  assert.equal(await page.locator('#yg-blue-fire i').count(), 5);
  await page.mouse.click(700, 500, { button: 'right' }); await page.waitForTimeout(70);
  assert.equal(await game(() => window.__yakarGol.world().ball.kind), 'pass');
  assert.equal(await cinema(), null);

  // Sağ tık basılı: oyun donar, top alev alır, nişan alınır; bırakınca yakar top ağır çekimde uçar, hak 3'ten 2'ye iner.
  await ready();
  await page.mouse.move(700, 500); await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(700);
  assert.ok(await page.locator('#yg-charge').isVisible(), 'sağ tık dolum halkası yok');
  assert.match(await page.locator('#yg-charge-text').textContent(), /BIRAK: PAS/);
  assert.equal(await cinema(), null, 'dolum bitmeden nişana geçti');
  await page.screenshot({ path: 'artifacts/11-fire-charge.png' });
  await page.waitForFunction(() => window.__yakarGol.state().cine === 'aim', null, { timeout: 3000 });
  assert.ok(await page.locator('#yg-cine').isVisible());
  assert.ok(await page.locator('#yg-cine-aim').isVisible());
  assert.equal(await game(() => window.__yakarGol.world().ball.owner), 0);
  const frozen = await game(() => window.__yakarGol.world().time);
  await page.waitForTimeout(500);
  assert.equal(await game(() => window.__yakarGol.world().time), frozen, 'nişanda oyun durmadı');
  assert.equal(await cinema(), 'aim');
  await page.screenshot({ path: 'artifacts/03-fire.png' });
  // Uçuşu görmek için yolu boşalt: botlar kısa süre kenarda (dolum sırasında yaklaşıp ilk karede vurulabiliyorlar).
  await game(() => { for (const t of window.__yakarGol.world().players.slice(1)) t.burn = 0.6; });
  await page.mouse.up({ button: 'right' });
  await page.waitForFunction(() => window.__yakarGol.state().cine === 'flight', null, { timeout: 2000 });
  assert.equal(await game(() => window.__yakarGol.world().ball.kind), 'fire');
  assert.ok(await game(() => window.__yakarGol.view().flames.visible));
  assert.match(await page.locator('#yg-over-energy-text').textContent(), /ENERJİ \d/);
  const t0 = await game(() => window.__yakarGol.world().time);
  await page.waitForTimeout(500);
  const slow = (await game(() => window.__yakarGol.world().time)) - t0;
  assert.ok(slow > 0.05 && slow < 0.35, 'ağır çekim değil: ' + slow);
  await page.screenshot({ path: 'artifacts/09-fire-flight.png' });
  await page.waitForFunction(() => window.__yakarGol.state().cine === null, null, { timeout: 5000 });
  assert.ok(await page.locator('#yg-cine').isHidden());
  assert.equal(await page.locator('#yg-fire-left').textContent(), '4 / 5');
  assert.equal(await page.locator('#yg-blue-fire i.used').count(), 1);
  assert.equal(await page.locator('#yg-orange-fire i.used').count(), 0);

  // Yakar top rakibe çarpınca çarpma daha ağır çekimde gösterilir; vurulan geriye savrulur.
  await ready();
  await game(() => { const w = window.__yakarGol.world(), p = w.players[0], r = w.players[6], aim = window.__yakarGol.view().aim(), d = Math.hypot(aim.x - p.x, aim.z - p.z); Object.assign(r, { x: p.x + (aim.x - p.x) / d * 4, z: p.z + (aim.z - p.z) / d * 4, guard: 0, burn: 0, jump: 0, dash: 0, think: 99, stun: 6 }); });
  await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => window.__yakarGol.state().cine === 'aim', null, { timeout: 3500 });
  await page.mouse.up({ button: 'right' });
  await page.waitForFunction(() => window.__yakarGol.state().cine === 'impact', null, { timeout: 4000 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'artifacts/10-fire-impact.png' });
  assert.ok(await page.locator('#yg-message').isHidden(), 'mesaj sinema başlığının üstüne bindi');
  await page.waitForFunction(() => window.__yakarGol.state().cine === null, null, { timeout: 3000 });

  // Topsuz sağ tık: kayma.
  await game(() => { window.__yakarGol.world().players[0].energyCd = 0; });
  await page.mouse.click(700, 500, { button: 'right' }); await page.waitForTimeout(60);
  assert.ok((await hero()).stats.dashes > 0);
  assert.ok(await game(() => window.__yakarGol.world().players[0].dash > 0), 'kayma bitti bile');
  await page.screenshot({ path: 'artifacts/12-slide.png' });

  // Kısa sol tık: bırakınca beyaz normal şut.
  await ready();
  await page.mouse.click(700, 500); await page.waitForTimeout(70);
  assert.equal(await game(() => window.__yakarGol.world().ball.owner), null);
  assert.equal(await game(() => window.__yakarGol.world().ball.kind), 'normal');
  assert.equal(await game(() => window.__yakarGol.view().ballCore.material.color.getHexString()), 'ffffff');

  // Basılı sol tık: şarj göstergesi, 2 sn'de rüzgar topu.
  await ready();
  await page.mouse.move(700, 500); await page.mouse.down();
  await page.waitForTimeout(700);
  assert.ok(await page.locator('#yg-charge').isVisible(), 'rüzgar dolum halkası yok');
  assert.match(await page.locator('#yg-charge-text').textContent(), /TUT: RÜZGAR/);
  await page.screenshot({ path: 'artifacts/06-wind-charge.png' });
  await page.waitForFunction(() => window.__yakarGol.world().ball.kind === 'wind', null, { timeout: 6000 });
  assert.ok(await game(() => window.__yakarGol.view().gusts.visible));
  await page.waitForTimeout(120);
  await page.screenshot({ path: 'artifacts/07-wind.png' });
  await page.mouse.up();

  // Shift: 1 sn hızlı koşu, enerji harcar.
  await game(() => { const p = window.__yakarGol.world().players[0]; p.energyCd = 0; });
  await page.keyboard.press('ShiftLeft'); await page.waitForTimeout(60);
  const sprinter = await hero();
  assert.ok(sprinter.sprint > 0); assert.ok(sprinter.energyCd > 2.5);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(400);
  assert.ok(await page.locator('#yg-speed').isVisible(), 'hız çizgileri yok');
  assert.ok(await game(() => window.__yakarGol.view().camera.fov > 70), 'kamera açısı genişlemedi');
  await page.screenshot({ path: 'artifacts/13-sprint.png' });
  await page.keyboard.up('KeyW');

  // Topu yürüyerek kaptıran sersemler: sırtta süre, başta yıldızlar.
  await game(() => { const w = window.__yakarGol.world(), p = w.players[0], r = w.players[5]; w.ball.owner = 0; w.ball.last = 0; Object.assign(p, { guard: 0, stun: 0, kickCd: 0 }); Object.assign(r, { x: p.x + Math.sin(p.angle) * 0.4, z: p.z + Math.cos(p.angle) * 0.4, guard: 0, kickCd: 0, dash: 0, jump: 0, burn: 0 }); p.jump = 0; });
  await page.waitForTimeout(150);
  assert.ok((await hero()).stun > 1);
  assert.ok(await page.locator('#yg-over-stun').isVisible());
  await page.screenshot({ path: 'artifacts/08-stun.png' });

  // Gol patlaması: herkes havaya fırlar, sonra santra için dizilir.
  await game(() => { const w = window.__yakarGol.world(); for (const p of w.players) Object.assign(p, { burn: 0, stun: 0 }); Object.assign(w.players[0], { x: 3, z: -26 }); Object.assign(w.ball, { x: 0, z: -39.9, vx: 0, vz: -29, last: 0, owner: null, kind: 'normal' }); });
  await page.waitForFunction(() => !!window.__yakarGol.world().blast, null, { timeout: 2000 });
  await page.waitForTimeout(350);
  assert.ok(await game(() => window.__yakarGol.world().players.filter(p => p.air > 0).length >= 8), 'oyuncular havaya fırlamadı');
  await page.screenshot({ path: 'artifacts/14-goal-blast.png' });
  await page.waitForFunction(() => !window.__yakarGol.world().blast && window.__yakarGol.world().kickoff > 0, null, { timeout: 4000 });
  await page.waitForFunction(() => window.__yakarGol.world().kickoff === 0, null, { timeout: 3000 });

  // Kenardan dönüşte kamera topa bakar.
  await game(() => { const w = window.__yakarGol.world(); Object.assign(w.ball, { x: 15, z: -20, vx: 0, vz: 0, owner: null, kind: 'normal' }); w.players[0].burn = 0.05; });
  await page.waitForTimeout(250);
  const facing = await game(() => {
    const v = window.__yakarGol.view(), w = window.__yakarGol.world(), p = w.players[0], c = v.camera.position;
    const look = Math.atan2(w.ball.x - c.x, w.ball.z - c.z), cam = v.aim(), yaw = Math.atan2(cam.x - c.x, cam.z - c.z);
    return Math.abs(Math.atan2(Math.sin(look - yaw), Math.cos(look - yaw)));
  });
  assert.ok(facing < 0.25, 'kamera topa bakmıyor: ' + facing);

  await page.keyboard.press('Escape');
  assert.ok(await page.locator('#yg-pause').isVisible());
  const pausedTime = await game(() => window.__yakarGol.world().time);
  await page.waitForTimeout(200);
  assert.equal(await game(() => window.__yakarGol.world().time), pausedTime);
  await page.locator('#yg-resume').click();

  await page.keyboard.press('F1');
  assert.ok(await page.locator('#yg-help').isVisible());
  await page.locator('#yg-help-close').click();

  await game(() => { const w = window.__yakarGol.world(); w.players[0].burn = 3; w.ball.owner = null; });
  await page.waitForTimeout(150);
  assert.ok(await page.locator('#yg-burn').isVisible());
  await page.screenshot({ path: 'artifacts/04-burn.png' });

  await game(() => { const w = window.__yakarGol.world(); w.time = 299.99; w.score = [3, 1]; w.kickoff = 0; window.__yakarGol.step(2); });
  assert.ok(await page.locator('#yg-results').isVisible());
  assert.equal(await page.locator('#yg-stats tr').count(), 10);
  await page.screenshot({ path: 'artifacts/05-results.png' });

  await page.locator('#yg-again').click();
  assert.equal(await game(() => window.__yakarGol.world().score[0]), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks: 'home, 5v5, movement, jump, fire shot + overhead energy, dash, tap shot, wind charge + wind ball, sprint, face ball on return, pause, help, burn, results, rematch', errors }));
} finally {
  await browser.close();
}
