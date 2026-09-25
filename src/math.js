// Küçük yardımcılar: sınırlama ve zemin (x, z) düzleminde uzaklık.
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
