import { BURN, LINEUP, MATCH, PITCH } from './config.js';

/**
 * Diziliş: rollere göre ev konumları (mavi yarı sahada, +z; turuncu için z aynalanır). Rol 0 forvet, 1-2 kanatlar,
 * 3 defans, 4 kaleci. Oyuncunun evi rolünün konumu + kendi kayması (shiftX / shiftZ). Botların yer tutması ve
 * golden sonraki yeniden diziliş buradan okunur. Her golden sonra iki takımda da saha oyuncularının rolleri karılır
 * (kaleciler yerinde kalır) ve evlerine küçük bir rastgele kayma eklenir: kimse hep aynı mevkide oynamaz.
 */
const X = PITCH.halfX, Z = PITCH.halfZ;
const HOMES = [{ x: 0, z: Z * 0.32 }, { x: -X * 0.5, z: Z * 0.12 }, { x: X * 0.5, z: Z * 0.12 }, { x: 0, z: Z * 0.6 }, { x: 0, z: Z - 3 }];
export const KEEPER = 4;

/** Takımın hücum yönü (z ekseninde): mavi -z kalesine, turuncu +z kalesine. */
export const attackDir = team => (team === 0 ? -1 : 1);

export function homeOf(p) {
  const h = HOMES[p.role];
  return { x: h.x + (p.shiftX || 0), z: (h.z + (p.shiftZ || 0)) * (p.team === 0 ? 1 : -1) };
}

/** Takımın forveti (rol 0): başlama vuruşunu o yapar. */
export const forwardOf = (w, team) => w.players.find(p => p.team === team && p.role === 0);

/**
 * Takımların saha oyuncularına rolleri karıştırarak dağıtır ve evlerini biraz kaydırır (tohumlu rastgelelik). İnsan
 * oyuncular her seferinde **başka** bir role geçer: rastgele eşleşme aynı rolü verirse bir takım arkadaşıyla takas eder.
 */
export function shuffleRoles(w) {
  for (const team of [0, 1]) {
    const field = w.players.filter(p => p.team === team && p.role !== KEEPER);
    const roles = field.map(p => p.role);
    for (let i = roles.length - 1; i > 0; i--) { const j = Math.floor(w.random() * (i + 1)); [roles[i], roles[j]] = [roles[j], roles[i]]; }
    field.forEach((p, human) => {
      if (!p.human || roles[human] !== p.role) return;
      const other = (human + 1 + Math.floor(w.random() * (field.length - 1))) % field.length;
      [roles[human], roles[other]] = [roles[other], roles[human]];
    });
    field.forEach((p, i) => {
      p.role = roles[i];
      p.shiftX = (w.random() - 0.5) * 2 * X * LINEUP.shiftX;
      p.shiftZ = (w.random() - 0.5) * 2 * Z * LINEUP.shiftZ;
    });
  }
}

/**
 * Golden sonra: roller karılır, herkes (yananlar da) yeni evine, top ortaya; başlama vuruşu `team`in forvetinden,
 * orta noktanın gerisinden.
 */
export function lineUp(w, team) {
  shuffleRoles(w);
  for (const p of w.players) Object.assign(p, homeOf(p), { vx: 0, vz: 0, burn: 0, guard: BURN.kickoffGuard, stun: 0, evade: 0, pressed: false, air: 0, dash: 0, sprint: 0, knock: 0, jump: 0, charge: 0 });
  const taker = forwardOf(w, team);
  taker.x = 0; taker.z = attackDir(team) * -1.5;
  Object.assign(w.ball, { x: 0, z: 0, vx: 0, vz: 0, owner: null, last: null, kind: 'normal', power: 0, lock: 0, stealLock: 0 });
  w.kickoff = MATCH.restart; w.nextKickoff = team; w.kickoffTaker = taker.id;
  w.events.push({ type: 'lineup', team });
}
