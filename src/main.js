import { createAudio } from './audio.js';
import { createCinema } from './cinema.js';
import { CINEMA, GOSTERI, KICK, TEAMS } from './config.js';
import { createRuzgarGosteri } from './gosteri-ruzgar.js';
import { createGosteri, gosteriKip } from './gosteri.js';
import { createInput } from './input.js';
import { createLobby } from './lobby.js';
import { createMuzik, sahneSec } from './muzik.js';
import { createNetClient } from './net/client.js';
import { macBasladi, macBitti, macKontrol } from './olcum.js';
import { isApp, onlineEnabled, serverHttp } from './platform.js';
import { enterFullscreen, fullscreenOn, fullscreenSupported, toggleFullscreen, touchDevice } from './touch.js';
import { createUI, onTap } from './ui.js';
import { createView } from './view/view.js';
import { canPower, createWorld, startAim, step } from './world.js';

/**
 * İstemci uygulaması: dünya, görünüm, girdi, arayüz ve ekran akışı (giriş → maç ↔ mola / yardım → maç sonu).
 * Her kare: sabit 1/60 sn adımlarla simülasyon (girdi her adımda okunur) → olaylar (efekt, ses, mesaj, kamera) →
 * çizim → karakter üstü gösterge; tabela ve kart kısa aralıkla tazelenir. Oyuncu doğunca (maç başı, gol sonrası
 * diziliş, kenardan dönüş) kamera topa çevrilir. Golde patlama olur, herkes fırlar (GOAL_BLAST), sonra santra. Fare kilidi düşerse (Esc) oyun molaya girer.
 *
 * Yakar pas ve rüzgar şutu sineması (CINEMA, cinema.js): top sendeyken sağ tık (yakar pas) ya da sol tık (rüzgar)
 * CINEMA.hold saniye basılı kalınca oyun ağır çekime geçer, CINEMA.aim saniye nişan alınır, bırakınca vuruş çıkar; bu
 * sırada rakip kayarak topu alırsa vuruş olmaz. Uçuşta da ağır çekim, herkesin kamerası topu izler. Kısa basış: sağ tık
 * pas, sol tık normal şut. Simülasyon kuralları aynı kalır; yalnızca adım başına düşen gerçek zaman değişir.
 *
 * **Çevrim içi** (webde, config.js → ONLINE; bkz. lobby.js, net/): maçı sunucu koşturur, bu sayfa girdiyi yollar ve
 * gelen durumu çizer (net/client.js). Sinemayı da sunucu yürütür (herkes aynı anda ağır çekime geçer); nişan
 * evresinde nişan noktası girdiyle gider. Çevrim içinde mola maçı durdurmaz.
 *
 * Dokunmatik kip (telefon, tablet, Android uygulaması; ?touch=1 ile masaüstünde de): joystick ve düğmeler (touch.js),
 * hafif görüntü, önemli anlarda titreşim; uygulamada Android geri tuşu mola / devam / çıkış olur.
 *
 * **Gösteri kipi** (yalnız web, `?gosteri=1`; bkz. gosteri.js): içerik klipleri için menü atlanır, on koltuğu da bot
 * oynar, arayüz gizlenir, kamera aksiyonu izler; girdi okunmaz, ölçüm gitmez, sunucuya bağlanılmaz.
 * `?gosteri=ruzgar` (bkz. gosteri-ruzgar.js) aynı kuralları paylaşan ikinci bir sahnedir: maç yerine rüzgar şutunu
 * anlatan, dönüp duran sahnelenmiş bir vuruş. Sahne kendi girdisini, zaman ölçeğini (ağır çekim), kamerasını ve
 * ekrandaki açıklama yazısını sürer; aşağıdaki `gosteri.*` çağrıları iki sahnenin ortak arayüzüdür (olmayan
 * yetenekler sessizce atlanır).
 */
const STEP = 1 / 60, MAX_STEPS = 5;

export async function start(root) {
  const testMode = new URLSearchParams(location.search).has('test');
  /** Gösteri sahnesi (yalnız web): `?gosteri=1` kendi kendine oynanan maç (gosteri.js), `?gosteri=ruzgar` rüzgar şutu sahnesi (gosteri-ruzgar.js). */
  const kip = gosteriKip();
  const gosteri = kip === 'ruzgar' ? createRuzgarGosteri(root) : kip ? createGosteri() : null;
  const touch = touchDevice();
  root.classList.toggle('touch', touch);
  const view = createView(root.querySelector('#yg-view'), { mobile: touch, iso: gosteri ? GOSTERI.iso : null, omuz: gosteri?.omuz || null });
  /**
   * Kamera: masaüstünde omuz kamerasıyla, dokunmatikte izometrik başlar; 🎥 ya da V ile geçilir (seçim tarayıcıda hatırlanır).
   */
  const camButton = root.querySelector('#yg-cam');
  const setCamera = mode => {
    // İzometrikte fare kilitlenmez (imleç nişandır): kilit bırakılır, bu bırakış molaya sokmaz.
    if (mode === 'iso' && document.pointerLockElement) { unlockQuiet = true; input.unlock(); }
    view.setCamera(mode);
    if (mode !== 'iso' && input && active()) input.lock();
    root.classList.toggle('iso', mode === 'iso');
    camButton.innerHTML = (mode === 'iso' ? '🎥 Omuz' : '🎥 İzometrik') + ' <kbd>V</kbd>';
    // Gösteri kipinin zorunlu izometriği oyuncunun kayıtlı seçimini bozmasın.
    if (!gosteri) try { localStorage.setItem('yg.cam', mode); } catch { /* yok */ }
  };
  let savedCam = null, unlockQuiet = false, input = null;
  try { savedCam = localStorage.getItem('yg.cam'); } catch { /* yok */ }
  // Gösteride kamerayı sahne seçer (maç sahnesi izometrik, rüzgar sahnesi omuz üstü); kaydedilmiş seçim okunmaz, yazılmaz.
  setCamera(gosteri ? gosteri.kamera || 'iso' : touch ? (savedCam === 'shoulder' ? 'shoulder' : 'iso') : savedCam === 'iso' ? 'iso' : 'shoulder');
  // Omuz kamerasına geçince bakış kaldığı yerden değil topa dönük başlar.
  const toggleCamera = () => { setCamera(view.cameraMode === 'iso' ? 'shoulder' : 'iso'); if (view.cameraMode === 'shoulder') view.faceBall(w); };
  onTap(camButton, toggleCamera);
  /**
   * Tam ekran düğmesi — yalnız telefon tarayıcısında. Maça girerken oyun kendiliğinden tam ekrana geçtiği için
   * (`enterFullscreen`) düğmenin işi giriş ekranı ve lobidir: oradaki adres çubuğunu da kaldırır. Bu yüzden maç
   * başlayınca gizlenir (ui.js → hud, `← josephuz.com` ile aynı kural) ve skor tabelasıyla hiç yan yana gelmez;
   * telefon dar yatay dururken (667x375) üst çubuğa beşinci simge binmiş olmaz.
   *
   * Play Store uygulamasında (Capacitor) kaldıracak tarayıcı çubuğu yok: `tam-ekran` sınıfı verilmez, düğme
   * görünmez (style.css). Masaüstünde de görünmez; orada F11 var.
   */
  root.classList.toggle('tam-ekran', touch && !isApp() && fullscreenSupported());
  const fullButton = root.querySelector('#yg-full');
  const syncFull = () => {
    const on = fullscreenOn();
    fullButton.classList.toggle('on', on);
    fullButton.textContent = on ? '⤡ Tam ekrandan çık' : '⛶ Tam ekran';
    fullButton.setAttribute('aria-label', on ? 'Tam ekrandan çık' : 'Tam ekran');
  };
  onTap(fullButton, toggleFullscreen);
  // Yazı ve simge yalnız buradan güncellenir: tarayıcının kendi yolundan (Esc, F11) girip çıkmak da böyle sayılır.
  document.addEventListener('fullscreenchange', syncFull);
  syncFull();
  const ui = createUI(root);
  const audio = createAudio();
  // cine: sinemanın görüntü durumu (bkz. syncCine); cinema: tek başına oyunda evreyi yürüten (cinema.js).
  let cine = null, rightHold = null, online = false;
  const cinema = createCinema();
  let w = createWorld(), screen = 'home', started = false, acc = 0, uiClock = 0, helpReturn = 'home', pausedAt = 0, last = performance.now();
  view.faceBall(w);

  const active = () => started && !screen;
  input = createInput(view.canvas, {
    testMode,
    touch: touch && root,
    // Gösteride girdi hiç okunmaz: tuş, fare ve dokunma yok sayılır, fare kilitlenmez, mola açılmaz.
    playing: () => !gosteri && active(),
    onHelp: help,
    onCamera: () => toggleCamera(),
    onPause: pause,
    onLook: (dx, dy) => { if (!cine || cine.phase === 'aim') view.look(dx, dy); },
    onPoint: (x, y) => view.point(x, y),
    canLock: () => view.cameraMode !== 'iso',
    onUnlock: () => { if (unlockQuiet) { unlockQuiet = false; return; } if (!gosteri && active() && view.cameraMode !== 'iso') show('pause'); },
    onBlur: () => { if (gosteri) return; if (active()) show('pause'); else input.clear(); },
  });

  function show(next) {
    screen = next;
    if (next === 'pause') pausedAt = performance.now();
    if (next) input.unlock();
    ui.show(next);
    input.clear();
    // Çevrim içinde mola yalnız bir perdedir: yeniden başlatma yok, çıkış odadan çıkar (standart menüdeki ad da değişir).
    root.querySelector('#yg-restart').hidden = online;
    root.querySelector('#yg-menu').textContent = online ? 'Odadan çık' : 'Ana menü';
    root.querySelector('#yg-pause-note').hidden = !online;
    root.querySelector('#yg-again').textContent = online ? 'LOBİYE DÖN' : 'BİR MAÇ DAHA';
    refresh();
  }
  function begin() {
    if (online) { showLobby(); return; }
    endCinema(); cinema.reset(); rightHold = null;
    // Gösteride her maç rastgele tohumla kurulur (bkz. gosteri.tohum): klipler birbirinin tekrarı olmasın.
    w = createWorld(gosteri ? gosteri.tohum() : undefined); view.faceBall(w);
    started = true; acc = 0;
    // Gösteri: on koltuk da bot, ölçüm yok, tam ekran ve fare kilidi yok (bkz. gosteri.js).
    if (gosteri) { gosteri.kur(w); show(null); return; }
    macBasladi(); // ölçüm: çevrimdışı maç başladı
    if (touch) enterFullscreen();
    show(null); input.lock();
  }
  function resume() { show(null); input.lock(); if (touch) enterFullscreen(); }
  function help() {
    if (gosteri) return; // gösteride perde açılmaz: kip girdisiz döner (bkz. gosteri.js)
    if (screen === 'help') { closeHelp(); return; }
    helpReturn = screen; show('help');
  }
  function closeHelp() { show(helpReturn); if (active()) input.lock(); }
  /**
   * Müziğin baktığı ekran: Kontroller perdesi saydamdır, altındaki ekran neyse müzik onundur (bkz. muzik.js sahneSec).
   * Yoksa molanın üstünde Kontroller açılıp kapanınca müzik sakin ↔ maç arasında gidip gelirdi.
   */
  const altEkran = () => (screen === 'help' ? helpReturn : screen);
  /** Esc: kilitliyken tarayıcı Esc'yi kilidi bırakmaya harcar (o da molaya sokar); kısa süre içindeki ikinci Esc yok sayılır. */
  function pause() {
    if (gosteri) return; // gösteride mola yok: kip girdisiz döner (bkz. gosteri.js)
    if (!started || screen === 'home' || screen === 'results' || screen === 'lobby') return;
    if (screen === 'help') { closeHelp(); return; }
    if (screen === 'pause') { if (performance.now() - pausedAt > 250) resume(); return; }
    show('pause');
  }
  function menu() {
    if (online) { leaveRoom(); return; }
    endCinema(); cinema.reset(); started = false; w = createWorld(); view.faceBall(w); show('home');
  }

  ui.button('start', () => { if (online) leaveRoom(); begin(); }); ui.button('restart', begin); ui.button('again', begin);
  ui.button('pause-open', pause); ui.button('resume', resume); ui.button('menu', menu);
  ui.button('help-open', help); ui.button('help-close', closeHelp);
  const toggleSound = () => ui.setSound(audio.toggle());
  ui.button('sound', toggleSound); ui.button('pause-sound', toggleSound);
  ui.setSound(audio.enabled);
  // Üst çubuktaki ve mola menüsündeki "Kontroller F1" aynı perdeyi açar (standart araç çubuğu).
  ui.button('pause-help', help);
  /**
   * Oyun içi müzik (bkz. muzik.js): efekt sesinden bağımsız açılıp kapanır, ayarı tarayıcıda kalır. Açma / kapama
   * düğmesi hem üst çubukta hem mola menüsündedir, ses düzeyi sürgüsü mola menüsünde; ikisi de aynı durumu gösterir.
   * Gösteri kiplerinde müzik hiç kurulmaz (`muzik.kapali`), o zaman düğmeler gizlenir.
   */
  const muzik = createMuzik(root);
  const muzikYaz = () => ui.setMuzik(muzik.acik, muzik.ses);
  // Düğmeler yalnız gösteri kipinde gizlenir. Otomatik tarayıcıda (`muzik.kapali`, bkz. muzik.js) da dururlar:
  // standart çubuk her zaman aynı görünür, ayar yine saklanır, yalnız çalacak parça yoktur.
  ui.setMuzikVar(!gosteri);
  const toggleMuzik = () => { muzik.ac(); muzikYaz(); };
  ui.button('muzik', toggleMuzik); ui.button('pause-muzik', toggleMuzik);
  ui.onMuzikSes(v => { muzik.sesAyarla(v); muzikYaz(); });
  muzikYaz();

  // ---------- Çevrim içi ----------
  // Gösteride sunucuya hiç bağlanılmaz: WebSocket açılmaz, oda / davet linki okunmaz.
  const net = onlineEnabled() && !gosteri ? createNetClient({
    onWelcome() {
      lobby.setServer(true);
      if (pending) { const go = pending; pending = null; go(); return; }
      // Sayfa yenilendi (lobideydik) ya da davet linki: odaya gir.
      const code = inviteCode || (!net.world && net.rememberedRoom());
      inviteCode = null;
      if (code && !net.lobby) net.join(code);
    },
    // Maçta ya da maç sonu karnesindeyken lobi yalnız güncellenir (karneden "Lobiye dön" ile görünür).
    onLobby(msg) {
      online = true;
      if (screen === 'lobby') lobby.render(msg);
      else if (!started && screen !== 'results') showLobby(msg);
    },
    onError(msg) {
      lobby.status(msg);
      if (msg === 'Böyle bir oda yok' && screen !== 'lobby') net.leave();
    },
    onStart(msg, first) {
      if (!first) return;
      online = true; endCinema(); cinema.reset(); rightHold = null;
      w = net.world; view.faceBall(w);
      started = true; acc = 0;
      macBasladi(); // ölçüm: çevrimiçi maç başladı (yalnız first === true, yani gerçek başlangıç)
      if (touch) enterFullscreen();
      show(null); input.lock();
    },
    onEvents(list) { w.events.push(...list); consume(); },
    onEnd(msg, world) {
      endCinema();
      if (world) { w = world; ui.results(w); }
      if (started) macBitti(); // ölçüm: yalnız maçı oynayan için (lobide bekleyen END alsa da saymaz)
      started = false;
      show('results');
    },
    onOnline: n => lobby.setOnline(n),
    onDisconnect(was) {
      lobby.setServer(false);
      if (was && online && started) ui.message('BAĞLANTI KOPTU · YENİDEN BAĞLANIYOR', 3);
    },
  }) : null;
  let pending = null, inviteCode = null;
  const lobby = createLobby(root, {
    id: () => net?.id,
    create(nick) { withHello(nick, () => net.create()); },
    join(nick, code) { withHello(nick, () => net.join(code)); },
    seat: slot => net.seat(slot),
    move: (id, slot) => net.move(id, slot),
    start: () => net.start(),
    leave: leaveRoom,
  });
  /** Adı yeniledikten sonra (sunucu WELCOME ile döner) odayı kur / odaya katıl. */
  function withHello(nick, go) { if (!net?.connected) return; pending = go; net.hello(nick); }
  function showLobby(msg = net?.lobby) {
    if (!msg) { show('home'); return; }
    online = true;
    lobby.render(msg);
    if (screen !== 'lobby') show('lobby');
  }
  function leaveRoom() {
    net?.leave();
    online = false; endCinema(); cinema.reset(); started = false; w = createWorld(); view.faceBall(w);
    lobby.status('');
    show('home');
  }
  if (net) {
    inviteCode = lobby.urlCode();
    if (inviteCode) lobby.showJoin();
    net.connect(lobby.nick());
  }

  const who = p => (p.id === w.me ? 'SEN' : TEAMS.names[p.team] + ' · ' + p.name);
  const mine = () => w.players[w.me];
  /** Yakar pas / rüzgar şutu neden atılamıyor (null: atılabilir). Enerji gerekmez, yalnız takımın hakkı. */
  const powerBlocked = kind => {
    const p = mine(), left = (kind === 'fire' ? w.fireLeft : w.windLeft)[p.team];
    return left <= 0 ? (kind === 'fire' ? 'TAKIMIN YAKAR PAS HAKKI BİTTİ' : 'TAKIMIN RÜZGAR HAKKI BİTTİ') : null;
  };
  const myAim = () => (w.aim && w.aim.id === w.me ? w.aim : null);
  /**
   * Sağ tık, top sendeyken: simülasyona gitmez; kısa basış pas olur, basılı tutuş yakar pas nişanına geçer
   * (tickRightHold). Yakar pas nişanındayken sağ tık bırakılınca (ya da sol tık) `fire`: vuruş çıkar.
   */
  function route(cmd) {
    const aim = myAim();
    if (aim && aim.kind === 'fire') {
      if (cmd.secondaryUp || !input.rightHeld() || cmd.tap) cmd.fire = true;
      cmd.secondary = false; cmd.tap = false;
      return cmd;
    }
    const owns = w.ball.owner === w.me;
    if (cmd.secondary && owns) { cmd.secondary = false; rightHold = { t: 0, warned: false }; }
    if (rightHold) {
      if (!owns) rightHold = null;
      else if (cmd.secondaryUp || !input.rightHeld()) { cmd.pass = true; rightHold = null; }
    }
    // Yakar pas dolumu sürüyor: dünyada sayılır, karakterin çevresinde alev olarak herkese görünür.
    cmd.held2 = !!rightHold;
    return cmd;
  }
  function tickRightHold(dt) {
    if (!rightHold || w.aim) return;
    rightHold.t += dt;
    if (rightHold.t < CINEMA.hold) return;
    const why = powerBlocked('fire');
    if (!why && canPower(w, w.me, 'fire')) { rightHold = null; if (online) net.aim(); else startAim(w, w.me, 'fire'); }
    else if (!rightHold.warned) { rightHold.warned = true; if (why) ui.message(why, 1.2); }
  }
  /** Dolum halkası ve topun rengi için şu an hazırlanan vuruş (yoksa null). */
  function chargeState() {
    if (!active()) return null;
    const p = mine(), aim = myAim();
    if (aim) return { kind: aim.kind, p: 1 - (cine?.phase === 'aim' ? cine.t : 0) / CINEMA.aim, text: aim.kind === 'wind' ? 'BIRAK: RÜZGAR ŞUTU' : 'BIRAK: YAKAR PAS', full: true };
    if (cine) return null;
    if (rightHold) {
      const why = powerBlocked('fire'), full = rightHold.t >= CINEMA.hold;
      return { kind: why ? 'blocked' : 'fire', p: rightHold.t / CINEMA.hold, full: full && !why, text: why ? why + ' · BIRAK: PAS' : 'BIRAK: PAS · TUT: YAKAR PAS' };
    }
    if (p.charge > 0 && w.ball.owner === w.me) {
      const why = powerBlocked('wind'), full = p.charge >= KICK.windCharge;
      return { kind: why && full ? 'blocked' : 'wind', p: p.charge / KICK.windCharge, full: full && !why, text: why && full ? why + ' · BIRAK: ŞUT' : 'BIRAK: ŞUT · TUT: RÜZGAR' };
    }
    return null;
  }

  function endCinema() {
    if (!cine) return;
    cine = null;
    view.cinemaEnd(w);
    ui.cinema(false);
  }
  /**
   * Görüntüyü sinema evresine uydurur (her kare). Evre tek başına oyunda cinema.js'ten, çevrim içinde durum paketinden
   * gelir (w.cine): nişanda "NİŞAN AL" / "… NİŞAN ALIYOR", uçuşta "YAKAR PAS!" ya da "RÜZGAR ŞUTU!" ve vuranın adı.
   * Sinema başlarken kamera bakışı kaydedilir, bitince geri döner.
   */
  function syncCine(dt) {
    const s = online ? w.cine : cinema.state;
    if (!s) { endCinema(); return; }
    const p = w.players[s.id], self = s.id === w.me;
    if (!cine) cine = { phase: null };
    if (cine.phase !== s.phase || cine.id !== s.id) {
      const first = cine.phase === null;
      Object.assign(cine, { phase: s.phase, kind: s.kind, id: s.id, mine: self, t: 0 });
      if (s.phase === 'aim') {
        view.event({ type: s.kind === 'fire' ? 'ignite' : 'blow', x: w.ball.x, z: w.ball.z });
        audio.play('ignite');
        ui.cinema(true, self ? 'NİŞAN AL · BIRAK: ŞUT' : who(p) + ' NİŞAN ALIYOR', self ? 1 : null, s.kind);
      } else if (s.phase === 'impact') {
        view.event({ type: 'impact', x: w.ball.x, z: w.ball.z }); audio.play('impact');
      } else {
        // Nişansız başlayan uçuş (ör. eski sunucu): alev patlaması burada.
        if (first && s.kind === 'fire') { view.event({ type: 'ignite', x: w.ball.x, z: w.ball.z }); audio.play('ignite'); }
        ui.cinema(true, who(p), null, s.kind);
      }
    }
    cine.t += dt;
    if (cine.phase === 'aim' && cine.mine) ui.cinemaAim(1 - cine.t / CINEMA.aim);
  }
  /** Sinemanın görüntüsü: zaman ölçeği (oyuncu sallanması), alev yoğunluğu ve kameranın topu izlemesi. */
  function cinemaLook() {
    if (!cine) return null;
    const scale = { aim: CINEMA.aimScale, flight: CINEMA.flightScale, wind: CINEMA.windScale, impact: CINEMA.impactScale }[cine.phase] ?? 1;
    const heat = cine.kind !== 'fire' ? 0 : cine.phase === 'aim' ? Math.min(1, cine.t / 0.6) : cine.phase === 'flight' ? Math.max(0.35, 1 - cine.t / CINEMA.flightMax) : 1;
    // Kendi nişanında kamera senin elinde; başkası nişan alırken kamera ona döner. Uçuşta kamerayı chase() sürer.
    return { scale, heat, track: cine.phase === 'aim' && !cine.mine };
  }
  /**
   * Top ayaktan çıkınca (yakar pas / rüzgar uçuşu) **herkesin kamerası topu kovalar**: kamera oyuncu biçiminde bir odak
   * noktasını izler. Omuzda odak topun CINEMA.chase birim gerisidir ve bakış topun gidiş yönüne döner (kamera topun
   * arkasından onunla gider); izometrikte kadraj topa kayar. Uçuş yoksa null (kendi oyuncun); sinema bitince kamera
   * topa bakarak oyuncuya geçer (view.cinemaEnd).
   */
  const ballFocus = { x: 0, z: 0, angle: 0, team: 0, role: 0, burn: 0, stun: 0, air: 0, jump: 0, sprint: 0, vx: 0, vz: 0, on: false, yaw: 0 };
  function focusFor(dt) {
    const flying = cine && (cine.phase === 'flight' || cine.phase === 'wind' || cine.phase === 'impact');
    if (!flying) { ballFocus.on = false; return null; }
    const b = w.ball, speed = Math.hypot(b.vx, b.vz), iso = view.cameraMode === 'iso';
    if (!ballFocus.on) {
      const me = mine();
      Object.assign(ballFocus, { x: me.x, z: me.z, on: true, yaw: speed > 1 ? Math.atan2(b.vx, b.vz) : view.yaw });
    }
    if (speed > 1) ballFocus.yaw += Math.atan2(Math.sin(Math.atan2(b.vx, b.vz) - ballFocus.yaw), Math.cos(Math.atan2(b.vx, b.vz) - ballFocus.yaw)) * Math.min(1, dt * CINEMA.chaseTurn);
    const back = iso ? 0 : CINEMA.chase;
    const tx = b.x - Math.sin(ballFocus.yaw) * back, tz = b.z - Math.cos(ballFocus.yaw) * back;
    const k = 1 - Math.exp(-dt * (iso ? 5 : 9));
    ballFocus.x += (tx - ballFocus.x) * k; ballFocus.z += (tz - ballFocus.z) * k;
    if (!iso) view.setLook(ballFocus.yaw);
    return ballFocus;
  }

  function consume() {
    const me = w.me;
    for (const e of w.events) {
      view.event(e);
      audio.play(e.type);
      // Rüzgar sahnesi olayları kendisi yürütür (şut çıktı, rakip savruldu, gol oldu): bkz. gosteri-ruzgar.js olay.
      gosteri?.olay?.(e, w);
      // Gösteride titreşim yok: kipin "izleyeni" oyuncu değil kamera, telefonu her golde titretmenin anlamı yok.
      if (touch && !gosteri) buzz(e, me);
      // Tek başına oyunda sinemayı bu sayfa yürütür; çevrim içinde evre sunucudan gelir.
      if (!online) cinema.event(e);
      if (e.type === 'goal') { ui.message(ui.teamName(e.team) + ' TAKIM · GOOOL!', 2.2); audio.play('boom'); view.faceBall(w); }
      if (e.type === 'lineup') view.faceBall(w);
      if (e.type === 'return' && e.id === me) view.faceBall(w);
      if (e.type === 'burn' && e.attacker === me) ui.message('YAKALADIN! Şimdi golü bul.', 1.8);
      if (e.type === 'receive' && e.id === me) ui.message('TOP SENDE', 0.75);
      if (e.type === 'steal' && e.from === me && e.stun) ui.message('TOPU KAPTIRDIN · SERSEMLEDİN', 1.4);
      if (e.type === 'aimLost' && e.id === me) ui.message('KAYARAK TOPU ALDILAR · VURUŞ YOK', 1.6);
      if (e.type === 'aimLost' && e.by === me) ui.message('KAYARAK ALDIN · VURUŞU ENGELLEDİN', 1.6);
      if (e.type === 'overtime') ui.message('ALTIN GOL · Sonraki gol kazanır', 3);
    }
    w.events.length = 0;
    // Gösteride karne açılmaz ve ölçüm gitmez: birkaç saniye sonra yeni maç kurulur (bkz. gosteri.guncelle).
    if (gosteri) return;
    if (!online && w.winner !== null && screen !== 'results') { show('results'); ui.results(w); macBitti(); }
  }

  const refresh = () => { if (!gosteri) ui.hud(w, started && screen !== 'home' && screen !== 'lobby', screen); };
  /**
   * Gösteri sahnesinin zaman ölçeği ve görüntüsü (rüzgar sahnesi ilk çarpmada ve golde ağır çekime geçer, bkz.
   * gosteri-ruzgar.js bakis). Sahnesi olmayan ya da ölçek sürmeyen kipte null: o zaman sinema (cinema.js) geçerlidir.
   */
  const gosteriBakis = () => (gosteri?.bakis ? gosteri.bakis() : null);

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.08, (now - last) / 1000);
    last = now;
    // Müzik sahnesi (bkz. muzik.js): maçta ana tema, son dakikada / altın golde heyecan, geri kalan her yerde (giriş,
    // lobi, mola, karne) sakin parça. Aynı sahne yeniden verilince hiçbir şey olmaz, bu yüzden her kareden sorulur:
    // ekran geçişlerini tek tek kancalamaya gerek kalmaz. Gösteride `muzik.kapali` olduğu için çağrı boşa düşer.
    muzik.sahne(sahneSec(started, altEkran(), w));
    if (started && !gosteri) macKontrol(); // ölçüm: oyuncu 60 sn oynayınca bir kez "bir_dakika" (bayrak dolunca anında döner)
    if (online && started) {
      // Maçı sunucu koşturur: girdi gider, gelen durum ara değerle çizilir. Molada da maç sürer (girdi boş).
      const move = active() ? input.move(view) : null;
      if (active()) {
        net.input(route(input.read(view)), dt);
        tickRightHold(dt);
      } else net.input({ x: 0, z: 0, aim: null, hold: false }, dt);
      net.update(dt, w.cine ? null : move);
    } else if (active()) {
      // Nişanda ve uçuşta ağır çekim (cinema.js): adım başına düşen gerçek zaman küçülür, kurallar aynı kalır.
      acc += dt * (gosteriBakis()?.scale ?? cinema.scale());
      for (let n = 0; acc >= STEP && n < MAX_STEPS; n++) {
        // Gösteride insan girdisi okunmaz: maç sahnesinde on koltuğu da bot yapay zekâsı sürer (bkz. world.js step),
        // rüzgar sahnesinde girdiyi sahnenin kendisi verir (yalnız şutçuya; bkz. gosteri-ruzgar.js girdi).
        step(w, STEP, gosteri ? gosteri.girdi?.(STEP, w) || {} : route(input.read(view)));
        consume();
        acc -= STEP;
        if (screen) break;
      }
      if (!gosteri) tickRightHold(dt);
      cinema.tick(w, dt);
      // Maç bittiyse birkaç saniye sonra yenisi kurulur: gösteri girdisiz döner durur.
      if (gosteri) gosteri.guncelle(dt, w, begin);
    } else acc = 0;
    if (started) syncCine(dt);
    // Gösteride arayüz yoktur (bkz. style.css `.gosteri`): panel, gösterge ve işaret güncellemeleri hiç koşmaz.
    // Rüzgar sahnesi yine de ayaktaki topun dolum rengini ister (bkz. gosteri-ruzgar.js sarj → view/ballview.js).
    const charge = gosteri ? gosteri.sarj?.(w) || null : chargeState();
    if (!gosteri) {
      ui.tickMessage(dt, w, active());
      ui.charge(charge);
      const me = mine();
      ui.speed(active() && !cine && me.sprint > 0 && me.burn <= 0);
      input.sync(w, active());
      // İzometrikte nişan oku: top sendeyken ya da kendi nişanında.
      const aiming = active() && view.cameraMode === 'iso' && ((w.ball.owner === w.me && !cine) || !!myAim());
      view.showAim(aiming ? view.aim(input.move(view)) : null);
    }
    // Çevrim içinde durum pakette gelir: görüntü molada da oynar (sinemada ölçek sunucudan).
    const drawDt = online && started ? dt : screen ? 0 : dt;
    // Rüzgar sahnesi çizimden hemen önce kendi kadrajını kurar ve yükleme kıvılcımlarını saçar (bkz. gosteri-ruzgar.js cizim).
    gosteri?.cizim?.(drawDt, w, view);
    // Gösteride kamera senin oyuncunu değil sahnenin odağını izler (maçta aksiyonun ağırlık merkezi, rüzgar sahnesinde top);
    // izometrikte uçuş sırasında kadraj topu izler.
    view.render(w, drawDt, started && screen !== 'home' && screen !== 'lobby', gosteriBakis() || cinemaLook(), charge, gosteri ? gosteri.odak(drawDt, w) : focusFor(drawDt));
    if (!gosteri) {
      ui.overhead(w, dt, active(), view.project);
      ui.ballMark(w, active() && !cine, view.project);
    }
    uiClock -= dt;
    if (uiClock <= 0) { uiClock = 0.08; refresh(); }
  }

  /**
   * Test kancası. Gösteri kipinde de bilerek açıktır: tests/gosteri-smoke.mjs yayındaki `?gosteri=1` adresini de
   * denetleyebilsin. Yayına sızan bir yetki değil — dünya ve görünüm yalnız okunur, `step` zaten her karede koşan
   * simülasyon adımıdır; kip sunucuya bağlanmadığı için buradan başkasının maçına dokunulamaz.
   */
  if (testMode || gosteri) {
    window.__yakarGol = {
      world: () => w, view: () => view, net: () => net, state: () => ({ screen, started, online, gosteri: !!gosteri, cine: cine && cine.phase }),
      odak: () => (gosteri ? gosteri.nokta() : null),
      muzik: () => muzik.durum(),
      gosteriDurum: () => gosteri?.durum?.() ?? null,
      step: n => { for (let i = 0; i < n; i++) step(w, STEP); consume(); refresh(); },
    };
  }
  /** Android uygulamasında geri tuşu: maçta mola, molada devam, yardımda kapat, giriş ekranında uygulamadan çık. */
  const app = window.Capacitor?.isNativePlatform?.() ? window.Capacitor.registerPlugin?.('App') : null;
  app?.addListener('backButton', () => {
    if (screen === 'help') closeHelp();
    else if (active() || screen === 'pause') pause();
    else if (screen === 'home') app.exitApp();
    else menu();
  });

  refresh();
  // Gösteri: menü ve lobi atlanır, arayüz gizlenir (style.css `.gosteri`), maç hemen başlar.
  if (gosteri) {
    root.classList.add('gosteri');
    root.querySelector('#yg-gosteri').hidden = false;
    begin();
  }
  requestAnimationFrame(frame);
  // Çok oyunculusu açık sekme WebSocket bağlantısıyla sayılır; kapalıysa (uygulama) sinyalle. Gösteride sinyal de yok.
  if (!testMode && !net && !gosteri) heartbeat();
}

/** Dokunmatikte kısa titreşim: şut / pas, top kapma, yanma, gol. */
const BUZZ = { kick: 18, steal: 30, receive: 12, burn: 60, goal: [70, 50, 120] };
function buzz(e, me) {
  const ms = BUZZ[e.type];
  const mine = e.type === 'goal' || e.id === me || e.from === me || e.attacker === me || e.target === me;
  if (ms && mine) try { navigator.vibrate?.(ms); } catch { /* desteklenmiyor */ }
}

/**
 * Sunucuya "bu sekme açık" sinyali (çevrim içi sayısı için, bkz. server.mjs); sekme kapanınca vedalaşır. Çok oyunculusu
 * kapalı platformda (Android uygulaması) kullanılır; sinyal evdeki sunucuya gider (CORS izni var, kapalıysa sessizce düşer).
 */
function heartbeat() {
  const id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  const url = serverHttp() + '/presence?id=' + id;
  const beat = () => { if (!document.hidden) fetch(url, { method: 'POST', keepalive: true }).catch(() => {}); };
  beat();
  setInterval(beat, 20000);
  document.addEventListener('visibilitychange', beat);
  addEventListener('pagehide', () => navigator.sendBeacon?.(url + '&bye=1'));
}
