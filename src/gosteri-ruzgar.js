import { GOSTERI, GOSTERI_RUZGAR as R, KICK, PITCH } from './config.js';
import { KEEPER } from './lineup.js';
import { clamp } from './math.js';

/**
 * **Rüzgar şutu gösteri sahnesi** (`?gosteri=ruzgar`, yalnız tarayıcıda): içerik videosu için sahnelenmiş tek bir
 * vuruş. `?gosteri=1`den (gosteri.js) farkı: bu bir maç değil, durmadan tekrarlanan bir gösteri.
 *  - Bir bot **orta sahada** topla durur; rakipler (kaleci dahil) kaleyle onun arasına, topun yolu üstüne dizilir ve
 *    **hiç kıpırdamaz**: top çalmaz, saldırmaz. Takım arkadaşları da yanlarda durup izler. Bunun için on koltuk da
 *    "insan" işaretlenir (bkz. world.js step) ama yalnız şutçuya girdi verilir: kalan dokuzu girdisiz, yani hareketsiz
 *    kalır. Şutçunun `guard`'ı sahne boyunca açık tutulur, böylece sahnelenmiş vuruş çalınamaz (bkz. ball.js carry).
 *  - Şutçu rüzgar şutunu KICK.windCharge saniye yükler (sol tıkı basılı tutmakla birebir aynı yol: `hold` girdisi,
 *    bkz. world.js shoot), sonra nişan evresi gelir (world.js aiming); yükleme ve nişan boyunca top camgöbeğine döner
 *    ve çevresine rüzgar kıvılcımları saçılır. Nişan süresi dolunca rüzgar topu kendiliğinden çıkar, yoldaki rakipleri
 *    tek tek savurur (ball.js blow) ve gol olur.
 *  - Kamera **omuz üstüdür** (izometrik değil): şutçunun arkasından kaleye bakar, top giderken odak topun
 *    GOSTERI_RUZGAR.kamera.iz birim gerisinde yumuşakça onu izler.
 *  - İlk çarpmada ve golde kısa ağır çekim olur (GOSTERI_RUZGAR.agir); ekranda yalnız bu sahneye özel, büyük bir
 *    açıklama yazısı durur (#yg-gosteri-yazi).
 *  - Sahne golden sonra yeniden kurulur ve döner; her turda diziliş, şut yönü ve kamera açısı dünyanın tohumlu
 *    rastgelesiyle hafif değişir, böylece art arda çekilen turlar birbirinin kopyası olmaz.
 * Arayüzün gizlenmesi, girdinin okunmaması, ölçümün gitmemesi ve sunucuya bağlanılmaması `?gosteri=1` ile ortaktır
 * (bkz. main.js, style.css `.gosteri`). `?gosteri=1` ve normal oyun bu dosyadan hiç etkilenmez.
 */
const YAZI = { yukleme: 'Sol tık 1 sn basılı: RÜZGAR ŞUTU', carpma: 'Önüne çıkanı savurur!' };

export function createRuzgarGosteri(root) {
  const yaziEl = root.querySelector('#yg-gosteri-yazi');
  // Kameraya verilen sahte "oyuncu": yalnız konumu değişir, kalan alanlar view/camera.js'in beklediği durgun değerler.
  const odakNokta = { x: 0, z: 0, angle: 0, team: 0, role: 0, burn: 0, stun: 0, air: 0, jump: 0, sprint: 0, vx: 0, vz: 0 };
  let sahne = null, agir = 0, kivilcim = 0, tur = 0, goller = 0, savrulan = 0;

  /** Her tura rastgele tohum (bkz. gosteri.js): sayfa yenilense bile turlar birebir aynı olmasın. */
  const tohum = () => (Math.random() * 0x100000000) >>> 0;

  /** Maç kurulduğunda bir kez: on koltuk da bot, yakar top hakkı bol (sahne kullanmaz), sonra ilk diziliş. */
  function kur(w) {
    w.gosteri = true;
    for (const p of w.players) { p.human = true; p.name = 'Bot-' + (p.id + 1); }
    w.fireLeft = [GOSTERI.fireShots, GOSTERI.fireShots];
    tur = 0; goller = 0;
    diz(w);
  }

  /**
   * Bir turun dizilişi. Şutçu orta sahada, nişan kale ağzının içinde; rakipler şut çizgisi üstünde `dizi` oranlarında,
   * çizgiden sırayla sağa ve sola `dizi.sapma` birim kaymış (BALL.hit içinde kalır: top hepsine değer); takım
   * arkadaşları çizginin iyice yanında. Maçın sayacı, skoru ve gol patlaması her turda sıfırlanır: sahne sonsuza
   * kadar dönebilsin, maç süresi dolup karne ekranı aramasın.
   */
  function diz(w) {
    const rnd = w.random;
    Object.assign(w, { winner: null, blast: null, kickoff: 0, restart: 0, time: 0, overtime: false, nextKickoff: 0, score: [0, 0] });
    for (const p of w.players) {
      Object.assign(p, { vx: 0, vz: 0, burn: 0, stun: 0, evade: 0, pressed: false, air: 0, airMax: 1, jump: 0,
        dash: 0, sprint: 0, knock: 0, charge: 0, chargeSpent: false, energyCd: 0, kickCd: 0, guard: 0, think: 0 });
    }
    const atan = w.players[0];
    const ax = (rnd() - 0.5) * 2 * R.atan.x, az = R.atan.z + (rnd() - 0.5) * 2 * R.atan.jitter;
    const hedef = { x: (rnd() - 0.5) * 2 * R.hedef.x, z: -PITCH.halfZ - R.hedef.pay };
    const uzunluk = Math.hypot(hedef.x - ax, hedef.z - az);
    const dx = (hedef.x - ax) / uzunluk, dz = (hedef.z - az) / uzunluk, nx = -dz, nz = dx;
    atan.x = ax; atan.z = az; atan.angle = Math.atan2(dx, dz); atan.guard = R.koruma;

    const rakipler = w.players.filter(p => p.team === 1).sort((a, b) => (a.role === KEEPER ? 1 : 0) - (b.role === KEEPER ? 1 : 0));
    rakipler.forEach((p, i) => {
      const oran = R.dizi.ilk + (R.dizi.son - R.dizi.ilk) * (i / (rakipler.length - 1)) + (rnd() - 0.5) * 2 * R.dizi.jitter;
      const yan = (i % 2 ? -1 : 1) * (R.dizi.sapma[0] + rnd() * (R.dizi.sapma[1] - R.dizi.sapma[0]));
      p.x = clamp(ax + dx * oran * uzunluk + nx * yan, -PITCH.halfX + 1, PITCH.halfX - 1);
      p.z = clamp(az + dz * oran * uzunluk + nz * yan, -PITCH.halfZ + 1.5, PITCH.halfZ - 1.5);
      p.angle = Math.atan2(-dx, -dz);
    });
    const arkadaslar = w.players.filter(p => p.team === 0 && p.id !== atan.id);
    arkadaslar.forEach((p, i) => {
      const yan = (i % 2 ? -1 : 1) * (R.arkadas.x[0] + rnd() * (R.arkadas.x[1] - R.arkadas.x[0]));
      const ileri = R.arkadas.z[0] + (R.arkadas.z[1] - R.arkadas.z[0]) * (i / Math.max(1, arkadaslar.length - 1));
      p.x = clamp(ax + nx * yan + dx * ileri, -PITCH.halfX + 2, PITCH.halfX - 2);
      p.z = clamp(az + nz * yan + dz * ileri, -PITCH.halfZ + 3, PITCH.halfZ - 3);
      p.angle = Math.atan2(dx, dz);
    });
    Object.assign(w.ball, { x: atan.x, z: atan.z, vx: 0, vz: 0, owner: atan.id, last: atan.id, kind: 'normal', power: 0, lock: 0, stealLock: 0 });
    w.events.length = 0;

    tur++; agir = 0; kivilcim = 0;
    sahne = { atan: atan.id, hedef, dx, dz, yaw: Math.atan2(dx, dz) + (rnd() - 0.5) * 2 * R.kamera.sapma,
      evre: 'hazir', t: 0, carpti: false, yazi: YAZI.yukleme, yapis: true };
    yaz();
  }

  /**
   * Bu simülasyon adımının girdisi (main.js her adımda sorar). Yalnız şutçuya gider: yükleme evresinde sol tık basılı
   * (`hold`) ve nişan kaleye; kalan evrelerde kimseye girdi yok — on koltuk da "insan" olduğu için herkes durur.
   */
  function girdi(dt, w) {
    if (!sahne || sahne.evre !== 'yukleme') return { players: {} };
    return { players: { [sahne.atan]: { hold: true, aim: sahne.hedef } } };
  }

  /**
   * Simülasyon olayları (main.js consume'dan). Rüzgar şutu çıkınca uçuş evresi başlar ve topun rüzgar süresi sahne
   * için uzatılır (bkz. config.js GOSTERI_RUZGAR.ruzgar). Savrulan rakip daha uzun ve havaya savrulur, ilk çarpmada
   * ağır çekim ve ikinci açıklama yazısı gelir; golde yine ağır çekim olur ve tur biter.
   */
  function olay(e, w) {
    if (!sahne) return;
    if (e.type === 'kick' && e.kind === 'wind' && sahne.evre === 'yukleme') {
      sahne.evre = 'ucus'; sahne.t = 0;
      w.ball.power = R.ruzgar;
    }
    if (e.type === 'blow') {
      const p = w.players[e.id];
      if (p) { p.knock = R.savrulma.knock; p.air = p.airMax = R.savrulma.air; }
      savrulan++;
      if (!sahne.carpti) { sahne.carpti = true; agir = R.agir.sure; sahne.yazi = YAZI.carpma; }
    }
    if (e.type === 'goal' && sahne.evre === 'ucus') {
      sahne.evre = 'bitis'; sahne.t = 0; agir = R.agir.sure; goller++;
      // Gol patlaması tur bitene kadar sürsün: süresi dolsaydı (GOAL_BLAST.time) herkes santraya dizilir, sahne
      // yeniden kurulmadan önce bir anlığına ışınlanmış gibi görünürdü (bkz. world.js blastStep → lineUp).
      if (w.blast) w.blast.t = R.bitis + 1;
    }
  }

  /** Her kare (simülasyondan sonra, gerçek dt): evre sayacı, ağır çekim sayacı ve ekrandaki yazı. */
  function guncelle(dt, w) {
    if (!sahne) return;
    agir = Math.max(0, agir - dt);
    sahne.t += dt;
    if (sahne.evre === 'hazir' && sahne.t >= R.hazir) { sahne.evre = 'yukleme'; sahne.t = 0; }
    // Üst sınırlar güvenlik içindir: şut ya da gol beklenmedik bir durumda gelmezse sahne takılı kalmasın, yeniden kurulsun.
    else if (sahne.evre === 'yukleme' && sahne.t >= R.yuklemeEnCok) diz(w);
    else if (sahne.evre === 'ucus' && sahne.t >= R.ucusEnCok) diz(w);
    else if (sahne.evre === 'bitis' && sahne.t >= R.bitis) diz(w);
    yaz();
  }

  /** Ekrandaki açıklama yazısı (yalnız bu sahnede; yeri için bkz. style.css `#yg-gosteri-yazi`). */
  function yaz() {
    const metin = sahne ? sahne.yazi : '';
    if (yaziEl.textContent !== metin) yaziEl.textContent = metin;
    yaziEl.hidden = !metin;
  }

  /**
   * Kameranın izlediği nokta: şut çıkana kadar şutçunun kendisi, sonra topun `kamera.iz` birim gerisi — kamera topun
   * ardından kaleye doğru süzülür. Odak `sinir` içinde tutulur ki kamera ağın arkasına geçmesin. Tur kurulurken
   * hedefe yapışır, sonraki karelerde yumuşakça kayar; dt 0 ise (çizim durmuş) kıpırdamaz.
   */
  function odak(dt, w) {
    if (!sahne) return odakNokta;
    const ucusta = sahne.evre === 'ucus' || sahne.evre === 'bitis';
    const hx = clamp(ucusta ? w.ball.x - sahne.dx * R.kamera.iz : w.players[sahne.atan].x, -R.kamera.sinir.x, R.kamera.sinir.x);
    const hz = clamp(ucusta ? w.ball.z - sahne.dz * R.kamera.iz : w.players[sahne.atan].z, -R.kamera.sinir.z, R.kamera.sinir.z);
    const k = sahne.yapis ? 1 : dt > 0 ? 1 - Math.exp(-dt * R.kamera.yumusatma) : 0;
    sahne.yapis = false;
    odakNokta.x += (hx - odakNokta.x) * k;
    odakNokta.z += (hz - odakNokta.z) * k;
    return odakNokta;
  }

  /** Çizimden hemen önce: kamera bakışını kur ve yükleme sırasında şutçunun çevresine rüzgar kıvılcımı saç. */
  function cizim(dt, w, view) {
    if (!sahne) return;
    view.setLook(sahne.yaw, R.kamera.pitch);
    if (sahne.evre !== 'yukleme') return;
    kivilcim -= dt;
    if (kivilcim > 0) return;
    kivilcim = R.kivilcim;
    const p = w.players[sahne.atan];
    view.event({ type: 'blow', x: p.x, z: p.z });
  }

  /** Yüklenen vuruşun görüntüsü: ayaktaki top camgöbeğine döner ve dolum arttıkça parlar (bkz. view/ballview.js). */
  function sarj(w) {
    if (!sahne || sahne.evre !== 'yukleme' || w.ball.owner !== sahne.atan) return null;
    const p = w.players[sahne.atan], nisan = w.aim && w.aim.id === sahne.atan;
    return { kind: 'wind', p: nisan ? 1 : p.charge / KICK.windCharge, full: nisan || p.charge >= KICK.windCharge, text: '' };
  }

  /** Simülasyonun zaman ölçeği (main.js): ilk çarpmada ve golde kısa ağır çekim. */
  const bakis = () => ({ scale: agir > 0 ? R.agir.olcek : 1, heat: 0, track: false });

  /** Kameranın şu an baktığı nokta ve sahnenin durumu (yalnız okuma; testler ve hata ayıklama için). */
  const nokta = () => odakNokta;
  const durum = () => ({ evre: sahne?.evre ?? null, tur, goller, savrulan, yazi: sahne?.yazi ?? '', agir: agir > 0 });

  return { kamera: 'shoulder', omuz: R.omuz, tohum, kur, girdi, olay, guncelle, odak, cizim, sarj, bakis, nokta, durum };
}
