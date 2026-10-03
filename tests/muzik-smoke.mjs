// Oyun içi müzik dumanı testi (bkz. src/muzik.js). İki tarayıcı birden koşar:
//  - **Fare** (masaüstü, 1280x720): ilk tıklamadan önce hiç çalmaz; tıklayınca menüde sakin parça
//    (`yakar-2-devre-arasi`) çalar ve ilerler; maç başlayınca ana temaya (`yakar-1-spor-marsi`), son dakikada heyecan
//    parçasına (`yakar-3-son-dakika`) geçer ve parça bitince ana temaya devreder; molada sakin parçaya döner ve
//    molanın üstünde Kontroller açılıp kapanınca müzik yerinden oynamaz; "Müzik: kapalı" sayfa yenilenince korunur,
//    yeniden açılınca parça kaldığı yerden sürer; efekt sesi düğmesi müziği etkilemez; `?gosteri=1`'de hiç ses
//    öğesi kurulmaz.
//  - **Dokunmatik** (telefon taklidi, 750x342): müzik **ilk dokunuşta** başlamalı. Dokunmatik ekranda `pointerdown`
//    ve `touchstart` tarayıcıya "kullanıcı izin verdi" saymaz; parmağın kalktığı an sayar. İlk dokunuşta üç parçanın
//    da kilidi açılır, böylece maç parçası (çizim döngüsünden, yani dokunuşun dışından başlar) iOS'ta da çalar.
//
// Ses düzeyi **`seviye` alanından** okunur, `audio.volume`dan değil: düzey Web Audio kazanç düğümünden geçer
// (iOS Safari'de `audio.volume` salt okunurdur). Durma / ilerleme yine `audio.paused` ve `audio.currentTime`tir.
// Tarayıcı sesi `--mute-audio` ile kısılır. Oyunun kendisi otomatik tarayıcıda müziği kapatır (navigator.webdriver),
// bu yüzden `?muzik=1` ile açılır; `?test=1` oyunun okuma amaçlı test kancasını (`window.__yakarGol`) açar.
//
// Kendi kendine yeter: GAME_URL verilmezse oyun sunucusunu boş bir portta kendisi açar, Playwright'ı bu depoda ve
// komşu depolarda arar, bitince sunucuyu kapatır.
//   node tests/muzik-smoke.mjs
import assert from 'node:assert/strict';
import { glArgs, oyunSunucusu, playwright } from './ortam.mjs';

const { chromium } = await playwright();
const { url, kapat } = await oyunSunucusu();
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', ...glArgs()] });
const olcum = {};

/** Sayfadaki ses öğelerinin durumu (paused / currentTime öğeden, seviye müzik çalardan). */
const durumu = page => page.evaluate(() => window.__yakarGol.muzik());
/** O an baskın olan parça: çapraz geçiş sırasında iki parça birden çalar, sesi yüksek olan yenisidir. */
const calan = async page => (await durumu(page)).parcalar
  .filter(p => !p.paused && p.seviye > 0).sort((a, b) => b.seviye - a.seviye)[0] || null;
/** Oyunun kurulmasını bekler. */
const hazir = page => page.waitForFunction(() => !!window.__yakarGol?.muzik, null, { timeout: 20000 });
/** `ad` parçası duyulur biçimde çalıyor ve en az `en` saniye ilerledi mi (çapraz geçişin bitmesini de bekler). */
const bekleCalsin = (page, ad, en = 0.2) => page.waitForFunction(([ad, en]) => {
  const p = window.__yakarGol.muzik().parcalar.find(x => x.ad === ad);
  return !!p && !p.paused && p.seviye > 0.3 && p.currentTime > en;
}, [ad, en], { timeout: 20000 });
/** `ad` parçası sustu mu. */
const bekleSussun = (page, ad) => page.waitForFunction(ad => {
  const p = window.__yakarGol.muzik().parcalar.find(x => x.ad === ad);
  return !p || p.paused || p.seviye === 0;
}, ad, { timeout: 15000 });

try {
  // ---------------------------------------------------------------- 1) Masaüstü, fare
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });

  // 1) Açılış: oyun kurulur, müzik açıktır ama kullanıcı daha dokunmadığı için hiçbir şey çalmaz.
  await page.goto(url + '/?test=1&muzik=1');
  await hazir(page);
  const ilk = await durumu(page);
  assert.equal(ilk.kapali, false, 'müzik açık (?muzik=1)');
  assert.equal(ilk.acik, true, 'varsayılan ayar: müzik açık');
  assert.ok(Math.abs(ilk.ses - 0.35) < 0.001, `varsayılan ses düzeyi %35 (okunan: ${ilk.ses})`);
  assert.equal(await calan(page), null, 'ilk tıklamadan önce hiçbir parça çalmaz');
  assert.deepEqual(ilk.parcalar, [], 'dokunulmadan ses öğesi de kurulmaz');
  assert.equal(await page.locator('#yg-muzik').textContent(), 'Müzik: açık', 'üst çubuktaki müzik düğmesi');
  assert.equal(await page.locator('#yg-sound').textContent(), 'Ses: açık', 'üst çubuktaki standart ses yazısı');

  // 2) İlk tıklamadan sonra giriş ekranında sakin parça çalar ve gerçekten ilerler. Üç öğenin de kilidi açılır ama
  //    **yalnız sakin parçanın dosyası iner**: maç parçası maç başlarken yüklenir.
  await page.locator('#yg-home h1').click();
  await bekleCalsin(page, 'yakar-2-devre-arasi');
  const acilis = await durumu(page);
  assert.equal(acilis.webAudio, true, 'ses düzeyi Web Audio kazanç düğümünden geçmeli (iOS\'ta audio.volume salt okunur)');
  assert.equal(acilis.parcalar.length, 3, 'ilk dokunuşta üç parçanın da kilidi açılır (iOS için)');
  assert.deepEqual(acilis.parcalar.filter(p => p.yuklendi).map(p => p.ad), ['yakar-2-devre-arasi'],
    'menüde yalnız sakin parçanın dosyası inmeli');
  const menu = await calan(page);
  assert.equal(menu.ad, 'yakar-2-devre-arasi', 'menüde sakin parça çalar');
  assert.equal(menu.loop, true, 'tek parçalı sahne kendi kendine döner');
  const t0 = menu.currentTime;
  await page.waitForTimeout(1200);
  const menu2 = await calan(page);
  assert.ok(menu2.currentTime > t0 + 0.5, `sakin parça ilerler (${t0.toFixed(2)} → ${menu2.currentTime.toFixed(2)})`);
  assert.ok(menu2.seviye > 0.3 && menu2.seviye <= 0.36, `ses düzeyi ~%35 (okunan: ${menu2.seviye})`);
  olcum.menu = { parca: menu2.ad, currentTime: +menu2.currentTime.toFixed(2), seviye: menu2.seviye, paused: menu2.paused };

  // 3) Maç başlayınca ana temaya geçilir; sakin parça susar. Geçiş 1,8 sn çapraz süzülmedir.
  await page.locator('#yg-start').click();
  await page.waitForFunction(() => window.__yakarGol.state().started, null, { timeout: 20000 });
  await bekleCalsin(page, 'yakar-1-spor-marsi');
  const mac = await calan(page);
  assert.equal(mac.ad, 'yakar-1-spor-marsi', 'maç başlayınca ana temaya geçilir');
  assert.equal((await durumu(page)).sahne, 'mac', 'müzik sahnesi: maç');
  await bekleSussun(page, 'yakar-2-devre-arasi');
  const sakin = (await durumu(page)).parcalar.find(p => p.ad === 'yakar-2-devre-arasi');
  assert.ok(sakin.paused, 'sakin parça maçta susar');
  olcum.mac = { parca: mac.ad, currentTime: +mac.currentTime.toFixed(2), seviye: mac.seviye, sakinDurdu: sakin.paused };

  // 4) Son dakika (saatte 60 sn kaldı): heyecan parçası devralır.
  await page.evaluate(() => { window.__yakarGol.world().time = 300 - 30; });
  await bekleCalsin(page, 'yakar-3-son-dakika');
  const doruk = await calan(page);
  assert.equal(doruk.ad, 'yakar-3-son-dakika', 'son dakikada heyecan parçasına geçilir');
  assert.equal((await durumu(page)).sahne, 'doruk', 'müzik sahnesi: doruk');
  assert.equal(doruk.loop, false, 'iki parçalı sahnede döngü yok: sırayla çalınır');
  olcum.doruk = { parca: doruk.ad, currentTime: +doruk.currentTime.toFixed(2), seviye: doruk.seviye };

  // 4b) Parça bitmeden öbürü üstüne açılır: heyecan ↔ ana tema sırayla gider, araya sessizlik girmez.
  await page.evaluate(() => {
    const a = [...document.querySelectorAll('audio')].find(x => x.dataset.parca === 'yakar-3-son-dakika');
    a.currentTime = Math.max(0, a.duration - 2.4);
  });
  await bekleCalsin(page, 'yakar-1-spor-marsi', 0.1);
  await bekleSussun(page, 'yakar-3-son-dakika');
  const devir = await calan(page);
  assert.equal(devir.ad, 'yakar-1-spor-marsi', 'heyecan parçası bitince ana tema devralır');
  olcum.devir = { parca: devir.ad, currentTime: +devir.currentTime.toFixed(2) };

  // 5) Mola = devre arası: Esc sakin parçaya döner. Molanın üstünde açılan Kontroller perdesi müziği oynatmamalı
  //    (perde saydamdır: altındaki ekran moladır, bkz. src/main.js altEkran).
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('#yg-pause').isVisible(), 'Esc duraklatma menüsünü açar');
  assert.equal(await page.locator('#yg-resume').textContent(), 'DEVAM ET →', 'standart ilk düğme');
  await bekleCalsin(page, 'yakar-2-devre-arasi');
  assert.equal((await durumu(page)).sahne, 'sakin', 'molada devre arası parçası çalar');
  await page.locator('#yg-pause-help').click();
  await page.waitForTimeout(900);
  assert.equal((await page.evaluate(() => window.__yakarGol.state().screen)), 'help', 'Kontroller perdesi açıldı');
  assert.equal((await durumu(page)).sahne, 'sakin', 'Kontroller molanın üstünde açılınca müzik maç parçasına atlamamalı');
  await page.keyboard.press('Escape'); // perdeyi kapat: mola geri gelir
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.__yakarGol.state().screen), 'pause', 'Kontroller kapanınca molaya dönülür');
  const molaSonrasi = await calan(page);
  assert.equal(molaSonrasi.ad, 'yakar-2-devre-arasi', 'Kontroller kapanınca hâlâ devre arası parçası');
  olcum.mola = { parca: molaSonrasi.ad, sahne: 'sakin', kontrollerEtkisi: 'yok' };

  // 5b) Efekt sesi düğmesi müziği etkilemez: ikisi bağımsızdır.
  await page.locator('#yg-pause-sound').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('yg.sound')), 'off', 'efekt sesi kapandı');
  await page.waitForTimeout(600);
  const efektSonrasi = await calan(page);
  assert.ok(efektSonrasi && efektSonrasi.seviye > 0.3, 'efekt sesi kapanınca müzik durmamalı: ' + JSON.stringify(efektSonrasi));
  assert.equal((await durumu(page)).acik, true, 'müzik ayarı efekt düğmesinden etkilenmez');
  await page.locator('#yg-pause-sound').click(); // efekt sesini geri aç
  olcum.efektBagimsiz = { parca: efektSonrasi.ad, seviye: efektSonrasi.seviye };

  // 6) "Müzik: kapalı": duraklatma menüsünden kapat, müzik dursun; yeniden açınca **kaldığı yerden** sürsün.
  await page.locator('#yg-pause-muzik').click();
  assert.equal(await page.locator('#yg-pause-muzik').textContent(), 'Müzik: kapalı', 'düğme kapalıyı gösterir');
  assert.equal(await page.locator('#yg-muzik').textContent(), 'Müzik: kapalı', 'üst çubuktaki düğme de aynı durumu gösterir');
  await page.waitForFunction(() => window.__yakarGol.muzik().parcalar.every(p => p.paused || p.seviye === 0), null, { timeout: 8000 });
  const kapaliyken = (await durumu(page)).parcalar;
  assert.ok(kapaliyken.every(p => p.paused || p.seviye === 0), 'müzik kapanınca hiçbir parça duyulmaz');
  assert.equal(await page.evaluate(() => localStorage.getItem('yg.muzik')), 'off', 'ayar tarayıcıda saklanır');
  const durdugunuYer = kapaliyken.find(p => p.ad === 'yakar-2-devre-arasi').currentTime;
  assert.ok(durdugunuYer > 0.5, 'kapanan parça başa sarmamalı');
  olcum.kapali = kapaliyken.map(p => ({ parca: p.ad, paused: p.paused, seviye: p.seviye }));

  await page.locator('#yg-pause-muzik').click(); // yeniden aç: aynı sahnenin parçası kaldığı yerden sürer
  await bekleCalsin(page, 'yakar-2-devre-arasi', durdugunuYer);
  const sureni = await calan(page);
  assert.equal(sureni.ad, 'yakar-2-devre-arasi', 'yeniden açınca aynı sahnenin parçası döner');
  assert.ok(sureni.currentTime >= durdugunuYer, `kaldığı yerden sürmeli (${durdugunuYer.toFixed(2)} → ${sureni.currentTime.toFixed(2)})`);
  olcum.yenidenAcma = { parca: sureni.ad, durdugu: +durdugunuYer.toFixed(2), devam: +sureni.currentTime.toFixed(2) };

  // 6b) Ayar sayfa yenilenince korunur ve kapalıyken hiç ses öğesi kurulmaz.
  await page.locator('#yg-pause-muzik').click(); // yeniden kapat
  await page.goto(url + '/?test=1&muzik=1');
  await hazir(page);
  assert.equal((await durumu(page)).acik, false, 'yenilemeden sonra müzik kapalı');
  assert.equal(await page.locator('#yg-muzik').textContent(), 'Müzik: kapalı', 'yenilemeden sonra düğme de kapalı yazar');
  await page.locator('#yg-home h1').click();
  await page.waitForTimeout(2500);
  assert.equal(await calan(page), null, 'müzik kapalıyken tıklamadan sonra da hiç çalmaz');
  assert.deepEqual((await durumu(page)).parcalar, [], 'müzik kapalıyken ses öğesi de kurulmaz');
  olcum.yenilemeKorudu = { acik: false, sesOgesi: 0 };

  // Ayarı geri aç: aynı tarayıcı profilinde kalan "kapalı" sonraki koşuyu şaşırtmasın. Düğmeye basmak da bir
  // kullanıcı girdisidir: kilitler orada açılır ve müzik hemen başlar.
  await page.locator('#yg-muzik').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('yg.muzik')), 'on', 'ayar geri açılabilir');
  await bekleCalsin(page, 'yakar-2-devre-arasi');

  // 7) Gösteri kipi: video betiği müziğini kendi ekler, oyun hiç ses öğesi kurmaz.
  await page.goto(url + '/?gosteri=1');
  await hazir(page);
  await page.mouse.click(640, 360);
  await page.waitForTimeout(2000);
  assert.equal((await durumu(page)).kapali, true, 'gösteride müzik kapalıdır');
  assert.equal(await page.evaluate(() => document.querySelectorAll('audio').length), 0, '?gosteri=1 sayfasında hiç <audio> öğesi yok');
  olcum.gosteri = { kapali: true, sesOgesi: 0 };

  assert.deepEqual(errors, [], 'sayfa hatasız');
  await ctx.close();

  // ---------------------------------------------------------------- 2) Telefon, dokunmatik
  // Müzik **ilk** dokunuşta başlamalı: dinlenen olay parmağın kalktığı andır. Maç parçası da ilk dokunuşta kilidi
  // açılan öğeden çalar — çizim döngüsünden başlatıldığı için iOS'ta kilidi açılmamış öğe engellenirdi.
  const telCtx = await browser.newContext({ viewport: { width: 750, height: 342 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const telPage = await telCtx.newPage(), telHata = [];
  telPage.on('pageerror', e => telHata.push(e.message));
  telPage.on('console', e => { if (e.type() === 'error') telHata.push(e.text()); });
  await telPage.goto(url + '/?test=1&muzik=1');
  await hazir(telPage);
  assert.equal(await calan(telPage), null, 'dokunmadan önce telefonda da hiçbir şey çalmaz');

  await telPage.tap('#yg-home h1'); // **tek** dokunuş
  await bekleCalsin(telPage, 'yakar-2-devre-arasi');
  const tel = await calan(telPage);
  const telDurum = await durumu(telPage);
  assert.equal(telDurum.parcalar.length, 3, 'ilk dokunuşta üç parçanın da kilidi açılmalı');
  assert.ok(tel.currentTime > 0.2, `ilk dokunuşta müzik başlamalı (currentTime: ${tel.currentTime})`);
  olcum.dokunmatik = { dokunusSayisi: 1, parca: tel.ad, currentTime: +tel.currentTime.toFixed(2), seviye: tel.seviye, kilitliOge: telDurum.parcalar.length };

  // Maç parçası çizim döngüsünden başlar (dokunuşun dışından): kilidi açıldığı için burada da çalar.
  await telPage.tap('#yg-start');
  await telPage.waitForFunction(() => window.__yakarGol.state().started, null, { timeout: 20000 });
  await bekleCalsin(telPage, 'yakar-1-spor-marsi');
  const telMac = await calan(telPage);
  assert.equal(telMac.ad, 'yakar-1-spor-marsi', 'telefonda maç parçası da çalmalı');
  olcum.dokunmatikMac = { parca: telMac.ad, currentTime: +telMac.currentTime.toFixed(2), seviye: telMac.seviye };
  assert.deepEqual(telHata, [], 'telefon sayfası hatasız');
  await telCtx.close();

  console.log(JSON.stringify(olcum, null, 2));
  console.log('Müzik dumanı testi geçti (fare + dokunmatik).');
} finally {
  await browser.close();
  kapat();
}
