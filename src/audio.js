/**
 * Kısa sentez sesler (dosya yok): şut, yanma, gol ve rüzgar. Tarayıcı ilk kullanıcı hareketinden önce ses açtırmaz;
 * bağlam ilk seste kurulur, hata olursa sessiz kalır.
 * Aç / kapa ayarı tarayıcıda kalır (localStorage "yg.sound").
 */
const TONES = {
  kick: [380, 120],
  burn: [160, 120],
  goal: [650, 920],
  blow: [520, 260],
  ignite: [180, 980],
  impact: [120, 60],
  boom: [90, 40],
};

export function createAudio() {
  let context = null, enabled = true;
  try { enabled = localStorage.getItem('yg.sound') !== 'off'; } catch { /* yok */ }
  return {
    get enabled() { return enabled; },
    toggle() {
      enabled = !enabled;
      try { localStorage.setItem('yg.sound', enabled ? 'on' : 'off'); } catch { /* yok */ }
      return enabled;
    },
    play(type) {
      const tone = TONES[type];
      if (!enabled || !tone) return;
      try {
        context ??= new AudioContext();
        context.resume();
        const o = context.createOscillator(), g = context.createGain(), t = context.currentTime;
        o.frequency.setValueAtTime(tone[0], t);
        o.frequency.exponentialRampToValueAtTime(tone[1], t + 0.18);
        g.gain.setValueAtTime(0.045, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.23);
        o.connect(g); g.connect(context.destination);
        o.start(); o.stop(t + 0.24);
      } catch { /* ses yok */ }
    },
  };
}
