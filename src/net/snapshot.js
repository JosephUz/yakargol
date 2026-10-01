/**
 * Durum paketi (JSON, kısa diziler): maçın o anki hâli. Konumlar ve süreler yuvarlanır (bant genişliği). Sunucu
 * encodeSnapshot ile paketler, istemci applySnapshot ile kendi dünya kopyasına yazar (konumlar ara değerle ayrıca
 * yumuşatılır, bkz. client.js). Oyuncu alanlarının sırası PLAYER, top alanlarınınki BALL dizisindedir. aim: nişan
 * ([vuran, tür]), cine: sinema evresi ([evre, vuran, tür]; bkz. cinema.js).
 */
export const PLAYER = ['x', 'z', 'vx', 'vz', 'angle', 'burn', 'guard', 'stun', 'air', 'airMax', 'jump', 'dash', 'dashX', 'dashZ', 'sprint',
  'knock', 'knockX', 'knockZ', 'energyCd', 'kickCd', 'charge', 'fireCharge', 'call', 'role', 'burnX', 'burnZ', 'burnDX', 'burnDZ'];
const KINDS = ['normal', 'wind', 'fire', 'pass'];
const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;

/** cine: sunucudaki sinema evresi ({ phase, id, kind }, bkz. cinema.js) ya da null; ts: sunucu saati (sn, gerçek zaman). */
export function encodeSnapshot(w, cine, ts, events) {
  const b = w.ball;
  return {
    ts: r3(ts), time: r2(w.time), score: w.score, kickoff: r2(w.kickoff), fire: w.fireLeft, wind: w.windLeft, aim: w.aim ? [w.aim.id, w.aim.kind] : 0, ot: w.overtime ? 1 : 0, win: w.winner,
    blast: w.blast ? r2(w.blast.t) : 0, cine: cine ? [cine.phase, cine.id, cine.kind] : 0,
    b: [r2(b.x), r2(b.z), r2(b.vx), r2(b.vz), b.owner ?? -1, KINDS.indexOf(b.kind), r2(b.power), b.last ?? -1],
    p: w.players.map(p => PLAYER.map(k => (k === 'angle' || k === 'dashX' || k === 'dashZ' ? r3(p[k] ?? 0) : r2(p[k] ?? 0)))),
    h: w.players.map(p => (p.human ? 1 : 0)),
    ev: events,
  };
}

/** Paketteki durumu dünya kopyasına yazar (konumlar dahil; ara değer sonradan üstüne yazar). */
export function applySnapshot(w, s) {
  w.time = s.time; w.score = s.score; w.kickoff = s.kickoff; w.fireLeft = s.fire; if (s.wind) w.windLeft = s.wind; w.aim = s.aim ? { id: s.aim[0], kind: s.aim[1] } : null; w.overtime = !!s.ot; w.winner = s.win ?? null;
  w.blast = s.blast > 0 ? { t: s.blast } : null;
  const b = w.ball, [bx, bz, bvx, bvz, owner, kind, power, last] = s.b;
  Object.assign(b, { x: bx, z: bz, vx: bvx, vz: bvz, owner: owner < 0 ? null : owner, kind: KINDS[kind] || 'normal', power, last: last < 0 ? null : last });
  s.p.forEach((row, i) => {
    const p = w.players[i];
    PLAYER.forEach((k, j) => { p[k] = row[j]; });
    p.human = !!s.h[i];
    if (!p.burn) p.burnX = undefined;
  });
}
