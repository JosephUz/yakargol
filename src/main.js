import { createAudio } from './audio.js';
import { CINEMA, KICK, TEAMS } from './config.js';
import { createInput } from './input.js';
import { createLobby } from './lobby.js';
import { createNetClient } from './net/client.js';
import { macBasladi, macBitti, macKontrol } from './olcum.js';
import { onlineEnabled, serverHttp } from './platform.js';
import { enterFullscreen, touchDevice } from './touch.js';
import { createUI, onTap } from './ui.js';
import { createView } from './view/view.js';
import { createWorld, step } from './world.js';

/**
 * İstemci uygulaması: dünya, görünüm, girdi, arayüz ve ekran akışı (giriş → maç ↔ mola / yardım → maç sonu).
 * Her kare: sabit 1/60 sn adımlarla simülasyon (girdi her adımda okunur) → olaylar (efekt, ses, mesaj, kamera) →
 * çizim → karakter üstü gösterge; tabela ve kart kısa aralıkla tazelenir. Oyuncu doğunca (maç başı, gol sonrası
 * diziliş, kenardan dönüş) kamera topa çevrilir. Golde patlama olur, herkes fırlar (GOAL_BLAST), sonra santra. Fare kilidi düşerse (Esc) oyun molaya girer.
 *
 * Yakar top sineması (CINEMA): biri yakar top atınca simülasyon zamanı ölçeklenir: tutuşma (donuk) → uçuş (ağır
 * çekim) → çarpma (daha ağır). Simülasyon kuralları aynı kalır; yalnızca adım başına düşen gerçek zaman değişir.
 * İnsan oyuncuda tutuşma yerine nişan evresi vardır: top sendeyken sağ tık kısa basılırsa pas, CINEMA.hold'dan uzun
 * basılı kalırsa oyun donar ve CINEMA.aim saniye fareyle nişan alınır; bırakınca (sol tık ya da süre dolunca) yakar top fırlar.
 *
 * **Çevrim içi** (webde, config.js → ONLINE; bkz. lobby.js, net/): maçı sunucu koşturur, bu sayfa girdiyi yollar ve
 * gelen durumu çizer (net/client.js). Sinemayı da sunucu yürütür (herkes aynı anda donar / ağır çekime geçer); nişan
 * evresinde nişan noktası buradan gider. Çevrim içinde mola maçı durdurmaz.
 *
 * Dokunmatik kip (telefon, tablet, Android uygulaması; ?touch=1 ile masaüstünde de): joystick ve düğmeler (touch.js),
 * hafif görüntü, önemli anlarda titreşim; uygulamada Android geri tuşu mola / devam / çıkış olur.
 */
const STEP = 1 / 60, MAX_STEPS = 5;

export async function start(root) {
  const testMode = new URLSearchParams(location.search).has('test');
  const touch = touchDevice();
  root.classList.toggle('touch', touch);
  const view = createView(root.querySelector('#yg-view'), { mobile: touch });
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
    try { localStorage.setItem('yg.cam', mode); } catch { /* yok */ }
  };
  let savedCam = null, unlockQuiet = false, input = null;
  try { savedCam = localStorage.getItem('yg.cam'); } catch { /* yok */ }
  setCamera(touch ? (savedCam === 'shoulder' ? 'shoulder' : 'iso') : savedCam === 'iso' ? 'iso' : 'shoulder');
  const toggleCamera = () => setCamera(view.cameraMode === 'iso' ? 'shoulder' : 'iso');
  onTap(camButton, toggleCamera);
  const ui = createUI(root);
  const audio = createAudio();
  let cine = null, rightHold = null, online = false;
  let w = createWorld(), screen = 'home', started = false, acc = 0, uiClock = 0, helpReturn = 'home', pausedAt = 0, last = performance.now();
  view.faceBall(w);

  const active = () => started && !screen;
  input = createInput(view.canvas, {
    testMode,
    touch: touch && root,
    playing: active,
    onHelp: help,
    onCamera: () => toggleCamera(),
    onPause: pause,
    onLook: (dx, dy) => { if (!cine || cine.phase === 'aim') view.look(dx, dy); },
    onPoint: (x, y) => view.point(x, y),
    canLock: () => view.cameraMode !== 'iso',
    onUnlock: () => { if (unlockQuiet) { unlockQuiet = false; return; } if (active() && view.cameraMode !== 'iso') show('pause'); },
    onBlur: () => { if (active()) show('pause'); else input.clear(); },
  });

  function show(next) {
    screen = next;
    if (next === 'pause') pausedAt = performance.now();
    if (next) input.unlock();
    ui.show(next);
    input.clear();
    // Çevrim içinde mola yalnız bir perdedir: yeniden başlatma yok, çıkış odadan çıkar.
    root.querySelector('#yg-restart').hidden = online;
    root.querySelector('#yg-pause-note').hidden = !online;
    root.querySelector('#yg-again').textContent = online ? 'LOBİYE DÖN' : 'BİR MAÇ DAHA';
    refresh();
  }
  function begin() {
    if (online) { showLobby(); return; }
    endCinema(); rightHold = null;
    w = createWorld(); view.faceBall(w);
    started = true; acc = 0;
    macBasladi(); // ölçüm: çevrimdışı maç başladı
    if (touch) enterFullscreen();
    show(null); input.lock();
  }
  function resume() { show(null); input.lock(); if (touch) enterFullscreen(); }
  function help() {
    if (screen === 'help') { closeHelp(); return; }
    helpReturn = screen; show('help');
  }
  function closeHelp() { show(helpReturn); if (active()) input.lock(); }
  /** Esc: kilitliyken tarayıcı Esc'yi kilidi bırakmaya harcar (o da molaya sokar); kısa süre içindeki ikinci Esc yok sayılır. */
  function pause() {
    if (!started || screen === 'home' || screen === 'results' || screen === 'lobby') return;
    if (screen === 'help') { closeHelp(); return; }
    if (screen === 'pause') { if (performance.now() - pausedAt > 250) resume(); return; }
    show('pause');
  }
  function menu() {
    if (online) { leaveRoom(); return; }
    endCinema(); started = false; w = createWorld(); view.faceBall(w); show('home');
  }

  ui.button('start', () => { if (online) leaveRoom(); begin(); }); ui.button('restart', begin); ui.button('again', begin);
  ui.button('pause-open', pause); ui.button('resume', resume); ui.button('menu', menu);
  ui.button('help-open', help); ui.button('help-close', closeHelp);
  const toggleSound = () => ui.setSound(audio.toggle());
  ui.button('sound', toggleSound); ui.button('pause-sound', toggleSound);
  ui.setSound(audio.enabled);

  // ---------- Çevrim içi ----------
  const net = onlineEnabled() ? createNetClient({
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
      online = true; endCinema(); rightHold = null;
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
    online = false; endCinema(); started = false; w = createWorld(); view.faceBall(w);
    lobby.status('');
    show('home');
  }
  if (net) {
    inviteCode = lobby.urlCode();
    if (inviteCode) lobby.showJoin();
    net.connect(lobby.nick());
  }

  /** Yakar top çıktı: oyun donar, top alev alır; kamera topa döner. */
  function startCinema(e) {
    if (cine) return;
    const p = w.players[e.id];
    cine = { phase: 'ignite', t: 0 };
    view.cinemaStart();
    view.event({ type: 'ignite', x: w.ball.x, z: w.ball.z });
    audio.play('ignite');
    ui.cinema(true, who(p));
  }
  const who = p => (p.id === w.me ? 'SEN' : TEAMS.names[p.team] + ' · ' + p.name);
  const canFire = () => { const p = w.players[w.me]; return w.ball.owner === w.me && p.energyCd <= 0 && w.fireLeft[p.team] > 0 && p.kickCd <= 0 && p.stun <= 0; };
  const fireBlocked = () => { const p = w.players[w.me]; return w.fireLeft[p.team] <= 0 ? 'TAKIMIN YAKAR TOP HAKKI BİTTİ' : p.energyCd > 0 ? 'ENERJİ DOLMADI' : null; };
  /** Sağ tık, top sendeyken: simülasyona gitmez; kısa basış pas olur, basılı tutuş nişana geçer (tickRightHold). */
  function route(cmd) {
    const owns = w.ball.owner === w.me;
    if (cmd.secondary && owns) { cmd.secondary = false; rightHold = { t: 0, warned: false }; }
    if (rightHold) {
      if (!owns) rightHold = null;
      else if (cmd.secondaryUp || !input.rightHeld()) { cmd.pass = true; rightHold = null; }
    }
    return cmd;
  }
  function tickRightHold(dt) {
    if (!rightHold || cine) return;
    rightHold.t += dt;
    if (rightHold.t < CINEMA.hold) return;
    if (canFire()) { rightHold = null; if (online) net.aim(); else startAim(); }
    else if (!rightHold.warned) { rightHold.warned = true; const why = fireBlocked(); if (why) ui.message(why, 1.2); }
  }
  /** Dolum halkası ve topun rengi için şu an hazırlanan vuruş (yoksa null). */
  function chargeState() {
    if (!active()) return null;
    const p = w.players[w.me];
    if (cine && cine.phase === 'aim' && cine.mine !== false) return { kind: 'fire', p: 1 - cine.t / CINEMA.aim, text: 'BIRAK: YAKAR TOP', full: true };
    if (cine) return null;
    if (rightHold) {
      const why = fireBlocked(), full = rightHold.t >= CINEMA.hold;
      return { kind: why ? 'blocked' : 'fire', p: rightHold.t / CINEMA.hold, full: full && !why, text: why ? why + ' · BIRAK: PAS' : 'BIRAK: PAS · TUT: YAKAR TOP' };
    }
    if (p.charge > 0 && w.ball.owner === w.me) {
      const full = p.charge >= KICK.windCharge, wait = full && p.energyCd > 0;
      return { kind: wait ? 'blocked' : 'wind', p: p.charge / KICK.windCharge, full: full && !wait, text: wait ? 'ENERJİ BEKLENİYOR · BIRAK: ŞUT' : 'BIRAK: ŞUT · TUT: RÜZGAR' };
    }
    return null;
  }

  /** Nişan: oyun donar, top ayakta alev alır, fare serbest; bırakınca fireNow. */
  function startAim() {
    cine = { phase: 'aim', t: 0 };
    view.event({ type: 'ignite', x: w.ball.x, z: w.ball.z });
    audio.play('ignite');
    ui.cinema(true, 'NİŞAN AL · BIRAK: ŞUT', 1);
  }
  /** Nişan evresinde bırakıldı mı (sağ tık bırakıldı, sol tık ya da süre doldu). */
  const aimReleased = () => input.take('secondaryUp') | !input.rightHeld() | input.take('tap') | cine.t >= CINEMA.aim;
  function tickAim(dt) {
    cine.t += dt;
    const p = w.players[w.me], aim = view.aim(input.move(view));
    p.angle = Math.atan2(aim.x - p.x, aim.z - p.z);
    ui.cinemaAim(1 - cine.t / CINEMA.aim);
    if (aimReleased()) fireNow();
  }
  /** Nişanlanan yöne yakar top; kamera bu bakışı kaydeder (uçuştan sonra buraya döner). */
  function fireNow() {
    view.cinemaStart();
    const cmd = input.read(view);
    step(w, STEP, { aim: cmd.aim, fire: true });
    consume();
    if (cine && cine.phase === 'aim') endCinema();
  }
  function endCinema() {
    if (!cine) return;
    cine = null;
    view.cinemaEnd();
    ui.cinema(false);
  }
  /** Sinemanın evresine göre simülasyon zaman ölçeği ve alev yoğunluğu. */
  function cinemaLook() {
    if (!cine) return null;
    if (cine.phase === 'aim') return { scale: 0, heat: Math.min(1, cine.t / 0.6), track: false };
    if (cine.phase === 'ignite') return { scale: 0, heat: Math.min(1, cine.t / CINEMA.ignite) };
    if (cine.phase === 'flight') return { scale: CINEMA.flightScale, heat: Math.max(0.35, 1 - cine.t / CINEMA.flightMax) };
    return { scale: CINEMA.impactScale, heat: 1 };
  }
  function tickCinema(dt) {
    if (!cine) return;
    if (cine.phase === 'aim') { tickAim(dt); return; }
    cine.t += dt;
    if (cine.phase === 'ignite' && cine.t >= CINEMA.ignite) Object.assign(cine, { phase: 'flight', t: 0 });
    else if (cine.phase === 'flight' && (w.ball.kind !== 'fire' || cine.t >= CINEMA.flightMax)) endCinema();
    else if (cine.phase === 'impact' && cine.t >= CINEMA.impact) endCinema();
  }
  /**
   * Çevrim içi sinema: evreyi sunucu söyler (durum paketindeki cine). Evre değişince görüntü (şeritler, alev, kamera)
   * ona uyar; senin nişanındaysa nişan noktası ve bırakış sunucuya gider.
   */
  function syncNetCinema(dt) {
    const sc = w.cine;
    if (!sc) { endCinema(); return; }
    const p = w.players[sc.id], mine = sc.id === w.me;
    if (!cine) {
      cine = { phase: sc.phase, t: 0, mine, sent: false };
      view.cinemaStart();
      view.event({ type: 'ignite', x: w.ball.x, z: w.ball.z });
      audio.play('ignite');
      if (sc.phase === 'aim') ui.cinema(true, mine ? 'NİŞAN AL · BIRAK: ŞUT' : who(p) + ' NİŞAN ALIYOR', mine ? 1 : null);
      else ui.cinema(true, who(p));
    } else if (cine.phase !== sc.phase) {
      if (cine.phase === 'aim') ui.cinema(true, who(p));
      if (sc.phase === 'impact') { view.event({ type: 'impact', x: w.ball.x, z: w.ball.z }); audio.play('impact'); }
      Object.assign(cine, { phase: sc.phase, t: 0 });
    }
    cine.t += dt;
    if (cine.phase === 'aim' && mine && active() && !cine.sent) {
      const aim = view.aim(input.move(view));
      p.angle = Math.atan2(aim.x - p.x, aim.z - p.z);
      ui.cinemaAim(1 - cine.t / CINEMA.aim);
      const go = !!aimReleased();
      if (go) cine.sent = true;
      net.aimAt(aim, go);
    }
  }

  function consume() {
    const me = w.me;
    for (const e of w.events) {
      view.event(e);
      audio.play(e.type);
      if (touch) buzz(e, me);
      if (!online && e.type === 'kick' && e.kind === 'fire') {
        if (cine && cine.phase === 'aim') { Object.assign(cine, { phase: 'flight', t: 0 }); ui.cinema(true, 'SEN'); }
        else startCinema(e);
      }
      if (!online && e.type === 'burn' && cine) {
        Object.assign(cine, { phase: 'impact', t: 0 });
        view.event({ type: 'impact', x: e.x, z: e.z });
        audio.play('impact');
      }
      if (e.type === 'goal') { ui.message(ui.teamName(e.team) + ' TAKIM · GOOOL!', 2.2); audio.play('boom'); view.faceBall(w); }
      if (e.type === 'lineup') view.faceBall(w);
      if (e.type === 'return' && e.id === me) view.faceBall(w);
      if (e.type === 'burn' && e.attacker === me) ui.message('YAKALADIN! Şimdi golü bul.', 1.8);
      if (e.type === 'receive' && e.id === me) ui.message('TOP SENDE', 0.75);
      if (e.type === 'steal' && e.from === me && e.stun) ui.message('TOPU KAPTIRDIN · SERSEMLEDİN', 1.4);
      if (e.type === 'overtime') ui.message('ALTIN GOL · Sonraki gol kazanır', 3);
    }
    w.events.length = 0;
    if (!online && w.winner !== null && screen !== 'results') { show('results'); ui.results(w); macBitti(); }
  }

  const refresh = () => ui.hud(w, started && screen !== 'home' && screen !== 'lobby', screen);

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.08, (now - last) / 1000);
    last = now;
    if (started) macKontrol(); // ölçüm: oyuncu 60 sn oynayınca bir kez "bir_dakika" (bayrak dolunca anında döner)
    if (online && started) {
      // Maçı sunucu koşturur: girdi gider, gelen durum ara değerle çizilir. Molada da maç sürer (girdi boş).
      const move = active() ? input.move(view) : null;
      if (active()) {
        const cmd = route(input.read(view));
        if (!cine) net.input(cmd, dt);
        tickRightHold(dt);
      } else net.input({ x: 0, z: 0, aim: null, hold: false }, dt);
      net.update(dt, cine ? null : move);
      syncNetCinema(dt);
    } else if (active()) {
      acc += dt * (cine ? cinemaLook().scale : 1);
      for (let n = 0; acc >= STEP && n < MAX_STEPS; n++) {
        const was = cine;
        step(w, STEP, route(input.read(view)));
        consume();
        acc -= STEP;
        if (screen || (cine && !was)) { if (cine) acc = 0; break; }
      }
      tickRightHold(dt);
      tickCinema(dt);
    } else acc = 0;
    ui.tickMessage(dt, w, active());
    const charge = chargeState();
    ui.charge(charge);
    const me = w.players[w.me];
    ui.speed(active() && !cine && me.sprint > 0 && me.burn <= 0);
    input.sync(w, active());
    // İzometrikte nişan oku: top sendeyken ya da yakar top nişanında.
    const aiming = active() && view.cameraMode === 'iso' && ((w.ball.owner === w.me && !cine) || (cine?.phase === 'aim' && cine.mine !== false));
    view.showAim(aiming ? view.aim(input.move(view)) : null);
    // Çevrim içinde durum pakette gelir: görüntü molada da oynar (sinemada ölçek sunucudan).
    const drawDt = online && started ? dt : screen ? 0 : dt;
    view.render(w, drawDt, started && screen !== 'home' && screen !== 'lobby', online ? netLook() : cinemaLook(), charge);
    ui.overhead(w, dt, active(), view.project);
    ui.ballMark(w, active() && !cine, view.project);
    uiClock -= dt;
    if (uiClock <= 0) { uiClock = 0.08; refresh(); }
  }
  /** Çevrim içi sinemanın görüntüsü: ölçek oyuncu sallanması için, alev yoğunluğu evreden. */
  function netLook() {
    const look = cinemaLook();
    return look && cine.phase === 'aim' && !cine.mine ? { ...look, track: true } : look;
  }

  if (testMode) {
    window.__yakarGol = {
      world: () => w, view: () => view, net: () => net, state: () => ({ screen, started, online, cine: cine && cine.phase }),
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
  requestAnimationFrame(frame);
  // Çok oyunculusu açık sekme WebSocket bağlantısıyla sayılır; kapalıysa (uygulama) sinyalle.
  if (!testMode && !net) heartbeat();
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
