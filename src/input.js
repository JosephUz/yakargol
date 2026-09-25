import { createTouch } from './touch.js';

/**
 * Klavye ve fare (yalnızca tarayıcı). WASD / oklar hareket, fare kilitliyken bakış; sol tık şut (basılı tutunca rüzgar
 * şutu), sağ tık (top sendeyken kısa pas, basılı yakar top; topsuz kayma), Shift hızlı koşu, Boşluk zıplama;
 * V kamera (omuz ↔ izometrik), F1 yardım, Esc mola. Basışlar (tap, release, secondary, secondaryUp, sprint, pass, jump) bir sonraki okumada bir kez
 * tüketilir. Fare düğmeleri için mousedown / mouseup dinlenir: pointer olayları ikinci düğmeyi (sol basılıyken sağ tık)
 * ayrıca bildirmez.
 * İzometrik kamerada fare kilitlenmez: imleç sahada nişanı seçer. Kilit yokken (omuz) sahaya tıklamak önce fareyi kilitler; test kipinde (başsız tarayıcı kilit vermez) tıklama doğrudan işler.
 * Dokunmatik kipte (`touch` kök öğesi verilince, bkz. touch.js) fare kilidi yoktur: joystick hareket, sağ yarı bakış,
 * düğmeler fare ve klavyeyle aynı basışları üretir.
 */
export function createInput(canvas, { playing, onHelp, onPause, onLook, onPoint, onUnlock, onBlur, onCamera, canLock, testMode, touch }) {
  const keys = new Set();
  let edges = {}, held = false, rightHeld = false;
  /** Dokunmatik düğmeler: shoot sol tık, pass sağ tık, jump Boşluk, sprint Shift. */
  const pad = touch ? createTouch(touch, {
    down(name) {
      if (!playing()) return;
      if (name === 'shoot') { held = true; edges.tap = true; }
      else if (name === 'pass') { rightHeld = true; edges.secondary = true; }
      else edges[name] = true;
    },
    up(name) {
      if (name === 'shoot' && held) { held = false; edges.release = true; }
      if (name === 'pass' && rightHeld) { rightHeld = false; edges.secondaryUp = true; }
    },
    look: (dx, dy) => { if (playing()) onLook(dx, dy); },
  }) : null;

  const locked = () => document.pointerLockElement === canvas;
  const lock = () => { if (pad || !canLock()) return; try { canvas.requestPointerLock()?.catch(() => {}); } catch { /* desteklenmiyor */ } };
  const unlock = () => { if (document.pointerLockElement) document.exitPointerLock(); };
  const clear = () => { pad?.clear(); keys.clear(); edges = {}; held = false; rightHeld = false; };

  addEventListener('keydown', e => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'F1') { onHelp(); return; }
    if (e.code === 'KeyV' && playing()) { onCamera(); return; }
    if (e.code === 'Escape') { onPause(); return; }
    if (!playing()) return;
    keys.add(e.code);
    if (e.code === 'Space') edges.jump = true;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') edges.sprint = true;
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', () => { if (document.hidden) onBlur(); });
  document.addEventListener('pointerlockchange', () => { if (!locked()) onUnlock(); });

  canvas.addEventListener('contextmenu', e => e.preventDefault());
  // Kilitliyken (omuz) fare bakışı çevirir; kilitsiz izometrikte imleç nişandır (canLock false).
  canvas.addEventListener('mousemove', e => {
    if (!playing()) return;
    if (locked()) onLook(e.movementX, e.movementY);
    else if (!canLock()) onPoint(e.clientX, e.clientY);
  });
  canvas.addEventListener('mousedown', e => {
    if (!playing()) return;
    if (!locked() && !testMode && canLock()) { lock(); return; }
    if (!canLock()) onPoint(e.clientX, e.clientY);
    if (e.button === 0) { held = true; edges.tap = true; }
    if (e.button === 2) { rightHeld = true; edges.secondary = true; }
  });
  addEventListener('mouseup', e => {
    if (e.button === 0 && held) { held = false; edges.release = true; }
    if (e.button === 2 && rightHeld) { rightHeld = false; edges.secondaryUp = true; }
  });

  /** Ekran yönlü hareket ekseni (x sağ, z geri): klavye, yoksa joystick (analog). */
  function axes() {
    const on = (...codes) => codes.some(c => keys.has(c));
    const x = Number(on('KeyD', 'ArrowRight')) - Number(on('KeyA', 'ArrowLeft'));
    const z = Number(on('KeyS', 'ArrowDown')) - Number(on('KeyW', 'ArrowUp'));
    if (x || z || !pad) return [x, z];
    const s = pad.axis();
    return [s.x, s.z];
  }

  return {
    lock, unlock, clear,
    touch: !!pad,
    /** Dokunmatik düğmelerin görünürlüğü ve yazıları (her kare). */
    sync(w, visible) { pad?.sync(w, visible); },
    rightHeld: () => rightHeld,
    /** Tek bir basışı okuyup tüketir (yakar top nişanı sırasında). */
    take(name) { const v = !!edges[name]; delete edges[name]; return v; },
    /** Bakış yönlü hareket (dünya uzayında); basışları tüketmez (izometrik nişan, yakar top nişanı). */
    move(view) { return view.movement(...axes()); },
    /** Bu adımın girdisi: bakış yönlü hareket, nişan (izometrikte hareket yönüne), sol tık durumu ve birikmiş basışlar. */
    read(view) {
      if (pad?.poll().sprint) edges.sprint = true;
      const move = view.movement(...axes());
      const cmd = { ...move, aim: view.aim(move), hold: held, ...edges };
      edges = {};
      return cmd;
    },
  };
}
