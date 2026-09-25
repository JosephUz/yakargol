import { DASH, ENERGY, JUMP, KICK, SPRINT, WIND } from './config.js';
import { distance } from './math.js';

/**
 * Oyuncu eylemleri: zıplama, kayma, hızlı koşu, şut ve pas. İnsan girdisi de bot kararları da buradan geçer; eylem yapılamıyorsa
 * (maç bitti, başlama beklemesi, kenarda, enerji ya da şut beklemesi) false döner. Enerjili beceriler (kayma, hızlı
 * koşu, yakar top ve rüzgar şutu) ENERGY.cooldown ortak geri sayımını başlatır.
 */
export function emit(w, type, data = {}) { w.events.push({ type, ...data }); }

const idle = (w, p) => w.winner !== null || w.kickoff > 0 || p.burn > 0 || p.stun > 0;
const KINDS = ['normal', 'wind', 'fire', 'pass'];

export function jump(w, id) {
  const p = w.players[id];
  if (idle(w, p) || p.jump > 0) return false;
  p.jump = JUMP.time;
  return true;
}

/** Kayma: (x, z) yönüne, yön yoksa bakılan yöne. */
export function dash(w, id, x = 0, z = 0) {
  const p = w.players[id];
  if (idle(w, p) || p.energyCd > 0) return false;
  const d = Math.hypot(x, z);
  p.dashX = d > 0.1 ? x / d : Math.sin(p.angle);
  p.dashZ = d > 0.1 ? z / d : Math.cos(p.angle);
  p.dash = DASH.time; p.guard = DASH.guard; p.energyCd = ENERGY.cooldown;
  p.stats.dashes++;
  emit(w, 'dash', { id });
  return true;
}

/** Hızlı koşu: SPRINT.time saniye; enerji geri sayımı koşu bitince başlar. */
export function sprint(w, id) {
  const p = w.players[id];
  if (idle(w, p) || p.energyCd > 0) return false;
  p.sprint = SPRINT.time; p.energyCd = SPRINT.time + ENERGY.cooldown;
  emit(w, 'sprint', { id });
  return true;
}

/** Şut: top bendeyse `aim` noktasına doğru. Yakar top ve rüzgar şutu enerji ister; yakar top takım başına maçta KICK.fireShots kez. */
export function kick(w, id, aim, kind = 'normal') {
  const p = w.players[id], b = w.ball;
  if (idle(w, p) || p.kickCd > 0 || b.owner !== id) return false;
  if (!KINDS.includes(kind)) kind = 'normal';
  const powered = kind === 'fire' || kind === 'wind';
  if (powered && p.energyCd > 0) return false;
  if (kind === 'fire' && w.fireLeft[p.team] <= 0) return false;
  const dx = aim.x - p.x, dz = aim.z - p.z, d = Math.hypot(dx, dz);
  if (d < 0.05) return false;
  const speed = KICK[kind];
  p.angle = Math.atan2(dx, dz);
  Object.assign(b, {
    owner: null, last: id, kind, lock: KICK.lock,
    x: p.x + dx / d * KICK.reach, z: p.z + dz / d * KICK.reach, vx: dx / d * speed, vz: dz / d * speed,
    power: kind === 'fire' ? KICK.firePower : kind === 'wind' ? WIND.power : 0,
  });
  p.kickCd = KICK.cooldown; p.charge = 0;
  if (powered) p.energyCd = ENERGY.cooldown;
  if (kind === 'fire') w.fireLeft[p.team]--;
  if (kind === 'pass') p.stats.passes++;
  emit(w, 'kick', { id, kind, x: b.x, z: b.z });
  return true;
}

/** Pas: nişan yönüne en iyi hizalanan (ve yakın) takım arkadaşına, onun biraz önüne. */
export function pass(w, id, aim) {
  const p = w.players[id], dx = aim.x - p.x, dz = aim.z - p.z, d = Math.max(0.01, Math.hypot(dx, dz));
  let best = null, score = -Infinity;
  for (const t of w.players) {
    if (t.id === id || t.team !== p.team || t.burn > 0) continue;
    const len = distance(p, t);
    const alignment = ((t.x - p.x) * dx + (t.z - p.z) * dz) / (d * Math.max(0.01, len));
    const value = alignment * 12 - len * 0.16;
    if (value > score) { score = value; best = t; }
  }
  return best ? kick(w, id, { x: best.x + best.vx * 0.12, z: best.z + best.vz * 0.12 }, 'pass') : false;
}
