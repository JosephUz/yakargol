// "Ana ekrana ekle": oyun ana ekrandan açılınca tam ekran ve yatay başlar, adres çubuğu hiç çıkmaz. Bunun için
// manifest.webmanifest + icon.svg gerekir, index.html bunlara bağlanmalı ve **iki dağıtım yolu da** (yerel/tünel
// sunucusu ile Cloudflare'e ve Play Store paketine giden dist/ derlemesi) bu dosyaları vermelidir. Dosyalardan biri
// listelerden düşerse ana ekran kısayolu sessizce sıradan bir sekme gibi açılır — bu test tam olarak onu yakalar.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const oku = ad => readFile(path.join(root, ad), 'utf8');

test('manifest ana ekranda tam ekran + yatay açılmayı ister', async () => {
  const m = JSON.parse(await oku('manifest.webmanifest'));
  assert.equal(m.display, 'fullscreen');
  assert.deepEqual(m.display_override, ['fullscreen', 'standalone']);
  assert.equal(m.orientation, 'landscape');
  assert.equal(m.start_url, '/');
  assert.equal(m.scope, '/');
  assert.ok(m.name && m.short_name, 'ana ekran adı yok');
  assert.ok(m.icons?.length, 'simge yok');
  for (const i of m.icons) assert.equal(i.src, '/icon.svg');
  assert.ok(m.icons.some(i => i.purpose === 'maskable'), 'maskeli simge yok: Android kısayolu kırpılır');
});

test('icon.svg ana ekran simgesi olarak kullanılabilir', async () => {
  const svg = await oku('icon.svg');
  assert.match(svg, /<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, 'xmlns yok: tarayıcı simgeyi çizmez');
  assert.match(svg, /viewBox="0 0 100 100"/);
});

test('index.html manifeste, simgeye ve iOS tam ekran meta etiketlerine bağlanır', async () => {
  const html = await oku('index.html');
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/icon\.svg">/);
  assert.match(html, /<link rel="icon" href="\/icon\.svg" type="image\/svg\+xml">/);
  // iOS'ta manifest okunmaz: ana ekrandan tam ekran açılış bu iki metaya bağlı.
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/);
  assert.match(html, /<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">/);
  assert.match(html, /<meta name="mobile-web-app-capable" content="yes">/);
  // Üst çubuktaki tam ekran düğmesi (bkz. src/main.js, style.css, tests/mobil-tam-ekran.mjs).
  assert.match(html, /<button id="yg-full"/);
});

test('sunucu ve dist derlemesi manifest ile simgeyi verir', async () => {
  const server = await oku('server.mjs');
  const rootFiles = server.match(/const rootFiles = \[(.*?)\];/)?.[1] ?? '';
  for (const f of ['manifest.webmanifest', 'icon.svg']) assert.ok(rootFiles.includes(f), `server.mjs rootFiles içinde ${f} yok`);
  // Yanlış MIME türüyle verilen manifesti Chrome yok sayar, SVG'yi de indirmeye çevirir.
  assert.match(server, /'\.webmanifest': 'application\/manifest\+json/);
  assert.match(server, /'\.svg': 'image\/svg\+xml/);

  const build = await oku(path.join('scripts', 'build-web.mjs'));
  const kopya = build.match(/for \(const f of \[(.*?)\]\) await cp/)?.[1] ?? '';
  for (const f of ['manifest.webmanifest', 'icon.svg']) assert.ok(kopya.includes(f), `build-web.mjs kopya listesinde ${f} yok`);
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
