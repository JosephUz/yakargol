import * as T from 'three';
import { BURN, CINEMA, DASH, GOAL_BLAST, JUMP, KICK, PITCH, TEAMS } from '../config.js';
import { box, mat } from './builders.js';

/**
 * Oyuncu görselleri: blok gövde, kafa, saç, kollar ve bacaklar (koşarken sallanır), üstte isim etiketi (DOM).
 * Topu taşıyan şut yönüne, kayan kayma yönüne, diğer herkes (kenardakiler de) topa bakar. Kayan oyuncu gövdesi geriye
 * yatmış, bir bacağı önde yerde kayar; hızlı koşan oyuncunun çevresinden rüzgar çizgileri geriye akar. Yanan oyuncu takımının kenarında titrer; sersem
 * oyuncu sallanır ve başının üstünde yıldızlar döner. Gol patlamasında herkes havada kollarını savurarak takla atar.
 *
 * **Dolum çevresi** (aura): yakar top dolarken (sağ tık basılı) karakterin çevresinde yerden alev dilleri yükselir,
 * rüzgar şutu dolarken (sol tık basılı) çevresinde camgöbeği halkalar ve rüzgar çizgileri döner; dolum arttıkça büyür,
 * nişanda tam boydur. Böylece vuruş çıkmadan herkes o oyuncunun neye kalkıştığını görür.
 */
const starGeo = new T.OctahedronGeometry(0.12);
const streakGeo = new T.BoxGeometry(0.035, 0.035, 1.1);
const streakMat = new T.MeshBasicMaterial({ color: '#f4fbff', transparent: true, opacity: 0.55, depthWrite: false });
const starMat = new T.MeshBasicMaterial({ color: '#ffe066' });
const flameGeo = new T.ConeGeometry(0.15, 0.75, 5);
const flameMats = ['#fff38d', '#ff9a2e', '#ff3a14'].map(color => new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, blending: T.AdditiveBlending }));
const emberRing = new T.RingGeometry(0.62, 0.95, 32);
const emberMat = new T.MeshBasicMaterial({ color: '#ff5a1f', transparent: true, opacity: 0.55, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending });
const windRingGeo = new T.TorusGeometry(0.78, 0.035, 6, 36);
const windMats = ['#e9fdff', '#8ff3ff'].map(color => new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, blending: T.AdditiveBlending }));
const gustGeo = new T.BoxGeometry(0.04, 0.04, 0.7);
const FLAMES = 12, GUSTS = 8;

export const benchX = team => (team === 0 ? -1 : 1) * (PITCH.halfX + 3);
export const benchZ = p => -6 + p.role * 2.6;
/** Yerden yükseklik: gol patlamasında havada uçuş, zıplama ya da kayma. */
export const lift = p => (p.air > 0 ? Math.sin((1 - p.air / p.airMax) * Math.PI) * GOAL_BLAST.height * (p.airMax / GOAL_BLAST.air)
  : p.jump > 0 ? Math.sin(p.jump / JUMP.time * Math.PI) * JUMP.height : p.dash > 0 ? DASH.lift : 0);
/** Gol patlamasında havadaki takla (0 → 2π). */
const tumble = p => (p.air > 0 ? (1 - p.air / p.airMax) * Math.PI * 2 : 0);

export function createActor(scene, labels, id) {
  const root = new T.Group(), body = new T.Group();
  root.add(body); scene.add(root);
  const team = id < 5 ? 0 : 1, color = TEAMS.colors[team];
  box(body, 0.76, 0.9, 0.46, color, 0, 1.05, 0);
  box(body, 0.78, 0.26, 0.49, '#263a3a', 0, 0.59, 0);
  box(body, 0.53, 0.55, 0.5, '#d6a17c', 0, 1.75, 0);
  // Senin karakterin sarı saçlı (bkz. syncActors): kalabalıkta hemen seçilir.
  const hairColor = id % 3 === 0 ? '#443b31' : '#40352d';
  const hair = box(body, 0.56, 0.16, 0.54, hairColor, 0, 2.03, 0);
  box(body, 0.31, 0.08, 0.08, '#ffedcd', 0, 1.73, 0.27);
  const limbs = [];
  for (const x of [-0.23, 0.23]) {
    const leg = new T.Group(); leg.position.set(x, 0.6, 0);
    box(leg, 0.23, 0.53, 0.24, '#263a3a', 0, -0.22, 0);
    box(leg, 0.27, 0.18, 0.45, '#f3e6bf', 0, -0.5, 0.09);
    body.add(leg); limbs.push(leg);
  }
  for (const x of [-0.52, 0.52]) {
    const arm = new T.Group(); arm.position.set(x, 1.42, 0);
    box(arm, 0.22, 0.53, 0.25, color, 0, -0.2, 0);
    box(arm, 0.2, 0.25, 0.22, '#d6a17c', 0, -0.5, 0);
    body.add(arm); limbs.push(arm);
  }
  const stars = new T.Group();
  stars.position.y = 2.45; stars.visible = false; root.add(stars);
  for (let i = 0; i < 3; i++) {
    const star = new T.Mesh(starGeo, starMat), a = i * Math.PI * 2 / 3;
    star.position.set(Math.sin(a) * 0.42, 0, Math.cos(a) * 0.42);
    stars.add(star);
  }
  const label = document.createElement('div');
  label.className = 'actor-label ' + (team === 0 ? 'blue' : 'orange');
  labels.append(label);
  const wind = new T.Group(), streaks = [];
  wind.visible = false; scene.add(wind);
  for (let i = 0; i < 7; i++) { const s = new T.Mesh(streakGeo, streakMat); wind.add(s); streaks.push(s); }
  // Dolum çevresi: alev dilleri + yerde kor halkası (yakar top), dönen halkalar + rüzgar çizgileri (rüzgar şutu).
  const fireAura = new T.Group(), flames = [];
  fireAura.visible = false; root.add(fireAura);
  for (let i = 0; i < FLAMES; i++) { const f = new T.Mesh(flameGeo, flameMats[i % 3]); fireAura.add(f); flames.push(f); }
  const ember = new T.Mesh(emberRing, emberMat); ember.rotation.x = -Math.PI / 2; ember.position.y = 0.05; fireAura.add(ember);
  const windAura = new T.Group(), windRings = [], gusts = [];
  windAura.visible = false; root.add(windAura);
  for (let i = 0; i < 3; i++) { const r = new T.Mesh(windRingGeo, windMats[i % 2]); r.position.y = 0.45 + i * 0.7; windAura.add(r); windRings.push(r); }
  for (let i = 0; i < GUSTS; i++) { const g = new T.Mesh(gustGeo, windMats[i % 2]); windAura.add(g); gusts.push(g); }
  return { root, body, limbs, stars, wind, streaks, label, hair, hairColor, mine: null, fireAura, flames, ember, windAura, windRings, gusts };
}

/**
 * Her kare: konum, bakış, uzuv sallanması ve etiket (kendi oyuncunun etiketi yok; kameranın arkası gizli). Senin
 * oyuncun (w.me) sarı saçlı; çevrim içinde öbür insanların başında adları yazar.
 */
export function syncActors(actors, w, time, playing, project, real = time) {
  const b = w.ball;
  for (const p of w.players) {
    const v = actors[p.id], mine = p.id === w.me;
    if (v.mine !== mine) { v.mine = mine; v.hair.material = mat(mine ? '#f4cf3c' : v.hairColor); }
    const since = BURN.time - p.burn, knocked = p.burn > 0 && since < CINEMA.knock && p.burnX !== undefined;
    const burned = p.burn > 0 && !knocked;
    if (knocked) {
      // Yakar top çarptı: kenara gitmeden önce topun gidişi yönünde savrulup sırtüstü düşer.
      const k = since / CINEMA.knock;
      v.root.position.set(p.burnX + p.burnDX * k * 3, Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.9, p.burnZ + p.burnDZ * k * 3);
    } else v.root.position.set(burned ? benchX(p.team) : p.x, lift(p), burned ? benchZ(p) : p.z);
    const sliding = p.dash > 0 && !burned && !knocked, flying = p.air > 0 && !burned;
    v.root.rotation.y = flying ? Math.atan2(p.vx, p.vz) : sliding ? Math.atan2(p.dashX, p.dashZ) : b.owner === p.id || (p.human && Math.hypot(p.vx, p.vz) > 1.2) ? p.angle : Math.atan2(b.x - v.root.position.x, b.z - v.root.position.z);
    const swing = burned ? 0 : Math.min(Math.hypot(p.vx, p.vz) / 7, 1) * 0.65;
    // Kayma: bacaklardan biri öne uzanır, diğeri kırılır, kollar geriye açılır; yoksa koşu sallanması.
    const SLIDE = [-1.35, -0.4, 0.9, 0.9];
    v.limbs.forEach((l, i) => { l.rotation.x = flying ? Math.sin(time * 22 + i) * 1.1 : sliding ? SLIDE[i] : Math.sin(time * 15 + i * Math.PI) * swing; });
    const rush = p.sprint > 0 && !burned && !sliding && Math.hypot(p.vx, p.vz) > 1;
    v.wind.visible = rush;
    if (rush) {
      v.wind.position.set(p.x, 0, p.z);
      v.wind.rotation.y = Math.atan2(p.vx, p.vz);
      v.streaks.forEach((s, i) => {
        const t = (time * 2.6 + i / 7) % 1, a = i * 2.3;
        s.position.set(Math.sin(a) * 0.55, 0.45 + (i % 4) * 0.42, 0.4 - t * 2.4);
        s.scale.z = 0.6 + (1 - t) * 0.8;
      });
    }
    const dazed = !burned && p.stun > 0;
    v.body.rotation.z = burned ? Math.sin(time * 13) * 0.07 : dazed ? Math.sin(time * 6) * 0.16 : 0;
    v.body.rotation.x = flying ? -tumble(p) : knocked ? -Math.min(1, since / CINEMA.knock * 1.5) * 1.35 : sliding ? -1.05 : 0;
    aura(v, w, p, burned ? 0 : 1, real);
    v.stars.visible = dazed;
    if (dazed) { v.stars.rotation.y = time * 5; v.stars.children.forEach((s, i) => { s.rotation.y = time * 8 + i; s.position.y = Math.sin(time * 7 + i * 2) * 0.06; }); }
    // Pas isteyen (sen dahil) başında "PAS!" der.
    const calling = !burned && p.call > 0;
    v.label.classList.toggle('call', calling);
    v.label.textContent = burned ? 'YANDI · ' + p.burn.toFixed(1) : calling ? 'PAS!' : mine ? '' : w.online && p.human ? p.name + (p.role === 4 ? ' · KALECİ' : '') : p.role === 4 ? 'KALECİ' : '';
    const screen = project(v.root.position.x, 2.6, v.root.position.z);
    v.label.hidden = !playing || !v.label.textContent || screen.behind;
    v.label.style.transform = `translate(${screen.x}px,${screen.y}px) translate(-50%,-100%)`;
  }
}

/**
 * Dolum çevresi: yakar top / rüzgar dolumu (0-1) karakterin çevresinde alev ya da rüzgar olarak; nişanda tam boy.
 * Dolum: yakar topta fireCharge / CINEMA.hold, rüzgarda charge / KICK.windCharge (yalnız top ondayken). Gerçek zamanla
 * oynar (ağır çekimde de canlı).
 */
function aura(v, w, p, alive, t) {
  const aim = w.aim && w.aim.id === p.id ? w.aim.kind : null, owns = w.ball.owner === p.id;
  const fireK = alive * (aim === 'fire' ? 1 : owns ? Math.min(1, (p.fireCharge || 0) / CINEMA.hold) : 0);
  const windK = alive * (aim === 'wind' ? 1 : owns ? Math.min(1, (p.charge || 0) / KICK.windCharge) : 0);
  v.fireAura.visible = fireK > 0.12;
  if (v.fireAura.visible) {
    const k = 0.35 + fireK * 0.65;
    v.flames.forEach((f, i) => {
      const a = i / FLAMES * Math.PI * 2 + t * 1.6, r = 0.55 + (i % 2) * 0.18, flick = 0.65 + 0.45 * Math.sin(t * 17 + i * 1.9);
      f.position.set(Math.sin(a) * r, 0.3 + flick * 0.35 * k + (i % 3) * 0.25 * k, Math.cos(a) * r);
      f.scale.set(k, k * flick * (1 + (i % 3) * 0.35), k);
    });
    v.ember.scale.setScalar(0.8 + fireK * 0.45 + Math.sin(t * 9) * 0.05);
  }
  v.windAura.visible = windK > 0.12;
  if (v.windAura.visible) {
    const k = 0.45 + windK * 0.55, spin = t * (3 + windK * 5);
    v.windRings.forEach((r, i) => {
      r.rotation.set(Math.PI / 2 + Math.sin(spin + i) * 0.25, 0, spin * (i % 2 ? -1 : 1));
      r.scale.setScalar(k * (1 - i * 0.12) + Math.sin(t * 6 + i) * 0.04);
    });
    v.gusts.forEach((g, i) => {
      const a = i / GUSTS * Math.PI * 2 + spin * 1.3, r = 0.95 * k;
      g.position.set(Math.sin(a) * r, 0.3 + (i % 4) * 0.5, Math.cos(a) * r);
      g.rotation.y = a + Math.PI / 2;
      g.scale.z = 0.6 + windK;
    });
  }
}
