import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * "Ana ekrana ekle" simgelerinin PNG'leri. Tek çizim kaynağı `icon.svg`: burada yalnız ölçülendirilip taranır.
 * SVG tek başına yetmiyor, iki yerde PNG şart:
 *   - iOS "Ana Ekrana Ekle" `apple-touch-icon` için SVG kabul etmez; PNG yoksa ana ekrana simge yerine sayfanın
 *     küçültülmüş ekran görüntüsünü koyar.
 *   - Chrome Android'in "uygulama olarak yükle" ölçütü 192 ve 512 px PNG ister; yalnız SVG ile kısayol sıradan bir
 *     sekme gibi açılabilir, o zaman adres çubuğu geri gelir — yani görevin asıl amacı kaçar.
 * Maskeli (maskable) simge ayrı dosya: Android simgeyi daireye/squircle'a kırpar, çizim ortadaki %80'lik güvenli
 * dairede durmalı. icon.svg'nin içeriği %85 ölçekle yerleştirilerek bu daireye sığdırılır, kenarlar zemin rengiyle
 * dolar — kırpma neyi keserse kessin yalnız zemin gider.
 *
 * Yalnızca simge değişince elle çalıştırılır (üretilen PNG'ler depoya girer):
 *   node scripts/ikon-web.mjs        (Playwright ve Chrome gerekir; PLAYWRIGHT ortam değişkeni playwright paketinin
 *                                     yolu, CHROME ise chrome.exe yolu — bkz. scripts/icons.mjs)
 */
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BG = '#193d39';
const icon = readFileSync(path.join(root, 'icon.svg'), 'utf8');

// Windows yolu import() ile çalışmaz: file:// adresine çevrilir (zaten file:// ile verilmişse olduğu gibi kalır).
const paket = process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(!paket ? 'playwright' : paket.startsWith('file:') ? paket : pathToFileURL(paket).href);
const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage();

/** icon.svg'yi `oran` kadarıyla, kalanı zemin rengiyle dolu bir kareye çizip PNG yazar. */
async function png(ad, olcu, oran = 1) {
  await page.setViewportSize({ width: olcu, height: olcu });
  await page.setContent(`<html><body style="margin:0">
    <div style="width:${olcu}px;height:${olcu}px;background:${BG};display:flex;align-items:center;justify-content:center">
      <div style="width:${oran * 100}%;height:${oran * 100}%">${icon}</div>
    </div>
    <style>svg{display:block;width:100%;height:100%}</style>
  </body></html>`);
  const dosya = path.join(root, ad);
  writeFileSync(dosya, await page.screenshot());
  console.log(`${ad} hazır (${olcu}x${olcu})`);
}

// purpose:"any" — kenarına kadar çizim; tarayıcı kendi çerçevesini uygular.
await png('icon-192.png', 192);
await png('icon-512.png', 512);
// purpose:"maskable" — çizim ortadaki güvenli dairede, kenarlar zemin.
await png('icon-maskable-512.png', 512, 0.85);
// iOS: 180x180, saydamlık yok (iPhone köşeleri kendi yuvarlar).
await png('apple-touch-icon.png', 180);

await browser.close();
