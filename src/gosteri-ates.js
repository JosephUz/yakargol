import { GOSTERI, GOSTERI_ATES as A, MATCH } from './config.js';
import { KEEPER } from './lineup.js';

/**
 * **"Rüzgar ile Ateş" gösteri sahnesi** (`?gosteri=ruzgar-ates`, yalnız tarayıcıda): dikey short için baştan sona
 * sahnelenmiş tek bir anlatım. `?gosteri=1` (maç) ve `?gosteri=ruzgar` (sahnelenmiş vuruş) ile farkı: burada
 * **hiçbir şeyi simülasyon sürüklemez**. On oyuncunun yeri, topun yeri ve kamera her karede sahnenin saatine göre
 * yazılır; `step` yine koşar (dünya tutarlı kalsın diye) ama girdi verilmez ve çıktısı kadraja hiç yansımaz.
 * Sebebi: görüntünün saniyesi müziğin vuruşuna çivili olmalı (bkz. config.js GOSTERI_ATES.isaret ve
 * calisma/icerik/muzik/short/liste.json). Çekim sahte saatle kare kare yapıldığı için sahne kare kare yeniden üretilir.
 *
 * Sahne (saniyeler müzikten):
 *  - **0 → 3,75** kamera sahanın sağ üst köşesinden kaleye bakar; top **lensin önünden** doğar ve hızlanarak
 *    sahanın ortasına iner. 3,05-4,05 arasında kadraj yumuşakça yan görünüşe iner.
 *  - **3,75** top yere değer; aynı anda biri soldan biri sağdan iki oyuncu **kayarak** topun yanına gelir.
 *  - **3,75 → 11,25** yandan görünüş: soldaki **rüzgar şutu**, sağdaki **yakar pas** yüklemesi yapar (oyunun kendi
 *    dolum çevreleri, bkz. view/actors.js `p.sahneDolum`); top ikisinin ortasında havalanır ve **aynı anda hem
 *    camgöbeği rüzgar halkalarına hem aleve bürünür** (bkz. view/ballview.js `charge.ates`). Önce rüzgar, sonra
 *    ateş, son iki barda ikisi birden büyür.
 *  - **11,05 → 11,25** top kameraya fırlar ve **11,25**'te lense yapışır: ekranı tamamen kaplar. Ekran kapalıyken
 *    kamera kapanış kadrajına, on oyuncu da diziliş yerine geçer (geçiş görünmez).
 *  - **11,55 → 12,19** top lensten aşağı düşer ve arkası açılır.
 *  - **12,19 → 16,2** iki takım: solda 5, sağda 5 oyuncu kameraya dönük; ortada büyük **YAKAR GOL** başlığı.
 *    16,2'den sonrası videonun josephuz.com kapanışıdır (ffmpeg, bkz. ajanlar/icerik/short-uret.mjs).
 * Arayüzün gizlenmesi, girdinin okunmaması, ölçümün gitmemesi ve sunucuya bağlanılmaması `?gosteri=1` ile ortaktır
 * (bkz. main.js, style.css `.gosteri`). Normal oyun ve öbür gösteri kipleri bu dosyadan hiç etkilenmez.
 */
const ara = (a, b, k) => a + (b - a) * k;
const birim = (t, bas, son) => (son <= bas ? (t >= son ? 1 : 0) : Math.max(0, Math.min(1, (t - bas) / (son - bas))));
const yumusak = k => k * k * (3 - 2 * k);
/** İki kadraj arasında yumuşak geçiş: altı alan da (yer + bakılan nokta) birlikte kayar. */
const kadrajAra = (a, b, k) => ({
  x: ara(a.x, b.x, k), y: ara(a.y, b.y, k), z: ara(a.z, b.z, k),
  tx: ara(a.tx, b.tx, k), ty: ara(a.ty, b.ty, k), tz: ara(a.tz, b.tz, k),
});
/** Kadrajın baktığı birim yön: topu "lensin önüne" koyarken kullanılır. */
function yon(k) {
  const dx = k.tx - k.x, dy = k.ty - k.y, dz = k.tz - k.z, u = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / u, y: dy / u, z: dz / u };
}
/** Kadrajın `uzak` birim önündeki nokta (topun lense yapıştığı yer). */
function onunde(k, uzak) {
  const f = yon(k);
  return { x: k.x + f.x * uzak, y: k.y + f.y * uzak, z: k.z + f.z * uzak };
}

export function createAtesGosteri(root) {
  const baslikEl = root.querySelector('#yg-gosteri-baslik');
  // Kameraya verilen sahte "oyuncu": bu sahnede kamera setPose ile kurulduğu için yalnız view.render'ın istediği
  // durgun alanlar lazım (hızlı koşu açısı genişlemesin diye sprint 0).
  const odakNokta = { x: 0, z: 0, angle: 0, team: 0, role: 0, burn: 0, stun: 0, air: 0, jump: 0, sprint: 0, vx: 0, vz: 0 };
  let t = 0, sol = null, sag = null, dizi = { sol: [], sag: [] }, kadraj = A.kamera.dusus, dolum = { ruzgar: 0, ates: 0 }, kivilcim = 0;
  /** Çekim betiğinin okuduğu sahne durumu (window.__gosteri): kabul ölçütü bunun üstünde işler. */
  const olcum = { saniye: 0, evre: 'dusus', inisAt: 0, yapismaAt: 0, takimlarAt: 0, enDolum: 0,
    enYukseklik: 0, lensUzak: 99, yapismaKare: 0, dizilis: { sol: 0, sag: 0 }, tur: 0 };

  /** Sahne sabit tohumla kurulur: aynı video kare kare yeniden üretilebilsin (rastgele tur yok). */
  const tohum = () => MATCH.seed;

  function kur(w) {
    w.gosteri = true;
    // On koltuğun da "insan" işaretlenmesi botları susturur (bkz. world.js step): girdi vermediğimiz için kimse
    // kıpırdamaz, konumları zaten her karede sahne yazar.
    for (const p of w.players) { p.human = true; p.name = 'Bot-' + (p.id + 1); }
    w.fireLeft = [GOSTERI.fireShots, GOSTERI.fireShots];
    // Karşılıklı duran ikili: soldaki mavi, sağdaki turuncu; ikisi de kaleci değil (kaleciler dizilişin sonunda durur).
    sol = w.players.find(p => p.team === 0 && p.role !== KEEPER);
    sag = w.players.find(p => p.team === 1 && p.role !== KEEPER);
    // Topun "sahibi" baştan sona soldaki oyuncudur: view.render dolum rengini yalnız `w.me`nin topunda çizer
    // (bkz. view/view.js → ballview.js) ve w.me varsayılan olarak 0. numaralı oyuncudur.
    w.me = sol.id;
    dizi = {
      sol: [sol, ...w.players.filter(p => p.team === 0 && p !== sol)],
      sag: [sag, ...w.players.filter(p => p.team === 1 && p !== sag)],
    };
    olcum.dizilis = { sol: dizi.sol.length, sag: dizi.sag.length };
    basla(w);
  }

  /** Turu başa sarar (yalnız tarayıcıda açık bırakıldığında ve duman testinde; çekim `bitis`te keser). */
  function basla(w) {
    t = 0; kivilcim = 0;
    // Ölçümler tur başına sıfırlanır (`tur` ve `dizilis` kalır): çekim ilk turu keser, duman testi turun kendi
    // dönüm noktalarına bakar.
    Object.assign(olcum, { saniye: 0, evre: 'dusus', inisAt: 0, yapismaAt: 0, takimlarAt: 0, enDolum: 0,
      enYukseklik: 0, lensUzak: 99, yapismaKare: 0, tur: olcum.tur + 1 });
    Object.assign(w, { winner: null, blast: null, kickoff: 0, restart: 0, time: 0, overtime: false, nextKickoff: 0, score: [0, 0], aim: null });
    w.events.length = 0;
    for (const p of w.players) {
      Object.assign(p, { vx: 0, vz: 0, burn: 0, stun: 0, evade: 0, pressed: false, air: 0, airMax: 1, jump: 0,
        dash: 0, sprint: 0, knock: 0, charge: 0, fireCharge: 0, chargeSpent: false, energyCd: 0, kickCd: 0, guard: 0, think: 0, call: 0 });
      p.sahneDolum = null;
    }
    sahnele(w);
  }

  /** Bu sahnede kimseye girdi verilmez: on koltuk da "insan" olduğu için herkes durur, yeri sahne yazar. */
  const girdi = () => ({ players: {} });

  /** Sahnelenmiş anlatımda simülasyon olayının işi yok (gol de olmaz, yanma da): sessizce yutulur. */
  const olay = () => {};

  /**
   * Bir karelik sahne: evreye göre kamera, topun yeri ve yüksekliği, iki oyuncunun yükleme dolumu, on oyuncunun
   * konumu ve kapanış başlığı. `step`ten **sonra** koştuğu için simülasyonun bu kare ne yaptığı önemli değildir.
   */
  function sahnele(w) {
    const I = A.isaret, b = w.ball;
    const yanKadraj = kadrajAra(A.kamera.yan, A.kamera.yanSon, yumusak(birim(t, I.inis, I.hucum)));
    kadraj = t >= I.yapisma
      ? kadrajAra(A.kamera.takim, A.kamera.takimSon, yumusak(birim(t, I.takimlar, I.bitis)))
      : kadrajAra(A.kamera.dusus, yanKadraj, yumusak(birim(t, A.kamera.gecis[0], A.kamera.gecis[1])));

    // ---- top ----
    if (t < I.inis) {
      // Açılış: top lensin biraz önünde ve altında doğar, hızlanarak (serbest düşüş gibi) sahanın ortasına iner.
      const bas = onunde(A.kamera.dusus, A.top.ileri), u = birim(t, 0, I.inis);
      bas.y -= A.top.alt;
      b.x = ara(bas.x, A.top.yer.x, u); b.z = ara(bas.z, A.top.yer.z, u);
      b.yuk = Math.max(0, (bas.y - 0.43) * (1 - u * u));
      b.owner = null;
      olcum.evre = 'dusus';
    } else if (t < I.hucum) {
      // Yükleme: top iki oyuncunun tam ortasında, yerden yavaşça kalkar.
      b.x = A.top.yer.x; b.z = A.top.yer.z;
      b.yuk = A.top.havada * yumusak(birim(t, I.inis, I.ikisi));
      b.owner = sol.id;
      olcum.evre = 'yukleme';
      if (olcum.inisAt === 0) { olcum.inisAt = t; }
    } else if (t < I.yapisma) {
      // Hücum: top yandan bakan kadrajın lensine fırlar.
      const hedef = onunde(A.kamera.yanSon, A.top.lens), u = yumusak(birim(t, I.hucum, I.yapisma));
      b.x = ara(A.top.yer.x, hedef.x, u); b.z = ara(A.top.yer.z, hedef.z, u);
      b.yuk = ara(A.top.havada, hedef.y - 0.43, u);
      olcum.evre = 'hucum';
    } else if (t < I.dusus) {
      // Yapışma: top lense çarpmış gibi ekranı kaplar (kadraj artık kapanış kadrajı; ekran kapalı olduğu için geçiş görünmez).
      const nokta = onunde(kadraj, A.top.lens);
      b.x = nokta.x; b.z = nokta.z; b.yuk = nokta.y - 0.43;
      olcum.evre = 'yapisma';
      if (olcum.yapismaAt === 0) olcum.yapismaAt = t;
    } else {
      // Düşüş: top lensten aşağı ve sahneye doğru düşer, arkası açılır; dizilişin ortasında yerde kalır.
      const nokta = onunde(kadraj, A.top.lens), u = birim(t, I.dusus, I.takimlar);
      b.x = ara(nokta.x, A.top.son.x, u); b.z = ara(nokta.z, A.top.son.z, u);
      b.yuk = Math.max(0, ara(nokta.y - 0.43, 0, u * u));
      olcum.evre = t < I.takimlar ? 'acilis' : 'takimlar';
      if (t >= I.takimlar && olcum.takimlarAt === 0) olcum.takimlarAt = t;
    }
    Object.assign(b, { vx: 0, vz: 0, kind: 'normal', power: 0, lock: 0, stealLock: 0, to: null, last: sol.id });
    if (t >= I.inis) b.owner = sol.id;
    olcum.enYukseklik = Math.max(olcum.enYukseklik, b.yuk);
    if (t >= I.yapisma && t < I.dusus) {
      olcum.yapismaKare++;
      olcum.lensUzak = Math.min(olcum.lensUzak, Math.hypot(b.x - kadraj.x, b.yuk + 0.43 - kadraj.y, b.z - kadraj.z));
    }

    // ---- yüklemeler ----
    // Önce rüzgar, sonra ateş; `ikisi`den sonra ikisi birden `dolum` tepesine tırmanır (oyunun normal doluşunu aşar:
    // "giderek büyür" istenen budur). Yapışmadan sonra ikisi de sönük bir düzeyde kalır: dizilişin ortasındaki top
    // hâlâ hem rüzgarlı hem alevlidir ama başlığı bastırmaz.
    const tepe = A.ikili.dolum;
    if (t < I.inis) dolum = { ruzgar: 0, ates: 0 };
    else if (t < I.hucum) dolum = {
      ruzgar: ara(yumusak(birim(t, I.ruzgar, I.ates)), tepe, yumusak(birim(t, I.ikisi, I.hucum))),
      ates: ara(yumusak(birim(t, I.ates, I.ikisi)), tepe, yumusak(birim(t, I.ikisi, I.hucum))),
    };
    else if (t < I.yapisma) dolum = { ruzgar: tepe, ates: tepe };
    // Lense yapışmış ve lensten düşen topta dolum kısılır: tam dolumda alevler ve rüzgar halkaları kameranın
    // 0,95 birim önündeki topu sarıp kadrajı soyut renk lekesine çeviriyordu. Top hâlâ hem rüzgarlı hem alevli,
    // ama bu kez top olduğu görülüyor.
    else dolum = { ruzgar: 0.4, ates: 0.4 };
    olcum.enDolum = Math.max(olcum.enDolum, Math.min(dolum.ruzgar, dolum.ates));
    for (const p of w.players) p.sahneDolum = null;
    if (t >= I.inis && t < I.yapisma) {
      sol.sahneDolum = { wind: dolum.ruzgar, fire: 0 };
      sag.sahneDolum = { wind: 0, fire: dolum.ates };
    }

    // ---- oyuncular ----
    if (t < I.yapisma) {
      // İki oyuncu yanlardan kayarak gelir (kayma pozu: p.dash; bkz. view/actors.js).
      const u = yumusak(birim(t, I.inis, I.inis + A.ikili.kayma));
      for (const [p, isaret] of [[sol, -1], [sag, 1]]) {
        p.x = ara(isaret * A.ikili.giris, isaret * A.ikili.x, u); p.z = 0;
        // Kayma pozu yalnız kayarken: top inmeden önce ikisi de ayakta durur.
        p.dash = t >= I.inis && u < 1 ? 1 : 0; p.dashX = -isaret; p.dashZ = 0;
        p.angle = Math.atan2(b.x - p.x, b.z - p.z);
        p.vx = 0; p.vz = 0;
      }
      // Kalan sekiz oyuncu kalenin önünde bekler (maviler solda, turuncular sağda: kapanıştaki dizilişi önceden
      // haber verir). Açılış kadrajında sahayı doldururlar, yan kadrajda arka plandadırlar.
      for (const [taraf, isaret] of [[dizi.sol, -1], [dizi.sag, 1]]) {
        taraf.filter(p => p !== sol && p !== sag).forEach((p, i) => {
          p.x = isaret * (3.5 + i * 3); p.z = A.dizilis.uzak - (i % 2) * 1.8;
          p.dash = 0; p.vx = 0; p.vz = 0; p.angle = Math.atan2(b.x - p.x, b.z - p.z);
        });
      }
    } else {
      // Kapanış dizilişi: iki sıra, kameradan uzaklaşarak kenara açılır; herkes kameraya döner.
      for (const [taraf, isaret] of [[dizi.sol, -1], [dizi.sag, 1]]) {
        taraf.forEach((p, i) => {
          p.x = isaret * (A.dizilis.ilkX + i * A.dizilis.adimX);
          p.z = A.dizilis.ilkZ + i * A.dizilis.adimZ;
          p.dash = 0;
          // Kameraya dönük durmaları için: actors.js topa dönük çizer, ancak oyuncu hızlıysa kendi açısına bakar.
          const dx = kadraj.x - p.x, dz = kadraj.z - p.z, u = Math.hypot(dx, dz) || 1;
          p.angle = Math.atan2(dx, dz); p.vx = dx / u * 1.4; p.vz = dz / u * 1.4;
        });
      }
    }

    // ---- kapanış başlığı ----
    const k = birim(t, I.takimlar, I.takimlar + 0.5) * (1 - birim(t, I.bitis, I.bitis + 0.3));
    baslikEl.textContent = 'YAKAR GOL';
    baslikEl.hidden = k <= 0;
    // Saydamlık her karede sahnenin saatinden verilir: CSS geçişi gerçek zamanda koşar, sahte saatli çekimde kare
    // kare oturmazdı (bkz. ajanlar/icerik/short-uret.mjs SAAT_YAMASI).
    baslikEl.style.opacity = String(k);
    baslikEl.style.transform = `translate(-50%,-50%) scale(${(0.86 + 0.14 * yumusak(k)).toFixed(3)})`;
  }

  /** Her kare (simülasyondan sonra, gerçek dt): sahne saati ilerler ve bütün sahne yeniden yazılır. */
  function guncelle(dt, w) {
    t += dt;
    if (t >= A.isaret.tekrar) { basla(w); return; }
    sahnele(w);
    olcum.saniye = t;
  }

  /** Çizimden hemen önce: kadrajı kur ve yükleme sırasında iki oyuncunun çevresine oyunun kendi kıvılcımlarını saç. */
  function cizim(dt, w, view) {
    view.setPose(kadraj);
    if (dt <= 0 || t < A.isaret.inis || t >= A.isaret.hucum) return;
    kivilcim -= dt;
    if (kivilcim > 0) return;
    kivilcim = 0.3;
    if (dolum.ruzgar > 0.15) view.event({ type: 'blow', x: sol.x, z: sol.z });
    if (dolum.ates > 0.15) view.event({ type: 'burn', x: sag.x, z: sag.z });
  }

  /**
   * Ayaktaki topun görüntüsü: `kind` rüzgar, `p` rüzgar dolumu, `ates` yakar pas dolumu. İkisi birden verildiği için
   * top aynı anda camgöbeği rüzgar halkalarına ve aleve bürünür (bkz. view/ballview.js — `charge.ates` yalnız bu
   * sahnede dolu gelir).
   */
  function sarj(w) {
    if (t < A.isaret.inis || w.ball.owner !== w.me) return null;
    return { kind: 'wind', p: dolum.ruzgar, ates: dolum.ates, full: dolum.ruzgar >= 1, text: '' };
  }

  /** Sahnelenmiş anlatımda ağır çekim yok: simülasyon normal hızda akar (kadrajı zaten sahne sürüyor). */
  const bakis = () => ({ scale: 1, heat: 0, track: false });
  const nokta = () => odakNokta;
  const durum = () => ({ ...olcum });

  // Çekim betiği (ajanlar/icerik/short-uret.mjs) sahneyi buradan okur ve kabul ölçütünü bunun üstünde işletir.
  window.__gosteri = olcum;

  return { kamera: 'shoulder', tohum, kur, girdi, olay, guncelle, odak: () => odakNokta, cizim, sarj, bakis, nokta, durum };
}
