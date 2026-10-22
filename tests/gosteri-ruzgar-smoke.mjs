// Rüzgar şutu gösteri sahnesi dumanı testi (?gosteri=ruzgar): içerik videosu için sahnelenmiş vuruş çalışıyor mu?
// Denetlenenler: menü atlanır ve sahne kurulur, kamera omuz üstüdür (izometrik değil), rakipler şut çıkana dek
// kıpırdamaz, yükleme / çarpma / gol anları sırayla gelir, her turda beş rakip savrulur ve gol olur, 25 sn'de en az
// iki tam gol çıkar, ekrandaki açıklama yazısı kadrajın orta bandında ve yanlardan içeride durur, arayüz gizlidir,
// sunucuya WebSocket açılmaz, ölçüm isteği gitmez ve `?gosteri=1` ile normal oyun bu sahneden etkilenmez.
// Adres: GAME_URL (varsayılan http://localhost:5186). Playwright yolu: PLAYWRIGHT_MODULE.
// Tarayıcı bilerek Playwright'ın kendi Chromium'udur (kullanıcının Chrome'u değil) ve sesi kapalıdır (--mute-audio).
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://localhost:5186';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--disable-gpu-sandbox', ...(process.env.SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'])] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  // Açılan WebSocket'ler ve ölçüm çağrıları sayılır: gösteri sahnesinde ikisi de olmamalı.
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
  const bekle = (fn, ms = 20000) => page.waitForFunction(fn, null, { timeout: ms });

  await page.goto(url + '/?dil=tr&gosteri=ruzgar');
  await bekle(() => window.__yakarGol && window.__yakarGol.state().started);

  // 1) Menü atlanır, sahne kurulur, kamera omuz üstüdür (sahne 3B anlatım ister, izometrik yayın kamerası değil).
  assert.ok(await page.locator('#yg-home').isHidden(), 'giriş ekranı açılmaz');
  assert.ok(await game(() => document.getElementById('yakar-gol').classList.contains('gosteri')), 'gösteri sınıfı eklenir');
  assert.ok(await game(() => window.__yakarGol.state().gosteri), 'gösteri kipi açık');
  assert.equal(await game(() => window.__yakarGol.view().cameraMode), 'shoulder', 'kamera omuz üstü (izometrik değil)');
  assert.equal(await game(() => window.__yakarGol.world().players.length), 10, 'on oyuncu kurulur');

  // 2) Arayüz gizli: üst çubuk, skor tabelası, oyuncu kartı, tuş listesi, nişangah, dokunmatik kontroller, etiketler.
  for (const sel of ['#yakar-gol header', '#yg-scoreboard', '#yg-player', '#yg-controls', '#yg-crosshair', '#yg-touch', '#yg-labels']) {
    assert.ok(await page.locator(sel).isHidden(), `${sel} gizli`);
  }
  assert.ok(await page.locator('#yg-gosteri').isVisible(), 'köşedeki oyun adı görünür');

  // 3) Şutçu orta sahada topla durur; rakipler (kaleci dahil) kaleyle onun arasında, topun yolu üstünde dizilidir.
  const dizilis = await game(() => {
    const w = window.__yakarGol.world(), atan = w.players[0], hedefZ = -40;
    const rakipler = w.players.filter(p => p.team === 1);
    // Şut çizgisi şutçunun baktığı yöndür (sahne onu nişana çevirir); rakibin bu çizgiye dik uzaklığı topun ona
    // değmesini belirler (BALL.hit 0,85).
    const nx = -Math.cos(atan.angle), nz = Math.sin(atan.angle);
    return {
      atanZ: atan.z, topSahibi: w.ball.owner === atan.id,
      arada: rakipler.filter(p => p.z < atan.z && p.z > hedefZ).length,
      enUzakSapma: Math.max(...rakipler.map(p => Math.abs((p.x - atan.x) * nx + (p.z - atan.z) * nz))),
      kaleciEnOnde: rakipler.every(p => p.role === 4 || p.z > rakipler.find(k => k.role === 4).z),
    };
  });
  assert.ok(Math.abs(dizilis.atanZ) < 8, `şutçu orta sahada (z=${dizilis.atanZ.toFixed(1)})`);
  assert.ok(dizilis.topSahibi, 'top şutçuda');
  assert.equal(dizilis.arada, 5, 'beş rakibin hepsi şutçuyla kale arasında dizilir');
  assert.ok(dizilis.enUzakSapma < 0.85, `rakipler topun yolu üstünde (en uzak sapma ${dizilis.enUzakSapma.toFixed(2)} < BALL.hit)`);
  assert.ok(dizilis.kaleciEnOnde, 'kaleci dizilişin en sonunda, kaleye en yakın durur');

  // 4) Kimse saldırmaz: şut çıkana kadar şutçu dışında hiç kimse kıpırdamaz, top kimseye kaptırılmaz.
  const once = await game(() => window.__yakarGol.world().players.map(p => ({ x: p.x, z: p.z })));
  await page.waitForTimeout(1000);
  const kimildama = await page.evaluate(e => {
    const w = window.__yakarGol.world();
    return { en: Math.max(...w.players.slice(1).map((p, i) => Math.hypot(p.x - e[i + 1].x, p.z - e[i + 1].z))), sahip: w.ball.owner };
  }, once);
  assert.ok(kimildama.en < 0.05, `şut çıkana dek kimse kıpırdamaz (en çok ${kimildama.en.toFixed(3)} birim)`);
  assert.equal(kimildama.sahip, 0, 'bekleyen rakipler topu çalmaz');

  // 5) Yükleme: ekranda birinci açıklama yazısı, ayaktaki top camgöbeğine döner (oyundaki rüzgar şarjı görüntüsü).
  await bekle(() => window.__yakarGol.gosteriDurum().evre === 'yukleme');
  await bekle(() => window.__yakarGol.world().players[0].charge > 0.8);
  const yazi = await page.locator('#yg-gosteri-yazi');
  assert.ok(await yazi.isVisible(), 'açıklama yazısı görünür');
  assert.match(await yazi.textContent(), /RÜZGAR ŞUTU/, 'yüklemede rüzgar şutu anlatılır');
  // İçerik betiği 16:9 kaydı dikey videoya keserken yanlardan ~%15 kırpar ve üst / alt kısma kendi yazısını koyar:
  // yazı ortalanmış, kırpımın içinde ve kadrajın orta yatay bandında olmalı.
  const kutu = await yazi.boundingBox();
  assert.ok(Math.abs(kutu.x + kutu.width / 2 - 640) < 2, 'yazı yatayda ortalanmış');
  assert.ok(kutu.x > 1280 * 0.15 && kutu.x + kutu.width < 1280 * 0.85, 'yazı dikey kırpımın (%15 kenar) içinde kalır');
  assert.ok(kutu.y > 720 * 0.18 && kutu.y + kutu.height < 720 * 0.72, 'yazı kadrajın orta yatay bandında durur');
  await page.screenshot({ path: 'artifacts/gosteri-ruzgar-1-yukleme.png' });

  // 6) Çarpma: rüzgar topu ilk rakibi savurur, ağır çekime geçilir, yazı ikinciye döner.
  await bekle(() => window.__yakarGol.gosteriDurum().savrulan > 0);
  const carpma = await game(() => window.__yakarGol.gosteriDurum());
  assert.equal(carpma.evre, 'ucus', 'çarpma uçuş evresinde olur');
  assert.ok(carpma.agir, 'ilk çarpmada ağır çekime geçilir');
  assert.match(carpma.yazi, /savurur/, 'çarpmada savurma anlatılır');
  assert.equal(await game(() => window.__yakarGol.world().ball.kind), 'wind', 'top rüzgar topudur');
  await page.screenshot({ path: 'artifacts/gosteri-ruzgar-2-carpma.png' });

  // 7) Gol: yoldaki beş rakibin hepsi savrulur ve top ağa girer.
  await bekle(() => window.__yakarGol.gosteriDurum().goller > 0);
  const gol = await game(() => window.__yakarGol.gosteriDurum());
  assert.equal(gol.savrulan, 5, 'yoldaki beş rakibin hepsi savrulur');
  assert.equal(gol.evre, 'bitis', 'gol turu bitirir');
  assert.ok(await page.locator('#yg-results').isHidden(), 'gösteride maç sonu karnesi açılmaz');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'artifacts/gosteri-ruzgar-3-gol.png' });

  // 8) Döngü: sahne 9-12 saniyede bir sıfırlanır, 25 saniyelik klipte en az iki tam gol olur, her tur başka dizilir.
  const t0 = Date.now(), baslangic = gol.goller;
  const dizilis1 = await game(() => window.__yakarGol.world().players.map(p => p.x + ',' + p.z).join('|'));
  await bekle(() => window.__yakarGol.gosteriDurum().goller >= 2, 26000);
  const turSuresi = (Date.now() - t0) / 1000;
  assert.ok(turSuresi >= 8 && turSuresi <= 12.5, `tur 9-12 sn arasında yenilenir (${turSuresi.toFixed(1)} sn)`);
  const sonrasi = await game(() => window.__yakarGol.gosteriDurum());
  assert.ok(sonrasi.goller - baslangic >= 1 && sonrasi.tur >= 2, 'sahne döner: yeni tur kurulur ve yeniden gol olur');
  assert.equal(sonrasi.savrulan, 10, 'her turda beş rakip savrulur (iki turda on)');
  const dizilis2 = await game(() => window.__yakarGol.world().players.map(p => p.x + ',' + p.z).join('|'));
  assert.notEqual(dizilis2, dizilis1, 'her turda diziliş hafif değişir (klipler birbirinin kopyası olmaz)');
  // 25 sn'de en az iki tam gol: ilk gol ~6. saniyede, turlar ~9 sn. İki gol için geçen süre buna yeter mi?
  assert.ok(turSuresi < 19, `25 sn'lik klipte en az iki tam gol sığar (iki gol arası ${turSuresi.toFixed(1)} sn)`);

  // 9) Ne ağ ne ölçüm ne de sayfa hatası.
  assert.equal(await game(() => window.__sockets), 0, 'rüzgar sahnesinde sunucuya bağlanılmaz');
  assert.equal(await game(() => window.__olcum), 0, 'rüzgar sahnesinde ölçüm olayı gitmez');
  assert.deepEqual(errors, [], 'sayfa hatasız');

  // 10) Girdi sahneyi bozmaz: tuş ve tıklama mola / yardım perdesi açmaz.
  await page.keyboard.press('Escape'); await page.keyboard.press('F1'); await page.mouse.click(640, 360);
  await page.waitForTimeout(400);
  assert.equal(await game(() => window.__yakarGol.state().screen), null, 'girdi perde açmaz');

  // 11) `?gosteri=1` değişmedi: hâlâ kendi kendine oynanan izometrik maç, rüzgar sahnesinin yazısı orada çıkmaz.
  const sayfa2 = await ctx.newPage(), hata2 = [];
  sayfa2.on('pageerror', e => hata2.push(e.message));
  sayfa2.on('console', e => { if (e.type() === 'error') hata2.push(e.text()); });
  await sayfa2.goto(url + '/?dil=tr&gosteri=1');
  await sayfa2.waitForFunction(() => window.__yakarGol && window.__yakarGol.state().started, null, { timeout: 20000 });
  assert.equal(await sayfa2.evaluate(() => window.__yakarGol.view().cameraMode), 'iso', '?gosteri=1 izometrik kalır');
  assert.equal(await sayfa2.evaluate(() => window.__yakarGol.world().players.filter(p => p.human).length), 0, '?gosteri=1 maçında insan oyuncu yok');
  assert.equal(await sayfa2.evaluate(() => window.__yakarGol.gosteriDurum()), null, '?gosteri=1 rüzgar sahnesini kurmaz');
  assert.ok(await sayfa2.locator('#yg-gosteri-yazi').isHidden(), '?gosteri=1 ekranında açıklama yazısı çıkmaz');
  assert.deepEqual(hata2, [], '?gosteri=1 sayfası hatasız');

  console.log('Rüzgar şutu gösteri sahnesi dumanı testi geçti.');
} finally {
  await browser.close();
}
