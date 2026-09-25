import { ENERGY, TOUCH } from './config.js';

/**
 * Dokunmatik kontroller (yalnızca tarayıcı; telefon, tablet ve Android uygulaması). Çoklu dokunuş pointer olaylarıyla
 * izlenir, her parmak ayrı iş görür:
 * - Sol yarı: parmağın değdiği yerde beliren **joystick** (hareket, analog). Sonuna kadar itip biraz tutunca hızlı koşu.
 * - Sağ yarı: parmak kaydırmak **bakış / nişan** (farenin karşılığı).
 * - Sağ alttaki düğmeler: ŞUT (sol tık: dokun şut, basılı tut rüzgar), PAS (sağ tık: top sendeyken dokun pas, basılı tut
 *   yakar top nişanı; topsuzken KAY), ZIPLA (Boşluk), KOŞ (Shift). Düğmeye basılıyken parmağı kaydırmak da nişan alır:
 *   rüzgar dolarken ya da yakar top nişanında başparmak düğmeden kalkmadan hedefi çevirir.
 * Girdi input.js'e `sink` üzerinden akar (down / up / look); joystick ve kendiliğinden koşu `poll` ile okunur.
 */
export const touchDevice = () => new URLSearchParams(location.search).has('touch') || matchMedia('(pointer: coarse)').matches;

export function createTouch(root, sink) {
  const $ = id => root.querySelector('#yg-' + id);
  const el = { pad: $('touch'), stick: $('stick'), knob: $('stick').firstElementChild, pass: $('t-pass'), shoot: $('t-shoot'), sprint: $('t-sprint') };
  const fingers = new Map();
  let axis = { x: 0, z: 0 };

  const setStick = (x, z) => {
    const d = Math.hypot(x, z), k = d < TOUCH.dead ? 0 : Math.min(1, (d - TOUCH.dead) / (1 - TOUCH.dead)) / (d || 1);
    axis = { x: x * k, z: z * k };
  };

  function down(e) {
    const target = e.target.closest('[data-t]');
    if (!target) return;
    e.preventDefault();
    target.setPointerCapture?.(e.pointerId);
    const kind = target.dataset.t, f = { kind, x: e.clientX, y: e.clientY, target };
    if (kind === 'stick') {
      if ([...fingers.values()].some(o => o.kind === 'stick')) return;
      el.stick.hidden = false;
      el.stick.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
      el.knob.style.transform = '';
      setStick(0, 0);
    } else if (kind !== 'look') {
      target.classList.add('on');
      sink.down(kind);
    }
    fingers.set(e.pointerId, f);
  }

  function move(e) {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    e.preventDefault();
    if (f.kind === 'stick') {
      let dx = e.clientX - f.x, dy = e.clientY - f.y;
      const d = Math.hypot(dx, dy);
      if (d > TOUCH.stick) { dx *= TOUCH.stick / d; dy *= TOUCH.stick / d; }
      el.knob.style.transform = `translate(${dx}px,${dy}px)`;
      setStick(dx / TOUCH.stick, dy / TOUCH.stick);
      return;
    }
    sink.look((e.clientX - f.x) * TOUCH.look, (e.clientY - f.y) * TOUCH.look);
    f.x = e.clientX; f.y = e.clientY;
  }

  function up(e) {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    fingers.delete(e.pointerId);
    release(f);
  }

  function release(f) {
    if (f.kind === 'stick') { el.stick.hidden = true; setStick(0, 0); }
    else if (f.kind !== 'look') { f.target.classList.remove('on'); sink.up(f.kind); }
  }

  el.pad.addEventListener('pointerdown', down);
  el.pad.addEventListener('pointermove', move);
  el.pad.addEventListener('pointerup', up);
  el.pad.addEventListener('pointercancel', up);
  el.pad.addEventListener('contextmenu', e => e.preventDefault());

  return {
    /** Joystick yönü (x sağ, z geri; 0-1 analog); tüketmez. */
    axis: () => axis,
    /** Joystick yönü (x sağ, z geri; 0-1 analog). Hızlı koşu yalnız KOŞ düğmesiyle (joystick kendiliğinden koşturmaz). */
    poll() { return { ...axis, sprint: false }; },
    /** Bütün parmakları bırakır (mola, ekran değişimi). */
    clear() {
      for (const f of fingers.values()) release(f);
      fingers.clear();
    },
    /** Düğme yazıları ve enerji dolumu: topsuzken PAS düğmesi KAY olur, ŞUT sönük kalır. */
    sync(w, visible) {
      el.pad.hidden = !visible;
      if (!visible) return;
      const p = w.players[0], owns = w.ball.owner === 0, cd = Math.min(1, p.energyCd / ENERGY.cooldown).toFixed(3);
      el.pass.classList.toggle('dash', !owns);
      el.shoot.classList.toggle('idle', !owns);
      el.pass.style.setProperty('--cd', owns ? 0 : cd);
      el.sprint.style.setProperty('--cd', cd);
    },
  };
}

/** Tarayıcıda (uygulama dışında) oyuna girerken tam ekran ve yatay yön; desteklenmezse sessizce geçer. */
export function enterFullscreen() {
  if (window.Capacitor?.isNativePlatform?.() || document.fullscreenElement) return;
  const go = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
  Promise.resolve(go).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
}
