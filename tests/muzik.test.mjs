// Oyun içi müzik (bkz. src/muzik.js): hangi sahnede hangi parçanın çaldığı, parçaların gerçekten durduğu ve **iki
// dağıtım yolunun da** (yerel/tünel sunucusu ile Cloudflare'e ve Play Store paketine giden dist/ derlemesi) müziği
// verdiği. Biri listeden düşerse oyun sessiz kalır ya da 404 alır — bu test tam olarak onu yakalar.
//
// Ayrıca STANDART üst araç çubuğu ve duraklatma menüsünün sırası: bütün JosephUz oyunlarında aynı olmalı
// (← josephuz.com · Ses · Müzik · Kontroller F1). Tarayıcı ölçümleri tests/muzik-smoke.mjs dosyasındadır.
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { MATCH } from '../src/config.js';
import { DORUK, sahneSec } from '../src/muzik.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const oku = ad => readFile(path.join(root, ad), 'utf8');
/** Parça adı → sahnesi; LISANS.txt ve src/muzik.js bu üçünü de tanımalı. */
const PARCALAR = ['yakar-1-spor-marsi', 'yakar-2-devre-arasi', 'yakar-3-son-dakika'];
/** Dünya taslağı: saatte `kalan` saniye var. */
const dunya = (kalan, ek = {}) => ({ time: MATCH.duration - kalan, overtime: false, winner: null, ...ek });

test('sahne seçimi: menü, lobi, mola ve karne sakin; maç ana tema; son dakika ve altın gol heyecan', () => {
  assert.equal(sahneSec(false, 'home', null), 'sakin', 'giriş ekranı');
  assert.equal(sahneSec(false, 'lobby', dunya(300)), 'sakin', 'lobi');
  assert.equal(sahneSec(true, 'pause', dunya(120)), 'sakin', 'mola = devre arası');
  assert.equal(sahneSec(true, 'results', dunya(0)), 'sakin', 'maç sonu karnesi');
  assert.equal(sahneSec(true, null, { ...dunya(0), winner: 1 }), 'sakin', 'maç bittiyse karne parçası');

  assert.equal(sahneSec(true, null, dunya(300)), 'mac', 'maç başı');
  assert.equal(sahneSec(true, 'help', dunya(120)), 'mac', 'yardım perdesi maçın üstünde açılır: müzik maçın');
  assert.equal(sahneSec(true, null, dunya(DORUK + 1)), 'mac', 'son dakikaya bir saniye var');
  assert.equal(sahneSec(true, null, dunya(DORUK)), 'doruk', 'son dakika');
  assert.equal(sahneSec(true, null, dunya(5)), 'doruk');
  assert.equal(sahneSec(true, null, dunya(-30, { overtime: true })), 'doruk', 'altın gol');
});

test('parçalar yerinde: 128 kbps, dosya başı 3 MB altı, lisans notu yanında', async () => {
  for (const ad of PARCALAR) {
    const bilgi = await stat(path.join(root, 'muzik', ad + '.mp3'));
    assert.ok(bilgi.size > 500_000, `${ad}.mp3 eksik ya da bozuk (${bilgi.size} bayt)`);
    assert.ok(bilgi.size <= 3 * 1024 * 1024, `${ad}.mp3 3 MB'tan büyük (${bilgi.size} bayt)`);
  }
  const lisans = await oku('muzik/LISANS.txt');
  assert.match(lisans, /© 2026 JosephUz/);
  assert.match(lisans, /VSCO 2 Community Edition \(CC0\)/);
  for (const ad of PARCALAR) assert.ok(lisans.includes(ad + '.mp3'), `LISANS.txt ${ad} parçasını saymıyor`);
});

test('müzik iki dağıtım yolunda da verilir: sunucu ve dist/ derlemesi', async () => {
  const sunucu = await oku('server.mjs');
  assert.match(sunucu, /assetDirs = \['src', 'muzik'\]/, 'server.mjs muzik/ klasörünü servis etmeli');
  assert.match(sunucu, /'\.mp3': 'audio\/mpeg'/, 'mp3 içerik türü tanımlı olmalı');
  assert.match(sunucu, /Accept-Ranges/, 'ses dosyalarında Range desteklenmeli');
  const derleme = await oku('scripts/build-web.mjs');
  assert.match(derleme, /'muzik'\), path\.join\(dist, 'muzik'\)/, 'build-web.mjs muzik/ klasörünü dist/ altına kopyalamalı');
});

test('gösteri kipleri ve otomatik tarayıcılar sessiz: muzik.js hiç <audio> kurmaz', async () => {
  const kaynak = await oku('src/muzik.js');
  assert.match(kaynak, /if \(gosteriAcik\(\)\) return true/, '?gosteri=... müziği her durumda kapatmalı');
  assert.match(kaynak, /navigator\.webdriver/, 'Playwright gibi otomatik tarayıcılar sessiz olmalı');
});

test('STANDART üst araç çubuğu: ← josephuz.com · Ses · Müzik · Kontroller F1 (bu sırayla)', async () => {
  const html = await oku('index.html');
  const cubuk = html.slice(html.indexOf('<div class="header-actions">'), html.indexOf('</div>', html.indexOf('<div class="header-actions">')));
  const sira = [...cubuk.matchAll(/id="(yg-[a-z-]+)"/g)].map(m => m[1]);
  assert.deepEqual(sira.slice(0, 4), ['yg-site', 'yg-sound', 'yg-muzik', 'yg-help-open'],
    'standart dörtlü bu sırayla başta olmalı; oyuna özgü düğmeler sonra gelir');
  assert.ok(cubuk.includes('>Ses: açık<'), 'ses düğmesinin yazısı "Ses: açık" olmalı ("Ses açık" değil)');
  assert.ok(cubuk.includes('>Müzik: açık<'), 'müzik düğmesinin yazısı "Müzik: açık" olmalı');
  assert.ok(/>Kontroller <kbd>F1<\/kbd></.test(cubuk), 'yardım düğmesi "Kontroller F1" olmalı ("Nasıl oynanır" değil)');
});

test('STANDART duraklatma menüsü: DEVAM ET → · Kontroller F1 · Ses · Müzik · … · josephuz.com\'a dön', async () => {
  const html = await oku('index.html');
  const kart = html.slice(html.indexOf('<section id="yg-pause"'), html.indexOf('</section>', html.indexOf('<section id="yg-pause"')));
  const sira = [...kart.matchAll(/id="(yg-[a-z-]+)"/g)].map(m => m[1]).filter(id => id !== 'yg-muzik-ses' && id !== 'yg-muzik-yuzde' && id !== 'yg-pause-note');
  assert.deepEqual(sira, ['yg-pause', 'yg-resume', 'yg-pause-help', 'yg-pause-sound', 'yg-pause-muzik', 'yg-muzik-row', 'yg-restart', 'yg-menu'],
    'duraklatma menüsünün sırası standart olmalı');
  assert.ok(kart.includes('>DEVAM ET →<'), 'ilk düğme "DEVAM ET →" olmalı');
  assert.ok(kart.includes("josephuz.com'a dön"), 'menünün sonunda josephuz.com bağlantısı olmalı');
});
