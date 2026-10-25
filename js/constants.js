// Physical constants (CODATA 2018 / IAU 2015) and small numerical helpers.
// Everything is SI unless stated. Entropies are handled as log10(S / k_B).

export const PHYS = {
  c: 2.99792458e8,          // m s^-1
  G: 6.67430e-11,           // m^3 kg^-1 s^-2
  hbar: 1.054571817e-34,    // J s
  kB: 1.380649e-23,         // J K^-1
  Msun: 1.98847e30,         // kg
  yr: 3.15576e7,            // s (Julian year)
  Gyr: 3.15576e16,          // s
  Mpc: 3.0856775814913673e22, // m
  eV: 1.602176634e-19,      // J
};
PHYS.lP2 = PHYS.hbar * PHYS.G / PHYS.c ** 3;          // Planck length squared
PHYS.tP = Math.sqrt(PHYS.hbar * PHYS.G / PHYS.c ** 5); // Planck time, 5.39e-44 s

// Bekenstein–Hawking entropy of a Schwarzschild black hole, log10(S/kB), mass in solar masses.
export function logSbh(Msun) {
  const M = Msun * PHYS.Msun;
  return Math.log10(4 * Math.PI * PHYS.G * M * M / (PHYS.hbar * PHYS.c));
}
// Hawking evaporation time in years (Page's factor absorbed into the standard 5120π form).
export function logTevap(Msun) {
  const M = Msun * PHYS.Msun;
  const t = 5120 * Math.PI * PHYS.G ** 2 * M ** 3 / (PHYS.hbar * PHYS.c ** 4);
  return Math.log10(t / PHYS.yr);
}
// Hawking temperature in kelvin.
export function hawkingT(Msun) {
  return PHYS.hbar * PHYS.c ** 3 / (8 * Math.PI * PHYS.G * Msun * PHYS.Msun * PHYS.kB);
}
// Gibbons–Hawking entropy of a de Sitter horizon with Hubble rate H (s^-1): log10(S/kB).
export function logSdeSitter(H) {
  return Math.log10(Math.PI * PHYS.c ** 5 / (PHYS.hbar * PHYS.G * H * H));
}
export function deSitterT(H) {
  return PHYS.hbar * H / (2 * Math.PI * PHYS.kB);
}

export const sigmoid = (x) => 1 / (1 + Math.exp(-x));
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const LN10 = Math.LN10;

export function linspace(a, b, n) {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = a + ((b - a) * i) / (n - 1);
  return out;
}

// Cumulative trapezoid integral of f over xs; F[0] = 0.
export function cumtrapz(xs, f) {
  const n = xs.length, F = new Float64Array(n);
  for (let i = 1; i < n; i++) F[i] = F[i - 1] + 0.5 * (f[i] + f[i - 1]) * (xs[i] - xs[i - 1]);
  return F;
}

// Linear interpolation on a monotone increasing abscissa (binary search), clamped at the ends.
export function interp1(xs, ys, x) {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] + t * (ys[hi] - ys[lo]);
}

// Complete elliptic integrals K(k), E(k) of modulus k in [0,1) by the arithmetic–geometric mean.
export function ellipKE(k) {
  let a = 1, b = Math.sqrt(1 - k * k), c = k, sum = 0.5 * c * c, pow = 0.5;
  for (let i = 0; i < 40 && Math.abs(c) > 1e-17; i++) {
    const an = 0.5 * (a + b), bn = Math.sqrt(a * b);
    c = 0.5 * (a - b); a = an; b = bn; pow *= 2; sum += pow * c * c;
  }
  const K = Math.PI / (2 * a);
  return { K, E: K * (1 - sum) };
}

// log10(10^a + 10^b) without overflow.
export function logAdd(a, b) {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  const m = Math.max(a, b);
  return m + Math.log10(Math.pow(10, a - m) + Math.pow(10, b - m));
}
export function logSum(arr) { return arr.reduce((acc, v) => logAdd(acc, v), -Infinity); }

// Centred finite-difference derivative of y w.r.t. x (arrays of equal length).
export function derivative(xs, ys) {
  const n = xs.length, d = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    const dx = xs[i1] - xs[i0];
    d[i] = dx === 0 ? 0 : (ys[i1] - ys[i0]) / dx;
  }
  return d;
}

// Mulberry32: tiny seeded PRNG so every model run is reproducible.
export function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussianWeights(n, sigmaBins) {
  const w = [], offs = [];
  let tot = 0;
  for (let i = 0; i < n; i++) {
    const z = ((i - (n - 1) / 2) / ((n - 1) / 2)) * 2.5; // spans ±2.5σ
    const wi = Math.exp(-0.5 * z * z);
    w.push(wi); offs.push(z * sigmaBins); tot += wi;
  }
  return { w: w.map((v) => v / tot), offs };
}

// ---------- formatting ----------
export function fmtPow(log10v, unit = '') {
  if (!isFinite(log10v)) return '—';
  const e = Math.floor(log10v), m = Math.pow(10, log10v - e);
  const ms = m >= 9.95 ? '10' : m.toFixed(1);
  return `${ms === '1.0' ? '' : ms + '×'}10<sup>${e}</sup>${unit ? ' ' + unit : ''}`;
}
export function fmtTime(logTyr) {
  if (!isFinite(logTyr)) return '—';
  const t = Math.pow(10, logTyr);
  if (logTyr < -8) {
    const s = t * PHYS.yr;
    const ls = Math.log10(s);
    if (ls < -3) return `${fmtPow(ls)} s`;
    return `${s.toPrecision(3)} s`;
  }
  if (logTyr < 3) return `${t.toPrecision(3)} yr`;
  if (logTyr < 6) return `${(t / 1e3).toPrecision(3)} kyr`;
  if (logTyr < 9) return `${(t / 1e6).toPrecision(3)} Myr`;
  if (logTyr < 12.5) return `${(t / 1e9).toPrecision(3)} Gyr`;
  return `${fmtPow(logTyr)} yr`;
}
export function fmtK(logTK) {
  if (!isFinite(logTK)) return '—';
  if (logTK > 4 || logTK < -3) return `${fmtPow(logTK)} K`;
  return `${Math.pow(10, logTK).toPrecision(3)} K`;
}
export function fmt(x, d = 3) {
  if (!isFinite(x)) return '—';
  if (Math.abs(x) >= 1e5 || (Math.abs(x) < 1e-3 && x !== 0)) return x.toExponential(2);
  return Number(x.toPrecision(d)).toString();
}
export const deg = (rad) => (rad * 180) / Math.PI;
