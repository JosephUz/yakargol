import * as T from 'three';
import { CAMERA, GOAL_BLAST, TOUCH } from '../config.js';
import { createActor, syncActors } from './actors.js';
import { createBallView, syncBall } from './ballview.js';
import { createShoulderCamera } from './camera.js';
import { createEffects } from './effects.js';
import { buildPitch } from './pitch.js';

/**
 * Görünüm: three.js sahnesi, ışıklar, saha, on oyuncu, top ve efektler; kamera omuz ya da izometrik (setCamera). Simülasyonu
 * yalnızca okur: render her karede dünyayı çizer, event simülasyon olaylarından efekt çıkarır. Hızlı koşuda kamera
 * açısı genişler (CAMERA.sprintFov); şarj sırasında ayaktaki top hazırlanan vuruşun rengine bürünür.
 * mobile: telefonda piksel oranı ve gölge haritası küçülür, yumuşak gölge yerine düz gölge (TOUCH).
 * iso: izometrik kadraj ayarlarının üstüne yazılanlar (gösteri kipi daha yakın bakar, bkz. config.js GOSTERI.iso).
 * İzometrikte nişan ekran ortası değildir: top sendeyken (ya da yakar top nişanında) yerde nişan yönünü gösteren ok çıkar.
 */
export function createView(container, { mobile = false, iso = null } = {}) {
  const renderer = new T.WebGLRenderer({ antialias: !mobile || devicePixelRatio < 2, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? TOUCH.pixelRatio : 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = mobile ? T.PCFShadowMap : T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-label', 'Yakar Gol oyun sahası');
  container.insertBefore(renderer.domElement, container.firstChild);

  const scene = new T.Scene();
  scene.background = new T.Color('#e4d5b3');
  scene.add(new T.HemisphereLight('#fff0d0', '#768b86', 2.6));
  const sun = new T.DirectionalLight('#ffe1b0', 3.2);
  sun.position.set(-25, 55, 20); sun.castShadow = true;
  sun.shadow.mapSize.setScalar(mobile ? TOUCH.shadow : 2048); sun.shadow.normalBias = 0.04;
  Object.assign(sun.shadow.camera, { left: -72, right: 72, top: 72, bottom: -72, near: 1, far: 200 });
  scene.add(sun);

  buildPitch(scene);
  const labels = container.querySelector('#yg-labels');
  const actors = Array.from({ length: 10 }, (_, id) => createActor(scene, labels, id));
  const ball = createBallView(scene);
  const effects = createEffects(scene);
  const shoulder = createShoulderCamera(iso);
  let time = 0, real = 0, aimAt = null;
  // İzometrik nişan oku: oyuncunun ayağından nişan yönüne yassı bir ok.
  const arrow = new T.Group(), arrowMat = new T.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.9, depthWrite: false, depthTest: false });
  const shaft = new T.Mesh(new T.PlaneGeometry(0.22, 3.2), arrowMat), head = new T.Mesh(new T.CircleGeometry(0.55, 3), arrowMat);
  shaft.rotation.x = head.rotation.x = -Math.PI / 2; shaft.position.z = 2.4; head.position.z = 4.2; head.rotation.z = Math.PI / 2;
  arrow.add(shaft, head); arrow.visible = false; arrow.renderOrder = 5; shaft.renderOrder = head.renderOrder = 5; scene.add(arrow);

  const resize = () => { renderer.setSize(innerWidth, innerHeight); shoulder.resize(innerWidth, innerHeight); };
  resize(); addEventListener('resize', resize);

  return {
    canvas: renderer.domElement,
    get camera() { return shoulder.camera; },
    get cameraMode() { return shoulder.mode; },
    /** 'shoulder' | 'iso' */
    setCamera: mode => { shoulder.setMode(mode); resize(); },
    flames: ball.flames,
    gusts: ball.gusts,
    ballCore: ball.core,
    faceBall: w => shoulder.faceBall(w),
    cinemaStart: () => shoulder.save(),
    cinemaEnd: () => shoulder.restore(),
    look: (dx, dy) => shoulder.look(dx, dy),
    /** İzometrikte fare imleci (ekran pikseli; null: yok). */
    point: (x, y) => shoulder.point(x, y),
    aim: move => shoulder.aim(move),
    /** İzometrik nişan oku bu karede nereyi göstersin (null: gizli). */
    showAim: at => { aimAt = at; },
    movement: (x, z) => shoulder.movement(x, z),
    project: (x, y, z) => shoulder.project(x, y, z),
    event: e => { effects.spawn(e); if (e.type === 'goal') shoulder.shake(GOAL_BLAST.shake); },
    /**
     * cine: { scale, heat } yakar top sinemasında: oyuncular ölçekli zamanla (donuk / ağır çekim), alevler gerçek zamanla oynar.
     * focus: kameranın izleyeceği nokta (oyuncu biçiminde: x, z, burn, air, jump, sprint); null ise kendi oyuncun.
     * Gösteri kipinde insan oyuncu yoktur, kamera aksiyonun ağırlık merkezini izler (bkz. gosteri.js).
     */
    render(w, dt, playing, cine = null, charge = null, focus = null) {
      const scale = cine ? cine.scale : 1;
      time += dt * scale; real += dt;
      if (cine && cine.track !== false) shoulder.track(w, dt);
      const hero = focus || w.players[w.me], wide = hero.sprint > 0 && hero.burn <= 0 ? CAMERA.sprintFov : CAMERA.fov;
      if (shoulder.mode === 'shoulder') shoulder.zoom(wide, dt);
      shoulder.follow(hero, dt);
      syncActors(actors, w, time, playing, shoulder.project);
      syncBall(ball, w.ball, real, dt * scale, cine ? cine.heat : 0, w.ball.owner === w.me ? charge : null);
      effects.update(cine ? dt * Math.max(scale, 0.3) : dt);
      arrow.visible = !!aimAt && shoulder.mode === 'iso' && hero.burn <= 0;
      if (arrow.visible) { arrow.position.set(hero.x, 0.2, hero.z); arrow.rotation.y = Math.atan2(aimAt.x - hero.x, aimAt.z - hero.z); }
      renderer.render(scene, shoulder.camera);
    },
  };
}
