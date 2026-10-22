// Oyun içi müzik (bkz. src/muzik.js). Burada ölçülenler **davranıştır**, kaynak koda uygulanan kalıplar değil:
//  - hangi sahnede hangi parçanın çalacağı (sahneSec),
//  - müziğin hangi adreste hiç kurulmayacağı (muzikKapali: gösteri kipleri ve otomatik tarayıcılar),
//  - parça dosyalarının yerinde ve boyutunda olduğu, lisans notunun onları saydığı,
//  - **iki dağıtım yolunun da** müziği gerçekten verdiği: sunucu çalıştırılıp `muzik/*.mp3` indirilir (Range isteği
//    dahil — tarayıcı akışı sürdürürken onu yollar), dist/ derlemesi koşturulup içine bakılır. Biri listeden düşerse
//    oyun sessiz kalır ya da 404 alır.
//
// 4 Ekim 2026'dan beri oyunda müzik yok (src/muzik.js `MUZIK_VAR` false, parçalar muzik/archive/ altında): parça
// dosyasına bakan ölçümler o zaman "müzik yok: atlandı" yazıp geçer, silinmez — parçalar gelince yeniden koşar.
//
// Ayrıca STANDART üst araç çubuğu ve duraklatma menüsünün sırası: bütün JosephUz oyunlarında aynı olmalı
// (← josephuz.com · Ses · Müzik · Kontroller F1). Tarayıcı ölçümleri tests/muzik-smoke.mjs dosyasındadır.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { MATCH } from '../src/config.js';
import { DORUK, MUZIK_VAR, sahneSec } from '../src/muzik.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const oku = ad => readFile(path.join(root, ad), 'utf8');
/**
 * Oyundaki parçalar; LISANS.txt ve src/muzik.js bunları tanımalı. 4 Ekim 2026'dan beri oyunda müzik yok (src/muzik.js
 * SAHNELER boş, `MUZIK_VAR` false): eski üç parça muzik/archive/ altında. Liste boşken parça ölçümleri atlanır
 * ("müzik yok: atlandı"); yeni parçalar gelince adları buraya yazılır ve ölçümler kendiliğinden geri döner.
 */
const PARCALAR = [];
/** Arşivlenen parçalar: silinmedi, yayına girmez. */
const ARSIV = ['yakar-1-spor-marsi', 'yakar-2-devre-arasi', 'yakar-3-son-dakika', 'yakar-4-mahalle-sabahi', 'yakar-5-soyunma-odasi', 'yakar-6-mactan-sonra'];
const atla = ne => console.log(`müzik yok: atlandı (${ne})`);

test('parça listesi ile src/muzik.js uyumlu: parça yoksa MUZIK_VAR false', () => {
  assert.equal(MUZIK_VAR, PARCALAR.length > 0, 'tests/muzik.test.mjs PARCALAR ile src/muzik.js SAHNELER birlikte güncellenmeli');
});
/** Dünya taslağı: saatte `kalan` saniye var. */
const dunya = (kalan, ek = {}) => ({ time: MATCH.duration - kalan, overtime: false, winner: null, ...ek });

test('sahne seçimi: menü, lobi, mola ve karne sakin; maç ana tema; son dakika ve altın gol heyecan', () => {
  assert.equal(sahneSec(false, 'home', null), 'sakin', 'giriş ekranı');
  assert.equal(sahneSec(false, 'lobby', dunya(300)), 'sakin', 'lobi');
  assert.equal(sahneSec(true, 'pause', dunya(120)), 'sakin', 'mola = devre arası');
  assert.equal(sahneSec(true, 'results', dunya(0)), 'sakin', 'maç sonu karnesi');
  assert.equal(sahneSec(true, null, { ...dunya(0), winner: 1 }), 'sakin', 'maç bittiyse karne parçası');

  assert.equal(sahneSec(true, null, dunya(300)), 'mac', 'maç başı');
  assert.equal(sahneSec(true, null, dunya(DORUK + 1)), 'mac', 'son dakikaya bir saniye var');
  assert.equal(sahneSec(true, null, dunya(DORUK)), 'doruk', 'son dakika');
  assert.equal(sahneSec(true, null, dunya(5)), 'doruk');
  assert.equal(sahneSec(true, null, dunya(-30, { overtime: true })), 'doruk', 'altın gol');

  // Kontroller perdesi saydamdır: çağıran (main.js `altEkran`) onun **altındaki** ekranı verir. Maçın üstünde
  // açılınca müzik maçın müziğidir, molanın üstünde açılınca mola sürüyor sayılır — perde müziği oynatmaz.
  assert.equal(sahneSec(true, null, dunya(120)), 'mac', 'Kontroller maçın üstünde: altındaki ekran yok → maç');
  assert.equal(sahneSec(true, 'pause', dunya(120)), 'sakin', 'Kontroller molanın üstünde: altındaki ekran mola → sakin');
});

test('müzik hangi adreste hiç kurulmaz: gösteri kipleri ve otomatik tarayıcılar sessizdir', async t => {
  const { muzikKapali } = await import('../src/muzik.js');
  const eski = { window: globalThis.window, location: globalThis.location };
  // muzik.js tarayıcı dosyasıdır: `location`, `window` ve `navigator.webdriver` burada taklit edilir.
  const kur = (arama, webdriver = false) => {
    globalThis.window = {};
    globalThis.location = { search: arama, hostname: 'localhost', protocol: 'http:', host: 'localhost' };
    Object.defineProperty(globalThis.navigator, 'webdriver', { value: webdriver, configurable: true });
  };
  t.after(() => {
    globalThis.window = eski.window; globalThis.location = eski.location;
    delete globalThis.navigator.webdriver;
  });

  kur(''); assert.equal(muzikKapali(), false, 'sıradan tarayıcıda müzik açıktır');
  kur('?gosteri=1'); assert.equal(muzikKapali(), true, 'gösteri maçı: video betiği müziğini kendi ekler');
  kur('?gosteri=ruzgar'); assert.equal(muzikKapali(), true, 'rüzgar sahnesi de sessizdir');
  kur('?gosteri=1&muzik=1'); assert.equal(muzikKapali(), true, 'gösteriyi `?muzik=1` bile açamaz');
  kur('', true); assert.equal(muzikKapali(), true, 'otomatik tarayıcı (Playwright) 6 MB ses indirmez');
  kur('?muzik=1', true); assert.equal(muzikKapali(), false, 'müziği ölçen test `?muzik=1` ile açar');
  kur('?muzik=0'); assert.equal(muzikKapali(), true, '`?muzik=0` elle kapatır');
});

test('parçalar yerinde: her biri ayrı beste, dosya başı 3 MB altı, lisans notu yanında; arşiv silinmedi', async () => {
  for (const ad of ARSIV) {
    const bilgi = await stat(path.join(root, 'muzik', 'archive', ad + '.mp3'));
    assert.ok(bilgi.size > 500_000, `muzik/archive/${ad}.mp3 eksik ya da bozuk`);
  }
  if (!MUZIK_VAR) {
    assert.match(await oku('muzik/LISANS.txt'), /şu an oyunda müzik yok/, 'LISANS.txt oyunda müzik olmadığını söylemeli');
    atla('parça dosyaları');
  }
  const izler = new Map();
  for (const ad of PARCALAR) {
    const bayt = await readFile(path.join(root, 'muzik', ad + '.mp3'));
    assert.ok(bayt.length > 500_000, `${ad}.mp3 eksik ya da bozuk (${bayt.length} bayt)`);
    assert.ok(bayt.length <= 3 * 1024 * 1024, `${ad}.mp3 3 MB'tan büyük (${bayt.length} bayt)`);
    // Üçü aynı süre ve bit hızında olduğu için **boyutları da aynı**: ayrı beste olduklarını yalnız içerik söyler.
    const iz = createHash('sha256').update(bayt).digest('hex');
    assert.ok(!izler.has(iz), `${ad}.mp3 ile ${izler.get(iz)}.mp3 aynı dosya: her parça ayrı olmalı`);
    izler.set(iz, ad);
  }
  const lisans = await oku('muzik/LISANS.txt');
  assert.match(lisans, /© 2026 JosephUz/);
  assert.match(lisans, /VSCO 2 Community Edition \(CC0\)/);
  for (const ad of PARCALAR) assert.ok(lisans.includes(ad + '.mp3'), `LISANS.txt ${ad} parçasını saymıyor`);
});

/** İşletim sisteminin verdiği boş bir port: sabit port başka bir sunucuda açık olabilir. */
const bosPort = () => new Promise((çöz, hata) => {
  const s = createServer();
  s.on('error', hata);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => çöz(port)); });
});

test('sunucu müziği gerçekten veriyor: mp3, Range isteği ve lisans notu', async t => {
  const port = await bosPort(), adres = `http://127.0.0.1:${port}`;
  const sunucu = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  t.after(() => sunucu.kill());
  const bitis = Date.now() + 20000;
  let ayakta = false;
  while (Date.now() < bitis && !ayakta) {
    try { ayakta = (await fetch(adres + '/health')).ok; } catch { await new Promise(b => setTimeout(b, 150)); }
  }
  assert.ok(ayakta, `oyun sunucusu ${adres} adresinde açılmadı`);

  assert.equal((await fetch(adres + '/muzik/LISANS.txt')).status, 200, 'lisans notu da yayımlanmalı');
  assert.equal((await fetch(adres + '/muzik/../package.json')).status, 404, 'muzik/ dışına çıkılamamalı');
  if (!MUZIK_VAR) { atla('sunucudan mp3 ve Range'); return; }

  for (const ad of PARCALAR) {
    const y = await fetch(`${adres}/muzik/${ad}.mp3`);
    assert.equal(y.status, 200, `${ad}.mp3 verilmiyor`);
    assert.equal(y.headers.get('content-type'), 'audio/mpeg');
    assert.equal(y.headers.get('accept-ranges'), 'bytes', 'ses dosyasında Range desteklenmeli');
    const bayt = Buffer.from(await y.arrayBuffer());
    assert.equal(bayt.subarray(0, 3).toString('latin1'), 'ID3', `${ad}.mp3 ID3 başlığıyla başlamıyor`);
  }
  // Tarayıcı akışı sürdürürken ya da ileri sararken `Range` yollar; karşılığı verilmezse parça baştan dinlenir.
  const tam = await readFile(path.join(root, 'muzik', PARCALAR[0] + '.mp3'));
  const dilim = await fetch(`${adres}/muzik/${PARCALAR[0]}.mp3`, { headers: { Range: 'bytes=100-199' } });
  assert.equal(dilim.status, 206, 'Range isteğine 206 dönmeli');
  assert.equal(dilim.headers.get('content-range'), `bytes 100-199/${tam.length}`);
  assert.deepEqual(Buffer.from(await dilim.arrayBuffer()), tam.subarray(100, 200), 'verilen aralık dosyanınkiyle aynı değil');
});

test('dist/ derlemesi (Cloudflare + Play Store paketi) müziği içine alıyor', async () => {
  await promisify(execFile)(process.execPath, ['scripts/build-web.mjs'], { cwd: root });
  // Arşiv yayına girmez; parça yokken dist/muzik/ içinde yalnız lisans notu kalır.
  await assert.rejects(stat(path.join(root, 'dist', 'muzik', 'archive')), 'muzik/archive/ dist/ içine girmemeli');
  if (!MUZIK_VAR) {
    assert.deepEqual(await readdir(path.join(root, 'dist', 'muzik')), ['LISANS.txt'], 'parça yokken dist/muzik/ yalnız LISANS.txt içermeli');
    atla('dist/ içindeki mp3');
  }
  for (const ad of [...PARCALAR.map(a => a + '.mp3'), 'LISANS.txt']) {
    const bilgi = await stat(path.join(root, 'dist', 'muzik', ad));
    assert.ok(bilgi.size > 0, `dist/muzik/${ad} eksik`);
  }
  // Göreli yol: Capacitor'ın `https://localhost/` kökünde de aynı dosya bulunur, bir sonraki APK'ya kendiliğinden girer.
  assert.match(await readFile(path.join(root, 'dist', 'src', 'muzik.js'), 'utf8'), /`muzik\/\$\{p\.ad\}\.mp3`/,
    'parça yolu göreli kalmalı (uygulamada kök farklıdır)');
});

test('STANDART üst araç çubuğu: ← josephuz.com · Ses · Müzik · Kontroller F1 (bu sırayla)', async () => {
  const html = await oku('index.html');
  const cubuk = html.slice(html.indexOf('<div class="header-actions">'), html.indexOf('</div>', html.indexOf('<div class="header-actions">')));
  const sira = [...cubuk.matchAll(/id="(yg-[a-z-]+)"/g)].map(m => m[1]);
  assert.deepEqual(sira.slice(0, 4), ['yg-site', 'yg-sound', 'yg-muzik', 'yg-help-open'],
    'standart dörtlü bu sırayla başta olmalı; oyuna özgü düğmeler sonra gelir');
  assert.ok(cubuk.includes('>Ses: açık<'), 'ses düğmesinin yazısı "Ses: açık" olmalı ("Ses açık" değil)');
  assert.ok(cubuk.includes('>Müzik: açık<'), 'müzik düğmesinin yazısı "Müzik: açık" olmalı');
  // Yazı dil sözlüğünden gelir (josephuz docs/dil-standardi.md; data-i18n-html'li öğenin içi boş kalır).
  assert.ok(/id="yg-help-open" data-i18n-html="arac.kontroller"/.test(cubuk), 'yardım düğmesi sözlükteki arac.kontroller yazısını almalı');
  const tr = (await import('../src/diller/tr.js')).default;
  assert.equal(tr['arac.kontroller'], 'Kontroller <kbd>F1</kbd>', 'yardım düğmesi "Kontroller F1" olmalı ("Nasıl oynanır" değil)');
  assert.ok(sira.at(-1) !== 'dil' && cubuk.trimEnd().endsWith('<button id="dil"></button>'), 'dil düğmesi çubuğun sonunda olmalı');
});

test('STANDART duraklatma menüsü: DEVAM ET → · Kontroller F1 · Ses · Müzik · … · josephuz.com\'a dön', async () => {
  const html = await oku('index.html');
  const kart = html.slice(html.indexOf('<section id="yg-pause"'), html.indexOf('</section>', html.indexOf('<section id="yg-pause"')));
  const sira = [...kart.matchAll(/id="(yg-[a-z-]+)"/g)].map(m => m[1]).filter(id => id !== 'yg-pause-note');
  assert.deepEqual(sira, ['yg-pause', 'yg-resume', 'yg-pause-help', 'yg-pause-sound', 'yg-pause-muzik', 'yg-restart', 'yg-menu'],
    'duraklatma menüsünün sırası standart olmalı');
  assert.ok(!kart.includes('type="range"'), 'menüde müzik sesi sürgüsü olmamalı (ses düzeyi sabit)');
  assert.ok(kart.includes('>DEVAM ET →<'), 'ilk düğme "DEVAM ET →" olmalı');
  assert.ok(kart.includes("josephuz.com'a dön"), 'menünün sonunda josephuz.com bağlantısı olmalı');
});
