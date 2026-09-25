import * as T from 'three';
import { PITCH } from '../config.js';
import { box, cyl, line, mat, ring, sign } from './builders.js';

/**
 * Mahalle sahası: çim şeritleri, çizgiler, iki kale (direk, file), kale yanlarında alçak duvar, yan duvarlar ve tel
 * örgü, yedek kulübesi bankları, arkada apartmanlar ve ağaçlar. Ölçülerin hepsi PITCH'ten türer: saha büyüyünce
 * çevre de açılır.
 */
export function buildPitch(scene) {
  const X = PITCH.halfX, Z = PITCH.halfZ, G = PITCH.goal, L = X - 1, E = Z - 1, stripes = 14, sl = 2 * Z / stripes;
  box(scene, 4 * X + 100, 0.6, 2 * Z + 90, '#cbbd98', 0, -0.55, 0);
  box(scene, 2 * X + 2, 0.3, 2 * Z + 2, '#476f62', 0, -0.1, 0);
  for (let i = 0; i < stripes; i++) box(scene, 2 * X, 0.02, sl, i % 2 ? '#71937c' : '#6b8a74', 0, 0.055, -Z + sl / 2 + i * sl);
  line(scene, [[-L, -E], [L, -E], [L, E], [-L, E], [-L, -E]], '#e8e6c5', 0.12);
  line(scene, [[-L, 0], [L, 0]]);
  ring(scene, 6.5, '#e8e6c5'); ring(scene, 0.3, '#e8e6c5');

  for (const side of [-1, 1]) goalEnd(scene, side, X, Z, G, E);
  for (const side of [-1, 1]) sideLine(scene, side, X, Z);

  const badge = sign('YAKAR GOL', 9, 2.2, '#6b8a74', '#b9c7a0');
  badge.rotation.x = -Math.PI / 2; badge.position.set(0, 0.09, 7);
  scene.add(badge);
}

/** Bir kale ucu: ceza ve kale alanı çizgileri, direkler, file, kale yanındaki duvarlar ve arkadaki tabela. */
function goalEnd(scene, side, X, Z, G, E) {
  line(scene, [[-11, side * E], [-11, side * (E - 10)], [11, side * (E - 10)], [11, side * E]]);
  line(scene, [[-G - 1, side * E], [-G - 1, side * (E - 5)], [G + 1, side * (E - 5)], [G + 1, side * E]]);
  for (const x of [-G - 0.1, G + 0.1]) cyl(scene, 0.13, 3.5, '#f2ecd9', x, 1.75, side * Z);
  box(scene, 2 * G + 0.4, 0.22, 0.22, '#f2ecd9', 0, 3.5, side * Z);
  box(scene, 2 * G + 0.4, 0.16, 0.16, '#d8cdb0', 0, 3.3, side * (Z + 2));
  for (let x = -G; x <= G; x += 0.5) {
    box(scene, 0.018, 3.3, 0.018, '#ded8bc', x, 1.65, side * (Z + 2));
    line(scene, [[x, side * Z], [x, side * (Z + 2)]], '#ddd5b9', 0.025);
  }
  for (let y = 0.2; y <= 3.3; y += 0.4) box(scene, 2 * G, 0.018, 0.018, '#ddd7bd', 0, y, side * (Z + 2));
  for (const x of [-1, 1]) box(scene, X + 0.4 - G - 0.1, 1.1, 0.35, '#d6bc91', x * (G + 0.1 + X + 0.4) / 2, 0.55, side * (Z + 0.4));
  const board = sign(side === -1 ? 'MAHALLE LİGİ' : 'YAKAR GOL', 11, 2, '#173a39', '#f7dc9f');
  board.position.set(0, 5.2, side * (Z + 4));
  if (side === 1) board.rotation.y = Math.PI;
  scene.add(board);
}

/** Bir yan: duvar, tel örgü, banklar, apartmanlar (pencere ve balkonlarıyla) ve ağaçlar. */
function sideLine(scene, side, X, Z) {
  box(scene, 0.4, 1.1, 2 * Z + 1, '#c8ae83', side * (X + 0.4), 0.55, 0);
  for (let z = -Z; z <= Z; z += Z / 7) cyl(scene, 0.07, 3.5, '#566960', side * (X + 0.5), 2, z);
  for (let y = 1.3; y <= 3.5; y += 0.55) box(scene, 0.025, 0.02, 2 * Z, '#7b8a73', side * (X + 0.5), y, 0);
  for (let z = -Z; z <= Z; z += 1) box(scene, 0.02, 2.4, 0.02, '#89947b', side * (X + 0.5), 2.3, z);
  for (const z of [-Z * 0.68, Z * 0.68]) {
    box(scene, 1.7, 0.25, 5, '#ac734b', side * (X + 3), 0.6, z);
    for (const dz of [-1.8, 1.8]) box(scene, 0.3, 0.6, 0.3, '#4c6158', side * (X + 3), 0.25, z + dz);
  }
  const walls = ['#c28462', '#d4b884', '#a9b0a1', '#c9a18b'];
  for (let k = 0; k < 4; k++) {
    const z = -Z + 2 + k * (2 * Z - 4) / 3, x = side * (X + (side === 1 ? 20 : 10) + (k % 2) * 2), height = 8 + (k % 3) * 3;
    box(scene, 9, height, 12, walls[k], x, height / 2, z);
    box(scene, 9.6, 0.5, 12.5, '#b27054', x, height + 0.2, z);
    for (let floor = 0; floor < Math.floor(height / 3); floor++) {
      for (const dz of [-3.6, 0, 3.6]) {
        box(scene, 0.06, 1.6, 1.2, '#536966', x - side * 4.55, 2 + floor * 2.8, z + dz);
        box(scene, 1.15, 0.15, 2, '#e3ceb0', x - side * 4.9, 1.2 + floor * 2.8, z + dz);
      }
    }
  }
  for (const z of [-Z - 3, 0, Z + 4]) {
    cyl(scene, 0.3, 4, '#816749', side * (X + 5), 2, z);
    const tree = new T.Mesh(new T.IcosahedronGeometry(2.4, 1), mat('#799461'));
    tree.position.set(side * (X + 5), 4.7, z); tree.castShadow = true;
    scene.add(tree);
  }
}
