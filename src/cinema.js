import { CINEMA } from './config.js';

/**
 * Yakar pas ve rüzgar şutu sineması: evreyi dünyadan ve olaylardan çıkarır, simülasyonun zaman ölçeğini verir. Tek
 * başına oyunda main.js, çevrim içinde sunucu (server/rooms.mjs) kullanır; çevrim içinde evre durum paketinde gider
 * (herkes aynı anda ağır çekime geçer). Süreler gerçek saniyedir (bkz. config.js CINEMA).
 *  - aim:    biri nişan alıyor (w.aim) → ağır çekim (aimScale).
 *  - flight: yakar pas uçuyor → flightScale, en çok flightMax (uçuş süresi); her yaktığı rakipte kısa impact (impactScale,
 *            impact sn), sonra top hâlâ alevliyse uçuşa döner.
 *  - wind:   rüzgar topu uçuyor → windScale, en çok windMax; gol olunca ya da duvara çarpınca biter.
 * Evre: { phase, kind: 'fire' | 'wind', id (vuran), t } ya da null.
 */
export function createCinema() {
  let c = null;
  return {
    get state() { return c; },
    reset() { c = null; },
    /** Simülasyon olayı: vuruş çıktı → uçuş; yakar pas birini yaktı → çarpma. */
    event(e) {
      if (e.type === 'kick' && (e.kind === 'fire' || e.kind === 'wind')) c = { phase: e.kind === 'fire' ? 'flight' : 'wind', kind: e.kind, id: e.id, t: 0 };
      else if (e.type === 'burn' && c && c.kind === 'fire' && (c.phase === 'flight' || c.phase === 'impact')) c = { ...c, phase: 'impact', t: 0, ft: c.phase === 'flight' ? c.t : c.ft };
      else if (e.type === 'aimLost' && c && c.phase === 'aim') c = null;
    },
    /** Her kare (gerçek dt): nişanı dünyadan izler, evre sürelerini işletir. */
    tick(w, dt) {
      if (w.aim) {
        if (!c || c.phase !== 'aim' || c.id !== w.aim.id) c = { phase: 'aim', kind: w.aim.kind, id: w.aim.id, t: 0 };
      } else if (c && c.phase === 'aim') c = null;
      if (!c) return;
      c.t += dt;
      const b = w.ball;
      if (c.phase === 'flight' && (b.kind !== 'fire' || c.t >= CINEMA.flightMax)) c = null;
      else if (c && c.phase === 'wind' && (b.kind !== 'wind' || c.t >= CINEMA.windMax)) c = null;
      else if (c && c.phase === 'impact' && c.t >= CINEMA.impact) c = b.kind === 'fire' && b.owner === null ? { ...c, phase: 'flight', t: c.ft || 0 } : null;
    },
    /** Simülasyonun zaman ölçeği. */
    scale() {
      if (!c) return 1;
      return { aim: CINEMA.aimScale, flight: CINEMA.flightScale, wind: CINEMA.windScale, impact: CINEMA.impactScale }[c.phase] ?? 1;
    },
  };
}
