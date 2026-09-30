import { GOSTERI } from './config.js';
import { clamp } from './math.js';
import { isApp } from './platform.js';

/**
 * **Gösteri kipi** (`?gosteri=1`): içerik klipleri için "kendi kendine oynayan" maç. Yalnız tarayıcıda açılır, oyunun
 * normal davranışına hiç dokunmaz.
 *  - Menü ve lobi atlanır, doğrudan maç başlar: on koltuğun hepsi bottur (`p.human = false`, bkz. world.js step —
 *    insan işareti olmayan her oyuncuyu botInput sürer), insan koltuğunu da aynı yapay zekâ oynar.
 *  - Başlama beklemeleri kısalır ve botlar saldırganlaşır (GOSTERI.bot, bkz. ai.js): ilk saniyelerde ekranda aksiyon olur.
 *    Yakar top hakkı bollaşır ki klip boyunca yakar top, ağır çekim ve kayma bitmesin.
 *  - Kamera topun ve çevresindeki kalabalığın ağırlık merkezini yumuşakça izler; kadraj telefon ekranı için yakındır
 *    (GOSTERI.iso). Mevcut yakar top sineması (donuk → ağır çekim → çarpma) gösteride de çalışır: onu main.js yürütür.
 *  - Arayüz gizlidir (bkz. style.css `.gosteri`), ölçüm (olcum.js) gitmez, sunucuya bağlanılmaz (bkz. main.js).
 *  - Maç bitince karne açılmaz: GOSTERI.yenidenBasla saniye sonra yeni maç kurulur, kip girdisiz döner.
 * Uygulamada (isApp) açılmaz: Play Store sürümüne yeni bir kip girmez.
 */
export function gosteriAcik() {
  if (isApp()) return false;
  const v = new URLSearchParams(location.search).get('gosteri');
  return v !== null && v !== '0';
}

export function createGosteri() {
  const K = GOSTERI.kamera;
  // Kameraya verilen sahte "oyuncu": yalnız konumu değişir, kalan alanlar view/camera.js'in beklediği durgun değerler.
  const odakNokta = { x: 0, z: 0, angle: 0, team: 0, role: 0, burn: 0, stun: 0, air: 0, jump: 0, sprint: 0, vx: 0, vz: 0 };
  let bitisTimer = 0, yapis = true;

  /** Yeni maç: her koltuk bot, kısa başlama beklemesi, bol yakar top hakkı; kamera ilk karede aksiyona yapışır. */
  function kur(w) {
    w.gosteri = true;
    for (const p of w.players) { p.human = false; p.name = 'Bot-' + (p.id + 1); }
    w.kickoff = GOSTERI.kickoff; w.restart = GOSTERI.restart;
    w.fireLeft = [GOSTERI.fireShots, GOSTERI.fireShots];
    bitisTimer = 0; yapis = true;
    odak(0, w);
  }

  /**
   * Kamera odağı: topun ve çevresindeki oyuncuların ağırlık merkezi. Her oyuncu topa uzaklığına göre tartılır
   * (`yayilma` mesafesinde ağırlık yarıya iner), topun kendi ağırlığı `top`; böylece kamera boş sahaya değil topun
   * etrafındaki kalabalığa — kapışmanın olduğu yere — bakar. Topun hızının biraz ötesine bakılır ki uçan (ve yakar)
   * top kadrajdan kaçmasın; odak `sinir` içinde tutulur ki kadraj sahanın dışındaki boş çayıra taşmasın (bkz. config.js).
   * Maçın ilk çağrısında (kur) odak hedefe yapışır, sonraki karelerde yumuşakça kayar; dt 0 ise (çizim durmuş) kıpırdamaz.
   */
  function odak(dt, w) {
    const b = w.ball, r2 = K.yayilma * K.yayilma;
    let x = b.x * K.top, z = b.z * K.top, n = K.top;
    for (const p of w.players) {
      if (p.burn > 0) continue;
      const agirlik = 1 / (1 + ((p.x - b.x) ** 2 + (p.z - b.z) ** 2) / r2);
      x += p.x * agirlik; z += p.z * agirlik; n += agirlik;
    }
    const hx = clamp(x / n + b.vx * K.ilerisi, -K.sinir.x, K.sinir.x);
    const hz = clamp(z / n + b.vz * K.ilerisi, -K.sinir.z, K.sinir.z);
    const k = yapis ? 1 : dt > 0 ? 1 - Math.exp(-dt * K.yumusatma) : 0;
    yapis = false;
    odakNokta.x += (hx - odakNokta.x) * k;
    odakNokta.z += (hz - odakNokta.z) * k;
    return odakNokta;
  }

  /** Her kare (simülasyondan sonra): maç bittiyse yeni maçın geri sayımı. */
  function guncelle(dt, w, yeniMac) {
    if (w.winner === null) return;
    bitisTimer += dt;
    if (bitisTimer >= GOSTERI.yenidenBasla) { bitisTimer = 0; yeniMac(); }
  }

  /** Kameranın şu an baktığı nokta (yalnız okuma; testler ve hata ayıklama için). */
  const nokta = () => odakNokta;

  return { kur, odak, guncelle, nokta };
}
