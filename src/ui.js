import { ENERGY, KICK, MATCH, STEAL, TEAMS } from './config.js';
import { benchX, lift } from './view/actors.js';

/**
 * Arayüz (DOM): ekranlar (giriş, yardım, mola, maç sonu), skor tabelası ve saat, sol alttaki oyuncu kartı, yanma
 * perdesi, ortadaki mesaj ve **karakterin sırtındaki gösterge**: enerji geri sayımı (kayma ve hızlı koşu ortak), enerji dolunca kısa "HAZIR" ve top kaptırınca sersemlik süresi. Nişangahın çevresinde **dolum halkası**:
 * sol tık (rüzgar) ve sağ tık (yakar pas) basılıyken hangi vuruşun hazırlandığını ve ne kadar dolduğunu gösterir. Simülasyonu yalnızca okur.
 */
const SCREENS = ['home', 'help', 'pause', 'results', 'lobby'];
const CHARGE_COLORS = { wind: '#8ff3ff', fire: '#ff7a2e', blocked: '#9aa39c' };
const STATS = ['goals', 'passes', 'burns', 'steals', 'saves'];
/** Dokunuşun basış sayılması için parmağın kayabileceği en fazla piksel ve dokunuş sonrası click'i yutma süresi (ms). */
const TAP_SLOP = 12, TAP_CLICK_GUARD = 700;

/**
 * Düğmeye basış. Dokunuşta `click` beklenmez: Chrome hızlı bir kaydırmadan hemen sonraki ilk dokunuşun `click`'ini
 * yutar (kaydırmanın sönümünü durdurmak için), bu yüzden bakışı çevirip hemen üstteki 🎥 / ☰ / 🔊 düğmesine dokunan
 * oyuncuda düğmeler yarım saniye kadar ölü kalıyordu. Dokunuş `pointerup` ile işlenir (parmak düğmeden kaymadıysa).
 * `pointerdown`'da preventDefault şart: yoksa tarayıcı dokunuşun ardından uyumluluk fare olaylarını üretir ve düğme
 * ekranı kapattığı için bunlar altta kalan sahaya düşer (izometrik nişanı imlece kilitler, şut tetikler).
 * Fare ve klavye (Enter / Boşluk) eskisi gibi `click` ile çalışır; iki yol birden gelirse ikincisi yutulur.
 */
export function onTap(node, fn) {
  let down = null, handled = -Infinity;
  node.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') { down = null; return; }
    e.preventDefault();
    node.focus?.({ preventScroll: true });
    down = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  node.addEventListener('pointercancel', () => { down = null; });
  node.addEventListener('pointerup', e => {
    const d = down;
    down = null;
    if (!d || d.id !== e.pointerId || Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_SLOP) return;
    handled = performance.now();
    fn(e);
  });
  node.addEventListener('click', e => { if (performance.now() - handled > TAP_CLICK_GUARD) fn(e); });
}

export function createUI(root) {
  const $ = id => root.querySelector('#yg-' + id);
  const el = {
    screens: Object.fromEntries(SCREENS.map(s => [s, $(s)])),
    playing: ['scoreboard', 'controls', 'player', 'pause-open'].map($),
    blue: $('blue-score'), orange: $('orange-score'), fires: [$('blue-fire'), $('orange-fire')], winds: [$('blue-wind'), $('orange-wind')], timer: $('timer'), period: $('period'),
    side: $('side'), ball: $('ball-status'), energyText: $('energy-text'), energyFill: $('energy-fill'),
    burn: $('burn'), burnCount: $('burn-count'), crosshair: $('crosshair'), message: $('message'),
    over: $('overhead'), overEnergy: $('over-energy'), overEnergyText: $('over-energy-text'), overEnergyFill: $('over-energy-fill'),
    charge: $('charge'), chargeText: $('charge-text'), speed: $('speed'), overStun: $('over-stun'), overStunText: $('over-stun-text'), overStunFill: $('over-stun-fill'),
    ballmark: $('ballmark'), cine: $('cine'), cineWho: $('cine-who'), cineAim: $('cine-aim'), cineAimFill: $('cine-aim-fill'), fireLeft: $('fire-left'), windLeft: $('wind-left'), cineTitle: $('cine-title'),
    site: $('site'), full: $('full'), resultTitle: $('result-title'), finalScore: $('final-score'), stats: $('stats'), sound: $('sound'), pauseSound: $('pause-sound'),
    muzik: $('muzik'), pauseMuzik: $('pause-muzik'),
  };
  // Skor tabelasındaki alev damlaları hak sayısı kadar (KICK.fireShots).
  for (const node of el.fires) node.innerHTML = '<i></i>'.repeat(KICK.fireShots);
  for (const node of el.winds) node.innerHTML = '<i></i>'.repeat(KICK.windShots);
  let messageTime = 0, readyTime = 0, lastEnergy = 0, muzikVar = true;

  return {
    button: (id, fn) => onTap($(id), fn),

    show(screen) { for (const s of SCREENS) el.screens[s].hidden = screen !== s; },

    /** Ses (efekt) düğmeleri — üst çubuk ve mola menüsü aynı durumu, standart yazıyla gösterir. */
    setSound(on) {
      const yazi = on ? 'Ses: açık' : 'Ses: kapalı';
      for (const b of [el.sound, el.pauseSound]) { b.textContent = yazi; b.classList.toggle('muted', !on); }
    },

    /**
     * Müzik düğmeleri (üst çubuk ve mola menüsü); efekt sesinden **bağımsız** (bkz. muzik.js). Ses düzeyi sabit,
     * menüde sürgü yok (oyuncu cihazın sesinden ayarlar). Gösteri kiplerinde müzik hiç kurulmaz: `setMuzikVar(false)` düğmeleri gizler.
     */
    setMuzik(on) {
      const yazi = on ? 'Müzik: açık' : 'Müzik: kapalı';
      for (const b of [el.muzik, el.pauseMuzik]) { b.textContent = yazi; b.classList.toggle('muted', !on); }
    },
    /** Müzik ayarı var mı (gösteri kiplerinde ve hiç parça yokken yok): düğmeler büsbütün gizlenir. */
    setMuzikVar(gorunur) { muzikVar = gorunur; el.pauseMuzik.hidden = !gorunur; if (!gorunur) el.muzik.hidden = true; },

    message(text, time = 2) { el.message.textContent = text; el.message.hidden = false; messageTime = time; },

    /** Mesajın süresi; başlama beklemesinde geri sayım. */
    tickMessage(dt, w, active) {
      if (messageTime > 0 && active) { messageTime -= dt; if (messageTime <= 0) el.message.hidden = true; }
      if (messageTime > 0) return;
      if (active && w.kickoff > 0) { el.message.hidden = false; el.message.textContent = 'HAZIR OL · ' + Math.ceil(w.kickoff); }
      else el.message.hidden = true;
    },

    /** Tabela, saat ve oyuncu kartı (sık değişmeyenler; kare başına değil, kısa aralıkla). */
    hud(w, playing, screen) {
      for (const node of el.playing) node.hidden = !playing;
      // Giriş ekranı ve lobide duran üst çubuk düğmeleri; maç başlayınca skor tabelasına yer açılır. Tam ekran
      // düğmesi zaten yalnız telefon tarayıcısında görünür (style.css → `#yakar-gol.tam-ekran #yg-full`).
      el.site.hidden = playing;
      el.full.hidden = playing;
      // Müzik düğmesi standart çubuğun parçasıdır; telefonda maç sırasında gizlenir, çünkü üst çubuktaki beşinci
      // simge skor tabelasının üstüne biner (bkz. tests/mobil-tam-ekran.mjs). Müzik o sırada ☰ → mola menüsünden
      // açılıp kapatılır; masaüstünde çubukta durmaya devam eder.
      el.muzik.hidden = !muzikVar || (playing && root.classList.contains('touch'));
      el.crosshair.hidden = !playing || !!screen;
      el.blue.textContent = w.score[0]; el.orange.textContent = w.score[1];
      el.fires.forEach((node, team) => {
        node.title = TEAMS.names[team] + ' takımının yakar pas hakkı: ' + w.fireLeft[team];
        [...node.children].forEach((pip, i) => pip.classList.toggle('used', i >= w.fireLeft[team]));
      });
      el.winds.forEach((node, team) => {
        node.title = TEAMS.names[team] + ' takımının rüzgar şutu hakkı: ' + w.windLeft[team];
        [...node.children].forEach((pip, i) => pip.classList.toggle('used', i >= w.windLeft[team]));
      });
      const left = Math.max(0, Math.ceil(MATCH.duration - w.time));
      el.timer.textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
      el.period.textContent = w.overtime ? 'ALTIN GOL' : '5v5 · TEK MAÇ';
      const p = w.players[w.me], owner = w.players[w.ball.owner];
      el.side.textContent = 'SEN / ' + TEAMS.names[p.team] + ' TAKIM';
      el.ball.textContent = p.burn > 0 ? 'KENARDASIN' : p.stun > 0 ? 'SERSEMLEDİN' : w.ball.owner === w.me ? 'TOP SENDE' : owner?.team === p.team ? 'PAS İÇİN AÇIL' : 'TOPU KAZAN';
      el.energyText.textContent = p.energyCd > 0 ? p.energyCd.toFixed(1) + ' sn' : 'HAZIR';
      el.energyFill.style.width = (1 - p.energyCd / ENERGY.cooldown) * 100 + '%';
      el.fireLeft.textContent = w.fireLeft[p.team] + ' / ' + KICK.fireShots;
      el.fireLeft.classList.toggle('empty', w.fireLeft[p.team] <= 0);
      el.windLeft.textContent = w.windLeft[p.team] + ' / ' + KICK.windShots;
      el.windLeft.classList.toggle('empty', w.windLeft[p.team] <= 0);
      el.burn.hidden = !playing || !!screen || p.burn <= 0;
      el.burnCount.textContent = p.burn.toFixed(1) + ' sn';
    },

    /**
     * Top ekranda değilse kenarda işaret: topun yönünü gösteren ok, ekrana girince kaybolur (yakar pasta kırmızı).
     * project: dünya → ekran (behind: kameranın arkasında).
     */
    ballMark(w, visible, project) {
      const b = w.ball, m = 30, W = innerWidth, H = innerHeight;
      let s = visible ? project(b.x, 0.4, b.z) : null;
      const onScreen = s && !s.behind && s.x > 0 && s.x < W && s.y > 0 && s.y < H;
      el.ballmark.hidden = !s || onScreen;
      if (el.ballmark.hidden) return;
      // Kameranın arkasındaki nokta ekranda ters düşer: yön ortadan çevrilir.
      let dx = s.x - W / 2, dy = s.y - H / 2;
      if (s.behind) { dx = -dx; dy = -dy; if (Math.hypot(dx, dy) < 1) dy = 1; }
      const k = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), (H / 2 - m) / Math.abs(dy || 1e-6));
      el.ballmark.style.transform = `translate(${W / 2 + dx * k}px,${H / 2 + dy * k}px) translate(-50%,-50%)`;
      el.ballmark.style.setProperty('--a', Math.atan2(dy, dx) + 'rad');
      el.ballmark.classList.toggle('fire', b.kind === 'fire');
    },

    /** Karakterin sırtındaki gösterge (başın üstünde nişan açısını kapatıyordu); her kare, gövdenin ekran konumuna. */
    overhead(w, dt, visible, project) {
      const p = w.players[w.me];
      if (lastEnergy > 0 && p.energyCd <= 0) readyTime = 0.9;
      lastEnergy = p.energyCd;
      readyTime = Math.max(0, readyTime - dt);
      const cooling = p.energyCd > 0, dazed = p.stun > 0;
      el.over.hidden = !visible || p.burn > 0 || !(cooling || dazed || readyTime > 0);
      if (el.over.hidden) return;
      const at = project(p.burn > 0 ? benchX(p.team) : p.x, lift(p) + 1.15, p.z);
      el.over.style.transform = `translate(${at.x}px,${at.y}px) translate(-50%,-50%)`;
      el.overEnergy.hidden = !cooling && readyTime <= 0;
      el.overEnergy.classList.toggle('ready', !cooling);
      el.overEnergyText.textContent = cooling ? 'ENERJİ ' + p.energyCd.toFixed(1) : 'ENERJİ HAZIR';
      el.overEnergyFill.style.width = (1 - p.energyCd / ENERGY.cooldown) * 100 + '%';
      el.overStun.hidden = !dazed;
      el.overStunText.textContent = 'SERSEM ' + p.stun.toFixed(1);
      el.overStunFill.style.width = p.stun / STEAL.stun * 100 + '%';
    },

    /**
     * Dolum halkası: null gizler; { p: 0-1, kind: 'wind' | 'fire' | 'blocked', text, full }. Renk vuruşun türünden gelir.
     */
    charge(state) {
      el.charge.hidden = !state;
      if (!state) return;
      el.charge.style.setProperty('--p', Math.max(0, Math.min(1, state.p)).toFixed(3));
      el.charge.style.setProperty('--c', CHARGE_COLORS[state.kind]);
      el.charge.classList.toggle('full', !!state.full);
      el.chargeText.textContent = state.text;
    },
    /** Hızlı koşuda ekran kenarlarında hız çizgileri. */
    speed(on) { el.speed.hidden = !on; },

    /** Sinema şeritleri ve "YAKAR PAS!" ya da "RÜZGAR ŞUTU!" yazısı (atanın adıyla); aim: nişan süresi çubuğu (1 → 0). */
    cinema(on, who = '', aim = null, kind = 'fire') {
      el.cine.hidden = !on;
      el.cine.classList.toggle('wind', kind === 'wind');
      el.cineTitle.textContent = kind === 'wind' ? 'RÜZGAR ŞUTU!' : 'YAKAR PAS!';
      el.cineWho.textContent = who;
      el.cineAim.hidden = aim === null;
      if (aim !== null) el.cineAimFill.style.width = aim * 100 + '%';
    },
    /** Nişan süresi çubuğu (1 → 0). */
    cinemaAim(left) { el.cineAimFill.style.width = Math.max(0, left) * 100 + '%'; },

    results(w) {
      el.resultTitle.textContent = w.winner === w.players[w.me].team ? 'Mahallenin galibi sizsiniz!' : 'Rövanşta görüşürüz.';
      el.finalScore.textContent = w.score[0] + ' : ' + w.score[1];
      el.stats.innerHTML = w.players.map(p =>
        `<tr class="${p.team === 0 ? 'blue-text' : 'orange-text'}${p.id === w.me ? ' me' : ''}"><td>${esc(p.name)}${p.role === 4 ? ' · Kaleci' : ''}</td>` +
        STATS.map(k => `<td>${p.stats[k]}</td>`).join('') + '</tr>').join('');
    },

    teamName: team => TEAMS.names[team],
  };
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
