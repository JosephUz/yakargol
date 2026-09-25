// Giriş noktası: oyunu yükler, başarısız olursa kullanıcıya okunur bir mesaj gösterir.
const root = document.getElementById('yakar-gol');
try {
  const { start } = await import('./src/main.js');
  await start(root);
} catch (err) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#193d39;color:#f6edda;font:16px system-ui;padding:24px;text-align:center;z-index:100';
  el.textContent = 'Oyun başlatılamadı: WebGL desteğini ve yerel sunucuyu kontrol et. ' + (err && err.message ? err.message : '');
  root.appendChild(el);
  console.error(err);
}
