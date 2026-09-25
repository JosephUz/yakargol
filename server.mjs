import http from 'node:http';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

/**
 * Tek süreç, tek port: statik dosyalar (oyun). Proje klasöründeki oyun dosyaları, src/ ve three.js paketi dışında
 * hiçbir dosyaya erişim yok. Ağ oyunu yok; simülasyon tarayıcıda koşar.
 */
const root = path.dirname(fileURLToPath(import.meta.url));
const vendorDir = path.join(root, 'node_modules', 'three', 'build');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
const rootFiles = ['index.html', 'style.css', 'game.js'];
/** Oyun dosyaları önbelleğe alınmaz: tek bir sürüm vardır ve güncelleme anında geçmelidir. */
const noStore = 'no-store, no-cache, must-revalidate, max-age=0';
/** Sürüm damgası: en yeni oyun dosyasının değişme zamanı; /health ile hangi yapının ayakta olduğu görülür. */
async function buildStamp() {
  let newest = 0;
  const walk = async dir => {
    let list = []; try { list = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const d of list) {
      const full = path.join(dir, d.name);
      if (d.isDirectory()) await walk(full);
      else if (/\.(js|mjs|css|html)$/.test(d.name)) { try { newest = Math.max(newest, (await stat(full)).mtimeMs); } catch { /* yok */ } }
    }
  };
  for (const f of [...rootFiles, 'server.mjs']) { try { newest = Math.max(newest, (await stat(path.join(root, f))).mtimeMs); } catch { /* yok */ } }
  await walk(path.join(root, 'src'));
  return new Date(newest).toISOString();
}
let stamp = 'bilinmiyor';

function resolveFile(pathname) {
  if (pathname === '/') pathname = '/index.html';
  const rel = path.normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  if (rel.includes('..')) return null;
  if (rel.startsWith('vendor' + path.sep) || rel.startsWith('vendor/')) {
    const file = path.join(vendorDir, path.basename(rel));
    return file.startsWith(vendorDir) ? file : null;
  }
  const top = rel.split(/[\\/]/)[0];
  if (top === rel && !rootFiles.includes(rel)) return null;
  if (top !== rel && top !== 'src') return null;
  return path.join(root, rel);
}

const port = Number(process.env.PORT || 5186);
const host = process.env.HOST || '127.0.0.1';
const address = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`;
/**
 * Çevrim içi sayısı: açık her sekme `POST /presence?id=<sekme>` ile PRESENCE.beat saniyede bir haber verir, kapanırken
 * `bye=1` gönderir. Son PRESENCE.ttl saniyede haber veren sekmeler /health → online alanında sayılır (josephuz.com
 * bu sayıyı gösterir). Kimlik rastgele sekme kimliğidir; başka bilgi tutulmaz. Android uygulaması oyunu kendi içinden
 * (https://localhost) açtığı için /presence her kökene açıktır (CORS); yanıt gövdesizdir, başka uç açılmaz.
 */
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Max-Age': '86400' };
const PRESENCE = { ttl: 45, max: 5000 };
const presence = new Map();
const onlineCount = () => {
  const cutoff = Date.now() - PRESENCE.ttl * 1000;
  for (const [id, at] of presence) if (at < cutoff) presence.delete(id);
  return presence.size;
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, address);
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': types['.json'], 'Cache-Control': noStore });
    res.end(JSON.stringify({ oyun: 'Yakar Gol', online: onlineCount(), surum: stamp })); return;
  }
  if (url.pathname === '/presence' && req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
  if (url.pathname === '/presence' && req.method === 'POST') {
    const id = url.searchParams.get('id') || '';
    if (/^[a-z0-9]{8,32}$/.test(id)) {
      if (url.searchParams.has('bye')) presence.delete(id);
      else if (presence.has(id) || presence.size < PRESENCE.max) presence.set(id, Date.now());
    }
    req.resume();
    res.writeHead(204, { 'Cache-Control': noStore, ...CORS }); res.end(); return;
  }
  const file = resolveFile(url.pathname);
  const type = file && types[path.extname(file).toLowerCase()];
  if (!file || !type || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  try {
    const bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': noStore });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch {
    res.writeHead(file.startsWith(vendorDir) ? 500 : 404);
    res.end(file.startsWith(vendorDir) ? 'three.js bulunamadi. Once npm install calistirin.' : 'Not found');
  }
});

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `${port} portu kullanimda. Baska port icin PORT ortam degiskenini ayarlayin.` : error);
  process.exit(1);
});
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { console.log(sig + ': kapaniyor.'); server.close(); process.exit(0); });
buildStamp().then(s => { stamp = s; });
server.listen(port, host, () => {
  console.log(`Yakar Gol: ${address} (dinlenen: ${host}:${port})\nDurdurmak icin Ctrl+C.`);
  if (process.argv.includes('--open')) {
    const child = spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process '${address}'`], { windowsHide: true, stdio: 'ignore' });
    child.on('error', console.error);
  }
});
