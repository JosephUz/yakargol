import { GOSTERI } from './config.js';
import { clamp } from './math.js';
import { isApp } from './platform.js';

/**
 * **Gösteri kipi** (`?gosteri=1`): içerik klipleri için "kendi kendine oynayan" maç. Yalnız tarayıcıda açılır, oyunun
 * normal davranışına hiç dokunmaz.
 *  - Menü ve lobi atlanır, doğrudan maç başlar: on koltuğun hepsi bottur (`p.human = false`, bkz. world.js step —
 *    insan işareti olmayan her oyuncuyu botInput sürer), insan koltuğunu da aynı yapay zekâ oynar.
 *  - Başlama beklemeleri kısalır ve botlar saldırganlaşır (GOSTERI.bot, bkz. ai.js): ilk saniyelerde ekranda aksiyon olur.
 *    Yakar pas hakkı bollaşır ki klip boyunca yakar pas, ağır çekim ve kayma bitmesin.
 *  - Kamera topun ve çevresindeki kalabalığın ağırlık merkezini yumuşakça izler; kadraj telefon ekranı için yakındır
 *    (GOSTERI.iso). Mevcut yakar pas sineması (donuk → ağır çekim → çarpma) gösteride de çalışır: onu main.js yürütür.
 *  - Arayüz gizlidir (bkz. style.css `.gosteri`), ölçüm (olcum.js) gitmez, sunucuya bağlanılmaz (bkz. main.js).
 *  - Maç bitince karne açılmaz: GOSTERI.yenidenBasla saniye sonra yeni maç kurulur, kip girdisiz döner.
 *  - Her maç rastgele tohumla kurulur (tohum): art arda çekilen klipler aynı maçın tekrarı olmaz.
 * Uygulamada (isApp) açılmaz: Play Store sürümüne yeni bir kip girmez.
 *
 * `?gosteri` adresinin ikinci sahnesi `?gosteri=ruzgar`dır (gosteri-ruzgar.js): maç değil, rüzgar şutunu anlatan
 * sahnelenmiş bir vuruş. Arayüzün gizlenmesi, girdinin okunmaması, ölçümün ve ağın kesilmesi iki sahnede de ortaktır;
 * hangisinin açık olduğunu aşağıdaki `gosteriKip` söyler.
 */

/**
 * Hangi gösteri sahnesi açık: `'mac'` (`?gosteri=1`, bu dosyadaki kendi kendine oynayan maç), `'ruzgar'`
 * (`?gosteri=ruzgar`, rüzgar şutunu anlatan sahnelenmiş vuruş — bkz. gosteri-ruzgar.js) ya da `null` (kapalı).
 * Uygulamada (isApp) her ikisi de kapalıdır.
 */
export function gosteriKip() {
  if (isApp()) return null;
  const v = new URLSearchParams(location.search).get('gosteri');
  if (v === null || v === '0') return null;
  return v === 'ruzgar' ? 'ruzgar' : 'mac';
}

/** Herhangi bir gösteri sahnesi açık mı (arayüzü gizleyen, girdiyi ve ölçümü kesen ortak kurallar için). */
export const gosteriAcik = () => gosteriKip() !== null;

export function createGosteri() {
  const K = GOSTERI.kamera;
  // Kameraya verilen sahte "oyuncu": yalnız konumu değişir, kalan alanlar view/camera.js'in beklediği durgun değerler.
  const odakNokta = { x: 0, z: 0, angle: 0, team: 0, role: 0, burn: 0, stun: 0, air: 0, jump: 0, sprint: 0, vx: 0, vz: 0 };
  let bitisTimer = 0, yapis = true;

  /**
   * Yeni maçın tohumu (createWorld'e verilir). Gösteride girdi yok ve adım süresi sabit: maç sabit tohumla
   * (MATCH.seed) kurulsa her gösteri maçı — sayfa yenilense bile — aynı maçın birebir tekrarı olur, klipler
   * birbirinin kopyası çıkardı. Bu yüzden her maça rastgele tohum verilir. Yalnız bu kipe özeldir: normal oyun ve
   * testler MATCH.seed'in belirliliğini kullanmayı sürdürür.
   */
  const tohum = () => (Math.random() * 0x100000000) >>> 0;

  /** Yeni maç: her koltuk bot, kısa başlama beklemesi, bol yakar pas hakkı; kamera ilk karede aksiyona yapışır. */
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

  return { tohum, kur, odak, guncelle, nokta };
}
