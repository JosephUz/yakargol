import * as T from 'three';
import { mat } from './builders.js';

/**
 * Top görseli. Normal ve pas topu beyaz; yakar top kırmızı, parlayan ve arkasında alev dilleri; rüzgar topu açık
 * camgöbeği, çevresinde dönen ve geride kalan rüzgar halkaları. Yerdeki halka topun türünün rengini alır. `heat` (0-1)
 * yakar top sinemasında alevleri büyütür ve topun turuncu ışığını parlatır. `charge` ({ kind, p }) şarj sırasında ayaktaki
 * topu hazırlanan vuruşun rengine boyar (rüzgar camgöbeği, yakar top kırmızı), dolum arttıkça parlar.
 */
const CHARGE = { wind: '#5fe6ff', fire: '#ff3a14', blocked: '#9aa39c' };
const WHITE = new T.Color('#ffffff');
const LOOK = {
  normal: { ring: '#ffffff', scale: 1 },
  pass: { ring: '#ffffff', scale: 1 },
  fire: { ring: '#ff3020', scale: 1.3 },
  wind: { ring: '#8ff3ff', scale: 1.3 },
};

export function createBallView(scene) {
  const group = new T.Group();
  const core = new T.Mesh(new T.IcosahedronGeometry(0.38, 2), mat('#fff6d4'));
  core.castShadow = true; group.add(core);
  for (let i = 0; i < 6; i++) {
    const patch = new T.Mesh(new T.CircleGeometry(0.145, 5), mat('#263c3c')), a = i * Math.PI / 3;
    patch.position.set(Math.sin(a) * 0.36, 0, Math.cos(a) * 0.36); patch.rotation.y = a;
    group.add(patch);
  }
  scene.add(group);
  const materials = {
    white: new T.MeshBasicMaterial({ color: '#ffffff' }),
    fire: new T.MeshStandardMaterial({ color: '#ff2514', emissive: '#ff3010', emissiveIntensity: 2 }),
    wind: new T.MeshStandardMaterial({ color: '#c9f7ff', emissive: '#5fdcff', emissiveIntensity: 1.2 }),
    charge: new T.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0 }),
  };

  const flames = new T.Group(), flameBits = [];
  scene.add(flames);
  for (let i = 0; i < 14; i++) {
    const color = i % 3 === 0 ? '#fff38d' : i % 2 ? '#ff7a16' : '#ff3014';
    const mesh = new T.Mesh(new T.ConeGeometry(0.2, 0.8, 5), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
    flames.add(mesh); flameBits.push(mesh);
  }

  const gusts = new T.Group(), gustRings = [];
  scene.add(gusts);
  for (let i = 0; i < 6; i++) {
    const mesh = new T.Mesh(new T.TorusGeometry(0.55, 0.05, 6, 28), new T.MeshBasicMaterial({ color: i % 2 ? '#e8fdff' : '#8ff3ff', transparent: true, opacity: 0.8, depthWrite: false }));
    gusts.add(mesh); gustRings.push(mesh);
  }

  const floor = new T.Mesh(new T.RingGeometry(0.48, 0.62, 32), new T.MeshBasicMaterial({ color: '#ffdc81', side: T.DoubleSide }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const light = new T.PointLight('#ff6a1a', 0, 16, 2);
  scene.add(light);
  return { group, core, materials, flames, flameBits, gusts, gustRings, floor, light };
}

export function syncBall(v, b, time, dt, heat = 0, charge = null) {
  const look = LOOK[b.kind] || LOOK.normal, loose = b.owner === null;
  v.group.position.set(b.x, 0.43 + Math.sin(time * 20) * 0.03, b.z);
  v.group.rotation.x += Math.hypot(b.vx, b.vz) * dt;
  v.core.material = b.kind === 'fire' ? v.materials.fire : b.kind === 'wind' ? v.materials.wind : v.materials.white;
  v.floor.position.set(b.x, 0.1, b.z);
  v.floor.material.color.set(look.ring);
  v.floor.scale.setScalar(look.scale * (1 + heat * 1.6));
  if (charge) {
    const k = Math.max(0, Math.min(1, charge.p)), tint = CHARGE[charge.kind], pulse = 0.85 + Math.sin(time * 14) * 0.15;
    v.core.material = v.materials.charge;
    v.materials.charge.color.copy(WHITE).lerp(new T.Color(tint), k);
    v.materials.charge.emissive.set(tint);
    v.materials.charge.emissiveIntensity = k * 1.8 * pulse;
    v.floor.material.color.set(tint);
    v.floor.scale.setScalar(1 + k * 0.9 * pulse);
  }

  const speed = Math.max(0.01, Math.hypot(b.vx, b.vz)), bx = -b.vx / speed, bz = -b.vz / speed;
  v.flames.visible = b.kind === 'fire' && loose;
  v.light.position.set(b.x, 1.1, b.z);
  v.light.intensity = v.flames.visible ? 12 + heat * 70 : 0;
  v.flames.position.set(b.x, 0.45, b.z);
  if (v.flames.visible) {
    v.flameBits.forEach((f, i) => {
      const t = (time * 2.3 + i / 14) % 1, spread = Math.sin(i * 2.4 + time * 16) * 0.25;
      f.position.set(bx * t * 2.8 + spread, 0.12 + t * 0.55, bz * t * 2.8 + Math.cos(i * 2.4 + time * 16) * 0.18);
      f.scale.setScalar((1 - t) * (0.8 + Math.sin(i + time * 20) * 0.15) * (1 + heat * 1.4));
      f.material.opacity = (1 - t) * 0.9;
      f.rotation.z = Math.sin(i + time * 12) * 0.5;
    });
  }

  v.gusts.visible = b.kind === 'wind' && loose;
  v.gusts.position.set(b.x, 0.45, b.z);
  if (v.gusts.visible) {
    const heading = Math.atan2(b.vx, b.vz);
    v.gustRings.forEach((g, i) => {
      const t = (time * 3 + i / 6) % 1;
      g.position.set(bx * t * 3.2, Math.sin(time * 18 + i) * 0.12, bz * t * 3.2);
      g.rotation.set(0, heading, time * 9 + i);
      g.scale.setScalar(0.7 + t * 0.9);
      g.material.opacity = (1 - t) * 0.85;
    });
  }
}
