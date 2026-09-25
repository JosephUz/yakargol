import * as T from 'three';
import { BURN, CINEMA, DASH, GOAL_BLAST, JUMP, PITCH, TEAMS } from '../config.js';
import { box } from './builders.js';

/**
 * Oyuncu görselleri: blok gövde, kafa, saç, kollar ve bacaklar (koşarken sallanır), üstte isim etiketi (DOM).
 * Topu taşıyan şut yönüne, kayan kayma yönüne, diğer herkes (kenardakiler de) topa bakar. Kayan oyuncu gövdesi geriye
 * yatmış, bir bacağı önde yerde kayar; hızlı koşan oyuncunun çevresinden rüzgar çizgileri geriye akar. Yanan oyuncu takımının kenarında titrer; sersem
 * oyuncu sallanır ve başının üstünde yıldızlar döner. Gol patlamasında herkes havada kollarını savurarak takla atar.
 */
const starGeo = new T.OctahedronGeometry(0.12);
const streakGeo = new T.BoxGeometry(0.035, 0.035, 1.1);
const streakMat = new T.MeshBasicMaterial({ color: '#f4fbff', transparent: true, opacity: 0.55, depthWrite: false });
const starMat = new T.MeshBasicMaterial({ color: '#ffe066' });

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
  // Senin karakterin (0) sarı saçlı: kalabalıkta hemen seçilir.
  box(body, 0.56, 0.16, 0.54, id === 0 ? '#f4cf3c' : id % 3 === 0 ? '#443b31' : '#40352d', 0, 2.03, 0);
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
  return { root, body, limbs, stars, wind, streaks, label };
}

/** Her kare: konum, bakış, uzuv sallanması ve etiket (kendi oyuncunun etiketi yok; kameranın arkası gizli). */
export function syncActors(actors, w, time, playing, project) {
  const b = w.ball;
  for (const p of w.players) {
    const v = actors[p.id], since = BURN.time - p.burn, knocked = p.burn > 0 && since < CINEMA.knock && p.burnX !== undefined;
    const burned = p.burn > 0 && !knocked;
    if (knocked) {
      // Yakar top çarptı: kenara gitmeden önce topun gidişi yönünde savrulup sırtüstü düşer.
      const k = since / CINEMA.knock;
      v.root.position.set(p.burnX + p.burnDX * k * 3, Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.9, p.burnZ + p.burnDZ * k * 3);
    } else v.root.position.set(burned ? benchX(p.team) : p.x, lift(p), burned ? benchZ(p) : p.z);
    const sliding = p.dash > 0 && !burned && !knocked, flying = p.air > 0 && !burned;
    v.root.rotation.y = flying ? Math.atan2(p.vx, p.vz) : sliding ? Math.atan2(p.dashX, p.dashZ) : b.owner === p.id || (p.id === 0 && Math.hypot(p.vx, p.vz) > 1.2) ? p.angle : Math.atan2(b.x - v.root.position.x, b.z - v.root.position.z);
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
    v.stars.visible = dazed;
    if (dazed) { v.stars.rotation.y = time * 5; v.stars.children.forEach((s, i) => { s.rotation.y = time * 8 + i; s.position.y = Math.sin(time * 7 + i * 2) * 0.06; }); }
    v.label.textContent = burned ? 'YANDI · ' + p.burn.toFixed(1) : p.id !== 0 && p.role === 4 ? 'KALECİ' : '';
    const screen = project(v.root.position.x, 2.6, v.root.position.z);
    v.label.hidden = !playing || !v.label.textContent || screen.behind;
    v.label.style.transform = `translate(${screen.x}px,${screen.y}px) translate(-50%,-100%)`;
  }
}
