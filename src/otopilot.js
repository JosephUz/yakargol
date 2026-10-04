import { OTOPILOT as O } from './config.js';
import { isApp } from './platform.js';

/**
 * **Otopilot** (`?otopilot=1`, yalnız tarayıcı): içerik videoları için **gerçek bir maç**, ama senin oyuncunu da bir
 * bot oynar. `?gosteri=1`den (gosteri.js) farkı, bunun bir klip sahnesi değil **oyunun kendisi** olmasıdır:
 *  - Maç normal kurallarla ve **normal bot ayarlarıyla** kurulur (gösterinin hızlandırılmış başlama beklemeleri,
 *    bollaştırılmış yakar pas hakkı ve saldırganlaştırılmış botları burada yoktur; `w.gosteri` kurulmaz, bkz. ai.js cfg).
 *  - Senin koltuğunu (`w.me`) da aynı bot yapay zekâsı oynar: `p.human` işareti kalkar, world.js step o koltuğu da
 *    botInput ile sürer — koşar, pas verir, şut atar, yakar pas yakar, kayar, zıplar. Simülasyonda hiçbir ayrıcalığı
 *    yoktur, bot bütün kararları oyuncunun verdiği girdilerle verir.
 *  - **Kamera senin oyuncundadır**: normal oyun kamerası (omuz üstü ya da izometrik). Omuz kamerasında bakışı fare
 *    yerine otopilot çevirir — oyuncunun yaptığı gibi topa doğru, yumuşakça (bkz. `bakis`).
 *  - Arayüz normal oyundaki gibi durur; menü, lobi, Kontroller perdesi, mola ve karne ekranı hiç açılmaz. Maç bitince
 *    `yenidenBasla` saniye sonra yeni maç kurulur.
 *  - Ölçüm (olcum.js) ve ağ bağlantısı yoktur, fare kilidi istenmez. Uygulamada (isApp) hiç açılmaz.
 * Normal oyun ve gösteri sahneleri bu dosyadan hiç etkilenmez.
 */
export function otopilotAcik() {
  if (isApp()) return false;
  const v = new URLSearchParams(location.search).get('otopilot');
  return v !== null && v !== '0';
}

export function createOtopilot() {
  let bitisTimer = 0;

  /** Yeni maç: senin koltuğun da bota verilir. Maçın kuralları ve bot ayarları normal oyunun aynısıdır. */
  function kur(w) {
    w.otopilot = true;
    // human işareti kalkınca world.js step bu koltuğu da botInput ile sürer (bkz. ai.js). w.me değişmez: arayüz,
    // mesajlar ve kamera hâlâ senin oyuncunu gösterir, yalnız tuşlara basan sen değilsin.
    const me = w.players[w.me];
    if (me) me.human = false;
    bitisTimer = 0;
  }

  /**
   * Omuz kamerasının bakışı: otopilotun "faresi". Oyuncunun yaptığı gibi topa döner, ama anında değil `O.bakis`
   * hızında yumuşakça — kadraj zıplamasın. İzometrik kamerada bakış dönmediği için hiçbir şey yapmaz.
   */
  function bakis(dt, w, view) {
    if (!view || view.cameraMode === 'iso' || !w.players) return;
    const p = w.players[w.me];
    if (!p || p.burn > 0) return; // yanmış oyuncu kenarda bekliyor: bakış kaldığı yerde kalsın
    const hedef = Math.atan2(w.ball.x - p.x, w.ball.z - p.z);
    const k = Math.min(1, dt * O.bakis);
    const su = view.yaw;
    view.setLook(su + Math.atan2(Math.sin(hedef - su), Math.cos(hedef - su)) * k);
  }

  /** Maç bitince karne açılmaz: `yenidenBasla` saniye sonra yeni maç kurulur, kip girdisiz döner. */
  function guncelle(dt, w, begin) {
    if (w.winner === null) { bitisTimer = 0; return; }
    bitisTimer += dt;
    if (bitisTimer >= O.yenidenBasla) { bitisTimer = 0; begin(); }
  }

  return { kur, bakis, guncelle };
}
