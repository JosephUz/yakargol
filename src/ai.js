import { BOT, GOSTERI, PITCH } from './config.js';
import { dash, kick, pass, sprint } from './actions.js';
import { attackDir, homeOf, KEEPER } from './lineup.js';
import { clamp, distance } from './math.js';

/**
 * Bot kararı: bu adımın hareket yönü { x, z }. Top bendeyse kaleye sürer ve aralıklarla şut / yakar top / pas seçer;
 * üstüne rakip gelince (bkz. pressed) hızlı tepki verip topu elinden çıkarır. Kaleci kale ağzında topa göre kayar,
 * top yaklaşınca çıkar. Takımın topa en yakın `BOT.chasers` saha oyuncusu topa koşar (uzaksa hızlı koşar, rakip
 * taşıyana yaklaşınca üstüne kayar), kalanlar ev konumundan topa ve hücuma doğru
 * esner. Yakar top yaklaşınca kaçmak için atılabilir.
 */
export function botInput(w, p) {
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
    if (p.evade <= 0) decide(w, p, mates, dir, presser);
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
  if (b.kind === 'fire' && b.owner === null && distance(p, b) < B.dodgeRange && p.energyCd <= 0 && p.think <= 0) {
    p.think = B.think;
    if (w.random() < B.dodgeChance) dash(w, p.id, p.x - b.x, p.z - b.z);
  }
  const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
  return { x: d > 0.3 ? dx / d : 0, z: d > 0.3 ? dz / d : 0 };
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
 * Top bendeyken karar. Baskı altındaysa BOT.escape ağırlıklarıyla rastgele: sürmeye devam (BOT.commit saniye), en
 * boştaki arkadaşa pas, ileri doğru duvardan sektirme, şut (kaleye yakınsa çok daha olası) ya da enerjisi ve hakkı
 * varsa baskı yapana yakar top; yapılamayan seçenek atlanır. Baskı yoksa: kaleci ileri pas; kaleye yakınsa şut; rakip yakınsa ara sıra yakar top; ara sıra ileri pas.
 */
function decide(w, p, mates, dir, presser) {
  if (p.think > 0) return;
  const B = cfg(w);
  p.think = B.think + w.random() * B.thinkJitter;
  const Z = PITCH.halfZ, inRange = dir * p.z > Z - B.shootRange && Math.abs(p.x) < PITCH.halfX * 0.7;
  const shoot = () => kick(w, p.id, { x: (w.random() - 0.5) * PITCH.goal * 1.3, z: dir * (Z + 3) });
  if (presser) { escape(w, p, mates, dir, presser, inRange, shoot); return; }
  const enemy = w.players
    .filter(t => t.team !== p.team && t.burn <= 0 && distance(p, t) < B.threat)
    .sort((a, c) => distance(a, p) - distance(c, p))[0];
  if (p.role === KEEPER) pass(w, p.id, { x: 0, z: dir * Z * 0.8 });
  else if (inRange) shoot();
  else if (enemy && w.fireLeft[p.team] > 0 && distance(p, enemy) < B.fireRange && w.random() < B.fireChance) kick(w, p.id, lead(enemy), 'fire');
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
    { weight: p.energyCd <= 0 && w.fireLeft[p.team] > 0 && p.role !== KEEPER ? B.escape.fire : 0, run: () => kick(w, p.id, lead(presser), 'fire') },
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

/** Hareketli hedefin biraz önü. */
const lead = t => ({ x: t.x + t.vx * 0.15, z: t.z + t.vz * 0.15 });

/** En boştaki arkadaş: yakın rakibi en uzak olan, çok geride kalmayan ve çok uzak olmayan (kaleci son çare). */
function openMate(w, p, mates, dir) {
  const B = cfg(w);
  let best = null, score = -Infinity;
  for (const t of mates) {
    if (t.id === p.id || t.stun > 0) continue;
    const len = distance(p, t);
    if (len < 3 || len > B.passRange) continue;
    const space = Math.min(...w.players.filter(e => e.team !== p.team && e.burn <= 0).map(e => distance(e, t)));
    const value = space * 1.5 + dir * (t.z - p.z) * 0.3 - len * 0.1 - (t.role === KEEPER ? 8 : 0);
    if (value > score) { score = value; best = t; }
  }
  return best;
}

/** Duvardan sektirme: baskı yapanın ters tarafındaki yan duvarda, `ahead` kadar ileride bir nokta (top sekip ileri gider). */
function wallPoint(p, dir, presser, ahead) {
  const side = presser.x > p.x ? -1 : presser.x < p.x ? 1 : Math.sign(p.x) || 1;
  return { x: side * (PITCH.halfX + 1), z: clamp(p.z + dir * ahead, -PITCH.halfZ + 2, PITCH.halfZ - 2) };
}
