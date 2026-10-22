// "Rüzgar ile Ateş" gösteri sahnesi dumanı testi (?gosteri=ruzgar-ates): dikey short için baştan sona sahnelenmiş
// anlatım çalışıyor mu? Denetlenenler: menü atlanır ve sahne kurulur, kamera omuz üstüdür, top gökten (kameranın
// olduğu yükseklikten) sahanın ortasına iner, 3,75'te iki oyuncu yanlardan kayarak gelir, yandan görünüşte soldaki
// rüzgar sağdaki yakar pas yüklemesi yapar ve iki yükleme aynı topta görünür, 11,25'te top kameranın lensine
// yapışır, 12,19'da iki takım beşer oyuncuyla dizilir ve ortada "YAKAR GOL" başlığı açılır, sahne dönüp yeniden
// kurulur, arayüz gizlidir, sunucuya WebSocket açılmaz, ölçüm isteği gitmez ve öbür gösteri kipleri ile normal
// oyun bu sahneden etkilenmez. Dönüm noktaları müziğin işaretlerinden (muzik/short/liste.json) 0,1 sn'den fazla
// kaymamalıdır: kayarsa çekim müziğe oturmaz.
// Playwright ve sunucu ortam değişkeni olmadan da bulunur (bkz. tests/ortam.mjs) — Kalite Kapısı çıplak koşturur.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { glArgs, oyunSunucusu, playwright } from './ortam.mjs';

/** Müziğin işaretleri (calisma/icerik/muzik/short/liste.json → short-yakar-gol-ruzgar-ile-ates.isaretler). */
const ISARET = { inis: 3.75, yapisma: 11.25, takimlar: 12.19 };
const PAY = 0.1;

const { chromium } = await playwright();
const sunucu = await oyunSunucusu();
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--disable-gpu-sandbox', ...glArgs()] });
try {
  const ctx = await browser.newContext({ viewport: { width: 540, height: 960 } });
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
  const sahne = () => game(() => window.__gosteri);
  const bekle = (fn, ms = 30000) => page.waitForFunction(fn, null, { timeout: ms });
  /** Sahne saati verilen saniyeyi geçene kadar bekler (gerçek zamanla değil sahnenin saatiyle). */
  const saniyeyeKadar = (sn, ms = 40000) => page.waitForFunction(s => window.__gosteri.saniye >= s, sn, { timeout: ms, polling: 50 });

  await page.goto(sunucu.url + '/?dil=tr&gosteri=ruzgar-ates&muzik=0');
  await bekle(() => window.__yakarGol && window.__yakarGol.state().started);
  await bekle(() => window.__gosteri && window.__gosteri.evre);

  // 1) Menü atlanır, arayüz gizlenir, kamera omuz üstüdür (sahne 3B anlatım ister, izometrik yayın kamerası değil).
  assert.ok(await page.locator('#yg-home').isHidden(), 'giriş ekranı açılmaz');
  assert.ok(await game(() => document.getElementById('yakar-gol').classList.contains('gosteri')), 'gösteri sınıfı eklenir');
  assert.ok(await game(() => window.__yakarGol.state().gosteri), 'gösteri kipi açık');
  assert.equal(await game(() => window.__yakarGol.view().cameraMode), 'shoulder', 'kamera omuz üstü (izometrik değil)');
  assert.ok(await page.locator('#yg-scoreboard').isHidden(), 'skor tabelası gizli');
  assert.equal(await game(() => window.__gosteri.dizilis.sol + '-' + window.__gosteri.dizilis.sag), '5-5', 'iki takım beşer oyuncu');

  // 2) Düşüş: top kameranın olduğu yükseklikten iner, sahipsizdir ve kimse kaymaz.
  await saniyeyeKadar(0.8);
  const dusus = await game(() => ({ ...window.__gosteri, top: { ...window.__yakarGol.world().ball },
    kayan: window.__yakarGol.world().players.filter(p => p.dash > 0).length }));
  assert.equal(dusus.evre, 'dusus', '0,8. saniyede top hâlâ iniyor');
  assert.ok(dusus.top.yuk > 2, `top havada (yükseklik ${dusus.top.yuk.toFixed(2)})`);
  assert.equal(dusus.top.owner, null, 'inen top kimsenin ayağında değil');
  assert.equal(dusus.kayan, 0, 'top inmeden kimse kaymaz');
  assert.ok(dusus.top.vx !== 0 || dusus.top.vz !== 0, 'düşen top yatay hızıyla yuvarlanır (görsel dönüş)');
  await page.screenshot({ path: 'artifacts/gosteri-ates-1-dusus.png' });

  /**
   * Düşüşün fiziği (Yusuf'un 8 Ekim notu: sekmeleri vuruşlara zorlamak yapay duruyordu). Müziğe hizalanan tek
   * nokta ilk temastır; kalan sekmeleri sabit yerçekimi ve enerji kaybı belirler, yani her sekme bir öncekinden
   * **daha alçak** olmalı ve aradaki süreler **kısalmalı**. Son temastan sonra top `inis`e kadar yuvarlanır.
   */
  const fizik = await sahne();
  assert.ok(Math.abs(fizik.temaslar[0] - 1.40625) <= 0.01, `ilk temas müziğin vuruşunda (${fizik.temaslar[0]} sn)`);
  assert.ok(fizik.temaslar.length >= 3, `top birkaç kez sekiyor (${fizik.temaslar.length} temas)`);
  assert.ok(fizik.temaslar[fizik.temaslar.length - 1] <= 3.75, 'son temas inişten önce');
  const aralar = fizik.temaslar.slice(1).map((s, i) => s - fizik.temaslar[i]);
  for (let i = 1; i < aralar.length; i++) assert.ok(aralar[i] < aralar[i - 1], `sekme araları kısalıyor (${aralar.map(a => a.toFixed(2)).join(' > ')})`);
  for (let i = 1; i < fizik.sekmeYuksek.length; i++) {
    assert.ok(fizik.sekmeYuksek[i] < fizik.sekmeYuksek[i - 1], `her sekme bir öncekinden alçak (${fizik.sekmeYuksek.join(' > ')})`);
  }

  // Sekme kadrajda da görünür: ilk iki temas arasında top gerçekten havalanır.
  await saniyeyeKadar((fizik.temaslar[0] + fizik.temaslar[1]) / 2);
  const sekme = await game(() => ({ yuk: window.__yakarGol.world().ball.yuk, evre: window.__gosteri.evre }));
  assert.equal(sekme.evre, 'dusus', 'sekmeler iniş evresinde');
  assert.ok(sekme.yuk > 1, `top yere çarpıp sekiyor (${sekme.yuk.toFixed(2)} birim havada)`);

  // 3) İniş ve kayma: 3,75'te iki oyuncu biri soldan biri sağdan topun yanına gelir.
  await saniyeyeKadar(4.6);
  const inis = await game(() => {
    const w = window.__yakarGol.world(), g = window.__gosteri;
    const sol = w.players.find(p => p.team === 0 && Math.abs(p.z) < 0.01 && Math.abs(p.x) < 3);
    const sag = w.players.find(p => p.team === 1 && Math.abs(p.z) < 0.01 && Math.abs(p.x) < 3);
    return { g, sol: sol && { x: sol.x, aura: window.__yakarGol.view().aura(sol.id) },
      sag: sag && { x: sag.x, aura: window.__yakarGol.view().aura(sag.id) }, top: { ...w.ball } };
  });
  assert.ok(Math.abs(inis.g.inisAt - ISARET.inis) <= PAY, `top müziğin vuruşunda durur (${inis.g.inisAt.toFixed(2)} sn)`);
  assert.ok(inis.sol && inis.sol.x < 0, 'bir oyuncu topun solunda');
  assert.ok(inis.sag && inis.sag.x > 0, 'öbür oyuncu topun sağında');
  assert.ok(Math.abs(inis.top.x) < 0.01 && inis.top.yuk < 1, 'top tam ikisinin ortasında, yerde');
  assert.ok(inis.sol.aura.wind, 'soldaki rüzgar şutu yüklüyor');
  assert.ok(!inis.sol.aura.fire, 'soldaki yakar pas yüklemiyor');
  assert.ok(inis.sag.aura.fire, 'sağdaki yakar pas yüklüyor');
  assert.ok(!inis.sag.aura.wind, 'sağdaki rüzgar yüklemiyor');
  // İki yükleme **aynı karede** başlar (Yusuf, 8 Ekim: sırayla gelen sahneleme kaldırıldı).
  assert.equal(inis.g.ruzgarBas, inis.g.atesBas, `iki yükleme aynı anda başlar (${inis.g.ruzgarBas.toFixed(2)} sn)`);
  assert.ok(Math.abs(inis.g.ruzgarBas - ISARET.inis) <= PAY, 'yüklemeler topun durduğu karede başlar');

  // 4) Yandan yükleme: son barlarda iki yükleme aynı topta, ikisi de tam dolu.
  await saniyeyeKadar(10.2);
  const yukleme = await game(() => {
    const w = window.__yakarGol.world(), v = window.__yakarGol.view();
    const sol = w.players.find(p => p.team === 0 && Math.abs(p.z) < 0.01 && Math.abs(p.x) < 3);
    const sag = w.players.find(p => p.team === 1 && Math.abs(p.z) < 0.01 && Math.abs(p.x) < 3);
    return { g: window.__gosteri, sol: v.aura(sol.id), sag: v.aura(sag.id),
      alev: v.flames.visible, ruzgar: v.gusts.visible,
      ruzgarDolum: sol.sahneDolum.wind, atesDolum: sag.sahneDolum.fire };
  });
  assert.ok(yukleme.sol.wind && !yukleme.sol.fire, 'soldaki yalnız rüzgar yüklüyor');
  assert.ok(yukleme.sag.fire && !yukleme.sag.wind, 'sağdaki yalnız yakar pas yüklüyor');
  assert.ok(yukleme.alev && yukleme.ruzgar, 'iki efekt aynı topta: alevler ve rüzgar halkaları birlikte görünür');
  assert.equal(yukleme.ruzgarDolum.toFixed(3), yukleme.atesDolum.toFixed(3), 'iki yükleme birlikte büyür (dolumları eşit)');
  assert.ok(yukleme.g.enDolum >= 0.85, `iki yükleme de tam dolar (en az ${yukleme.g.enDolum.toFixed(2)})`);
  await page.screenshot({ path: 'artifacts/gosteri-ates-2-yukleme.png' });

  // 5) Yapışma: 11,25'te top kameranın lensine gelir (1 birimden yakın) ve ekranı kaplar.
  await saniyeyeKadar(11.7);
  const yapisma = await sahne();
  assert.ok(Math.abs(yapisma.yapismaAt - ISARET.yapisma) <= PAY, `top müziğin darbesinde lense yapışır (${yapisma.yapismaAt.toFixed(2)} sn)`);
  assert.ok(yapisma.yapismaKare > 0, 'yapışma evresi gerçekten çizilir');
  assert.ok(yapisma.lensUzak <= 1, `top kameranın lensine yapışır (${yapisma.lensUzak.toFixed(2)} birim)`);
  assert.ok(yapisma.enYukseklik > 5, `top gökten iner (en yüksek ${yapisma.enYukseklik.toFixed(1)} birim)`);

  // 6) Kapanış: 12,19'da solda 5 sağda 5 oyuncu dizilir, ortada "YAKAR GOL" başlığı.
  await saniyeyeKadar(13.2);
  const kapanis = await game(() => {
    const w = window.__yakarGol.world(), b = document.getElementById('yg-gosteri-baslik');
    return { g: window.__gosteri,
      sol: w.players.filter(p => p.team === 0 && p.x < 0).length,
      sag: w.players.filter(p => p.team === 1 && p.x > 0).length,
      baslik: b.textContent, gizli: b.hidden, saydam: Number(b.style.opacity) };
  });
  assert.ok(Math.abs(kapanis.g.takimlarAt - ISARET.takimlar) <= PAY, `diziliş müziğin temasında açılır (${kapanis.g.takimlarAt.toFixed(2)} sn)`);
  assert.equal(kapanis.g.evre, 'takimlar', 'kapanış evresi');
  assert.equal(kapanis.sol, 5, 'solda mavi takımın beş oyuncusu');
  assert.equal(kapanis.sag, 5, 'sağda turuncu takımın beş oyuncusu');
  assert.equal(kapanis.baslik, 'YAKAR GOL', 'ortada büyük YAKAR GOL başlığı');
  assert.ok(!kapanis.gizli && kapanis.saydam > 0.9, 'başlık açılmış ve tam görünür');
  await page.screenshot({ path: 'artifacts/gosteri-ates-3-takimlar.png' });

  // 7) Sahne takılmaz: tur bitince baştan kurulur (tarayıcıda açık bırakıldığında döner durur).
  await bekle(() => window.__gosteri.tur >= 2, 20000);
  assert.ok((await sahne()).saniye < 2, 'yeni tur baştan başlar');

  // 8) Ne ağ ne ölçüm ne de sayfa hatası.
  assert.equal(await game(() => window.__sockets), 0, 'bu sahnede sunucuya bağlanılmaz');
  assert.equal(await game(() => window.__olcum), 0, 'bu sahnede ölçüm olayı gitmez');
  assert.deepEqual(errors, [], 'sayfa hatasız');

  // 9) Girdi sahneyi bozmaz: tuş ve tıklama mola / yardım perdesi açmaz.
  await page.keyboard.press('Escape'); await page.keyboard.press('F1'); await page.mouse.click(270, 480);
  await page.waitForTimeout(400);
  assert.equal(await game(() => window.__yakarGol.state().screen), null, 'girdi perde açmaz');

  // 10) Öbür kipler değişmedi: `?gosteri=ruzgar` kendi sahnesini kurar, `?gosteri=1` izometrik maç kalır; ikisinde de
  //     bu sahnenin başlığı ve ölçüm kancası yok.
  for (const [adres, kamera] of [['/?gosteri=ruzgar', 'shoulder'], ['/?gosteri=1', 'iso']]) {
    const oburu = await ctx.newPage(), hata = [];
    oburu.on('pageerror', e => hata.push(e.message));
    oburu.on('console', e => { if (e.type() === 'error') hata.push(e.text()); });
    await oburu.goto(sunucu.url + adres);
    await oburu.waitForFunction(() => window.__yakarGol && window.__yakarGol.state().started, null, { timeout: 20000 });
    assert.equal(await oburu.evaluate(() => window.__yakarGol.view().cameraMode), kamera, `${adres} kamerası değişmedi`);
    assert.equal(await oburu.evaluate(() => window.__gosteri), undefined, `${adres} bu sahneyi kurmaz`);
    assert.ok(await oburu.locator('#yg-gosteri-baslik').isHidden(), `${adres} ekranında kapanış başlığı çıkmaz`);
    assert.deepEqual(hata, [], `${adres} sayfası hatasız`);
    await oburu.close();
  }

  console.log('"Rüzgar ile Ateş" gösteri sahnesi dumanı testi geçti.');
} finally {
  await browser.close();
  sunucu.kapat();
}
