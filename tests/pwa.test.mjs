// "Ana ekrana ekle": oyun ana ekrandan açılınca tam ekran ve yatay başlar, adres çubuğu hiç çıkmaz. Bunun için
// manifest.webmanifest + simgeler gerekir, index.html bunlara bağlanmalı ve **iki dağıtım yolu da** (yerel/tünel
// sunucusu ile Cloudflare'e ve Play Store paketine giden dist/ derlemesi) bu dosyaları vermelidir. Dosyalardan biri
// listelerden düşerse ana ekran kısayolu sessizce sıradan bir sekme gibi açılır — bu test tam olarak onu yakalar.
//
// Simgelerde SVG tek başına yetmez, bu yüzden PNG'ler de ölçülür: iOS `apple-touch-icon` SVG kabul etmez (simge
// yerine sayfanın ekran görüntüsü çıkar), Chrome Android'in "uygulama olarak yükle" ölçütü 192 ve 512 px PNG ister.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const oku = ad => readFile(path.join(root, ad), 'utf8');

/** Ana ekran simgelerinin PNG'leri: dosya adı → beklenen kenar uzunluğu. */
const PNG_SIMGELER = { 'icon-192.png': 192, 'icon-512.png': 512, 'icon-maskable-512.png': 512, 'apple-touch-icon.png': 180 };
/** Dosya gerçekten PNG mi ve kaç piksel (IHDR başlığından; uzantıyı değiştirmek yetmesin diye bayta bakılır)? */
async function pngOlcu(ad) {
  const b = await readFile(path.join(root, ad));
  assert.deepEqual([...b.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${ad} PNG değil`);
  return { en: b.readUInt32BE(16), boy: b.readUInt32BE(20) };
}

test('manifest ana ekranda tam ekran + yatay açılmayı ister', async () => {
  const m = JSON.parse(await oku('manifest.webmanifest'));
  assert.equal(m.display, 'fullscreen');
  assert.deepEqual(m.display_override, ['fullscreen', 'standalone']);
  assert.equal(m.orientation, 'landscape');
  assert.equal(m.start_url, '/');
  assert.equal(m.scope, '/');
  assert.ok(m.name && m.short_name, 'ana ekran adı yok');
  assert.ok(m.icons?.length, 'simge yok');
});

test('manifestteki simgeler Android yükleme ölçütünü karşılar: 192 ve 512 px PNG, biri maskeli', async () => {
  const { icons } = JSON.parse(await oku('manifest.webmanifest'));
  // Yalnız SVG ile Chrome Android oyunu uygulama olarak yüklemeyebilir; o zaman kısayol adres çubuklu bir sekmedir.
  const png = icons.filter(i => i.type === 'image/png');
  for (const olcu of ['192x192', '512x512']) {
    assert.ok(png.some(i => i.sizes === olcu && (i.purpose ?? 'any').split(/\s+/).includes('any')),
      `manifestte purpose:any ${olcu} PNG simge yok: Android "uygulama olarak yükle" demeyebilir`);
  }
  // Maskeli simge ayrı dosya olmalı: Android çizimi daireye kırpar, kenara kadar dolu simge kesilir.
  const maskeli = png.find(i => (i.purpose ?? '').split(/\s+/).includes('maskable'));
  assert.ok(maskeli, 'maskeli PNG simge yok: Android kısayolu kırpılır');
  assert.notEqual(maskeli.src, png.find(i => (i.purpose ?? 'any').split(/\s+/).includes('any'))?.src,
    'maskeli simge ile normal simge aynı dosya: kırpma çizimi keser');

  // Manifestte yazan her simge gerçekten var ve bildirdiği ölçüde.
  for (const i of icons) {
    assert.ok(i.src.startsWith('/'), `${i.src} kök yoldan verilmeli`);
    const ad = i.src.slice(1);
    if (i.type !== 'image/png') continue;
    assert.ok(ad in PNG_SIMGELER, `${ad} testteki simge listesinde yok`);
    const { en, boy } = await pngOlcu(ad);
    assert.equal(`${en}x${boy}`, i.sizes, `${ad} manifestte ${i.sizes} yazıyor ama ${en}x${boy}`);
  }
});

test('icon.svg ana ekran simgesi olarak kullanılabilir', async () => {
  const svg = await oku('icon.svg');
  assert.match(svg, /<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, 'xmlns yok: tarayıcı simgeyi çizmez');
  assert.match(svg, /viewBox="0 0 100 100"/);
});

test('apple-touch-icon.png iOS ölçüsünde gerçek bir PNG', async () => {
  // iOS SVG kabul etmez ve 180x180 ister; olmazsa ana ekrana simge yerine sayfanın küçültülmüş görüntüsü düşer.
  const { en, boy } = await pngOlcu('apple-touch-icon.png');
  assert.deepEqual([en, boy], [180, 180]);
});

test('index.html manifeste, simgeye ve iOS tam ekran meta etiketlerine bağlanır', async () => {
  const html = await oku('index.html');
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png">/);
  assert.match(html, /<link rel="icon" href="\/icon\.svg" type="image\/svg\+xml">/);
  // iOS'ta manifest okunmaz: ana ekrandan tam ekran açılış bu iki metaya bağlı.
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/);
  assert.match(html, /<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">/);
  assert.match(html, /<meta name="mobile-web-app-capable" content="yes">/);
  // Üst çubuktaki tam ekran düğmesi (bkz. src/main.js, style.css, tests/mobil-tam-ekran.mjs).
  assert.match(html, /<button id="yg-full"/);
});

test('sunucu ve dist derlemesi manifest ile bütün simgeleri verir', async () => {
  // Simgenin biri listeden düşerse ana ekran kısayolu sessizce bozulur: Android yükleme ölçütü ya da iOS simgesi gider.
  const dosyalar = ['manifest.webmanifest', 'icon.svg', ...Object.keys(PNG_SIMGELER)];

  const server = await oku('server.mjs');
  const rootFiles = server.match(/const rootFiles = \[([\s\S]*?)\];/)?.[1] ?? '';
  for (const f of dosyalar) assert.ok(rootFiles.includes(`'${f}'`), `server.mjs rootFiles içinde ${f} yok`);
  // Yanlış MIME türüyle verilen manifesti Chrome yok sayar, SVG ile PNG'yi de indirmeye çevirir.
  assert.match(server, /'\.webmanifest': 'application\/manifest\+json/);
  assert.match(server, /'\.svg': 'image\/svg\+xml/);
  assert.match(server, /'\.png': 'image\/png/);

  const build = await oku(path.join('scripts', 'build-web.mjs'));
  const kopya = build.match(/for \(const f of \[([\s\S]*?)\]\) await cp/)?.[1] ?? '';
  for (const f of dosyalar) assert.ok(kopya.includes(`'${f}'`), `build-web.mjs kopya listesinde ${f} yok`);
});

test('tam ekran düğmesi uygulamada ve masaüstünde görünmez, maç başlayınca gizlenir', async () => {
  // Düğme JOS-696'da iki kez sorun çıkarmıştı: Play Store uygulamasında da duruyordu ve dar yatay telefonda skor
  // tabelasının üstüne biniyordu. Çözüm iki kuralda: `tam-ekran` sınıfı yalnız telefon tarayıcısında verilir
  // (isApp değil), ve düğme maç sırasında `← josephuz.com` gibi gizlenir — tabelayla hiç yan yana gelmez.
  const main = await oku(path.join('src', 'main.js'));
  assert.match(main, /classList\.toggle\('tam-ekran', touch && !isApp\(\) && fullscreenSupported\(\)\)/);
  const ui = await oku(path.join('src', 'ui.js'));
  assert.match(ui, /el\.full\.hidden = playing/, 'maç başlayınca tam ekran düğmesi gizlenmeli');
  const css = await oku('style.css');
  assert.match(css, /#yakar-gol #yg-full\{display:none\}/, 'düğme öntanımlı olarak kapalı olmalı');
  // Kimlikli seçici `[hidden]`i yenerdi: gizleme kuralı `:not([hidden])` ile korunur.
  assert.match(css, /#yakar-gol\.tam-ekran #yg-full:not\(\[hidden\]\)\{display:block/);
});
