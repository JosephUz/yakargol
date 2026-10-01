import { BOT, CINEMA, GOSTERI, KICK, PITCH } from './config.js';
import { dash, jump, kick, pass, sprint, startAim } from './actions.js';
import { attackDir, homeOf, KEEPER } from './lineup.js';
import { clamp, distance } from './math.js';

/**
 * Bot kararı: bu adımın hareket yönü { x, z }. Top bendeyse kaleye sürer ve aralıklarla şut / yakar pas / pas seçer;
 * üstüne rakip gelince (bkz. pressed) hızlı tepki verip topu elinden çıkarır. Kaleci kale ağzında topa göre kayar,
 * top yaklaşınca çıkar. Takımın topa en yakın `BOT.chasers` saha oyuncusu topa koşar (uzaksa hızlı koşar, rakip
 * taşıyana yaklaşınca üstüne kayar), kalanlar ev konumundan topa ve hücuma doğru
 * esner. Yakar pas ve rüzgar şutunu insan gibi atar (bkz. charging): dolum → ağır çekimde nişan → vuruş. Yakar pası
 * arada rakip olan bir arkadaşa atar (bkz. burnLane). Takım arkadaşı pas isterse (p.call) kısa bir tepkiyle ona pas
 * verir. Yakar pas üstüne gelirken zıplayıp kurtulabilir (bkz. dodgeFire). Rakip yakar pas ya da rüzgar nişanı
 * alırken (w.aim) saha oyuncuları nişan alanın üstüne koşar ve yaklaşınca kayıp topu ayağından almaya çalışır.
 */
export function botInput(w, p, dt = 0) {
  if (w.aim && w.aim.id === p.id) return aimingBot(w, p);
  if (p.plan && w.ball.owner !== p.id) p.plan = null;
  const B = cfg(w), b = w.ball, holder = w.players[b.owner], dir = attackDir(p.team), X = PITCH.halfX, Z = PITCH.halfZ;
  const mates = w.players.filter(t => t.team === p.team && t.burn <= 0);
  const chasers = mates.filter(t => t.role !== KEEPER).sort((a, c) => distance(a, b) - distance(c, b)).slice(0, B.chasers);
  const loose = !holder || holder.team !== p.team;
  let x = p.x, z = p.z;
  if (b.owner === p.id) {
    x = p.x * 0.65; z = dir * (Z - 2);
    const presser = pressed(w, p);
    if (presser && p.evade > 0) {
      // Sürmeye karar verdi: baskı yapandan uzağa ve ileri doğru döner.
      const ax = p.x - presser.x, az = p.z - presser.z, d = Math.max(0.01, Math.hypot(ax, az));
      x = p.x + ax / d * 4; z = p.z + az / d * 2 + dir * 3;
    }
    if (presser && !p.pressed) p.think = Math.min(p.think, B.reactMin + w.random() * (B.reactMax - B.reactMin));
    p.pressed = !!presser;
    // Arkadaşı pas istedi: kısa bir tepkiyle karar verir (bkz. decide).
    const caller = callerOf(w, p, mates);
    if (caller && !p.heard) p.think = Math.min(p.think, B.reactMin + w.random() * (B.reactMax - B.reactMin));
    p.heard = !!caller;
    if (p.plan) return charging(w, p, x, z, dt);
    if (p.evade <= 0) decide(w, p, mates, dir, presser);
  } else if (w.aim && w.players[w.aim.id].team !== p.team && p.role !== KEEPER && distance(p, w.players[w.aim.id]) < B.aimRush) {
    // Rakip nişan alıyor: üstüne koş, yetişince kay (yalnız kayarak alınır).
    const aimer = w.players[w.aim.id];
    x = aimer.x; z = aimer.z;
    if (distance(p, aimer) < B.aimDash && p.energyCd <= 0) dash(w, p.id, aimer.x - p.x, aimer.z - p.z);
  } else if (p.role === KEEPER) {
    x = clamp(b.x * 0.48, -PITCH.goal + 0.8, PITCH.goal - 0.8); z = -dir * (Z - 2.5);
    if (Math.abs(b.z + dir * (Z - 2.5)) < B.keeperRange && loose) { x = b.x; z = b.z; }
  } else if (loose && chasers.some(t => t.id === p.id)) {
    x = b.x; z = b.z;
    if (distance(p, b) > B.sprintRange) sprint(w, p.id);
    else if (holder && distance(p, holder) < B.dashRange && p.energyCd <= 0 && p.think <= 0) {
      p.think = B.think;
      if (w.random() < B.dashChance) dash(w, p.id, holder.x + holder.vx * 0.2 - p.x, holder.z + holder.vz * 0.2 - p.z);
    }
  } else {
    const h = homeOf(p);
    x = clamp(h.x + b.x * B.homeX, -X + 3, X - 3);
    z = clamp(h.z + b.z * B.homeZ + dir * (holder?.team === p.team ? 12 : 1), -Z + 5, Z - 5);
  }
  dodgeFire(w, p, B);
  const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
  return { x: d > 0.3 ? dx / d : 0, z: d > 0.3 ? dz / d : 0 };
}

/**
 * Yakar pasa zıplama: rakibin attığı yakar pas bu bota doğru geliyorsa (en yakın geçiş BOT.fireJump.miss içinde,
 * çarpmaya fireJump.time saniyeden az kala) zıplar; havadakini yakar pas yakmaz. Her atışta bot bir kez zar atar
 * (fireJump.chance): bazen tepki veremez ve yanar.
 */
function dodgeFire(w, p, B) {
  const b = w.ball, J = B.fireJump || BOT.fireJump, shooter = w.players[b.last];
  if (b.kind !== 'fire' || b.owner !== null || !shooter || shooter.team === p.team || p.jump > 0) return;
  if (p.dodgeShot !== w.shots) { p.dodgeShot = w.shots; p.dodgeOk = w.random() < J.chance; }
  if (!p.dodgeOk) return;
  const v2 = b.vx * b.vx + b.vz * b.vz; if (v2 < 1) return;
  const t = ((p.x - b.x) * b.vx + (p.z - b.z) * b.vz) / v2;
  if (t <= 0 || t > J.time) return;
  if (Math.hypot(b.x + b.vx * t - p.x, b.z + b.vz * t - p.z) < J.miss) jump(w, p.id);
}

/** Pas isteyen takım arkadaşı (en yeni istek), yoksa null. */
const callerOf = (w, p, mates) => mates.filter(t => t.id !== p.id && t.call > 0 && t.stun <= 0 && t.burn <= 0).sort((a, c) => c.call - a.call)[0] || null;

/** Planın hedefi: yakar pasta pasın gideceği arkadaş, rüzgarda rakip kalenin içi. */
function planTarget(w, p, plan) {
  if (plan.kind === 'wind') return plan.goal;
  const m = w.players[plan.mate];
  return m && m.burn <= 0 ? { x: m.x, z: m.z } : { x: p.x + Math.sin(p.angle) * 15, z: p.z + Math.cos(p.angle) * 15 };
}

/**
 * Yakar pas için arkadaş: aradaki yolda (BOT.laneWidth içinde) en çok rakip olan, BOT.passRange'in 1,5 katından yakın
 * arkadaş (eşitlikte ileride olan). Yolda hiç rakip yoksa null.
 */
function burnLane(w, p, mates, dir) {
  const B = cfg(w), width = B.laneWidth ?? BOT.laneWidth;
  const rivals = w.players.filter(e => e.team !== p.team && e.burn <= 0);
  let best = null, score = 0;
  for (const t of mates) {
    if (t.id === p.id) continue;
    const dx = t.x - p.x, dz = t.z - p.z, len = Math.hypot(dx, dz);
    if (len < 4 || len > B.passRange * 1.5) continue;
    const hits = rivals.filter(e => {
      const k = ((e.x - p.x) * dx + (e.z - p.z) * dz) / (len * len);
      return k > 0 && k < 1 && Math.abs((e.x - p.x) * dz - (e.z - p.z) * dx) / len < width;
    }).length;
    const value = hits * 10 + dir * (t.z - p.z) * 0.05;
    if (hits > 0 && value > score) { score = value; best = t; }
  }
  return best;
}

/**
 * Dolum: bot yakar pas (sağ tık basılı, held2) ya da rüzgar (sol tık basılı, hold) için topu sürerken dolar; çevresinde
 * alev / rüzgar görünür. Rüzgar dolunca nişanı dünya başlatır (world.js shoot); yakar pas dolunca bot başlatır. Nişan
 * başlayamazsa (biri zaten nişan alıyor, hak bitti) plan bırakılır.
 */
function charging(w, p, x, z, dt) {
  const plan = p.plan, target = planTarget(w, p, plan);
  plan.t = (plan.t || 0) + dt;
  const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
  const cmd = { x: d > 0.3 ? dx / d : 0, z: d > 0.3 ? dz / d : 0, aim: target };
  if (plan.kind === 'fire') {
    cmd.held2 = true;
    if ((p.fireCharge || 0) + dt >= CINEMA.hold) { if (startAim(w, p.id, 'fire')) w.aim.target = target; else p.plan = null; }
  } else {
    cmd.hold = true;
    if (p.charge >= KICK.windCharge && !w.aim) p.plan = null; // nişan başlayamadı: bırakınca normal şut
  }
  if (plan.t > CINEMA.hold * 3) p.plan = null;
  return cmd;
}

/** Nişan alan bot: BOT.aimTime simülasyon saniyesi nişanı tutar, sonra bırakır (rüzgarda sol tık bırak, yakar pasta ateş). */
function aimingBot(w, p) {
  const B = cfg(w), a = w.aim, done = a.t >= (B.aimTime ?? BOT.aimTime);
  return { x: 0, z: 0, aim: p.plan ? planTarget(w, p, p.plan) : a.target, hold: a.kind === 'wind' && !done, fire: a.kind === 'fire' && done };
}

/**
 * Bu maçta hangi bot ayarları geçerli: gösteri kipinde (içerik klipleri, `?gosteri=1`, bkz. gosteri.js) botlar daha
 * saldırgandır; normal oyunda ve çevrim içi maçta her zaman BOT kullanılır.
 */
const cfg = w => (w.gosteri ? GOSTERI.bot : BOT);

/**
 * Üstüne gelen rakip: BOT.pressure içinde ve yaklaşan (ya da BOT.pressure / 2'den yakın) en yakın rakip; yoksa null.
 * Kayan rakip daha uzaktan sayılır (kayma topu mutlaka çalar).
 */
function pressed(w, p) {
  const B = cfg(w);
  let best = null, bestD = Infinity;
  for (const t of w.players) {
    if (t.team === p.team || t.burn > 0 || t.stun > 0) continue;
    const d = distance(p, t), range = t.dash > 0 ? B.pressure * 1.6 : B.pressure;
    if (d > range || d >= bestD) continue;
    const closing = -((t.vx - p.vx) * (t.x - p.x) + (t.vz - p.vz) * (t.z - p.z)) / Math.max(0.01, d);
    if (closing > 0.5 || d < B.pressure / 2) { best = t; bestD = d; }
  }
  return best;
}

/**
 * Top bendeyken karar. Pas isteyen arkadaş varsa önce ona (BOT.callChance). Baskı altındaysa BOT.escape ağırlıklarıyla
 * rastgele: sürmeye devam (BOT.commit saniye), en boştaki arkadaşa pas, ileri doğru duvardan sektirme, şut (kaleye
 * yakınsa çok daha olası) ya da takımın hakkı varsa ve arada rakip olan bir arkadaş varsa yakar pas (dolumla);
 * yapılamayan seçenek atlanır. Baskı yoksa: kaleci ileri pas; rakip kaleye yakınsa ara sıra rüzgar şutu (dolumla);
 * kaleye yakınsa şut; rakip yakınsa ara sıra yakar pas (yolda rakip varsa); ara sıra ileri pas.
 */
function decide(w, p, mates, dir, presser) {
  if (p.think > 0) return;
  const B = cfg(w);
  p.think = B.think + w.random() * B.thinkJitter;
  const Z = PITCH.halfZ, inRange = dir * p.z > Z - B.shootRange && Math.abs(p.x) < PITCH.halfX * 0.7;
  const shoot = () => kick(w, p.id, { x: (w.random() - 0.5) * PITCH.goal * 1.3, z: dir * (Z + 3) });
  const caller = callerOf(w, p, mates);
  if (caller && w.random() < (B.callChance ?? BOT.callChance) && kick(w, p.id, lead(caller), 'pass')) return;
  if (presser) { escape(w, p, mates, dir, presser, inRange, shoot); return; }
  const enemy = w.players
    .filter(t => t.team !== p.team && t.burn <= 0 && distance(p, t) < B.threat)
    .sort((a, c) => distance(a, p) - distance(c, p))[0];
  if (p.role === KEEPER) pass(w, p.id, { x: 0, z: dir * Z * 0.8 });
  else if (w.windLeft[p.team] > 0 && !w.aim && dir * p.z > Z - (B.windRange ?? BOT.windRange) && w.random() < (B.windChance ?? BOT.windChance)) p.plan = { kind: 'wind', goal: { x: (w.random() - 0.5) * PITCH.goal * 1.2, z: dir * (Z + 3) } };
  else if (inRange) shoot();
  else if (enemy && w.fireLeft[p.team] > 0 && !w.aim && distance(p, enemy) < B.fireRange && w.random() < B.fireChance && firePlan(w, p, mates, dir)) return;
  else if (w.random() < B.passChance) {
    const forward = mates.filter(t => t.id !== p.id && dir * t.z > dir * p.z + 2).sort((a, c) => dir * (c.z - a.z))[0];
    if (forward) kick(w, p.id, lead(forward), 'pass');
  }
}

function escape(w, p, mates, dir, presser, inRange, shoot) {
  const B = cfg(w), open = openMate(w, p, mates, dir);
  const options = [
    { weight: B.escape.dribble, run: () => { p.evade = B.commit; p.think = B.commit; return true; } },
    { weight: inRange ? B.escape.shoot * 3 : B.escape.shoot * (dir * p.z > 0 ? 1 : 0), run: shoot },
    { weight: w.fireLeft[p.team] > 0 && !w.aim && p.role !== KEEPER ? B.escape.fire : 0, run: () => firePlan(w, p, mates, dir) },
    { weight: open ? B.escape.pass : 0, run: () => kick(w, p.id, lead(open), 'pass') },
    { weight: B.escape.wall, run: () => kick(w, p.id, wallPoint(p, dir, presser, B.wallAhead)) },
  ];
  while (options.some(o => o.weight > 0)) {
    const total = options.reduce((s, o) => s + o.weight, 0);
    let roll = w.random() * total;
    const pick = options.find(o => (roll -= o.weight) < 0 && o.weight > 0) || options.find(o => o.weight > 0);
    if (pick.run()) return;
    pick.weight = 0;
  }
}

/** Yakar pas planı: yolunda rakip olan arkadaş varsa ona (dolum başlar); yoksa false. */
function firePlan(w, p, mates, dir) {
  const mate = burnLane(w, p, mates, dir);
  if (!mate) return false;
  p.plan = { kind: 'fire', mate: mate.id };
  return true;
}

/** Hareketli hedefin biraz önü. */
const lead = t => ({ x: t.x + t.vx * 0.15, z: t.z + t.vz * 0.15 });

/** En boştaki arkadaş: yakın rakibi en uzak olan, çok geride kalmayan ve çok uzak olmayan (kaleci son çare); pas isteyen öne geçer. */
function openMate(w, p, mates, dir) {
  const B = cfg(w);
  let best = null, score = -Infinity;
  for (const t of mates) {
    if (t.id === p.id || t.stun > 0) continue;
    const len = distance(p, t);
    if (len < 3 || len > B.passRange) continue;
    const space = Math.min(...w.players.filter(e => e.team !== p.team && e.burn <= 0).map(e => distance(e, t)));
    const value = space * 1.5 + dir * (t.z - p.z) * 0.3 - len * 0.1 - (t.role === KEEPER ? 8 : 0) + (t.call > 0 ? 20 : 0);
    if (value > score) { score = value; best = t; }
  }
  return best;
}

/** Duvardan sektirme: baskı yapanın ters tarafındaki yan duvarda, `ahead` kadar ileride bir nokta (top sekip ileri gider). */
function wallPoint(p, dir, presser, ahead) {
  const side = presser.x > p.x ? -1 : presser.x < p.x ? 1 : Math.sign(p.x) || 1;
  return { x: side * (PITCH.halfX + 1), z: clamp(p.z + dir * ahead, -PITCH.halfZ + 2, PITCH.halfZ - 2) };
}
