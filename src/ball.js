import { BALL, BURN, DASH, GOAL_BLAST, PITCH, STEAL, WIND } from './config.js';
import { emit } from './actions.js';
import { KEEPER, lineUp } from './lineup.js';
import { distance } from './math.js';

/**
 * Top, bir adım. Taşınıyorsa taşıyanın ayağının önünde durur ve rakipler kapmaya çalışır. Boştaysa ilerler, duvardan
 * seker, kaleye girerse gol olur (yakar top olmaz). Oyuncuya değerse yakalanır; rakibe değen yakar top onu yakar.
 * Rüzgar topu durdurulamaz: kimse tutamaz, rakipleri savurup yavaşlamadan yoluna devam eder; kaleye giderse gol olur,
 * duvara çarparsa rüzgarı biter (normal top).
 */
export function updateBall(w, dt) {
  const b = w.ball;
  if (b.owner !== null) { carry(w); return; }
  const pieces = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vz) * dt / BALL.substep)), h = dt / pieces;
  for (let n = 0; n < pieces; n++) {
    b.x += b.vx * h; b.z += b.vz * h;
    if (Math.abs(b.x) > PITCH.halfX - 0.25) { b.x = Math.sign(b.x) * (PITCH.halfX - 0.25); b.vx *= -BALL.sideBounce; windOut(w); emit(w, 'bounce'); }
    if (Math.abs(b.z) > PITCH.halfZ) {
      if (Math.abs(b.x) < PITCH.goal && b.kind !== 'fire') { scoreGoal(w, b.z < 0 ? 0 : 1); return; }
      b.z = Math.sign(b.z) * (PITCH.halfZ - 0.1); b.vz *= -BALL.endBounce; windOut(w); emit(w, 'bounce');
    }
    if (touch(w)) return;
  }
  const friction = Math.exp(-(b.kind === 'wind' ? WIND.friction : BALL.friction) * dt);
  b.vx *= friction; b.vz *= friction;
  if (b.kind === 'fire' && b.power <= 0) { b.kind = 'normal'; b.vx *= BALL.fireFade; b.vz *= BALL.fireFade; }
  if (b.kind === 'wind' && b.power <= 0) b.kind = 'normal';
}

/** Rüzgar topu duvara çarptı: rüzgarı biter, normal top olarak seker. */
function windOut(w) { if (w.ball.kind === 'wind') { w.ball.kind = 'normal'; w.ball.power = 0; emit(w, 'windEnd'); } }

/**
 * Taşınan top. Yürüyen rakip **topa** STEAL.reach kadar yakınsa, taşıyanın arkasında değilse (arkadan ancak hızlı
 * koşuyla), iki taraf da yerdeyse, kapan şut beklemesinde değilse ve taşıyan korunmuyorsa topu kapar; taşıyan STEAL.stun
 * kadar sersemler. Kayan rakip DASH.steal içindeyse her koşulda kapar; taşıyan STEAL.dashStun kadar sersemler.
 * Sersem oyuncu topu kapamaz. Nişan alan (yakar top / rüzgar, w.aim) yürüyerek soyulamaz: yalnız kayarak.
 */
function carry(w) {
  const b = w.ball, p = w.players[b.owner];
  b.x = p.x + Math.sin(p.angle) * BALL.hold; b.z = p.z + Math.cos(p.angle) * BALL.hold;
  b.vx = p.vx; b.vz = p.vz;
  if (b.stealLock > 0) return;
  const aiming = w.aim && w.aim.id === p.id;
  for (const rival of w.players) {
    if (rival.team === p.team || rival.burn > 0 || rival.stun > 0 || rival.air > 0) continue;
    const reach = distance(rival, p);
    const steals = rival.dash > 0
      ? reach <= DASH.steal
      : !aiming && distance(rival, b) <= STEAL.reach && (rival.sprint > 0 || !behind(p, rival, reach)) && rival.jump <= 0 && p.jump <= 0 && rival.kickCd <= 0 && p.guard <= 0;
    if (!steals) continue;
    b.owner = rival.id; b.last = rival.id;
    p.kickCd = STEAL.loserCooldown; p.charge = 0; p.dash = 0; b.stealLock = STEAL.lock; rival.guard = STEAL.guard; rival.stats.steals++;
    p.stun = rival.dash > 0 ? STEAL.dashStun : STEAL.stun; p.vx = 0; p.vz = 0;
    emit(w, 'steal', { id: rival.id, from: p.id, stun: true, dash: rival.dash > 0 });
    return;
  }
}

/** Rakip taşıyanın arkasında mı (taşıyanın bakış yönüne göre). */
export function behind(p, rival, reach) {
  return ((rival.x - p.x) * Math.sin(p.angle) + (rival.z - p.z) * Math.cos(p.angle)) / Math.max(0.01, reach) < STEAL.behindDot;
}

/**
 * Boştaki topun oyunculara değmesi. true: top bu adımda durdu (yakalandı ya da yaktı). Yakalama BALL.catch içinde,
 * yakar topun yakması ve rüzgar topunun savurması daha dar BALL.hit içinde olur.
 */
function touch(w) {
  const b = w.ball, shooter = w.players[b.last];
  for (const p of w.players) {
    if (p.burn > 0 || p.jump > 0 || p.knock > 0 || p.air > 0 || (p.stun > 0 && b.kind !== 'fire') || (p.dash > 0 && b.kind === 'fire') || (b.last === p.id && b.lock > 0)) continue;
    const d = distance(p, b), rival = shooter && p.team !== shooter.team;
    if (d > BALL.catch) continue;
    if (b.kind === 'fire' && rival) { if (p.guard > 0 || d > BALL.hit) continue; burn(w, p); return true; }
    if (b.kind === 'wind') { if (rival && d <= BALL.hit) blow(w, p); continue; }
    if (b.kind === 'fire' && b.lock > 0) continue;
    Object.assign(b, { owner: p.id, last: p.id, kind: 'normal', power: 0 });
    p.guard = BALL.catchGuard;
    if (p.role === KEEPER && rival) p.stats.saves++;
    emit(w, 'receive', { id: p.id });
    return true;
  }
  return false;
}

/** Rüzgar topu rakibi havaya fırlatır ve yolundan, topun gidişine dik yönde (rakibin durduğu tarafa) savurur. */
function blow(w, p) {
  const b = w.ball, v = Math.max(0.01, Math.hypot(b.vx, b.vz)), nx = -b.vz / v, nz = b.vx / v;
  const side = (p.x - b.x) * nx + (p.z - b.z) * nz >= 0 ? 1 : -1;
  p.knock = WIND.knock; p.knockX = nx * side; p.knockZ = nz * side; p.air = p.airMax = WIND.air; p.dash = 0; p.jump = 0; p.charge = 0;
  b.vx *= WIND.keep; b.vz *= WIND.keep;
  emit(w, 'blow', { id: p.id, x: p.x, z: p.z });
}

function burn(w, p) {
  const b = w.ball, attacker = w.players[b.last];
  const v = Math.max(0.01, Math.hypot(b.vx, b.vz));
  Object.assign(p, { burn: BURN.time, vx: 0, vz: 0, charge: 0, burnX: p.x, burnZ: p.z, burnDX: b.vx / v, burnDZ: b.vz / v });
  if (attacker) attacker.stats.burns++;
  emit(w, 'burn', { id: p.id, attacker: attacker?.id, x: p.x, z: p.z });
  b.vx *= BURN.ballKeep; b.vz *= BURN.ballKeep; b.kind = 'normal'; b.power = 0; b.lock = BURN.ballLock;
}

function scoreGoal(w, team) {
  w.score[team]++;
  const p = w.players[w.ball.last];
  if (p && p.team === team) p.stats.goals++;
  const b = w.ball, x = b.x, z = Math.sign(b.z) * PITCH.halfZ;
  emit(w, 'goal', { team, id: p?.id, x, z });
  if (w.overtime) { w.winner = team; emit(w, 'end'); return; }
  blast(w, x, z, 1 - team);
}

/**
 * Gol patlaması: herkes patlama noktasından uzağa fırlar (yakın olan daha hızlı ve daha uzun havada), top ağda durur.
 * GOAL_BLAST.time sonra world.step yeniden dizer (lineUp) ve santra `next` takımından yapılır.
 */
function blast(w, x, z, next) {
  Object.assign(w.ball, { owner: null, vx: 0, vz: 0, kind: 'normal', power: 0, lock: 0, stealLock: 0 });
  w.blast = { t: GOAL_BLAST.time, x, z, next };
  for (const p of w.players) {
    let dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
    if (d < 0.1) { const a = w.random() * Math.PI * 2; dx = Math.sin(a); dz = Math.cos(a); d = 1; }
    const speed = Math.max(GOAL_BLAST.min, GOAL_BLAST.speed - d * GOAL_BLAST.falloff);
    Object.assign(p, { vx: dx / d * speed, vz: dz / d * speed, dash: 0, sprint: 0, knock: 0, jump: 0, charge: 0 });
    p.airMax = p.air = GOAL_BLAST.air * (0.45 + 0.55 * speed / GOAL_BLAST.speed);
  }
}
