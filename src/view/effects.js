import * as T from 'three';
import { GOAL_BLAST, TEAMS } from '../config.js';
import { box } from './builders.js';

/**
 * Parçacıklar: şutta sarı, yanmada turuncu, rüzgarla savrulmada camgöbeği kıvılcım; yakar pas sinemasında tutuşma
 * (ignite) ve çarpma (impact) patlamaları. Golde Rocket League usulü **gol patlaması**: kaleden takım rengi, beyaz ve
 * altın parçalar fışkırır, yerde bir şok dalgası halkası sahaya yayılır ve kısa bir ışık çakar (bkz. GOAL_BLAST).
 * Küçük kutular yukarı fırlayıp yerçekimiyle düşer ve ömürleri bitince sahneden kalkar.
 */
const BURSTS = {
  kick: { count: 9, color: () => '#ffe197' },
  burn: { count: 9, color: () => '#ff9a50' },
  blow: { count: 12, color: () => '#bff6ff' },
  ignite: { count: 26, color: () => '#ffb347' },
  impact: { count: 46, color: () => '#ff5a1f' },
  goal: { count: 120, size: 0.28, spread: 26, up: [6, 16], life: 1.7, color: (e, i) => [TEAMS.colors[e.team], '#ffffff', '#ffd35c'][i % 3] },
};
const ringGeo = new T.RingGeometry(0.85, 1, 64);

export function createEffects(scene) {
  const live = [], waves = [];
  const flash = new T.PointLight('#ffffff', 0, 60, 1.5);
  scene.add(flash);
  let flashLife = 0;

  return {
    spawn(e) {
      const kind = BURSTS[e.type];
      if (!kind) return;
      const x = e.x || 0, z = e.z || 0, size = kind.size || 0.13, spread = kind.spread || 7, [upMin, upMax] = kind.up || [3, 7];
      for (let i = 0; i < kind.count; i++) {
        const mesh = box(scene, size, size, size, kind.color(e, i), x, 0.7, z);
        const a = Math.random() * Math.PI * 2, s = Math.random() * spread;
        live.push({ mesh, vx: Math.sin(a) * s, vz: Math.cos(a) * s, vy: upMin + Math.random() * (upMax - upMin), spin: (Math.random() - 0.5) * 12, life: (kind.life || 0.7) * (0.6 + Math.random() * 0.4) });
      }
      if (e.type === 'goal') {
        const color = new T.Color(TEAMS.colors[e.team]);
        for (const [delay, width] of [[0, 1], [0.12, 0.6]]) {
          const mesh = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: T.DoubleSide, depthWrite: false }));
          mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0.15, z); mesh.scale.setScalar(0.01);
          scene.add(mesh);
          waves.push({ mesh, t: -delay, width });
        }
        flash.color.copy(color).lerp(new T.Color('#ffffff'), 0.4);
        flash.position.set(x, 4, z);
        flashLife = GOAL_BLAST.flash;
      }
    },
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const e = live[i];
        e.life -= dt; e.vy -= dt * 12;
        e.mesh.position.x += e.vx * dt; e.mesh.position.y = Math.max(0.08, e.mesh.position.y + e.vy * dt); e.mesh.position.z += e.vz * dt;
        if (e.spin) { e.mesh.rotation.x += e.spin * dt; e.mesh.rotation.z += e.spin * dt; }
        if (e.life <= 0) { scene.remove(e.mesh); e.mesh.geometry.dispose(); live.splice(i, 1); }
      }
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i];
        w.t += dt;
        if (w.t < 0) continue;
        const k = w.t / GOAL_BLAST.wave;
        w.mesh.scale.setScalar(0.5 + k * GOAL_BLAST.waveRadius);
        w.mesh.material.opacity = Math.max(0, 0.9 * (1 - k) * w.width);
        if (k >= 1) { scene.remove(w.mesh); w.mesh.material.dispose(); waves.splice(i, 1); }
      }
      flashLife = Math.max(0, flashLife - dt);
      flash.intensity = flashLife > 0 ? 400 * (flashLife / GOAL_BLAST.flash) ** 2 : 0;
    },
  };
}
