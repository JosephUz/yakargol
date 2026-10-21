/**
 * Ağ sözlüğü: istemci ile sunucunun ortak mesaj adları. Çerçeveler JSON ({ t: <ad>, ... }). Sunucu otoriterdir: maçı
 * o koşturur; istemci yalnızca girdi yollar, durum paketi (bkz. snapshot.js) ve olay alır.
 */
export const C2S = {
  HELLO: 'hello',   // { nick, token } — bağlantı kimliği; token varsa eski koltuğa geri bağlanır
  CREATE: 'create', // { priv } — oda kur (kuran olursun); istemci herkese açık kurar, özelliği bekleme odasında SETTINGS değiştirir
  SETTINGS: 'settings', // { priv } — yalnızca kuran: oda ayarı (Yakar Gol'de yalnız ODA: Herkese açık / Özel); özel oda listede görünmez
  JOIN: 'join',     // { code } — sunucu kodu normCode ile düzeltir (kprt4 → KPRT-4)
  ROOMS: 'rooms',   // açık oda listesini iste (odada değilken liste değişince kendiliğinden de gelir)
  QUICK: 'quick',   // hızlı katıl: boş koltuğu olan en uygun açık odaya otur; uygun oda yoksa yeni (açık) oda kur
  SEAT: 'seat',     // { slot } — boş koltuğa otur (0-4 mavi, 5-9 turuncu; 4 ve 9 kaleci)
  MOVE: 'move',     // { id, slot } — yalnızca kuran: oyuncuyu koltuğa taşır, koltuk doluysa ikisi yer değiştirir
  START: 'start',   // yalnızca kuran
  LEAVE: 'leave',
  INPUT: 'in',      // { mv: [x, z], aim: [x, z], hold (sol tık basılı), h2 (sağ tık basılı, top sende), e: 'basışlar' } — bkz. EDGES
  AIM: 'aim',       // yakar pas nişanını başlat (sağ tık basılı, top sende); bırakınca girdide 'f' basışı
  PING: 'ping',
};
export const S2C = {
  WELCOME: 'welcome', // { id, token, nick }
  LOBBY: 'lobby',     // { code, hostId, state, priv, seats: [{ id, nick, online } | null] x10 }
  ROOMS: 'rooms',     // { list: [{ code, host, n, state }] } — açık odalar (özel değil, boş koltuklu); n: oturan oyuncu
  ERROR: 'error',     // { msg }
  START: 'start',     // { you, names: [..10], humans: [..10] } — maç başladı (ya da ortasına katıldın)
  SNAP: 's',          // durum paketi + o ana kadar biriken olaylar (bkz. snapshot.js)
  END: 'end',         // { score, winner, stats: [..10] }
  PONG: 'pong',
  ONLINE: 'on',       // { n } — çevrim içi (açık sekme) sayısı, değişince
};
/** Tek harfle gönderilen basışlar (girdi paketindeki e alanı): şut bas / bırak, sağ tık, koşu, pas, zıplama, yakar pas. */
export const EDGES = { t: 'tap', r: 'release', s: 'secondary', h: 'sprint', p: 'pass', j: 'jump', f: 'fire' };
export const NET = {
  /** Simülasyon adımı (sn) ve kaç adımda bir durum paketi (2 → saniyede 30). */
  step: 1 / 60, snapshotEvery: 2,
  /** Görüntü sunucunun bu kadar gerisinden, iki paket arası ara değerle çizilir (sn). */
  interp: 0.1,
  /** Kendi oyuncun beklemesin: yerel girdiden üretilen öne kayma (en çok leadMax birim), yumuşatma süresi (sn). */
  leadMax: 1.2, leadSmooth: 0.08,
  /** Girdi gönderim aralığı (sn); basış olunca beklemeden gider. */
  inputEvery: 1 / 30,
  /** Sunucu saatinin yumuşatması (paket titremesi çizime yansımasın); fark clockJump'ı aşarsa doğrudan kurulur. */
  clockSmooth: 0.1, clockJump: 0.5,
  /** Cloudflare boşta bağlantıyı kapatmasın: bu aralıkta ping (sn). */
  keepAlive: 20,
  /** Oda en çok 10 kişi (5v5); koltuk sayısı. */
  seats: 10,
};
export const roomCode = () => {
  const A = 'ABCDEFGHJKLMNPRSTUVYZ', D = '23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return `${s}-${D[Math.floor(Math.random() * D.length)]}`;
};
/**
 * Yazılan oda kodunu standart biçime getirir (josephuz docs/oda-standardi.md §5): büyük harf, boşluksuz; tiresiz yazılan
 * `KPRT4` → `KPRT-4`. Biçime uymayan kod olduğu gibi (büyük harfle) döner; sunucu "Böyle bir oda yok" der.
 */
export const normCode = raw => {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8);
  const m = /^([A-Z]{4})-?([0-9])$/.exec(s);
  return m ? `${m[1]}-${m[2]}` : s;
};
