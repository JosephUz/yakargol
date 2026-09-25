import { createAudio } from './audio.js';
import { CINEMA, KICK, TEAMS } from './config.js';
import { createInput } from './input.js';
import { enterFullscreen, touchDevice } from './touch.js';
import { createUI } from './ui.js';
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
  camButton.onclick = toggleCamera;
  const ui = createUI(root);
  const audio = createAudio();
  let cine = null, rightHold = null;
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
    refresh();
  }
  function begin() {
    endCinema(); rightHold = null;
    w = createWorld(); view.faceBall(w);
    started = true; acc = 0;
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
    if (!started || screen === 'home' || screen === 'results') return;
    if (screen === 'help') { closeHelp(); return; }
    if (screen === 'pause') { if (performance.now() - pausedAt > 250) resume(); return; }
    show('pause');
  }
  function menu() { endCinema(); started = false; w = createWorld(); view.faceBall(w); show('home'); }

  ui.button('start', begin); ui.button('restart', begin); ui.button('again', begin);
  ui.button('pause-open', pause); ui.button('resume', resume); ui.button('menu', menu);
  ui.button('help-open', help); ui.button('help-close', closeHelp);
  ui.button('sound', () => ui.setSound(audio.toggle()));

  /** Yakar top çıktı: oyun donar, top alev alır; kamera topa döner. */
  function startCinema(e) {
    if (cine) return;
    const p = w.players[e.id];
    cine = { phase: 'ignite', t: 0 };
    view.cinemaStart();
    view.event({ type: 'ignite', x: w.ball.x, z: w.ball.z });
    audio.play('ignite');
    ui.cinema(true, p.id === 0 ? 'SEN' : TEAMS.names[p.team] + ' · ' + p.name);
  }
  const canFire = () => { const p = w.players[0]; return w.ball.owner === 0 && p.energyCd <= 0 && w.fireLeft[0] > 0 && p.kickCd <= 0 && p.stun <= 0; };
  const fireBlocked = () => { const p = w.players[0]; return w.fireLeft[0] <= 0 ? 'TAKIMIN YAKAR TOP HAKKI BİTTİ' : p.energyCd > 0 ? 'ENERJİ DOLMADI' : null; };
  /** Sağ tık, top sendeyken: simülasyona gitmez; kısa basış pas olur, basılı tutuş nişana geçer (tickRightHold). */
  function route(cmd) {
    const owns = w.ball.owner === 0;
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
    if (canFire()) { rightHold = null; startAim(); }
    else if (!rightHold.warned) { rightHold.warned = true; const why = fireBlocked(); if (why) ui.message(why, 1.2); }
  }
  /** Dolum halkası ve topun rengi için şu an hazırlanan vuruş (yoksa null). */
  function chargeState() {
    if (!active()) return null;
    const p = w.players[0];
    if (cine && cine.phase === 'aim') return { kind: 'fire', p: 1 - cine.t / CINEMA.aim, text: 'BIRAK: YAKAR TOP', full: true };
    if (cine) return null;
    if (rightHold) {
      const why = fireBlocked(), full = rightHold.t >= CINEMA.hold;
      return { kind: why ? 'blocked' : 'fire', p: rightHold.t / CINEMA.hold, full: full && !why, text: why ? why + ' · BIRAK: PAS' : 'BIRAK: PAS · TUT: YAKAR TOP' };
    }
    if (p.charge > 0 && w.ball.owner === 0) {
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
  function tickAim(dt) {
    cine.t += dt;
    const p = w.players[0], aim = view.aim(input.move(view));
    p.angle = Math.atan2(aim.x - p.x, aim.z - p.z);
    ui.cinemaAim(1 - cine.t / CINEMA.aim);
    const go = input.take('secondaryUp') | !input.rightHeld() | input.take('tap') | cine.t >= CINEMA.aim;
    if (go) fireNow();
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

  function consume() {
    for (const e of w.events) {
      view.event(e);
      audio.play(e.type);
      if (touch) buzz(e);
      if (e.type === 'kick' && e.kind === 'fire') {
        if (cine && cine.phase === 'aim') { Object.assign(cine, { phase: 'flight', t: 0 }); ui.cinema(true, 'SEN'); }
        else startCinema(e);
      }
      if (e.type === 'burn' && cine) {
        Object.assign(cine, { phase: 'impact', t: 0 });
        view.event({ type: 'impact', x: e.x, z: e.z });
        audio.play('impact');
      }
      if (e.type === 'goal') { ui.message(ui.teamName(e.team) + ' TAKIM · GOOOL!', 2.2); audio.play('boom'); view.faceBall(w); }
      if (e.type === 'lineup') view.faceBall(w);
      if (e.type === 'return' && e.id === 0) view.faceBall(w);
      if (e.type === 'burn' && e.attacker === 0) ui.message('YAKALADIN! Şimdi golü bul.', 1.8);
      if (e.type === 'receive' && e.id === 0) ui.message('TOP SENDE', 0.75);
      if (e.type === 'steal' && e.from === 0 && e.stun) ui.message('TOPU KAPTIRDIN · SERSEMLEDİN', 1.4);
      if (e.type === 'overtime') ui.message('ALTIN GOL · Sonraki gol kazanır', 3);
    }
    w.events.length = 0;
    if (w.winner !== null && screen !== 'results') { show('results'); ui.results(w); }
  }

  const refresh = () => ui.hud(w, started && screen !== 'home', screen);

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.08, (now - last) / 1000);
    last = now;
    if (active()) {
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
    ui.speed(active() && !cine && w.players[0].sprint > 0 && w.players[0].burn <= 0);
    input.sync(w, active());
    // İzometrikte nişan oku: top sendeyken ya da yakar top nişanında.
    const aiming = active() && view.cameraMode === 'iso' && ((w.ball.owner === 0 && !cine) || cine?.phase === 'aim');
    view.showAim(aiming ? view.aim(input.move(view)) : null);
    view.render(w, screen ? 0 : dt, started && screen !== 'home', cinemaLook(), charge);
    ui.overhead(w, dt, active(), view.project);
    ui.ballMark(w, active() && !cine, view.project);
    uiClock -= dt;
    if (uiClock <= 0) { uiClock = 0.08; refresh(); }
  }

  if (testMode) {
    window.__yakarGol = {
      world: () => w, view: () => view, state: () => ({ screen, started, cine: cine && cine.phase }),
      step: n => { for (let i = 0; i < n; i++) step(w, STEP); consume(); refresh(); },
    };
  }
  /** Android uygulamasında geri tuşu: maçta mola, molada devam, yardımda kapat, giriş ekranında uygulamadan çık. */
  const app = window.Capacitor?.isNativePlatform?.() && window.Capacitor.registerPlugin?.('App');
  app?.addListener('backButton', () => {
    if (screen === 'help') closeHelp();
    else if (active() || screen === 'pause') pause();
    else if (screen === 'home') app.exitApp();
    else menu();
  });

  refresh();
  requestAnimationFrame(frame);
  if (!testMode) heartbeat();
}

/** Dokunmatikte kısa titreşim: şut / pas, top kapma, yanma, gol. */
const BUZZ = { kick: 18, steal: 30, receive: 12, burn: 60, goal: [70, 50, 120] };
function buzz(e) {
  const ms = BUZZ[e.type];
  const mine = e.type === 'goal' || e.id === 0 || e.from === 0 || e.attacker === 0 || e.target === 0;
  if (ms && mine) try { navigator.vibrate?.(ms); } catch { /* desteklenmiyor */ }
}

/**
 * Sunucuya "bu sekme açık" sinyali (çevrim içi sayısı için, bkz. server.mjs); sekme kapanınca vedalaşır. Oyun dosyaları
 * Cloudflare'deki statik siteden (yakargol.josephuz.com) ya da Android uygulamasının içinden gelir; sinyal evdeki sunucuya
 * gider (sunucu CORS izni verir, kapalıysa sessizce düşer). Sayfa sunucunun kendisinden açıldıysa (yerelde) aynı adres.
 */
const LIVE = 'https://yakargol-sunucu.josephuz.com';
const selfHosted = () => !window.Capacitor?.isNativePlatform?.() && /^(localhost|yakargol-sunucu\.josephuz\.com|[\d.]+|\[.*\])$/.test(location.hostname);
function heartbeat() {
  const id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  const url = (selfHosted() ? '' : LIVE) + '/presence?id=' + id;
  const beat = () => { if (!document.hidden) fetch(url, { method: 'POST', keepalive: true }).catch(() => {}); };
  beat();
  setInterval(beat, 20000);
  document.addEventListener('visibilitychange', beat);
  addEventListener('pagehide', () => navigator.sendBeacon?.(url + '&bye=1'));
}
