// Complexity-theory sources. Each builder returns a Curve:
//   { id, title, n, u, S, Slabel, sTurnDefault, clocks:{key:{label,values,note}}, defaultClock,
//     psi (order parameter in [0,1]), chi (susceptibility / production rate), thresholds, ledger, readout(i), snapshot(i) }
// Every quantity here is either an exact formula or a direct measurement on a simulation; the ledger says which.

import { linspace, cumtrapz, ellipKE, derivative, rng, clamp, fmt, derivative as ddx } from './constants.js';

// ============================================================ 2D Ising (Onsager, exact)
export const ISING_TC = 2 / Math.log(1 + Math.SQRT2); // 2.269185314…

export function isingExact(T, J = 1) {
  const b = 1 / T, k2 = 2 * b * J;
  const sh = Math.sinh(k2), ch = Math.cosh(k2), th = Math.tanh(k2), coth = 1 / th;
  const kappa = (2 * sh) / (ch * ch);      // elliptic modulus, 1 at T_c
  const kp = 2 * th * th - 1;              // κ′
  const { K, E } = ellipKE(Math.min(kappa, 1 - 1e-13));
  const U = -J * coth * (1 + (2 / Math.PI) * kp * K);
  const C = (2 / Math.PI) * Math.pow(b * J * coth, 2) * (2 * K - 2 * E - (1 - kp) * (Math.PI / 2 + kp * K));
  let I = 0; const M = 600;
  for (let j = 0; j < M; j++) {
    const phi = ((j + 0.5) * Math.PI) / 2 / M, s = Math.sin(phi);
    I += Math.log(0.5 * (1 + Math.sqrt(Math.max(0, 1 - kappa * kappa * s * s))));
  }
  I *= Math.PI / 2 / M;
  const mbF = Math.log(2 * ch) + I / Math.PI; // −βF per spin
  const F = -mbF / b;
  const S = b * (U - F);
  const m = T < ISING_TC ? Math.pow(1 - Math.pow(sh, -4), 1 / 8) : 0;
  return { U, C, F, S, m, kappa };
}

// Exact axial correlation length (McCoy & Wu 1973): 1/ξ = ln coth(βJ) − 2βJ above T_c, twice the dual expression below.
export function isingXi(T, J = 1) {
  const bJ = J / T, lc = Math.log(1 / Math.tanh(bJ));
  const inv = T > ISING_TC ? lc - 2 * bJ : 2 * (2 * bJ - lc);
  return inv > 1e-12 ? 1 / inv : Infinity;
}

export function buildIsing(params = {}) {
  const p = { Thot: 4.5, Tcold: 0.4, N: 700, ...params };
  const N = p.N, u = linspace(0, 1, N);
  const T = new Float64Array(N), S = new Float64Array(N), C = new Float64Array(N), m = new Float64Array(N), U = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    T[i] = p.Thot + (p.Tcold - p.Thot) * u[i];
    const r = isingExact(T[i]);
    S[i] = r.S; C[i] = Math.min(r.C, 6); m[i] = r.m; U[i] = r.U;
  }
  const uc = (p.Thot - ISING_TC) / (p.Thot - p.Tcold);
  const Sc = isingExact(ISING_TC * (1 - 1e-7)).S;
  const cool = T.map((v) => -v), lnInvT = T.map((v) => -Math.log(v)), beta = T.map((v) => 1 / v);
  return {
    id: 'ising', title: '2D Ising model, cooled through T_c (Onsager, exact)',
    n: N, u, S, Slabel: 'S per spin  [k_B]', Sunit: 'nats', sTurnDefault: 0.1, sTurnRange: [0.02, 0.7],
    clocks: {
      lnInvT: { label: 'ln(1/T)  (cooling; = ln a if T ∝ 1/a)', short: 'ln 1/T', values: lnInvT, unit: '', note: 'Cooling as e-folds of expansion. In this clock the winding density dS/d ln(1/T) = −T dS/dT = −C: the spiral\'s tightness is minus the heat capacity, which diverges as −ln|T−T_c| at the critical point.' },
      cool: { label: '−T  (temperature falling)', short: '−T', values: cool, unit: 'J/k_B', note: 'Linear temperature. dS/d(−T) = −C/T.' },
      beta: { label: 'β = 1/T  (inverse temperature)', short: 'β', values: beta, unit: 'k_B/J', note: 'The natural thermodynamic conjugate of energy: dS/dβ = β dU/dβ.' },
    },
    defaultClock: 'lnInvT',
    psi: m, psiLabel: 'spontaneous magnetisation |m| (Yang 1952)',
    chi: C, chiLabel: 'heat capacity C/k_B (capped at 6 for display)',
    thresholds: [
      { u: uc, label: 'T_c = 2/ln(1+√2) = 2.2692', note: `Onsager's critical point. S(T_c) = ${Sc.toFixed(4)} k_B per spin; C ~ −ln|T−T_c|; m ~ (T_c−T)^{1/8}; ξ ~ |T−T_c|^{−1}.`, kind: 'exact' },
    ],
    extras: { T, C, m, U },
    readout: (i) => [
      ['temperature T', fmt(T[i], 4) + ' J/k_B'],
      ['reduced t = (T−T_c)/T_c', fmt((T[i] - ISING_TC) / ISING_TC, 3)],
      ['entropy S', fmt(S[i], 4) + ' k_B / spin  (max ln 2 = 0.6931)'],
      ['internal energy U', fmt(U[i], 4) + ' J / spin'],
      ['heat capacity C', fmt(C[i], 4) + ' k_B / spin'],
      ['magnetisation |m|', fmt(m[i], 4)],
      ['correlation length ξ (lattice units)', fmt(isingXi(T[i]), 3)],
    ],
    ledger: [
      ['Free energy, energy, entropy', 'exact', 'Onsager (1944): −βf = ln(2cosh 2βJ) + (1/π)∫₀^{π/2} ln[(1+√(1−κ²sin²φ))/2]dφ, κ = 2sinh2βJ/cosh²2βJ; elliptic integrals by AGM.'],
      ['Heat capacity', 'exact', 'Logarithmic divergence at T_c (critical exponent α = 0).'],
      ['Spontaneous magnetisation', 'exact', 'Yang (1952): m = [1 − sinh⁻⁴(2βJ)]^{1/8} below T_c, zero above (β = 1/8).'],
      ['Live lattice', 'simulation', 'Metropolis Monte Carlo on a 64×64 periodic lattice at the cursor temperature; measured E and m shown against the exact values.'],
      ['Cooling ↔ expansion', 'analogy', 'T ∝ 1/a for radiation, so ln(1/T) is the universe\'s ln a. The Ising system is a subsystem in a bath; its entropy falls as it cools while the bath\'s rises by at least as much.'],
    ],
  };
}

export class IsingMC {
  constructor(L = 64, seed = 7) {
    this.L = L; this.s = new Int8Array(L * L); this.rand = rng(seed);
    for (let i = 0; i < L * L; i++) this.s[i] = this.rand() < 0.5 ? -1 : 1;
    this.setT(3);
  }
  setT(T) { this.T = T; this.p4 = Math.exp(-4 / T); this.p8 = Math.exp(-8 / T); }
  sweep(n = 1) {
    const L = this.L, s = this.s, r = this.rand;
    for (let k = 0; k < n * L * L; k++) {
      const i = (r() * L) | 0, j = (r() * L) | 0, idx = i * L + j;
      const nb = s[((i + 1) % L) * L + j] + s[((i + L - 1) % L) * L + j] + s[i * L + ((j + 1) % L)] + s[i * L + ((j + L - 1) % L)];
      const dE = 2 * s[idx] * nb;
      if (dE <= 0 || r() < (dE === 4 ? this.p4 : this.p8)) s[idx] = -s[idx];
    }
  }
  measure() {
    const L = this.L, s = this.s; let E = 0, M = 0;
    for (let i = 0; i < L; i++) for (let j = 0; j < L; j++) {
      const v = s[i * L + j]; M += v;
      E -= v * (s[((i + 1) % L) * L + j] + s[i * L + ((j + 1) % L)]);
    }
    return { e: E / (L * L), m: Math.abs(M) / (L * L) };
  }
}

// ============================================================ Logistic map: Lyapunov & KS entropy
export const FEIGENBAUM_RINF = 3.5699456718709449;
export function lyapunovLogistic(r, nTrans = 500, nMeas = 1000, bins = 128) {
  let x = 0.5123;
  for (let i = 0; i < nTrans; i++) x = r * x * (1 - x);
  const h = new Float64Array(bins); let lam = 0;
  for (let i = 0; i < nMeas; i++) {
    x = r * x * (1 - x);
    lam += Math.log(Math.abs(r * (1 - 2 * x)) + 1e-300);
    h[Math.min(bins - 1, (x * bins) | 0)]++;
  }
  let H = 0;
  for (let b = 0; b < bins; b++) if (h[b] > 0) { const q = h[b] / nMeas; H -= q * Math.log(q); }
  return { lambda: lam / nMeas, Hmu: H };
}

export function buildLogistic(params = {}) {
  const p = { mode: 'r', rMin: 2.8, rMax: 4.0, rFixed: 3.72, N: 720, nSteps: 70, ...params };
  if (p.mode === 'n') return buildLogisticEnsemble(p);
  const N = p.N, u = linspace(0, 1, N);
  const r = new Float64Array(N), lam = new Float64Array(N), Hmu = new Float64Array(N), h = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    r[i] = p.rMin + (p.rMax - p.rMin) * u[i];
    const o = lyapunovLogistic(r[i]); lam[i] = o.lambda; Hmu[i] = o.Hmu; h[i] = Math.max(0, o.lambda);
  }
  const S = cumtrapz(r, h); // accumulated Kolmogorov–Sinai entropy ∫ h dr
  const psi = lam.map((l) => clamp(l / Math.LN2, 0, 1));
  const uOf = (rv) => (rv - p.rMin) / (p.rMax - p.rMin);
  const th = [
    [3, 'Period 2', 'First period-doubling: the fixed point loses stability at r = 3.'],
    [1 + Math.sqrt(6), 'Period 4', 'r = 1+√6 = 3.4495.'],
    [3.544090, 'Period 8', 'Doublings now accumulate geometrically with ratio δ = 4.6692 (Feigenbaum).'],
    [FEIGENBAUM_RINF, 'r_∞ = 3.56995  onset of chaos', 'Accumulation point. Lyapunov exponent crosses zero: Kolmogorov–Sinai entropy h = λ⁺ switches on. A deterministic system acquires an arrow of time here.'],
    [1 + Math.sqrt(8), 'Period-3 window', 'r = 1+√8 = 3.8284 (Li–Yorke). Order reappears inside chaos; λ < 0 and entropy production stops.'],
    [4, 'r = 4  fully chaotic', 'Conjugate to the tent map; λ = ln 2 exactly. One bit of information per iteration.'],
  ].map(([rv, label, note]) => ({ u: uOf(rv), label, note, kind: 'exact' })).filter((t) => t.u > 0 && t.u < 1);
  for (let i = 1; i < N; i++) if (lam[i - 1] <= 0 && lam[i] > 0) { th.push({ u: u[i], label: `λ crosses 0 at r = ${r[i].toFixed(4)} (measured)`, note: 'Numerically measured zero crossing of the Lyapunov exponent.', kind: 'model' }); break; }
  return {
    id: 'logistic', title: 'Logistic map: Kolmogorov–Sinai entropy switching on',
    n: N, u, S, Slabel: '∫ h_KS dr  (accumulated entropy rate)', Sunit: 'nats', sTurnDefault: 0.05, sTurnRange: [0.01, 0.3],
    clocks: { r: { label: 'r  (control parameter)', short: 'r', values: r, unit: '', note: 'The clock is the control parameter, swept adiabatically. Height = r. Winding density dS/dr = h_KS = λ⁺, the rate at which the map forgets its initial condition (Pesin).' } },
    defaultClock: 'r',
    psi, psiLabel: 'λ⁺/ln 2  (chaotic fraction)',
    chi: h, chiLabel: 'Kolmogorov–Sinai entropy rate h = max(λ,0)',
    thresholds: th, extras: { r, lam, Hmu },
    readout: (i) => [['r', fmt(r[i], 5)], ['Lyapunov λ', fmt(lam[i], 4) + ' nats/iter'], ['KS entropy h = λ⁺', fmt(h[i], 4)], ['invariant-measure entropy H_μ', fmt(Hmu[i], 3) + ' of ln128 = 4.852'], ['∫ h dr', fmt(S[i], 4)]],
    ledger: [
      ['Lyapunov exponent', 'measured', 'λ(r) = ⟨ln|r(1−2x)|⟩ over 1000 iterations after a 500-step transient.'],
      ['KS entropy = λ⁺', 'exact', 'Pesin identity for one-dimensional maps: the metric entropy equals the positive Lyapunov exponent.'],
      ['Bifurcation points', 'exact', 'r₁ = 3, r₂ = 1+√6, r_∞ = 3.5699456…, period-3 at 1+√8, λ(4) = ln 2.'],
    ],
  };
}

function buildLogisticEnsemble(p) {
  const M = 20000, bins = 128, nS = p.nSteps + 1, eps = 1e-8;
  const x = new Float64Array(M); for (let k = 0; k < M; k++) x[k] = 0.3 + eps * (k / M);
  const u = linspace(0, 1, nS), S = new Float64Array(nS), n = new Float64Array(nS), hist = [];
  const r = p.rFixed;
  for (let s = 0; s < nS; s++) {
    const h = new Float64Array(bins);
    for (let k = 0; k < M; k++) h[Math.min(bins - 1, (x[k] * bins) | 0)]++;
    let H = 0; for (let b = 0; b < bins; b++) if (h[b] > 0) { const q = h[b] / M; H -= q * Math.log(q); }
    S[s] = H; n[s] = s; hist.push(h);
    for (let k = 0; k < M; k++) x[k] = r * x[k] * (1 - x[k]);
  }
  const { lambda, Hmu } = lyapunovLogistic(r);
  const dS = derivative(n, S);
  const nOnset = lambda > 0 ? Math.log(1 / (bins * eps)) / lambda : Infinity;
  const nSat = lambda > 0 ? nOnset + Hmu / lambda : Infinity;
  const th = [];
  if (isFinite(nOnset) && nOnset < p.nSteps) th.push({ u: nOnset / p.nSteps, label: `arrow switches on, n ≈ ${nOnset.toFixed(1)} (predicted)`, note: 'The ensemble\'s spread ε·e^{λn} reaches one coarse-graining cell: ln(1/(ε·bins))/λ. Before this, coarse-grained entropy is exactly zero although the dynamics is already chaotic.', kind: 'exact' });
  if (isFinite(nSat) && nSat < p.nSteps) th.push({ u: nSat / p.nSteps, label: `saturation, n ≈ ${nSat.toFixed(1)} (predicted)`, note: 'Entropy reaches the invariant measure\'s H_μ; the ensemble has forgotten its origin. Equilibrium.', kind: 'exact' });
  return {
    id: 'logistic', title: `Logistic map at r = ${r}: coarse-grained entropy of an ensemble`,
    n: nS, u, S, Slabel: 'Shannon entropy of the ensemble (128 cells)', Sunit: 'nats', sTurnDefault: 0.5, sTurnRange: [0.1, 3],
    clocks: { n: { label: 'n  (iterations)', short: 'n', values: n, unit: 'steps', note: 'Discrete time. 20 000 trajectories start within 10⁻⁸ of each other; the coarse-grained entropy grows at λ nats per step, then saturates. This is Boltzmann\'s H-theorem in one dimension.' } },
    defaultClock: 'n',
    psi: S.map((v) => clamp(v / Math.log(bins), 0, 1)), psiLabel: 'S / ln(cells)',
    chi: dS, chiLabel: 'ΔS per step (should approach λ = ' + lambda.toFixed(3) + ')',
    thresholds: th, extras: { hist, lambda, Hmu, r, bins },
    readout: (i) => [['iteration n', String(n[i])], ['ensemble entropy S', fmt(S[i], 4) + ' nats'], ['ΔS/Δn', fmt(dS[i], 4)], ['λ at this r', fmt(lambda, 4)], ['H_μ (equilibrium)', fmt(Hmu, 3)]],
    ledger: [
      ['Ensemble entropy', 'measured', 'Shannon entropy of 20 000 trajectories binned into 128 cells.'],
      ['Growth rate = λ', 'exact', 'Linear stretching: ln(spread) grows as λn until the spread reaches the cell size, then as the map folds.'],
      ['Latency before the arrow', 'exact', 'n_onset = ln(1/(ε·cells))/λ depends on the coarse-graining: entropy is observer-relative, the dynamics is not.'],
    ],
  };
}

// ============================================================ Kuramoto synchronisation
export function buildKuramoto(params = {}) {
  const p = { N: 400, gamma: 0.5, Kmax: 3.0, steps: 360, sub: 30, dt: 0.05, seed: 3, ...params };
  const N = p.N, Kc = 2 * p.gamma;
  const om = new Float64Array(N), th = new Float64Array(N), rand = rng(p.seed);
  for (let i = 0; i < N; i++) { om[i] = p.gamma * Math.tan(Math.PI * ((i + 0.5) / N - 0.5)); th[i] = 2 * Math.PI * rand(); }
  const nS = p.steps, u = linspace(0, 1, nS);
  const K = new Float64Array(nS), r = new Float64Array(nS), chi = new Float64Array(nS), H = new Float64Array(nS), rEx = new Float64Array(nS), psiM = new Float64Array(nS);
  const snaps = [];
  const bins = 36;
  for (let s = 0; s < nS; s++) {
    K[s] = (p.Kmax * s) / (nS - 1);
    let sr = 0, sr2 = 0, lastPsi = 0;
    for (let k = 0; k < p.sub; k++) {
      let cx = 0, sy = 0;
      for (let i = 0; i < N; i++) { cx += Math.cos(th[i]); sy += Math.sin(th[i]); }
      cx /= N; sy /= N;
      const rr = Math.hypot(cx, sy), ps = Math.atan2(sy, cx);
      for (let i = 0; i < N; i++) th[i] += p.dt * (om[i] + K[s] * rr * Math.sin(ps - th[i]));
      sr += rr; sr2 += rr * rr; lastPsi = ps;
    }
    r[s] = sr / p.sub; chi[s] = N * Math.max(0, sr2 / p.sub - r[s] * r[s]); psiM[s] = lastPsi;
    const h = new Float64Array(bins);
    for (let i = 0; i < N; i++) { let a = th[i] % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; h[Math.min(bins - 1, (a / (2 * Math.PI) * bins) | 0)]++; }
    let HH = 0; for (let b = 0; b < bins; b++) if (h[b] > 0) { const q = h[b] / N; HH -= q * Math.log(q); }
    H[s] = HH; rEx[s] = K[s] > Kc ? Math.sqrt(1 - Kc / K[s]) : 0;
    snaps.push(Float32Array.from(th));
  }
  const thr = [{ u: Kc / p.Kmax, label: `K_c = 2γ = ${Kc.toFixed(2)}  (exact, N→∞)`, note: 'Kuramoto (1975): for a Lorentzian frequency spread of width γ, coherence appears at K_c = 2/(πg(0)) = 2γ, with r = √(1−K_c/K) above it (critical exponent 1/2). A collective phase ψ, a shared clock, exists only above this coupling.', kind: 'exact' }];
  let iOn = -1; for (let s = 0; s < nS; s++) if (r[s] > 0.3) { iOn = s; break; }
  if (iOn > 0) thr.push({ u: u[iOn], label: `r exceeds 0.3 at K = ${K[iOn].toFixed(2)} (measured)`, note: 'Finite N = 400 and the finite ramp blur the transition; relaxation time ~2/(K−K_c) diverges at K_c (critical slowing down), so the measured r lags the exact curve.', kind: 'model' });
  return {
    id: 'kuramoto', title: 'Kuramoto oscillators: a shared clock emerging',
    n: nS, u, S: H, Slabel: 'phase entropy H (36 bins)', Sunit: 'nats', sTurnDefault: 0.25, sTurnRange: [0.05, 1.5],
    clocks: { K: { label: 'K  (coupling, ramped up)', short: 'K', values: K, unit: '', note: 'The clock is coupling strength, ramped slowly. Below K_c the oscillators share no phase, so there is no collective "now"; above it the order parameter ψ(t) ticks at the mean frequency: time as an emergent collective coordinate.' } },
    defaultClock: 'K',
    psi: r, psiLabel: 'order parameter r = |⟨e^{iθ}⟩|',
    chi, chiLabel: 'susceptibility N·Var(r)',
    thresholds: thr, extras: { K, r, rEx, om, snaps, Kc },
    readout: (i) => [['coupling K', fmt(K[i], 3)], ['K/K_c', fmt(K[i] / Kc, 3)], ['order parameter r (measured)', fmt(r[i], 3)], ['r exact, N→∞', fmt(rEx[i], 3)], ['phase entropy H', fmt(H[i], 3) + ' of ln36 = 3.584'], ['susceptibility N·Var r', fmt(chi[i], 3)]],
    ledger: [
      ['Critical coupling', 'exact', 'K_c = 2γ for the Lorentzian g(ω) = γ/π/(ω²+γ²); frequencies placed at exact quantiles.'],
      ['Order parameter curve', 'exact', 'r = √(1 − K_c/K) in the thermodynamic limit.'],
      ['Dynamics', 'simulation', '400 oscillators, mean-field form dθ_i/dt = ω_i + K r sin(ψ−θ_i), Euler step 0.05, 30 steps per K value.'],
      ['Phase entropy', 'measured', 'Shannon entropy of the phase histogram: an information-theoretic order parameter that falls as the clock forms.'],
    ],
  };
}

// ============================================================ Percolation (Newman–Ziff)
export const PC_SITE_SQUARE = 0.59274605;
export function buildPercolation(params = {}) {
  const p = { L: 128, every: 16, seed: 11, ...params };
  const L = p.L, Nn = L * L, rand = rng(p.seed);
  const order = new Int32Array(Nn); for (let i = 0; i < Nn; i++) order[i] = i;
  for (let i = Nn - 1; i > 0; i--) { const j = (rand() * (i + 1)) | 0; const t = order[i]; order[i] = order[j]; order[j] = t; }
  const parent = new Int32Array(Nn).fill(-1), size = new Int32Array(Nn), edge = new Uint8Array(Nn);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  let s2 = 0, slns = 0, smax = 0, nocc = 0, spanning = false;
  const nS = Math.floor(Nn / p.every), u = linspace(0, 1, nS);
  const pp = new Float64Array(nS), Pmax = new Float64Array(nS), chi = new Float64Array(nS), H = new Float64Array(nS), span = new Uint8Array(nS);
  let rec = 0, spanAt = -1;
  const xlnx = (x) => (x > 0 ? x * Math.log(x) : 0);
  for (let k = 0; k < Nn; k++) {
    const s = order[k], i = (s / L) | 0, j = s % L;
    parent[s] = s; size[s] = 1; edge[s] = (i === 0 ? 1 : 0) | (i === L - 1 ? 2 : 0); nocc++; s2 += 1;
    if (smax < 1) smax = 1;
    const nbs = [i > 0 ? s - L : -1, i < L - 1 ? s + L : -1, j > 0 ? s - 1 : -1, j < L - 1 ? s + 1 : -1];
    for (const nb of nbs) {
      if (nb < 0 || parent[nb] < 0) continue;
      let ra = find(s), rb = find(nb); if (ra === rb) continue;
      if (size[ra] < size[rb]) { const t = ra; ra = rb; rb = t; }
      const a = size[ra], b = size[rb];
      s2 += 2 * a * b; slns += xlnx(a + b) - xlnx(a) - xlnx(b);
      parent[rb] = ra; size[ra] = a + b; edge[ra] |= edge[rb];
      if (a + b > smax) smax = a + b;
      if (!spanning && edge[ra] === 3) { spanning = true; spanAt = (k + 1) / Nn; }
    }
    if ((k + 1) % p.every === 0 && rec < nS) {
      pp[rec] = (k + 1) / Nn; Pmax[rec] = smax / Nn;
      chi[rec] = nocc > smax ? (s2 - smax * smax) / (nocc - smax) : 0;
      H[rec] = Math.log(nocc) - slns / nocc; span[rec] = spanning ? 1 : 0; rec++;
    }
  }
  let iChi = 0; for (let s = 1; s < nS; s++) if (chi[s] > chi[iChi]) iChi = s;
  const thr = [
    { u: PC_SITE_SQUARE, label: 'p_c = 0.5927 (site, square lattice)', note: 'Percolation threshold (numerically exact to 8 digits). Infinite cluster appears; correlation length ξ ~ |p−p_c|^{−4/3}; P_∞ ~ (p−p_c)^{5/36}.', kind: 'exact' },
    { u: pp[iChi], label: `χ peaks at p = ${pp[iChi].toFixed(3)} (measured)`, note: `Mean finite-cluster size peaks here on this ${L}×${L} lattice; shifted from p_c by finite size as L^{−1/ν} = L^{−3/4}.`, kind: 'model' },
  ];
  if (spanAt > 0) thr.push({ u: spanAt, label: `spanning cluster at p = ${spanAt.toFixed(3)} (this sample)`, note: 'First cluster touching both top and bottom in this realisation.', kind: 'model' });
  return {
    id: 'percolation', title: 'Site percolation: a global structure emerging',
    n: nS, u, S: H, Slabel: 'cluster-membership entropy H', Sunit: 'nats', sTurnDefault: 1.0, sTurnRange: [0.2, 4],
    clocks: { p: { label: 'p  (occupation probability)', short: 'p', values: pp, unit: '', note: 'Sites are switched on one at a time in random order (Newman–Ziff), so the whole sweep is one exact sample. H is the entropy of "which cluster does a random occupied site belong to"; it collapses when the giant component absorbs the lattice.' } },
    defaultClock: 'p',
    psi: Pmax, psiLabel: 'P_∞ = largest cluster / N',
    chi, chiLabel: 'mean finite-cluster size (susceptibility)',
    thresholds: thr, extras: { order, L, pp, Pmax, span },
    readout: (i) => [['occupation p', fmt(pp[i], 4)], ['largest cluster fraction', fmt(Pmax[i], 4)], ['mean finite cluster size χ', fmt(chi[i], 3)], ['cluster entropy H', fmt(H[i], 3) + ' nats'], ['spans top→bottom', span[i] ? 'yes' : 'no']],
    ledger: [
      ['Threshold p_c', 'exact', 'Site percolation on the square lattice: p_c = 0.59274605 (Newman & Ziff 2000; Jacobsen 2015).'],
      ['Sweep', 'simulation', 'Union–find with path compression; Σs² and Σ s ln s maintained incrementally.'],
      ['Exponents', 'exact', 'ν = 4/3, β = 5/36, γ = 43/18 in two dimensions.'],
    ],
  };
}

export function percolationLabels(curve, i) {
  const { order, L } = curve.extras, Nn = L * L, n = Math.round(curve.extras.pp[i] * Nn);
  const parent = new Int32Array(Nn).fill(-1), size = new Int32Array(Nn);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let k = 0; k < n; k++) {
    const s = order[k], i0 = (s / L) | 0, j0 = s % L; parent[s] = s; size[s] = 1;
    const nbs = [i0 > 0 ? s - L : -1, i0 < L - 1 ? s + L : -1, j0 > 0 ? s - 1 : -1, j0 < L - 1 ? s + 1 : -1];
    for (const nb of nbs) { if (nb < 0 || parent[nb] < 0) continue; let ra = find(s), rb = find(nb); if (ra === rb) continue; if (size[ra] < size[rb]) { const t = ra; ra = rb; rb = t; } parent[rb] = ra; size[ra] += size[rb]; }
  }
  let big = -1, bigSize = 0; for (let s = 0; s < Nn; s++) if (parent[s] === s && size[s] > bigSize) { bigSize = size[s]; big = s; }
  const lab = new Int8Array(Nn); // 0 empty, 1 occupied, 2 largest
  for (let s = 0; s < Nn; s++) if (parent[s] >= 0) lab[s] = find(s) === big ? 2 : 1;
  return lab;
}

// ============================================================ Custom law S(τ)
export function buildCustom(params = {}) {
  const p = { expr: '2*t + 0.8*Math.tanh(12*(t-0.6))', N: 600, ...params };
  let f;
  try { f = new Function('t', `"use strict"; return (${p.expr});`); f(0.5); } catch (e) { f = (t) => t; p.error = String(e.message || e); }
  const N = p.N, u = linspace(0, 1, N), S = new Float64Array(N);
  for (let i = 0; i < N; i++) { const v = Number(f(u[i])); S[i] = isFinite(v) ? v : 0; }
  const dS = ddx(u, S), d2 = ddx(u, dS);
  const mx = Math.max(1e-9, ...Array.from(dS).map(Math.abs));
  const psi = dS.map((v) => clamp(0.5 + v / (2 * mx), 0, 1));
  const chi = dS.map(Math.abs);
  const thr = [];
  const a2 = Array.from(d2).map(Math.abs), med = [...a2].sort((a, b) => a - b)[Math.floor(N / 2)] || 0;
  for (let i = 2; i < N - 2; i++) if (a2[i] > a2[i - 1] && a2[i] >= a2[i + 1] && a2[i] > 8 * med + 1e-9 && thr.length < 4) thr.push({ u: u[i], label: `curvature peak at τ = ${u[i].toFixed(3)}`, note: `|d²S/dτ²| = ${fmt(a2[i], 3)}: the entropy law changes regime here.`, kind: 'model' });
  return {
    id: 'custom', title: 'Custom entropy law S(τ) = ' + p.expr, error: p.error,
    n: N, u, S, Slabel: 'S(τ)', Sunit: '', sTurnDefault: 0.5, sTurnRange: [0.05, 5],
    clocks: { tau: { label: 'τ  (your parameter, 0→1)', short: 'τ', values: u, unit: '', note: 'A law you typed. Try t, Math.log(t+1e-3), Math.exp(4*t), Math.tanh(10*(t-0.5)), or a sum of them.' } },
    defaultClock: 'tau',
    psi, psiLabel: 'dS/dτ (normalised)', chi, chiLabel: '|dS/dτ|',
    thresholds: thr, extras: {},
    readout: (i) => [['τ', fmt(u[i], 3)], ['S', fmt(S[i], 4)], ['dS/dτ', fmt(dS[i], 4)], ['d²S/dτ²', fmt(d2[i], 4)]],
    ledger: [['S(τ)', 'user', 'Evaluated as a JavaScript expression in t ∈ [0,1].']],
  };
}
