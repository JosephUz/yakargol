import { MATCH } from './config.js';
import { gosteriAcik } from './gosteri.js';

/**
 * Oyun içi müzik: üç parça, üç sahne, çapraz geçiş.
 *  - **sakin** (`Devre Arası`): giriş ekranı, lobi, mola (devre arası) ve maç sonu karnesi — tek parça, kendi kendine döner.
 *  - **mac** (`Spor Marşı`): maç sürerken ana tema.
 *  - **doruk** (`Son Dakika Golü` ↔ `Spor Marşı`): son dakika (saatte ≤ `DORUK` saniye kaldı) ve altın gol; parça
 *    bitince ana temaya, o da bitince yeniden heyecana döner, araya sessizlik girmez.
 *
 * Çalma `<audio>` öğeleriyledir (dosya akarak iner). **Ses düzeyi Web Audio kazanç düğümünden (`GainNode`) geçer:**
 * iOS Safari'de `HTMLMediaElement.volume` salt okunurdur, orada öğenin kendi sesi yazılamaz — %35 varsayılan, sürgü ve
 * çapraz geçiş yalnız kazanç düğümüyle çalışır. Web Audio yoksa öğenin `volume`una düşülür. Süzülme Web Audio varken
 * tek bir düz rampayla ses iş parçacığında yürür (pürüzsüz); sayaç o sırada yalnız okunan değeri güncel tutar.
 *
 * Dosyalar **gerektiğinde** iner: öğeler ilk dokunuşta bir anlık sessiz sesle kurulur (aşağıya bak), gerçek mp3 ise
 * ancak o parça gerektiğinde `src`e konur — menüde yalnız sakin parça iner, maç parçası maç başlarken.
 *
 * Ses düzeyi efektlerin (audio.js) altındadır: varsayılan %35. Açık / kapalı ve düzey tarayıcıda saklanır
 * (`yg.muzik`, `yg.muzik.ses`); açma / kapama düğmesi hem üst çubukta hem mola menüsündedir (bkz. ui.js setMuzik),
 * ses düzeyi sürgüsü mola menüsündedir. Efekt sesi düğmesi (`yg.sound`) müziği etkilemez: ikisi bağımsızdır.
 *
 * Tarayıcının otomatik oynatma kuralı: ilk kullanıcı girdisine kadar hiç `play()` çağrılmaz. Dinlenen olaylar
 * **parmağın kalktığı** andır (`pointerup`, `touchend`, `click`, `keydown`): dokunmatik ekranda `pointerdown` ve
 * `touchstart` tarayıcıya "kullanıcı izin verdi" saymaz, onlarla beklemek müziği ikinci dokunuşa bırakırdı. O ilk
 * girdide üç parçanın da **kilidi açılır** (sessiz bir ses çalınıp durdurulur) ve ses bağlamı uyandırılır; böylece
 * maç parçası, çizim döngüsünden — yani dokunuşun dışından — başlatıldığında iOS'ta da engellenmez.
 * Sekme gizlenince durur, dönünce kaldığı yerden sürer.
 *
 * Dosya yolları **görelidir** (`muzik/...`): aynı dosyalar Capacitor'ın `https://localhost/` kökünde de çalışır,
 * bir sonraki APK'ya kendiliğinden girer (bkz. scripts/build-web.mjs). Bu görevde APK üretilmez.
 */
const SAHNELER = {
  sakin: ['yakar-2-devre-arasi'],
  mac: ['yakar-1-spor-marsi'],
  doruk: ['yakar-3-son-dakika', 'yakar-1-spor-marsi'],
};
/** Maçın "son dakikası": saatte bu kadar saniye kalınca heyecan parçasına geçilir. */
export const DORUK = 60;
/** Çapraz geçiş süresi (sn): sahne değişiminde ve parça bitmeden önce. */
const GECIS = 1.8;
const VARSAYILAN_SES = 0.35;
/** Süzülme saatinin adımı (sn). */
const ADIM = 0.05;
/**
 * 8 kHz'de tek örneklik sessiz WAV. Öğenin kilidini ilk dokunuşta açmaya yarar: iOS/Android bir `<audio>` öğesine
 * ancak kullanıcı girdisi içinde `play()` çağrıldıysa sonradan da izin verir ve bu izin `src` değişince sürer.
 * Böylece kilit açılırken 2 MB'lık mp3 inmez — gerçek dosya o parça gerektiğinde konur.
 */
const SESSIZ = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==';

const kis = v => Math.max(0, Math.min(1, v));

/**
 * Hangi sahne çalmalı? Saf işlev: ekran akışından ve dünyanın durumundan okur, her kareden sorulabilir (aynı sahne
 * yeniden verilince hiçbir şey olmaz). Maç dışındaki her şey — giriş, lobi, mola, karne — sakin parçadır.
 *  - `started`: maç kuruldu mu (main.js `started`)
 *  - `screen`: açık perde ('home' | 'lobby' | 'pause' | 'results' | null). Yardım perdesi (`help`) saydamdır:
 *    çağıran onun **altındaki** ekranı verir (main.js `altEkran`), böylece molanın üstünde Kontroller açılınca
 *    müzik maç parçasına atlamaz.
 *  - `w`: dünya (time, overtime, winner)
 */
export function sahneSec(started, screen, w) {
  if (!started || !w || w.winner !== null) return 'sakin';
  if (screen) return 'sakin'; // mola "devre arası"dır; giriş, lobi ve karne de sakin parçadır
  return w.overtime || MATCH.duration - w.time <= DORUK ? 'doruk' : 'mac';
}

/**
 * Müzik hiç yüklenmesin mi? Gösteri kipleri (`?gosteri=...`) ve otomatik tarayıcılar (Playwright: `navigator.webdriver`)
 * sessizdir — video betiği klibin müziğini kendisi ekler, dumanı testleri de 6 MB ses indirmesin. `?muzik=0` elle
 * kapatır, `?muzik=1` ikisine de bakmadan açar (müziği ölçen test bunu kullanır).
 */
export function muzikKapali() {
  if (gosteriAcik()) return true; // gösteri hiçbir şekilde müzik çalmaz: `?muzik=1` bile açamaz
  const p = new URLSearchParams(location.search).get('muzik');
  if (p === '0') return true;
  if (p === '1') return false;
  return Boolean(navigator.webdriver);
}

export function createMuzik(root) {
  const kapali = muzikKapali();
  let acik = true, ses = VARSAYILAN_SES;
  try { acik = localStorage.getItem('yg.muzik') !== 'off'; } catch { /* yok */ }
  try { const v = Number(localStorage.getItem('yg.muzik.ses')); if (Number.isFinite(v) && v > 0 && v <= 1) ses = v; } catch { /* yok */ }
  const sakla = (k, v) => { try { localStorage.setItem(k, v); } catch { /* yok */ } };

  /** ad -> { ad, el, gain, seviye, yuklendi } */
  const parcalar = new Map();
  /** Süren süzülmeler: parça -> { bas, hedef, t, sure, bitince }. Tek bir sayaç hepsini yürütür. */
  const suzulme = new Map();
  let saat = null, sahneAdi = null, sira = 0, aktif = null, dokunuldu = false, gizli = false;
  /** Ses bağlamı: ilk kullanıcı girdisinde kurulur. `false` = tarayıcıda Web Audio yok, öğenin kendi sesi kullanılır. */
  let ctx = null;

  const hedefSes = () => (acik ? ses : 0);

  /** Parçanın o anki `seviye` değerini çıkışa yazar (kazanç düğümüne, Web Audio yoksa öğenin kendi sesine). */
  function cikisaYaz(p) {
    if (!p.gain) { p.el.volume = p.seviye; return; }
    const g = p.gain.gain, t = p.gain.context.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(p.seviye, t);
  }

  function tik() {
    for (const [p, f] of suzulme) {
      f.t += ADIM;
      const k = Math.min(1, f.t / f.sure);
      p.seviye = kis(f.bas + (f.hedef - f.bas) * k);
      if (!p.gain) p.el.volume = p.seviye; // Web Audio varken rampa ses iş parçacığında yürür, burada yalnız sayılır
      if (k >= 1) { suzulme.delete(p); p.seviye = f.hedef; cikisaYaz(p); f.bitince?.(); }
    }
    if (!suzulme.size && saat !== null) { clearInterval(saat); saat = null; }
  }
  /** Parçanın sesini `sure` saniyede `hedef`e süzer; `sure` 0 ise anında. */
  function suz(p, hedef, sure, bitince) {
    hedef = kis(hedef);
    if (sure <= 0) { suzulme.delete(p); p.seviye = hedef; cikisaYaz(p); bitince?.(); return; }
    if (p.gain) { // tek düz rampa: pürüzsüz, sekmenin kare hızından bağımsız
      const g = p.gain.gain, t = p.gain.context.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(p.seviye, t);
      g.linearRampToValueAtTime(hedef, t + sure);
    }
    suzulme.set(p, { bas: p.seviye, hedef, t: 0, sure, bitince });
    saat = saat ?? setInterval(tik, ADIM * 1000);
  }

  /** Web Audio bağlamı (bir kez kurulur; yoksa `false`). Kullanıcı girdisi içinde çağrılmalı: orada uyandırılır. */
  function baglam() {
    if (ctx !== null) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    try { ctx = AC ? new AC() : false; } catch { ctx = false; }
    return ctx;
  }
  const uyandir = () => { if (ctx && ctx.state === 'suspended') ctx.resume?.().catch(() => { /* kullanıcı girdisi bekler */ }); };

  /**
   * Parçanın kaydı; ilk istendiğinde kurulur. Öğe **sessiz** bir sesle doğar: gerçek dosya ancak `yukle` ile iner,
   * ama öğenin kilidi ilk dokunuşta bu sessiz sesle açılabilir (bkz. SESSIZ).
   */
  function parca(ad) {
    let p = parcalar.get(ad);
    if (p) return p;
    const el = new Audio();
    el.preload = 'none';
    el.hidden = true;
    el.dataset.parca = ad;
    el.src = SESSIZ;
    p = { ad, el, gain: null, seviye: 0, yuklendi: false };
    const c = baglam();
    if (c) {
      try {
        p.gain = c.createGain();
        p.gain.gain.value = 0;
        c.createMediaElementSource(el).connect(p.gain).connect(c.destination);
      } catch { p.gain = null; } // bağlanamadıysa öğenin kendi sesine düşülür
    }
    if (!p.gain) el.volume = 0;
    // Parça bitmeden önce öbürü üstüne açılsın: araya sessizlik girmez. `ended` yalnız yedektir (süre bilinmiyorsa).
    el.addEventListener('timeupdate', () => {
      if (p !== aktif || el.loop || !Number.isFinite(el.duration)) return;
      if (el.duration - el.currentTime <= GECIS + ADIM) sonraki();
    });
    el.addEventListener('ended', () => { if (p === aktif) sonraki(); });
    root.appendChild(el);
    parcalar.set(ad, p);
    return p;
  }

  /** Gerçek mp3'ü `src`e koyar (ilk kez gerektiğinde): dosya o an inmeye başlar. */
  function yukle(p) {
    if (p.yuklendi) return;
    p.yuklendi = true;
    p.el.preload = 'auto';
    // Göreli yol: hem web sunucusunda hem Capacitor'da (https://localhost/) aynı dosyayı bulur.
    p.el.src = `muzik/${p.ad}.mp3`;
  }

  /** Şu an çalması gereken parçanın adı (hiçbiri değilse null). */
  function istenen() {
    if (kapali || !acik || !dokunuldu || !sahneAdi) return null;
    const liste = SAHNELER[sahneAdi];
    return liste?.length ? liste[sira % liste.length] : null;
  }

  function calistir(p) {
    uyandir();
    const s = p.el.play();
    // Otomatik oynatma engellendiyse ilk girdi sayılmaz: bir sonraki girdide yeniden denenir.
    if (s?.catch) s.catch(() => { dokunuldu = false; });
  }

  /**
   * Durumu istenene getirir: gereken parça çalar, gereksiz olan süzülerek susar. `koru`: susan parça kaldığı yerde
   * beklesin (müzik düğmesiyle kapatınca; yeniden açılınca aynı yerden sürer). Sahne değişiminde ve parça devrinde
   * başa sarılır — sarılmazsa bitişine gelmiş bir parça yeniden seçilince anında "bitti" sayılır ve devir döngüye girer.
   */
  function uygula(sure = GECIS, koru = false) {
    if (gizli) return; // sekme kapalıyken çalınmaz; dönünce buraya yeniden gelinir
    const ad = istenen();
    if (!ad) {
      if (!aktif) return;
      const eski = aktif; aktif = null;
      suz(eski, 0, sure, () => { eski.el.pause(); if (!koru) eski.el.currentTime = 0; });
      return;
    }
    const yeni = parca(ad);
    yukle(yeni);
    if (aktif === yeni) { calistir(yeni); suz(yeni, hedefSes(), Math.min(sure, 0.3)); return; }
    if (aktif) { const eski = aktif; suz(eski, 0, sure, () => { eski.el.pause(); eski.el.currentTime = 0; }); }
    aktif = yeni;
    // Tek parçalı sahne (sakin, maç) kendi kendine döner: `ended` hiç gelmez, araya sessizlik girmez.
    yeni.el.loop = SAHNELER[sahneAdi].length < 2;
    yeni.seviye = 0; cikisaYaz(yeni);
    calistir(yeni);
    suz(yeni, hedefSes(), sure);
  }

  /** Aynı sahnenin sıradaki parçası (dorukta heyecan ↔ ana tema). */
  function sonraki() {
    const liste = SAHNELER[sahneAdi];
    if (!liste || liste.length < 2) { if (aktif) { aktif.el.currentTime = 0; calistir(aktif); } return; }
    sira++;
    uygula();
  }

  /**
   * İlk kullanıcı girdisi: tarayıcı buradan sonra çalmaya izin verir. Burada ses bağlamı uyanır ve **bütün**
   * parçaların kilidi açılır — maç parçası çizim döngüsünden (dokunuşun dışından) başlatıldığında iOS'ta da çalsın.
   */
  function ilkDokunus() {
    if (kapali || dokunuldu) return;
    dokunuldu = true;
    if (acik) kilitleriAc(); // kapalıyken hiç öğe kurulmaz; açılınca `ac()` kilitleri orada açar
    uygula(0.8);
  }
  /**
   * Ses bağlamını uyandırır ve üç parçanın da kilidini açar. Kullanıcı girdisi içinden çağrılmalı. Müzik kapalıyken
   * hiç çağrılmaz (o zaman tek bir ses öğesi bile kurulmaz); kullanıcı müziği açtığında — o da bir tıklamadır —
   * `ac()` buraya uğrar, böylece iOS'ta maç parçası yine ilk dokunuşla açılmış sayılır.
   */
  function kilitleriAc() {
    baglam(); uyandir();
    for (const liste of Object.values(SAHNELER)) for (const ad of liste) kilidiAc(parca(ad));
  }
  /** Öğeyi kullanıcı girdisi içinde bir anlık sessiz sesle çalıp durdurur: tarayıcı o öğeye kalıcı izin verir. */
  function kilidiAc(p) {
    if (p.yuklendi || p.kilitAcildi) return;
    p.kilitAcildi = true;
    const s = p.el.play();
    const dur = () => { if (!p.yuklendi && p !== aktif) { p.el.pause(); p.el.currentTime = 0; } };
    if (s?.then) s.then(dur, () => { /* kilit açılmadı: parça gerektiğinde yeniden denenir */ });
    else dur();
  }
  if (!kapali) {
    // Parmağın kalktığı an: dokunmatikte `pointerdown` / `touchstart` tarayıcıya kullanıcı izni saymaz.
    for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) document.addEventListener(ev, ilkDokunus, { passive: true });
    document.addEventListener('visibilitychange', () => {
      gizli = document.hidden;
      if (gizli) { if (aktif) aktif.el.pause(); return; }
      uyandir();
      uygula(0.4);
    });
  }

  return {
    kapali,
    /** Sahneyi değiştirir ('sakin' | 'mac' | 'doruk' | null). Aynı sahne yeniden verilirse hiçbir şey olmaz. */
    sahne(ad) {
      if (kapali || ad === sahneAdi) return;
      sahneAdi = ad; sira = 0;
      uygula();
    },
    get acik() { return acik; },
    get ses() { return ses; },
    /** Müzik açık / kapalı (verilmezse çevirir); seçim tarayıcıda saklanır. Yeni durumu döner. */
    ac(v) {
      acik = v === undefined ? !acik : Boolean(v);
      sakla('yg.muzik', acik ? 'on' : 'off');
      // Düğmeye basmak da bir kullanıcı girdisidir: müzik burada açıldıysa kilitler burada açılır (bkz. kilitleriAc).
      if (acik && dokunuldu) kilitleriAc();
      uygula(0.6, true); // kapatınca parça kaldığı yerde bekler: yeniden açılınca oradan sürer
      return acik;
    },
    /** Ses düzeyi (0-1); saklanır ve çalan parçaya anında uygulanır. */
    sesAyarla(v) {
      ses = kis(Number(v) || 0);
      sakla('yg.muzik.ses', String(ses));
      if (aktif && !suzulme.has(aktif)) { aktif.seviye = hedefSes(); cikisaYaz(aktif); }
      return ses;
    },
    /**
     * Testler ve hata ayıklama için: hangi parça, hangi sahne, çalıyor mu. `parcalar` her öğenin okunan durumudur;
     * **ses düzeyi `seviye` alanından okunur**, `audio.volume`dan değil: Web Audio kullanılırken öğenin kendi sesi
     * 1'de kalır, duyulan düzeyi kazanç düğümü taşır.
     */
    durum() {
      return {
        kapali, acik, ses, sahne: sahneAdi, webAudio: Boolean(ctx),
        parca: aktif?.ad || null, caliyor: Boolean(aktif && !aktif.el.paused), ogeler: parcalar.size,
        parcalar: [...parcalar.values()].map(p => ({
          ad: p.ad, seviye: +p.seviye.toFixed(3), paused: p.el.paused, currentTime: p.el.currentTime,
          loop: p.el.loop, yuklendi: p.yuklendi,
        })),
      };
    },
  };
}
