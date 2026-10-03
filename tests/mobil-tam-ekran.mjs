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
import { mkdir } from 'node:fs/promises';
import { glArgs, oyunSunucusu, playwright } from './ortam.mjs';

// Dar yatay telefon (iPhone SE / 8, yatay): üst çubuğun en sıkıştığı ölçü. Düğme burada yer bulursa her yerde bulur.
const EKRAN = { width: 667, height: 375 };
// Duraklatma menüsünün en sıkıştığı ölçü: iPhone 13 yatay (CSS px). Gece testi menüyü burada ölçer.
const DAR = { width: 750, height: 342 };

const { chromium } = await playwright();
const { url, kapat } = await oyunSunucusu();

await mkdir('artifacts', { recursive: true });
// Donanım GL yoksa SWIFTSHADER=1 ile yazılım çizimi; sahne bu testte ölçülmüyor, yalnız arayüz kutuları sayılıyor.
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', ...glArgs()] });

/** İki kutu kesişiyor mu (üst üste binme). */
const binisiyor = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
/** Sayfadan bir elemanın kutusu ve görünürlüğü. */
const OLC = `sec => { const n = document.querySelector(sec); if (!n) return null;
  const r = n.getBoundingClientRect(), s = getComputedStyle(n);
  return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom),
    gorunur: s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 }; }`;

/**
 * Duraklatma menüsünün ölçüsü: kart kaydırmasız sığıyor mu, ekrandan taşıyor mu ve her satırın **merkezine gerçekten
 * dokunulabiliyor mu**. Sonuncusu gece testinin "ortulu" bulgusunun aynısıdır: kart `overflow:auto` olduğu için
 * görünen alanının dışında kalan düğmenin merkezine dokunulunca dokunuş kartın (ya da perdenin) kendisine gider.
 */
const molaOlc = p => p.evaluate(() => {
  const kart = document.querySelector('#yg-pause .card'), r = kart.getBoundingClientRect();
  return {
    kaydirma: kart.scrollHeight - kart.clientHeight,
    tasma: Math.max(0, Math.round(r.bottom - innerHeight), Math.round(-r.top)),
    satirlar: [...kart.children].filter(n => getComputedStyle(n).display !== 'none').map(n => {
      const b = n.getBoundingClientRect(), ust = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return { et: n.id || n.textContent.trim(), etiket: n.tagName, yukseklik: Math.round(b.height), ulasilir: n === ust || n.contains(ust) };
    }),
  };
});
/** Gece testinin "ortulu" ve "kucuk" bulgularının karşılığı: menünün her satırına dokunulabilmeli. */
function molaDenetle(o, ekran) {
  assert.equal(o.kaydirma, 0, `${ekran}: duraklatma menüsü kaydırma istiyor (${o.kaydirma} px) — görünen alanın dışındaki düğmeye dokunulamaz`);
  assert.equal(o.tasma, 0, `${ekran}: duraklatma kartı ekrandan taşıyor (${o.tasma} px)`);
  for (const s of o.satirlar) {
    assert.ok(s.ulasilir, `${ekran}: "${s.et}" satırının merkezine dokunulamıyor (üstünü başka bir öğe örtüyor)`);
    if (s.etiket === 'BUTTON' || s.etiket === 'A') {
      assert.ok(s.yukseklik >= 24, `${ekran}: "${s.et}" düğmesi ${s.yukseklik} px — dokunma hedefi en az 24 px olmalı (WCAG 2.5.8)`);
    }
  }
}

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
  // 2b) Standart duraklatma menüsü dar yatay telefonda bütünüyle görünmeli: en alttaki "josephuz.com'a dön"
  //     kaydırmadan okunsun (menü JOS-844'te Kontroller, Müzik ve ses sürgüsüyle uzadı).
  await page.tap('#yg-pause-open');
  await page.waitForTimeout(400);
  const molaKart = await olc('#yg-pause .card'), molaSon = await olc("#yg-pause a.btn");
  const molaDugmeler = await page.evaluate(() => [...document.querySelectorAll('#yg-pause .card > button, #yg-pause .card > a')]
    .filter(n => getComputedStyle(n).display !== 'none').map(n => n.id || n.textContent.trim()));
  await page.screenshot({ path: 'artifacts/mobil-duraklatma.png' });
  console.log(JSON.stringify({ molaKart, molaSon, molaDugmeler, mola: await molaOlc(page) }));
  assert.deepEqual(molaDugmeler, ['yg-resume', 'yg-pause-help', 'yg-pause-sound', 'yg-pause-muzik', 'yg-restart', 'yg-menu', "josephuz.com'a dön"],
    'duraklatma menüsünün sırası standart olmalı');
  assert.ok(molaSon.bottom <= EKRAN.height, `duraklatma menüsünün son düğmesi ekrandan taşıyor (${molaSon.bottom} > ${EKRAN.height})`);
  assert.ok(molaKart.bottom <= EKRAN.height, 'duraklatma kartı ekrandan taşıyor');
  molaDenetle(await molaOlc(page), `${EKRAN.width}x${EKRAN.height}`);

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

  // 5) Duraklatma menüsünün en sıkıştığı ölçü: iPhone 13 yatay (750x342 CSS px) — gece testi menüyü burada ölçüyor ve
  //    JOS-844'ün ilk denemesinde "josephuz.com'a dön" kartın görünen alanının dışında kalıyordu (bulgu: ortulu).
  //    Çevrim içi menü de ayrı ölçülür: orada "Yeniden başlat" gider, yerine mola notu gelir — o da sığmalı.
  for (const cevrimici of [false, true]) {
    const darCtx = await browser.newContext({ viewport: DAR, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const darPage = await darCtx.newPage();
    await darPage.goto(url + '/?test=1');
    await darPage.waitForFunction(() => !!window.__yakarGol);
    await darPage.tap('#yg-start');
    await darPage.waitForTimeout(700);
    await darPage.evaluate(() => document.fullscreenElement && document.exitFullscreen());
    await darPage.tap('#yg-pause-open');
    await darPage.waitForTimeout(400);
    // Çevrim içi menünün ayrımı: "Yeniden başlat" gizlenir, mola notu görünür (bkz. src/main.js show).
    if (cevrimici) await darPage.evaluate(() => { document.querySelector('#yg-restart').hidden = true; document.querySelector('#yg-pause-note').hidden = false; });
    const darMola = await molaOlc(darPage);
    console.log(JSON.stringify({ dar: `${DAR.width}x${DAR.height}`, cevrimici, darMola }));
    if (!cevrimici) await darPage.screenshot({ path: 'artifacts/mobil-duraklatma-dar.png' });
    molaDenetle(darMola, `${DAR.width}x${DAR.height}${cevrimici ? ' (çevrim içi)' : ''}`);
    await darCtx.close();
  }

  console.log(`Tam ekran düğmesi dar yatay telefonda (${EKRAN.width}x${EKRAN.height}) yerinde: giriş ekranında var, maçta yok, uygulamada hiç yok.`);
  console.log('Standart üst araç çubuğu (← josephuz.com · Ses · Müzik · Kontroller F1) yatayda ve dikeyde tek satır, taşma yok.');
  console.log(`Standart duraklatma menüsü ${DAR.width}x${DAR.height} ekranda da kaydırmasız sığıyor, her satırına dokunulabiliyor (çevrim dışı ve çevrim içi).`);
} finally {
  await browser.close();
  kapat();
}
