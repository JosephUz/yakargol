import * as T from 'three';
import { CAMERA, CINEMA, PITCH } from '../config.js';
import { attackDir } from '../lineup.js';
import { benchX, benchZ, lift } from './actors.js';

/**
 * Omuz kamerası (tek kamera): senin oyuncunun (w.me) arkasında ve biraz sağında, zıplayınca onunla yükselir; yanınca kenardaki
 * yerine geçer. Yatay bakış (yaw) ve dikey eğim (pitch) fareyle döner. Nişan ekran ortasından zemine inen ışındır,
 * hareket bakış yönüne göredir. Oyuncu doğunca (maç başı, gol sonrası diziliş, kenardan dönüş) kamera topa çevrilir.
 * Yakar pas sinemasında kamera topu izler (track / kovalama); sinema bitince kaldığı yere değil **topa** döner (faceBall):
 * kontrol oyuncuya her geri geçişte (kovalama, başkasının nişanı, kenardan dönüş, kamera değişimi) bakış topa çevrilir.
 *
 * **İzometrik** kip (telefonda varsayılan, bkz. CAMERA.iso): ortografik kamera oyuncuyu sabit bir yan açıdan (futbol yayını
 * gibi) izler; bakış dönmez, topa çevrilmez, hareket ekrana göredir. Nişan: fare varsa imlecin sahadaki noktası (pointer),
 * yoksa (dokunmatik) hareket ya da bakış yönü, rakip kaleye dönükse kalenin ortası (aim).
 *
 * `isoOverride`: izometrik ayarların üstüne yazılır (gösteri kipi daha yakın ve tam aksiyonun üstüne bakan bir kadraj
 * ister, bkz. config.js GOSTERI.iso). `omuzOverride`: omuz kamerasının mesafesi / yüksekliği (rüzgar şutu gösteri
 * sahnesi şutçunun biraz daha gerisinden ve yukarısından bakar, bkz. config.js GOSTERI_RUZGAR.omuz).
 */
export function createShoulderCamera(isoOverride = null, omuzOverride = null) {
  const ISO = { ...CAMERA.iso, ...(isoOverride || {}) };
  const OMUZ = { back: CAMERA.back, side: CAMERA.side, height: CAMERA.height, ...(omuzOverride || {}) };
  const camera = new T.PerspectiveCamera(CAMERA.fov, 1, 0.1, CAMERA.far);
  const iso = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, CAMERA.far);
  let mode = 'shoulder', hero = null, pointer = null, poz = null;
  const ray = new T.Raycaster(), ground = new T.Plane(new T.Vector3(0, 1, 0), 0), point = new T.Vector3();
  let yaw = Math.PI, pitch = CAMERA.pitch, shake = 0;
  const spot = p => ({ x: p.burn > 0 ? benchX(p.team) : p.x, z: p.burn > 0 ? benchZ(p) : p.z });

  const active = () => (mode === 'iso' ? iso : camera);

  return {
    get camera() { return active(); },
    get yaw() { return yaw; },
    get mode() { return mode; },
    /** 'shoulder' | 'iso' */
    setMode(next) { mode = next === 'iso' ? 'iso' : 'shoulder'; pointer = null; },
    /** İzometrikte fare imleci (ekran pikseli; null: fare yok): nişan imlecin sahadaki noktasıdır. */
    point(x, y) { pointer = x == null ? null : { x: (x / innerWidth) * 2 - 1, y: 1 - (y / innerHeight) * 2 }; },
    /** Bakışı topa çevirir, eğimi varsayılana döndürür. */
    faceBall(w) {
      if (mode === 'iso') return;
      const p = w.players[w.me], x = p.burn > 0 ? benchX(p.team) : p.x, z = p.burn > 0 ? benchZ(p) : p.z;
      const dx = w.ball.x - x, dz = w.ball.z - z;
      if (Math.hypot(dx, dz) > 0.01) yaw = Math.atan2(dx, dz);
      pitch = CAMERA.pitch;
    },
    /** Kamera sarsıntısı (gol patlaması): verilen güçle başlar, hızla söner. */
    shake(power) { shake = Math.max(shake, power); },
    /** Bakışı topa doğru yumuşakça çevirir (sinema). */
    track(w, dt) {
      if (mode === 'iso') return;
      const at = spot(w.players[w.me]), target = Math.atan2(w.ball.x - at.x, w.ball.z - at.z), k = Math.min(1, dt * CINEMA.turn);
      yaw += Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw)) * k;
      pitch += (CAMERA.pitch + 0.06 - pitch) * k;
    },
    /**
     * Bakışı doğrudan ayarlar: gösteri sahneleri kadrajı kendileri kurar (rüzgar sahnesi kamerayı şut çizgisine
     * bakacak biçimde çevirir, bkz. src/gosteri-ruzgar.js). İzometrikte bakış dönmediği için yok sayılır.
     */
    setLook(nextYaw, nextPitch) {
      if (mode === 'iso') return;
      yaw = nextYaw;
      if (nextPitch !== undefined) pitch = nextPitch;
    },
    /**
     * Kamerayı doğrudan bir yere koyar ve bir noktaya baktırır: `{ x, y, z, tx, ty, tz }` (null: omuz kuralına döner).
     * Yalnız baştan sona sahnelenmiş gösteri sahnesi kullanır (bkz. src/gosteri-ates.js): orada kadraj oyuncunun
     * omzuna değil anlatıma bağlıdır — top lense yapışır, kamera yandan bakar, kapanışta diziliş çerçevelenir.
     * Kurulduğunda `follow` ve `zoom` devre dışı kalır: oyuncunun yeri ve hızı kadrajı artık değiştirmez.
     */
    setPose(next) { poz = next || null; },
    look(dx, dy) {
      if (mode === 'iso') return;
      yaw -= dx * CAMERA.yawSpeed;
      pitch = Math.max(CAMERA.pitchMin, Math.min(CAMERA.pitchMax, pitch + dy * CAMERA.pitchSpeed));
    },
    resize(width, height) {
      camera.aspect = width / height; camera.updateProjectionMatrix();
      const h = ISO.half, a = width / height;
      Object.assign(iso, { left: -h * a, right: h * a, top: h, bottom: -h }); iso.updateProjectionMatrix();
    },
    /** Görüş açısını hedefe yumuşakça götürür (hızlı koşuda genişler). */
    zoom(fov, dt) {
      if (poz) return; // sahnelenmiş kadrajda görüş açısı sabit (bkz. setPose)
      if (Math.abs(camera.fov - fov) < 0.05) return;
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 6);
      camera.updateProjectionMatrix();
    },
    follow(p, dt = 0) {
      hero = p;
      if (poz) {
        camera.position.set(poz.x, poz.y, poz.z);
        camera.lookAt(poz.tx, poz.ty, poz.tz);
        camera.updateMatrixWorld();
        return;
      }
      const x = p.burn > 0 ? benchX(p.team) : p.x, z = p.burn > 0 ? benchZ(p) : p.z, fx = Math.sin(yaw), fz = Math.cos(yaw);
      if (mode === 'iso') {
        const c = ISO, back = c.dist * Math.cos(c.elevation), y = p.air > 0 ? lift(p) * 0.5 : 0;
        const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
        // Kadraj oyuncunun biraz ötesine bakar: karşı tarafta sahanın daha çoğu görünür.
        const tx = x + fx * c.lead, tz = z + fz * c.lead;
        iso.position.set(tx - fx * back, y + c.dist * Math.sin(c.elevation), tz - fz * back);
        if (shake > 0) { iso.position.x += (Math.random() - 0.5) * shake; iso.position.z += (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt * 0.9); }
        iso.lookAt(iso.position.x + fx * back, y, iso.position.z + fz * back);
        iso.updateMatrixWorld();
        return;
      }
      camera.position.set(x - fx * OMUZ.back - fz * OMUZ.side, OMUZ.height + (p.jump > 0 || p.air > 0 ? lift(p) : 0), z - fz * OMUZ.back + fx * OMUZ.side);
      if (shake > 0) {
        camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake;
        shake = Math.max(0, shake - dt * 0.9);
      }
      camera.lookAt(camera.position.x + fx * 20, camera.position.y - Math.tan(pitch) * 20, camera.position.z + fz * 20);
      camera.updateMatrixWorld();
    },
    /**
     * Nişan noktası. İzometrikte fare imlecinin sahadaki noktası; fare yoksa `move` (hareket yönü, dünya uzayında) ya da
     * oyuncunun baktığı yön, kaleye dönükse kale.
     */
    aim(move = null) {
      if (mode === 'iso' && pointer) {
        iso.updateMatrixWorld();
        ray.setFromCamera(pointer, iso);
        if (ray.ray.intersectPlane(ground, point)) return { x: point.x, z: point.z };
      }
      if (mode === 'iso' && hero) {
        const m = move && Math.hypot(move.x, move.z) > 0.2 ? move : { x: Math.sin(hero.angle), z: Math.cos(hero.angle) };
        const d = Math.hypot(m.x, m.z), dx = m.x / d, dz = m.z / d;
        const gx = 0, gz = attackDir(hero.team) * PITCH.halfZ, gd = Math.hypot(gx - hero.x, gz - hero.z);
        if ((dx * (gx - hero.x) + dz * (gz - hero.z)) / gd > Math.cos(ISO.goalAssist)) return { x: gx, z: gz };
        return { x: hero.x + dx * ISO.aimDist, z: hero.z + dz * ISO.aimDist };
      }
      camera.updateMatrixWorld();
      ray.setFromCamera({ x: 0, y: 0 }, camera);
      const hit = ray.ray.intersectPlane(ground, point);
      if (!hit || point.distanceTo(camera.position) > CAMERA.aimMax) ray.ray.at(CAMERA.aimFallback, point);
      return { x: point.x, z: point.z };
    },
    /** Ekran yönlü hareket girdisini (x sağ, z geri) bakış yönlü zemin vektörüne çevirir. */
    movement(x, z) {
      const forward = new T.Vector3();
      active().getWorldDirection(forward); forward.y = 0; forward.normalize();
      const right = new T.Vector3().crossVectors(forward, new T.Vector3(0, 1, 0));
      return { x: right.x * x - forward.x * z, z: right.z * x - forward.z * z };
    },
    /** Dünya noktasının ekran konumu; behind: kameranın arkasında (etiket gizlenir). */
    project(x, y, z) {
      const p = new T.Vector3(x, y, z).project(active());
      return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2, behind: p.z > 1 };
    },
  };
}
