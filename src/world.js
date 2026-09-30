import { BURN, DASH, GOAL_BLAST, KICK, MATCH, MOVE, PITCH, SPRINT, WIND } from './config.js';
import { dash, emit, jump, kick, pass, sprint } from './actions.js';
import { botInput } from './ai.js';
import { updateBall } from './ball.js';
import { attackDir, homeOf, lineUp } from './lineup.js';
import { clamp } from './math.js';
import { createRng } from './rng.js';

export { dash, jump, kick, pass, sprint };

/**
 * Maç simülasyonu: DOM ve three.js yok, testler Node'da (ve çevrim içi odada sunucuda) koşar. 5v5: tek başına oyunda
 * 0. oyuncu insan, kalan dokuzu bot; çevrim içinde `human` işaretli her koltuk bir insandır. step sabit adımla
 * ilerletir, olayları w.events'e yazar (görünüm, ses ve mesajlar oradan okur; tüketen boşaltır). `me`: bu tarayıcıdaki
 * oyuncu (görünüm, arayüz ve kamera onu izler; tek başına oyunda 0).
 *
 * İnsan girdisi (her adım): x, z hareket yönü; aim nişan noktası; hold sol tık basılı, tap bu adımda basıldı, release
 * bu adımda bırakıldı; secondary sağ tık; fire yakar top (tarayıcıda sağ tık basılı tutulup nişan alındıktan sonra, bkz.
 * main.js); sprint Shift; pass pas; jump boşluk. Tarayıcıda
 * top sendeyken kısa sağ tık pas olarak gelir (bkz. main.js). Birden çok insan varsa (sunucu) girdi
 * `{ players: { [id]: girdi } }` biçimindedir; girdisi gelmeyen insan o adımda durur.
 */
export function createWorld(seed = MATCH.seed) {
  const w = {
    // gosteri: içerik klipleri için bot-bot gösteri kipi (bkz. gosteri.js); botlar saldırganlaşır, normal maçta hep false.
    // restart: golden sonraki başlama beklemesi (lineup.js); gösteri kipi kısaltır.
    // seed: bu maçın tohumu (yalnız okuma; aynı tohum aynı bot kararlarını verir). Normal maçta hep MATCH.seed,
    // gösteri kipinde her maça rastgele tohum verilir (bkz. gosteri.js → tohum).
    me: 0, time: 0, score: [0, 0], winner: null, overtime: false, gosteri: false, kickoff: MATCH.kickoff, restart: MATCH.restart, nextKickoff: 0, kickoffTaker: 0, blast: null, fireLeft: [KICK.fireShots, KICK.fireShots], events: [], players: [],
    seed, random: createRng(seed),
    ball: { x: 0, z: 0, vx: 0, vz: 0, owner: null, last: null, kind: 'normal', power: 0, lock: 0, stealLock: 0 },
  };
  for (let i = 0; i < MATCH.teamSize * 2; i++) {
    const team = i < MATCH.teamSize ? 0 : 1, role = i % MATCH.teamSize;
    const p = {
      id: i, team, role, human: i === 0, name: i === 0 ? 'Sen' : 'Bot-' + i, x: 0, z: 0, vx: 0, vz: 0, angle: team === 0 ? Math.PI : 0,
      burn: 0, guard: BURN.kickoffGuard, stun: 0, evade: 0, pressed: false, air: 0, airMax: 1, jump: 0, dash: 0, sprint: 0, dashX: 0, dashZ: 0, knock: 0, knockX: 0, knockZ: 0,
      energyCd: 0, kickCd: 0, charge: 0, chargeSpent: false, think: 0.3 + i * 0.07,
      stats: { goals: 0, passes: 0, burns: 0, steals: 0, saves: 0, dashes: 0 },
    };
    w.players.push(Object.assign(p, homeOf(p)));
  }
  return w;
}

const TIMERS = ['guard', 'stun', 'evade', 'jump', 'dash', 'sprint', 'knock', 'energyCd', 'kickCd', 'think'];

export function step(w, dt, input = {}) {
  if (w.winner !== null) return;
  dt = Math.min(dt, 1 / 30);
  if (w.blast) { blastStep(w, dt); return; }
  if (w.kickoff > 0) {
    w.kickoff = Math.max(0, w.kickoff - dt);
    if (w.kickoff === 0) { w.ball.owner = w.kickoffTaker; w.ball.last = w.ball.owner; }
    return;
  }
  w.time += dt;
  w.ball.lock = Math.max(0, w.ball.lock - dt);
  w.ball.power = Math.max(0, w.ball.power - dt);
  w.ball.stealLock = Math.max(0, w.ball.stealLock - dt);
  for (const p of w.players) {
    for (const k of TIMERS) p[k] = Math.max(0, p[k] - dt);
    if (p.burn > 0) { sideline(w, p, dt); continue; }
    if (p.stun > 0) { p.charge = 0; move(p, p.knock > 0 ? p.knockX : 0, p.knock > 0 ? p.knockZ : 0, p.knock > 0 ? WIND.push : MOVE.speed, dt); continue; }
    const cmd = !p.human ? botInput(w, p) : input.players ? input.players[p.id] || {} : input;
    act(w, p, cmd, dt);
    if (p.knock > 0) move(p, p.knockX, p.knockZ, WIND.push, dt);
    else if (p.dash > 0) move(p, p.dashX, p.dashZ, DASH.speed, dt);
    else move(p, cmd.x || 0, cmd.z || 0, (w.ball.owner === p.id ? MOVE.dribble : MOVE.speed) * (p.sprint > 0 ? SPRINT.mult : 1), dt);
  }
  updateBall(w, dt);
  checkClock(w);
}

/** Girdiyi eyleme çevirir. Sağ tık: top bendeyse pas, değilse topa doğru kayma (basılan yön ne olursa olsun). fire: yakar top. */
function act(w, p, cmd, dt) {
  // Koşarken gidilen yöne, dururken nişana dönülür (şut ve pas yine nişana gider; kayma hep topa).
  if (Math.hypot(cmd.x || 0, cmd.z || 0) > 0.1) p.angle = Math.atan2(cmd.x, cmd.z);
  else if (cmd.aim) p.angle = Math.atan2(cmd.aim.x - p.x, cmd.aim.z - p.z);
  const ahead = cmd.aim || { x: p.x, z: p.z + attackDir(p.team) * 20 };
  if (cmd.jump) jump(w, p.id);
  if (cmd.sprint) sprint(w, p.id);
  if (cmd.secondary) {
    if (w.ball.owner === p.id) pass(w, p.id, cmd.aim || { x: 0, z: attackDir(p.team) * PITCH.halfZ });
    else {
      const bx = w.ball.x - p.x, bz = w.ball.z - p.z, far = Math.hypot(bx, bz) > 0.01;
      dash(w, p.id, far ? bx : Math.sin(p.angle), far ? bz : Math.cos(p.angle));
    }
  }
  if (cmd.fire) kick(w, p.id, ahead, 'fire');
  shoot(w, p, cmd, ahead, dt);
  if (cmd.pass) pass(w, p.id, cmd.aim || { x: 0, z: attackDir(p.team) * PITCH.halfZ });
}

/**
 * Sol tık: top bendeyken basılı tuttukça şarj dolar. KICK.windCharge saniyeye varınca rüzgar topu kendiliğinden çıkar
 * (tuş bırakılana kadar yeni şarj başlamaz); daha önce bırakılırsa normal şut. Enerji hazır değilse şarj dolu bekler:
 * enerji gelince rüzgar topu çıkar, önce bırakılırsa normal şut. Top elden çıkarsa ya da tuş basılı değilse (ör. mola
 * sonrası) şarj sıfırlanır.
 */
function shoot(w, p, cmd, ahead, dt) {
  const owns = w.ball.owner === p.id, pressing = cmd.hold || cmd.tap;
  if (pressing && owns && !p.chargeSpent) {
    p.charge += dt;
    if (p.charge >= KICK.windCharge) {
      if (kick(w, p.id, ahead, 'wind')) p.chargeSpent = true;
      else p.charge = KICK.windCharge;
    }
  } else if (!owns) p.charge = 0;
  if (cmd.release || !pressing) {
    if (cmd.release && p.charge > 0 && owns) kick(w, p.id, ahead, 'normal');
    p.charge = 0; p.chargeSpent = false;
  }
}

/** Yanan oyuncu kenarda bekler; süre bitince kendi yarısında yan duvar dibinden, kısa korunmayla döner. */
function sideline(w, p, dt) {
  p.burn = Math.max(0, p.burn - dt);
  if (p.burn > 0) return;
  p.x = p.id % 2 ? -PITCH.halfX + 3 : PITCH.halfX - 3;
  p.z = attackDir(p.team) * -PITCH.halfZ * 0.48;
  p.guard = BURN.returnGuard;
  emit(w, 'return', { id: p.id });
}

function move(p, x, z, speed, dt) {
  const d = Math.hypot(x, z), blend = 1 - Math.exp(-MOVE.accel * dt), m = MOVE.margin;
  p.vx += (x / Math.max(1, d) * speed - p.vx) * blend;
  p.vz += (z / Math.max(1, d) * speed - p.vz) * blend;
  p.x = clamp(p.x + p.vx * dt, -PITCH.halfX + m, PITCH.halfX - m);
  p.z = clamp(p.z + p.vz * dt, -PITCH.halfZ + m, PITCH.halfZ - m);
}

/** Gol patlaması sürerken: oyuncular fırlatıldıkları yönde süzülür (sürtünmeyle yavaşlar), süre bitince yeniden diziliş. */
function blastStep(w, dt) {
  const k = Math.exp(-GOAL_BLAST.drag * dt), m = MOVE.margin;
  for (const p of w.players) {
    p.air = Math.max(0, p.air - dt);
    if (p.burn > 0) continue;
    p.vx *= k; p.vz *= k;
    p.x = clamp(p.x + p.vx * dt, -PITCH.halfX + m, PITCH.halfX - m);
    p.z = clamp(p.z + p.vz * dt, -PITCH.halfZ + m, PITCH.halfZ - m);
  }
  w.blast.t -= dt;
  if (w.blast.t <= 0) { const next = w.blast.next; w.blast = null; lineUp(w, next); }
}

/** Süre bitince önde olan kazanır; eşitlikte altın gol (sonraki gol bitirir, bkz. ball.js). */
function checkClock(w) {
  if (w.time < MATCH.duration || w.overtime) return;
  if (w.score[0] === w.score[1]) { w.overtime = true; emit(w, 'overtime'); }
  else { w.winner = w.score[0] > w.score[1] ? 0 : 1; emit(w, 'end'); }
}
