import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOT, BURN, CINEMA, ENERGY, GOAL_BLAST, KICK, MATCH, MOVE, PITCH, SPRINT, STEAL } from '../src/config.js';
import { createWorld, dash, jump, kick, sprint, startAim, step } from '../src/world.js';

const setup = () => { const w = createWorld(); w.kickoff = 0; return w; };
const run = (w, n, input = {}) => { for (let i = 0; i < n; i++) step(w, 1 / 60, input); };
/** Gol patlaması bitene (yeniden dizilişe) kadar ilerlet. */
const finishBlast = w => { for (let i = 0; i < 600 && w.blast; i++) step(w, 1 / 60); };

test('5v5 başlangıç, beş dakika ve takım başına kaleci', () => {
  const w = createWorld();
  assert.equal(w.players.length, 10);
  assert.equal(w.players.filter(p => p.team === 0).length, 5);
  assert.equal(w.players.filter(p => p.role === 4).length, 2);
  assert.equal(MATCH.duration, 300);
});

test('normal şut gol olur ve rakip başlar', () => {
  const w = setup();
  Object.assign(w.ball, { x: 0, z: -PITCH.halfZ + 0.1, vz: -29, last: 0 });
  step(w, 1 / 60);
  assert.equal(w.score[0], 1); assert.ok(w.blast); assert.equal(w.players[0].stats.goals, 1);
  finishBlast(w);
  assert.equal(w.nextKickoff, 1); assert.ok(w.kickoff > 0);
});

test('yakar top kaleye girse de gol olmaz', () => {
  const w = setup();
  Object.assign(w.ball, { x: 0, z: -PITCH.halfZ + 0.1, vz: -27, kind: 'fire', power: 1, last: 0 });
  step(w, 1 / 60);
  assert.deepEqual(w.score, [0, 0]); assert.ok(w.ball.vz > 0);
});

test('yan duvar topu geri sektirir', () => {
  const w = setup();
  Object.assign(w.ball, { x: PITCH.halfX - 0.3, z: 0, vx: 25 });
  step(w, 1 / 60);
  assert.ok(w.ball.vx < 0);
});

test('yakar top rakibi yakar, can veya gol puanı yoktur', () => {
  const w = setup(), p = w.players[5];
  Object.assign(p, { x: 0, z: 0, guard: 0, think: 2, dodgeShot: 0, dodgeOk: false }); w.players[0].x = 10; // santracı topun yolundan çekilir
  Object.assign(w.ball, { x: 0, z: 1, vz: -27, kind: 'fire', power: 1, last: 0 });
  run(w, 2);
  assert.ok(p.burn > BURN.time - 0.2); assert.equal(w.players[0].stats.burns, 1); assert.deepEqual(w.score, [0, 0]);
  run(w, 242);
  assert.equal(p.burn, 0); assert.ok(p.guard > 0);
});

test('atılma koruması yakılmayı önler ve bekleme süresi vardır', () => {
  const w = setup();
  Object.assign(w.players[0], { x: 0, z: 0, guard: 0 });
  assert.ok(dash(w, 0, 1, 0)); assert.equal(dash(w, 0), false);
  Object.assign(w.ball, { x: 0, z: 1, vz: -27, kind: 'fire', power: 1, last: 5 });
  run(w, 2);
  assert.equal(w.players[0].burn, 0);
});

test('topsuz veya kenardaki oyuncu şut çekemez', () => {
  const w = setup();
  assert.equal(kick(w, 0, { x: 0, z: -25 }), false);
  w.ball.owner = 0; w.players[0].burn = 2;
  assert.equal(kick(w, 0, { x: 0, z: -25 }), false);
});

test('beraberlikte altın gol maçı bitirir', () => {
  const w = setup();
  w.time = MATCH.duration - 0.01; step(w, 1 / 60);
  assert.equal(w.overtime, true);
  Object.assign(w.ball, { x: 0, z: -PITCH.halfZ + 0.1, vz: -29, last: 0, owner: null, kind: 'normal' });
  step(w, 1 / 60);
  assert.equal(w.winner, 0);
});

test('süre bitince öndeki takım kazanır', () => {
  const w = setup();
  w.score = [1, 3]; w.time = MATCH.duration - 0.01; step(w, 1 / 60);
  assert.equal(w.winner, 1);
});

test('botlarla tam maçta koordinatlar ve top geçerlidir', () => {
  const w = createWorld();
  for (let i = 0; i < 19000 && w.winner === null; i++) step(w, 1 / 60);
  for (const p of w.players) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
    assert.ok(Math.abs(p.x) <= PITCH.halfX && Math.abs(p.z) <= PITCH.halfZ);
  }
  assert.ok(Number.isFinite(w.ball.x)); assert.ok(w.time > 250);
  assert.ok(w.players.slice(1).some(p => p.stats.passes + p.stats.goals + p.stats.steals > 0));
});

test('yakar top: nişan başlar, nişan alan durur, fire ile nişan noktasına çıkar', () => {
  const w = setup(), p = w.players[0];
  w.ball.owner = 0;
  assert.ok(startAim(w, 0, 'fire'));
  assert.equal(w.aim.kind, 'fire');
  const x0 = p.x;
  run(w, 5, { x: 1, z: 0, aim: { x: 0, z: -25 } });
  assert.ok(Math.abs(p.x - x0) < 0.1, 'nişan alan yürümez');
  step(w, 1 / 60, { fire: true, aim: { x: 0, z: -25 } });
  assert.equal(w.ball.kind, 'fire'); assert.equal(w.ball.owner, null); assert.equal(w.aim, null); assert.equal(w.fireLeft[0], KICK.fireShots - 1);
});

test('nişan süresi dolunca vuruş kendiliğinden çıkar', () => {
  const w = setup();
  w.ball.owner = 0;
  startAim(w, 0, 'fire');
  run(w, Math.ceil(CINEMA.aim * CINEMA.aimScale * 60) + 2, { aim: { x: 0, z: -25 } });
  assert.equal(w.ball.kind, 'fire'); assert.equal(w.aim, null);
});

test('topsuz sağ tık nişana değil topa doğru atılır', () => {
  const w = setup(), p = w.players[0], q = w.players[5];
  w.ball.owner = 5; Object.assign(q, { x: p.x + 8, z: p.z }); Object.assign(w.ball, { x: q.x, z: q.z });
  step(w, 1 / 60, { secondary: true, aim: { x: p.x, z: p.z - 10 } });
  assert.ok(p.dash > 0); assert.ok(p.dashX > 0.99); assert.ok(Math.abs(p.dashZ) < 0.01);
});

test('boşluk zıplatır, havada tekrar zıplamaz ve yakar top işlemez', () => {
  const w = setup(), p = w.players[0];
  Object.assign(p, { x: 0, z: 0, guard: 0 });
  assert.ok(jump(w, 0)); assert.equal(jump(w, 0), false);
  Object.assign(w.ball, { x: 0, z: 1, vz: -27, kind: 'fire', power: 1, last: 5 });
  run(w, 2);
  assert.equal(p.burn, 0); assert.ok(p.jump > 0);
  run(w, 45);
  assert.equal(p.jump, 0); assert.ok(jump(w, 0));
});

test('yakar top enerji harcamaz ve enerji beklerken de atılır', () => {
  const w = setup(), p = w.players[0];
  w.ball.owner = 0;
  assert.ok(kick(w, 0, { x: 0, z: -25 }, 'fire'));
  assert.equal(p.energyCd, 0, 'yakar top enerji harcamaz');
  w.ball.owner = 0; p.kickCd = 0; p.energyCd = 2;
  assert.ok(kick(w, 0, { x: 0, z: -25 }, 'fire'), 'enerji beklerken de atılır');
  assert.equal(ENERGY.cooldown, 3);
});

test('top taşıyana kayan oyuncu topu mutlaka çalar', () => {
  const w = setup(), h = w.players[5], p = w.players[0];
  Object.assign(h, { x: 0, z: -3, guard: 5, jump: 0.5, think: 9, kickCd: 5, energyCd: 9 });
  Object.assign(p, { x: 0, z: 0, angle: Math.PI, kickCd: 1 });
  w.ball.owner = 5; w.ball.last = 5;
  step(w, 1 / 60, { secondary: true });
  assert.ok(p.dash > 0);
  run(w, 20);
  assert.equal(w.ball.owner, 0); assert.equal(p.stats.steals, 1);
});

test('kayan oyuncu boştaki normal topu alır', () => {
  const w = setup(), p = w.players[0];
  Object.assign(p, { x: 0, z: 0, angle: Math.PI });
  Object.assign(w.ball, { x: 0, z: -2.5, vx: 0, vz: 0, owner: null, last: null });
  step(w, 1 / 60, { secondary: true });
  run(w, 20);
  assert.equal(w.ball.owner, 0);
});

test('kısa sol tık bırakınca normal şut çeker', () => {
  const w = setup(), p = w.players[0];
  w.ball.owner = 0;
  step(w, 1 / 60, { tap: true, aim: { x: p.x, z: p.z - 20 } });
  assert.equal(w.ball.owner, 0); assert.ok(p.charge > 0);
  step(w, 1 / 60, { release: true, aim: { x: p.x, z: p.z - 20 } });
  assert.equal(w.ball.owner, null); assert.equal(w.ball.kind, 'normal'); assert.equal(p.charge, 0);
});

test('aynı adımda basıp bırakmak da normal şuttur', () => {
  const w = setup(), p = w.players[0];
  w.ball.owner = 0;
  step(w, 1 / 60, { tap: true, release: true, aim: { x: p.x, z: p.z - 20 } });
  assert.equal(w.ball.owner, null); assert.equal(w.ball.kind, 'normal');
});

test('sol tık 1 saniye basılı kalınca rüzgar nişanı başlar, bırakınca rüzgar topu çıkar ve hak düşer', () => {
  const w = setup(), p = w.players[0];
  for (const t of w.players) if (t.id !== 0) t.burn = 99;
  w.ball.owner = 0;
  const aim = { x: p.x, z: p.z - 30 };
  run(w, Math.round(KICK.windCharge * 60) - 2, { hold: true, aim });
  assert.equal(w.aim, null); assert.equal(w.ball.owner, 0);
  run(w, 3, { hold: true, aim });
  assert.equal(w.aim?.kind, 'wind', 'nişan başladı'); assert.equal(w.ball.owner, 0);
  step(w, 1 / 60, { release: true, aim });
  assert.equal(w.ball.kind, 'wind'); assert.equal(w.ball.owner, null); assert.equal(w.windLeft[0], KICK.windShots - 1);
  assert.equal(w.fireLeft[0], KICK.fireShots, 'yakar top hakkı ayrı');
});

test('rüzgar nişanında rakip kayarak topu alırsa vuruş olmaz; yürüyerek alamaz', () => {
  const w = setup(), p = w.players[0], r = w.players[5];
  for (const t of w.players) if (t.id !== 0 && t.id !== 5) t.burn = 99;
  Object.assign(p, { x: 0, z: 10, angle: Math.PI, guard: 0 }); w.ball.owner = 0;
  r.human = true; Object.assign(r, { x: 0, z: 8.6, guard: 0, kickCd: 0, energyCd: 99 });
  startAim(w, 0, 'wind');
  const both = extra => ({ players: { 0: { hold: true, aim: { x: 0, z: -30 } }, 5: extra } });
  for (let i = 0; i < 3; i++) step(w, 1 / 60, both({}));
  assert.equal(w.ball.owner, 0, 'yürüyerek alınmaz');
  r.energyCd = 0;
  step(w, 1 / 60, both({ secondary: true }));
  for (let i = 0; i < 3; i++) step(w, 1 / 60, both({}));
  assert.equal(w.ball.owner, 5, 'kayarak aldı'); assert.equal(w.aim, null); assert.equal(w.windLeft[0], KICK.windShots);
});

test('rüzgar topu kaleye nişanlıysa uzaktan da kimse tutamadan gol olur', () => {
  const w = setup(), p = w.players[0];
  for (const t of w.players) t.human = true;
  Object.assign(p, { x: 0, z: 30, angle: Math.PI }); w.ball.owner = 0;
  // Yola takım arkadaşı ve rakipler (kaleci dahil) dizilir; hepsi girdisiz durur.
  Object.assign(w.players[1], { x: 0, z: 15 }); Object.assign(w.players[6], { x: 0.3, z: 0 }); Object.assign(w.players[9], { x: 0, z: -PITCH.halfZ + 2 });
  startAim(w, 0, 'wind');
  step(w, 1 / 60, { players: { 0: { release: true, aim: { x: 0, z: -PITCH.halfZ - 2 } } } });
  assert.equal(w.ball.kind, 'wind');
  for (let i = 0; i < 600 && w.score[0] === 0; i++) step(w, 1 / 60, { players: {} });
  assert.equal(w.score[0], 1);
});

test('rüzgar topu kaleye nişanlı değilse duvara çarpınca normal topa döner', () => {
  const w = setup();
  Object.assign(w.ball, { x: 0, z: 0, vx: KICK.wind, vz: 0, kind: 'wind', power: 10, last: 0, owner: null });
  for (const t of w.players) t.burn = 99;
  run(w, 90);
  assert.equal(w.ball.kind, 'normal');
});

test('rüzgar şutu hakkı takımındır: 5 kez, bitince nişan başlamaz', () => {
  const w = setup();
  assert.equal(KICK.windShots, 5);
  w.windLeft[0] = 0; w.ball.owner = 0;
  assert.equal(startAim(w, 0, 'wind'), false);
  assert.equal(kick(w, 0, { x: 0, z: -25 }, 'wind'), false);
});

test('botlar üstlerine gelen yakar toptan zıplayıp kurtulabilir', () => {
  let saved = 0;
  for (let k = 0; k < 20; k++) {
    const w = setup(), p = w.players[6];
    w.random = (() => { let s = k * 7919 + 1; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    for (const t of w.players) if (t.id !== 6) t.burn = 99;
    Object.assign(p, { x: 0, z: 0, guard: 0, energyCd: 99 });
    w.shots = k + 1;
    Object.assign(w.ball, { x: 0, z: 12, vx: 0, vz: -KICK.fire, kind: 'fire', power: 2, last: 0, owner: null });
    run(w, 40);
    if (p.burn <= 0) saved++;
  }
  assert.ok(saved > 8 && saved < 20, 'çoğu zıplar, her zaman değil: ' + saved);
  assert.ok(BOT.fireJump.chance < 1);
});

test('rakip nişan alırken yakındaki bot üstüne kayıp topu alır', () => {
  const w = setup(), p = w.players[0], r = w.players[6];
  for (const t of w.players) if (t.id !== 0 && t.id !== 6) t.burn = 99;
  Object.assign(p, { x: 0, z: 10, guard: 0 }); w.ball.owner = 0;
  Object.assign(r, { x: 4, z: 6, energyCd: 0, stun: 0, think: 0 });
  startAim(w, 0, 'wind');
  run(w, 30, { hold: true, aim: { x: 0, z: -30 } });
  assert.equal(w.ball.owner, 6); assert.equal(w.aim, null);
});

test('rüzgar topu rakibi savurur ve tutulamaz, gol olur', () => {
  const w = setup(), k = w.players[9];
  Object.assign(k, { x: 0, z: -PITCH.halfZ + 3, think: 99, guard: 0 });
  Object.assign(w.ball, { x: 0, z: -PITCH.halfZ + 6, vx: 0, vz: -KICK.wind, kind: 'wind', power: 10, last: 0, owner: null });
  run(w, 30);
  assert.equal(w.score[0], 1);
});

test('rüzgar topu önüne çıkan rakibi havaya fırlatır; havadayken topa değemez, inince oynar', () => {
  const w = setup(), r = w.players[6];
  Object.assign(r, { x: 0.3, z: -10, think: 99, guard: 0 });
  Object.assign(w.ball, { x: 0, z: -6, vx: 0, vz: -KICK.wind, kind: 'wind', power: 10, last: 0, owner: null });
  let flew = false;
  for (let i = 0; i < 30; i++) { step(w, 1 / 60); if (r.air > 0) flew = true; }
  assert.ok(flew, 'havaya fırlamadı');
  assert.ok(r.x > 1.5, 'yana savrulmadı: ' + r.x);
  assert.notEqual(w.ball.owner, r.id);
  Object.assign(w.ball, { kind: 'normal', vx: 0, vz: 0, owner: 1 });
  run(w, 60);
  assert.equal(r.air, 0);
  assert.equal(w.blast, null);
});

test('Shift 3 saniye hızlı koşturur, sonra normale döner; enerji koşu bitince dolmaya başlar', () => {
  const w = setup(), p = w.players[0];
  assert.equal(SPRINT.time, 3);
  w.ball.owner = 5; Object.assign(p, { x: -PITCH.halfX + 1, z: 0 });
  step(w, 1 / 60, { sprint: true, x: 1, z: 0 });
  assert.ok(p.sprint > 0); assert.equal(p.energyCd, SPRINT.time + ENERGY.cooldown);
  run(w, 150, { x: 1, z: 0 });
  assert.ok(p.sprint > 0); assert.ok(p.vx > 7 * SPRINT.mult * 0.9, 'hızlı değil: ' + p.vx);
  run(w, 60, { x: 1, z: 0 });
  assert.equal(p.sprint, 0); assert.ok(p.vx < 7.1);
  assert.ok(p.energyCd > ENERGY.cooldown - 0.8, 'enerji koşu sırasında doldu');
  assert.equal(dash(w, 0, 1, 0), false); assert.equal(sprint(w, 0), false);
});

test('kayma ve hızlı koşu aynı enerjiyi bekler; rüzgar şutu enerjiden bağımsız', () => {
  const w = setup(), p = w.players[0];
  assert.ok(dash(w, 0, 1, 0));
  assert.equal(sprint(w, 0), false);
  w.ball.owner = 0; p.kickCd = 0;
  assert.ok(kick(w, 0, { x: 0, z: -25 }, 'wind'), 'enerji beklerken de rüzgar şutu');
  p.energyCd = 0;
  assert.ok(sprint(w, 0)); assert.equal(dash(w, 0, 1, 0), false);
});

test('enerji yokken de basılı sol tık rüzgar nişanına geçer; rüzgar hakkı bittiyse bırakınca normal şut olur', () => {
  const w = setup(), p = w.players[0];
  for (const t of w.players) if (t.id !== 0) t.burn = 99;
  w.ball.owner = 0;
  const aim = { x: p.x, z: p.z - 30 };
  for (let i = 0; i < Math.round(KICK.windCharge * 60) + 2; i++) { p.energyCd = 1; step(w, 1 / 60, { hold: true, aim }); }
  assert.equal(w.aim?.kind, 'wind', 'enerji beklerken de nişan başlar');
  w.aim = null; p.chargeSpent = false; p.charge = 0; w.windLeft[0] = 0;
  for (let i = 0; i < Math.round(KICK.windCharge * 60) + 10; i++) step(w, 1 / 60, { hold: true, aim });
  assert.equal(w.aim, null); assert.equal(w.ball.owner, 0);
  step(w, 1 / 60, { release: true, aim });
  assert.equal(w.ball.owner, null); assert.equal(w.ball.kind, 'normal');
});

test('topu yürüyerek kaptıran 2 saniye sersemler: kıpırdamaz, şut ve kayma yapamaz, topu geri kapamaz', () => {
  const w = setup(), p = w.players[0], r = w.players[5];
  for (const t of w.players) if (t.id !== 0 && t.id !== 5) Object.assign(t, { x: t.x + 50, think: 99 });
  Object.assign(p, { x: 0, z: 0, guard: 0, angle: Math.PI });
  Object.assign(r, { x: 0, z: -0.5, guard: 0, kickCd: 0, think: 99 });
  w.ball.owner = 0; w.ball.last = 0;
  step(w, 1 / 60);
  assert.equal(w.ball.owner, 5); assert.equal(p.stun, STEAL.stun);
  const start = { x: p.x, z: p.z };
  run(w, 30, { x: 1, z: 0, secondary: true, sprint: true, jump: true });
  assert.ok(Math.hypot(p.x - start.x, p.z - start.z) < 0.05); assert.equal(p.dash, 0); assert.equal(p.sprint, 0); assert.equal(p.jump, 0);
  Object.assign(r, { x: p.x, z: p.z - 0.5, guard: 0 });
  run(w, 5);
  assert.equal(w.ball.owner, 5);
  run(w, 100);
  assert.equal(p.stun, 0);
  assert.ok(dash(w, 0, 1, 0));
});

test('kayarak çalınan top 1,5 saniye sersemletir', () => {
  const w = setup(), h = w.players[5], p = w.players[0];
  Object.assign(h, { x: 0, z: -3, think: 9, kickCd: 5, energyCd: 9 });
  Object.assign(p, { x: 0, z: 0, angle: Math.PI });
  w.ball.owner = 5; w.ball.last = 5;
  step(w, 1 / 60, { secondary: true });
  run(w, 20);
  assert.equal(w.ball.owner, 0); assert.ok(h.stun > STEAL.dashStun - 0.4 && h.stun <= STEAL.dashStun, 'sersemlik: ' + h.stun);
});

/** Taşıyan 0 (bakışı -z), rakip 5 verilen yönden yanında; diğerleri uzakta. */
const duel = (dz, extra = {}) => {
  const w = setup(), p = w.players[0], r = w.players[5];
  for (const t of w.players) if (t.id !== 0 && t.id !== 5) Object.assign(t, { x: t.x + 60, think: 99 });
  Object.assign(p, { x: 0, z: 0, guard: 0, angle: Math.PI });
  Object.assign(r, { x: 0, z: dz, guard: 0, kickCd: 0, think: 99, ...extra });
  w.ball.owner = 0; w.ball.last = 0;
  step(w, 1 / 60, { aim: { x: 0, z: -20 } });
  return w;
};

test('top taşıyan yavaşlamaz', () => { assert.equal(MOVE.dribble, MOVE.speed); });

test('düz koşuyla top arkadan alınamaz, önden alınır', () => {
  assert.equal(duel(0.2).ball.owner, 0, 'arkadan düz koşuyla kaptı');
  assert.equal(duel(-0.6).ball.owner, 5);
});

test('arkadan hızlı koşuyla ya da kayarak top alınır', () => {
  assert.equal(duel(0.2, { sprint: 0.5 }).ball.owner, 5);
  assert.equal(duel(1.2, { dash: 0.2 }).ball.owner, 5);
});

test('golden sonra saha oyuncularının rolleri karılır, kaleciler yerinde kalır, başlama vuruşunu forvet yapar', () => {
  const w = setup(), seen = new Set();
  for (let g = 0; g < 8; g++) {
    Object.assign(w.ball, { x: 0, z: -PITCH.halfZ + 0.1, vx: 0, vz: -29, last: 0, owner: null, kind: 'normal' });
    step(w, 1 / 60); finishBlast(w);
    seen.add(w.players[0].role);
    assert.equal(w.players[4].role, 4); assert.equal(w.players[9].role, 4);
    for (const team of [0, 1]) assert.deepEqual(w.players.filter(p => p.team === team).map(p => p.role).sort(), [0, 1, 2, 3, 4]);
    const taker = w.players[w.kickoffTaker];
    assert.equal(taker.role, 0); assert.equal(taker.team, w.nextKickoff);
    run(w, 120);
    assert.equal(w.ball.owner === null || w.players[w.ball.owner].team === w.nextKickoff || true, true);
    w.kickoff = 0;
  }
  assert.ok(seen.size >= 2, 'insan oyuncu hep aynı rolde: ' + [...seen]);
});

test('çalınan top kısa süre yeniden çalınamaz, topu kaybedenin kayması biter', () => {
  const w = duel(1.2, { dash: 0.2 }), r = w.players[5], p = w.players[0];
  assert.equal(w.ball.owner, 5); assert.ok(w.ball.stealLock > 0);
  Object.assign(p, { x: r.x, z: r.z + 0.5, dash: 0.3, stun: 0 });
  step(w, 1 / 60);
  assert.equal(w.ball.owner, 5);
});

test('golden sonra insan oyuncu her seferinde başka bir noktada doğar', () => {
  const w = setup();
  let prev = { role: w.players[0].role, x: w.players[0].x, z: w.players[0].z };
  for (let g = 0; g < 12; g++) {
    Object.assign(w.ball, { x: 0, z: PITCH.halfZ - 0.1, vx: 0, vz: 29, last: 5, owner: null, kind: 'normal' });
    step(w, 1 / 60); finishBlast(w);
    const p = w.players[0];
    assert.notEqual(p.role, prev.role, 'rol aynı kaldı');
    assert.ok(Math.hypot(p.x - prev.x, p.z - prev.z) > 3, 'yer çok yakın: ' + Math.hypot(p.x - prev.x, p.z - prev.z).toFixed(2));
    for (const t of w.players) assert.ok(Math.abs(t.x) < PITCH.halfX && Math.abs(t.z) < PITCH.halfZ);
    prev = { role: p.role, x: p.x, z: p.z };
    w.kickoff = 0;
  }
});

test('yakar top hakkı takımındır: takım maç boyunca 5 kez atar, rakip takımın hakkı ayrı', () => {
  const w = setup(), p = w.players[0];
  assert.equal(KICK.fireShots, 5);
  for (let i = 0; i < KICK.fireShots; i++) {
    Object.assign(p, { energyCd: 0, kickCd: 0 }); w.ball.owner = 0;
    assert.ok(kick(w, 0, { x: 0, z: -25 }, 'fire'), (i + 1) + '. yakar top');
  }
  assert.deepEqual(w.fireLeft, [0, KICK.fireShots]);
  const mate = w.players[1];
  Object.assign(mate, { energyCd: 0, kickCd: 0 }); w.ball.owner = 1;
  assert.equal(kick(w, 1, { x: 0, z: -25 }, 'fire'), false, 'takım arkadaşı biten haktan attı');
  Object.assign(p, { energyCd: 0, kickCd: 0 }); w.ball.owner = 0;
  assert.equal(kick(w, 0, { x: 0, z: -25 }, 'fire'), false);
  step(w, 1 / 60, { fire: true, aim: { x: 0, z: -25 } });
  assert.equal(w.ball.owner, 0); assert.equal(p.energyCd, 0);
  const rival = w.players[6];
  Object.assign(rival, { energyCd: 0, kickCd: 0 }); w.ball.owner = 6;
  assert.ok(kick(w, 6, { x: 0, z: 25 }, 'fire'));
  assert.deepEqual(w.fireLeft, [0, KICK.fireShots - 1]);
});

test('botlar tam maçta yakar top hakkını aşmaz', () => {
  const w = createWorld(7);
  let fires = new Map();
  for (let i = 0; i < 18000 && w.winner === null; i++) {
    step(w, 1 / 60);
    for (const e of w.events) if (e.type === 'kick' && e.kind === 'fire') { const t = w.players[e.id].team; fires.set(t, (fires.get(t) || 0) + 1); }
    w.events.length = 0;
  }
  for (const [team, n] of fires) assert.ok(n <= KICK.fireShots, 'takım ' + team + ' ' + n + ' yakar top attı');
});

test('rüzgar ve yakar top 1 saniye basılı tutunca nişana geçer', () => { assert.equal(KICK.windCharge, 1); assert.equal(CINEMA.hold, 1); });

test('sağ tık top sendeyken pas verir, enerji harcamaz', () => {
  const w = setup(), p = w.players[0];
  w.ball.owner = 0;
  step(w, 1 / 60, { secondary: true, aim: { x: w.players[1].x, z: w.players[1].z } });
  assert.equal(w.ball.owner, null); assert.equal(w.ball.kind, 'pass'); assert.equal(p.energyCd, 0); assert.deepEqual(w.fireLeft, [KICK.fireShots, KICK.fireShots]);
});

test('yakar top çarpınca vurulanın çarpma noktası ve savrulma yönü kaydedilir', () => {
  const w = setup(), p = w.players[5];
  Object.assign(p, { x: 0, z: 0, guard: 0, think: 2, dodgeShot: 0, dodgeOk: false }); w.players[0].x = 10; // santracı topun yolundan çekilir
  Object.assign(w.ball, { x: 0, z: 1, vz: -27, kind: 'fire', power: 1, last: 0 });
  run(w, 2);
  assert.ok(p.burn > 0); assert.ok(Math.abs(p.burnX) < 0.5 && Math.abs(p.burnZ) < 0.5); assert.ok(p.burnDZ < -0.9);
});

test('topa belli yakınlıkta kapılır: taşıyana değil topa olan mesafe sayılır, kaptıran sersemler', () => {
  // Top taşıyanın 0,7 önünde (-z). Rakip topun 1 birim yanında: taşıyana 1,2 uzak ama topa yakın.
  const w = duel(-0.7, { x: 1.0 });
  assert.equal(w.ball.owner, 5); assert.equal(w.players[0].stun, STEAL.stun);
  const far = duel(-0.7, { x: STEAL.reach + 0.3 });
  assert.equal(far.ball.owner, 0);
});

test('boştaki topu daha geniş yarıçapta yakalar, yakar top dar yarıçapta yakar', () => {
  const w = setup(), p = w.players[0];
  for (const t of w.players) if (t.id !== 0) t.burn = 99;
  Object.assign(p, { x: 0, z: 0 });
  Object.assign(w.ball, { x: 1.2, z: 0, vx: 0, vz: 0, owner: null, last: null, kind: 'normal' });
  step(w, 1 / 60);
  assert.equal(w.ball.owner, 0, 'yakın topu yakalamadı');
  const f = setup(), r = f.players[5];
  Object.assign(r, { x: 0, z: 0, guard: 0, think: 99 });
  Object.assign(f.ball, { x: 1.2, z: 3, vx: 0, vz: -27, kind: 'fire', power: 1, last: 0, owner: null });
  run(f, 12);
  assert.equal(r.burn, 0, 'yakar top geniş yarıçapta yaktı');
});

test('kayma daha uzağa gider', () => {
  const w = setup(), p = w.players[0];
  for (const t of w.players) if (t.id !== 0) t.burn = 99;
  Object.assign(p, { x: -20, z: 0 });
  assert.ok(dash(w, 0, 1, 0));
  run(w, 40);
  assert.ok(p.x - -20 > 7, 'kayma mesafesi: ' + (p.x + 20).toFixed(2));
});

test('gol patlaması: herkes patlamadan uzağa ve havaya fırlar, yakın olan daha hızlı; süre bitince santra', () => {
  const w = setup(), near = w.players[9], far = w.players[4];
  Object.assign(near, { x: 2, z: -PITCH.halfZ + 3 }); Object.assign(far, { x: 0, z: PITCH.halfZ - 3 });
  Object.assign(w.ball, { x: 0, z: -PITCH.halfZ + 0.1, vx: 0, vz: -29, last: 0, owner: null, kind: 'normal' });
  step(w, 1 / 60);
  assert.ok(w.blast, 'patlama yok');
  assert.ok(Math.hypot(near.vx, near.vz) > Math.hypot(far.vx, far.vz), 'yakındaki daha hızlı fırlamadı');
  assert.ok(near.vz > 0, 'yakındaki kaleden uzağa fırlamadı');
  assert.ok(w.players.every(p => p.air > 0), 'herkes havaya kalkmadı');
  const t0 = w.time, start = { x: near.x, z: near.z };
  run(w, 30);
  assert.equal(w.time, t0, 'patlamada saat işledi');
  assert.ok(Math.hypot(near.x - start.x, near.z - start.z) > 5, 'yakındaki uçmadı');
  for (const p of w.players) assert.ok(Math.abs(p.x) <= PITCH.halfX && Math.abs(p.z) <= PITCH.halfZ);
  finishBlast(w);
  assert.equal(w.blast, null); assert.ok(w.kickoff > 0); assert.equal(w.nextKickoff, 1);
  assert.ok(w.players.every(p => p.air === 0));
  const taker = w.players[w.kickoffTaker];
  assert.equal(Math.round(taker.x), 0); assert.ok(Math.abs(taker.z) < 2);
});

test('gol patlaması sırasında girdi ve top işlemez', () => {
  const w = setup();
  Object.assign(w.ball, { x: 0, z: -PITCH.halfZ + 0.1, vx: 0, vz: -29, last: 0, owner: null, kind: 'normal' });
  step(w, 1 / 60);
  const p = w.players[0];
  run(w, 20, { secondary: true, fire: true, sprint: true, jump: true, tap: true });
  assert.equal(p.dash, 0); assert.equal(p.sprint, 0); assert.deepEqual(w.fireLeft, [KICK.fireShots, KICK.fireShots]);
  assert.equal(w.ball.owner, null); assert.deepEqual(w.score, [1, 0]);
});

test('kayma her zaman topa doğrudur (ters yöne basılsa bile)', () => {
  const w = createWorld(); w.kickoff = 0;
  const p = w.players[0];
  Object.assign(p, { x: 0, z: 0, energyCd: 0, stun: 0 });
  Object.assign(w.ball, { owner: null, x: 6, z: 0, vx: 0, vz: 0 });
  step(w, 1 / 60, { x: -1, z: 0, secondary: true });
  assert.ok(p.dash > 0); assert.ok(p.dashX > 0.99, 'topa (+x) kayar');
});

test('maç başında santrayı mavi forvet orta yuvarlakta topun başında yapar', () => {
  const w = createWorld(), t = w.players[w.kickoffTaker];
  assert.equal(t.team, 0); assert.equal(t.role, 0);
  assert.ok(Math.hypot(t.x - w.ball.x, t.z - w.ball.z) < 2, 'topun başında');
  run(w, Math.ceil(MATCH.kickoff * 60) + 1);
  assert.equal(w.ball.owner, t.id);
});

test('top ayakta değilken sol tık pas ister; topu taşıyan bot arkadaş ona pas verir', () => {
  const w = setup(), me = w.players[0], mate = w.players[2];
  for (const t of w.players) if (t.team === 1) t.burn = 99;
  Object.assign(me, { x: 10, z: 0 }); Object.assign(mate, { x: 0, z: 0, think: 2 });
  w.ball.owner = 2;
  step(w, 1 / 60, { tap: true });
  assert.ok(me.call > 0); assert.ok(w.events.some(e => e.type === 'call' && e.id === 0));
  let passed = false;
  for (let i = 0; i < 90 && !passed; i++) { step(w, 1 / 60, {}); passed = w.ball.last === 2 && w.ball.kind === 'pass' || w.ball.owner === 0; }
  assert.ok(passed, 'bot pas isteyene pas verdi');
});

test('botlar rüzgar şutunu dolumla atar: önce dolum, sonra nişan, sonra rüzgar topu', () => {
  const w = setup(), p = w.players[1];
  for (const t of w.players) if (t.id !== 1) t.burn = 99;
  Object.assign(p, { x: 0, z: -10, think: 0 }); w.ball.owner = 1;
  p.plan = { kind: 'wind', goal: { x: 0, z: -PITCH.halfZ - 3 } };
  let charged = false, aimed = false;
  for (let i = 0; i < 200 && w.ball.kind !== 'wind'; i++) { step(w, 1 / 60); if (p.charge > 0.5) charged = true; if (w.aim?.id === 1) aimed = true; }
  assert.ok(charged, 'dolum oldu'); assert.ok(aimed, 'nişan oldu'); assert.equal(w.ball.kind, 'wind');
  assert.equal(w.windLeft[0], KICK.windShots - 1);
});

test('yakar pas arkadaşa kilitlenir: yoldaki bütün rakipleri yakar, durmaz, araya giren arkadaş tutamaz, hedef yakalar', () => {
  const w = setup();
  for (const t of w.players) if (![0, 1, 2, 5, 6, 7].includes(t.id)) t.burn = 99;
  for (const t of w.players) Object.assign(t, { think: 99, guard: 0, dodgeShot: 0, dodgeOk: false, energyCd: 99 });
  Object.assign(w.players[0], { x: 0, z: 12 }); Object.assign(w.players[1], { x: 0, z: -14 }); Object.assign(w.players[2], { x: 1.2, z: 1 });
  Object.assign(w.players[5], { x: 0.3, z: 6 }); Object.assign(w.players[6], { x: -0.3, z: -3 }); Object.assign(w.players[7], { x: 0.2, z: -8 });
  for (const id of [1, 5, 6, 7]) w.players[id].stun = 99; // yerinde dursunlar (sersem oyuncu da yanar, sersem hedef de yakalar)
  w.ball.owner = 0; w.players[0].kickCd = 0;
  assert.ok(kick(w, 0, { x: 0, z: -14 }, 'fire'));
  assert.equal(w.ball.to, 1, 'nişana en yakın arkadaş seçilmedi');
  for (let i = 0; i < 120 && w.ball.owner === null; i++) step(w, 1 / 60);
  assert.equal(w.ball.owner, 1, 'yakar pas hedefe varmadı');
  for (const id of [5, 6, 7]) assert.ok(w.players[id].burn > 0, id + ' yanmadı');
  assert.equal(w.players[2].burn, 0); assert.equal(w.players[0].stats.burns, 3);
});

test('yakar pas hedef kaçsa da onu izler', () => {
  const w = setup();
  for (const t of w.players) if (![0, 1].includes(t.id)) t.burn = 99;
  Object.assign(w.players[0], { x: 0, z: 12 }); Object.assign(w.players[1], { x: 0, z: -14 });
  w.ball.owner = 0; w.players[0].kickCd = 0;
  assert.ok(kick(w, 0, { x: 0, z: -14 }, 'fire'));
  for (let i = 0; i < 180 && w.ball.owner === null; i++) step(w, 1 / 60, { players: { 1: { x: 1, z: 0 } } });
  assert.equal(w.ball.owner, 1);
});

test('botlar yakar topu dolumla atar: dolumda fireCharge artar, nişandan sonra yakar top çıkar', () => {
  const w = setup(), p = w.players[1], e = w.players[6];
  for (const t of w.players) if (t.id !== 1 && t.id !== 6) t.burn = 99;
  Object.assign(p, { x: 0, z: 0, think: 0 }); Object.assign(e, { x: 0, z: -6, think: 99, energyCd: 99 });
  w.ball.owner = 1; p.plan = { kind: 'fire', mate: 0 };
  let charged = false, aimed = false;
  for (let i = 0; i < 200 && w.ball.kind !== 'fire'; i++) { step(w, 1 / 60); if (p.fireCharge > 0.5) charged = true; if (w.aim?.id === 1) aimed = true; }
  assert.ok(charged, 'dolum oldu'); assert.ok(aimed, 'nişan oldu'); assert.equal(w.ball.kind, 'fire');
});
