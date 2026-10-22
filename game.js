// Giriş noktası: oyunu yükler, başarısız olursa kullanıcıya okunur bir mesaj gösterir.
// Dil (josephuz docs/dil-standardi.md): sayfadaki data-i18n işaretleri oyun kurulmadan önce çevrilir.
import { dilUygula, dilDugmesi, t } from './src/dil.js';

const root = document.getElementById('yakar-gol');
dilUygula();
dilDugmesi(document.getElementById('dil'));
try {
  const { start } = await import('./src/main.js');
  await start(root);
} catch (err) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#193d39;color:#f6edda;font:16px system-ui;padding:24px;text-align:center;z-index:100';
  el.textContent = t('hata.baslatma') + (err && err.message ? err.message : '');
  root.appendChild(el);
  console.error(err);
}
