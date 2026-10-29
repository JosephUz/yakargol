import * as T from 'three';
import { mat } from './builders.js';
import { JUMP } from '../config.js';

/** Taşıyan zıplıyorsa top onunla havalanır: o anki yükseklik (zıplama yayı × JUMP.ball), değilse 0. */
export function topKalkisi(w) {
  const p = w.ball.owner === null ? null : w.players[w.ball.owner];
  return p && p.jump > 0 ? Math.sin(p.jump / JUMP.time * Math.PI) * JUMP.height * JUMP.ball : 0;
}

/**
 * Top görseli. Normal ve pas topu beyaz; yakar pas kırmızı, parlayan ve arkasında alev dilleri; rüzgar topu açık
 * camgöbeği, çevresinde dönen ve geride kalan rüzgar halkaları. Yerdeki halka topun türünün rengini alır. `heat` (0-1)
 * yakar pas sinemasında alevleri büyütür ve topun turuncu ışığını parlatır. `charge` ({ kind, p }) şarj sırasında ayaktaki
 * topu hazırlanan vuruşun rengine boyar (rüzgar camgöbeği, yakar pas kırmızı), dolum arttıkça parlar.
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

export function syncBall(v, b, time, dt, heat = 0, charge = null, kalk = 0) {
  const look = LOOK[b.kind] || LOOK.normal, loose = b.owner === null;
  /**
   * `b.yuk` topun yerden yüksekliği (birim). Oyunun topu hep yerde yuvarlanır, bu yüzden simülasyonda böyle bir alan
   * yoktur ve normal oyunda hep 0'dır; yalnız baştan sona sahnelenmiş gösteri sahnesi doldurur (bkz. gosteri-ates.js):
   * top gökten iner ve kameranın lensine yapışır. Yerdeki halka yükselmez — düşen topun gölgesi gibi durur.
   */
  // kalk: taşıyanla birlikte zıplayan top (topKalkisi); top elden havada çıkarsa yere süzülür.
  v.kalk = kalk > 0 ? kalk : Math.max(0, (v.kalk || 0) - dt * 6);
  const yuk = (b.yuk || 0) + v.kalk;
  /**
   * `charge.ates` yine yalnız o sahnede dolu gelir: aynı topta **iki yükleme birden** görünür (soldaki rüzgar şutu,
   * sağdaki yakar pas yüklerken top hem camgöbeği halkalara hem aleve bürünür). Normal oyunda şarj tek türdür ve
   * alev / rüzgar yalnız top serbestken çıkar.
   */
  const ikili = !!charge && charge.ates !== undefined;
  v.group.position.set(b.x, 0.43 + yuk + Math.sin(time * 20) * 0.03, b.z);
  v.group.rotation.x += Math.hypot(b.vx, b.vz) * dt;
  v.core.material = b.kind === 'fire' ? v.materials.fire : b.kind === 'wind' ? v.materials.wind : v.materials.white;
  v.floor.position.set(b.x, 0.1, b.z);
  v.floor.material.color.set(look.ring);
  // Yerdeki halka topun gölgesi gibidir: top havalandıkça küçülür. Normal oyunda top hep yerdedir (`yuk` 0), yani
  // çarpan 1 kalır; yalnız gösteri sahnesinde top gökten iner ve lense yapışır — orada halka yerde devleşmesin.
  const halka = 1 / (1 + yuk * 0.9);
  v.floor.scale.setScalar(look.scale * (1 + heat * 1.6) * halka);
  if (charge) {
    const k = Math.max(0, Math.min(1, charge.p)), tint = CHARGE[charge.kind], pulse = 0.85 + Math.sin(time * 14) * 0.15;
    const ates = ikili ? Math.max(0, Math.min(1, charge.ates)) : 0;
    v.core.material = v.materials.charge;
    // İki yüklemede gövde rüzgarın camgöbeğinde kalır, ateş ışımadan gelir: ikisini gövdede karıştırmak topu
    // pembeleştirip her iki vuruşu da tanınmaz yapıyordu.
    v.materials.charge.color.copy(WHITE).lerp(new T.Color(tint), k);
    v.materials.charge.emissive.set(tint).lerp(new T.Color(CHARGE.fire), ates * 0.6);
    // İki yüklemeli topta ışıma daha ölçülü: sahnenin sonunda kamera topun 0,62 birim önüne gelir, 1,8'lik ışıma o
    // mesafede beyaza patlar ve iki rengin karışımı hiç görünmezdi (bkz. gosteri-ates.js yapışma evresi).
    v.materials.charge.emissiveIntensity = Math.max(k, ates) * (ikili ? 0.8 : 1.8) * pulse;
    v.floor.material.color.set(tint);
    v.floor.scale.setScalar((1 + Math.max(k, ates) * 0.9 * pulse) * halka);
  }

  const speed = Math.max(0.01, Math.hypot(b.vx, b.vz)), bx = -b.vx / speed, bz = -b.vz / speed;
  const ates = ikili ? charge.ates : 0, ruzgar = ikili ? charge.p : 0;
  v.flames.visible = (b.kind === 'fire' && loose) || ates > 0.08;
  v.light.position.set(b.x, 1.1 + yuk, b.z);
  v.light.intensity = v.flames.visible ? 12 + heat * 70 : 0;
  v.flames.position.set(b.x, 0.45 + yuk, b.z);
  if (v.flames.visible) {
    v.flameBits.forEach((f, i) => {
      const t = (time * 2.3 + i / 14) % 1;
      if (ikili) {
        // Top duruyor (ayakta yükleniyor ya da lense yapışmış): alevler kuyruk bırakmak yerine topun çevresinde
        // döner ve yukarı uzar; dolum arttıkça büyür.
        const a = i / 14 * Math.PI * 2 + time * 2.6, r = (0.34 + t * 0.5) * (0.4 + ates * 0.6);
        f.position.set(Math.sin(a) * r, -0.12 + t * 0.95, Math.cos(a) * r);
        f.scale.setScalar((1 - t) * (0.7 + Math.sin(i + time * 20) * 0.15) * (0.3 + ates * 0.8));
        f.material.opacity = (1 - t) * 0.95 * Math.min(1, 0.3 + ates);
        f.rotation.z = Math.sin(i + time * 12) * 0.5;
        return;
      }
      const spread = Math.sin(i * 2.4 + time * 16) * 0.25;
      f.position.set(bx * t * 2.8 + spread, 0.12 + t * 0.55, bz * t * 2.8 + Math.cos(i * 2.4 + time * 16) * 0.18);
      f.scale.setScalar((1 - t) * (0.8 + Math.sin(i + time * 20) * 0.15) * (1 + heat * 1.4));
      f.material.opacity = (1 - t) * 0.9;
      f.rotation.z = Math.sin(i + time * 12) * 0.5;
    });
  }

  v.gusts.visible = (b.kind === 'wind' && loose) || ruzgar > 0.08;
  v.gusts.position.set(b.x, 0.45 + yuk, b.z);
  if (v.gusts.visible) {
    const heading = Math.atan2(b.vx, b.vz);
    v.gustRings.forEach((g, i) => {
      const t = (time * 3 + i / 6) % 1;
      if (ikili) {
        // Duran topun çevresinde eğik dönen halkalar: dolum arttıkça genişler.
        g.position.set(0, Math.sin(time * 18 + i) * 0.1, 0);
        g.rotation.set(Math.PI / 2 + Math.sin(time * 2 + i) * 0.5, time * 1.7 + i, time * 9 + i);
        g.scale.setScalar((0.55 + t * 0.4) * (0.5 + ruzgar * 0.7));
        g.material.opacity = (1 - t * 0.6) * 0.85 * Math.min(1, 0.3 + ruzgar);
        return;
      }
      g.position.set(bx * t * 3.2, Math.sin(time * 18 + i) * 0.12, bz * t * 3.2);
      g.rotation.set(0, heading, time * 9 + i);
      g.scale.setScalar(0.7 + t * 0.9);
      g.material.opacity = (1 - t) * 0.85;
    });
  }
}
