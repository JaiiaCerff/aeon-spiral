// One aeon of a flat ΛCDM universe with an entropy budget.
//
// Exact:      the FLRW background a(t), conformal time η(a), T_CMB(a), de Sitter bound.
// Empirical:  today's entropy budget (Egan & Lineweaver 2010, ApJ 710, 1825; cosmic event horizon volume).
// Model:      how black-hole entropy grows and evaporates (Bekenstein–Hawking, Hawking lifetimes, Page/Zurek factor).
// Hypothesis: the CCC crossover (Penrose 2010), handled by the lens layer, not here.

import {
  PHYS, linspace, cumtrapz, interp1, sigmoid, logAdd, derivative, gaussianWeights,
  logSbh, logTevap, logSdeSitter, deSitterT, fmtPow, fmtTime, fmtK, fmt, LN10,
} from './constants.js';

export const COSMO_DEFAULTS = {
  H0: 67.4,            // km s^-1 Mpc^-1 (Planck 2018)
  Om: 0.315,           // matter density parameter
  Or: 9.15e-5,         // radiation (photons + 3 massless neutrinos)
  Tcmb: 2.7255,        // K
  logSrad: 89.6,       // log10 S of relic photons + neutrinos in the event-horizon volume (4e89)
  logSbhNow: 104.5,    // log10 S of black holes today (3.1e104, dominated by supermassive BHs)
  logSbhMax: 106.0,    // asymptotic BH entropy from late mergers/accretion before evaporation
  bhGrowthMidGyr: 2.0, // when half of today's BH entropy exists (cosmic noon)
  bhGrowthWidthDex: 0.35,
  bhLateMidLogYr: 14,  // late growth (bound structures merge) centred here
  bhLateWidthDex: 2.0,
  logMstellar: 1.0,    // log10 M/Msun of a typical stellar black hole
  logMsmbh: 10.0,      // log10 M/Msun of the black holes that carry most entropy at the end
  evapSpreadDex: 0.4,  // mass spread of the population, in dex
  hawkingFactor: 1.5,  // S(Hawking radiation)/S(hole) (Zurek 1982; Page 1983: 1.3–1.6)
  logTstart: -50.0,    // log10 t/yr ≈ Planck time
  logTend: 110.0,      // where this aeon's history is cut: after the last black holes
  N: 900,
};

export function buildBackground(p) {
  const H0 = (p.H0 * 1e3) / PHYS.Mpc; // s^-1
  const OL = 1 - p.Om - p.Or;
  const E = (a) => Math.sqrt(p.Or / a ** 4 + p.Om / a ** 3 + OL);
  const Nx = 9000, x0 = -75, x1 = 420;
  const xs = linspace(x0, x1, Nx);
  const ft = new Float64Array(Nx), fe = new Float64Array(Nx);
  for (let i = 0; i < Nx; i++) {
    const a = Math.exp(xs[i]), e = E(a);
    ft[i] = 1 / e;           // dt·H0 = dx / E
    fe[i] = 1 / (a * e);     // dη·H0 = dx / (a E)
  }
  const sOr = Math.sqrt(p.Or), sOL = Math.sqrt(OL);
  const t = cumtrapz(xs, ft), eta = cumtrapz(xs, fe);
  const t0 = Math.exp(2 * x0) / (2 * sOr), e0 = Math.exp(x0) / sOr; // radiation-era tails below x0
  const lnT = new Float64Array(Nx);
  for (let i = 0; i < Nx; i++) { t[i] += t0; eta[i] += e0; lnT[i] = Math.log(t[i]); }
  const etaInf = eta[Nx - 1] + Math.exp(-x1) / sOL; // de Sitter tail above x1
  const Hinf = H0 * sOL;
  const bg = {
    H0, OL, E, xs, t, eta, lnT, x0, x1, etaInf, Hinf,
    tH_Gyr: 1 / H0 / PHYS.Gyr,
    lnaFromLogTyr(logTyr) {
      const tt = Math.pow(10, logTyr) * PHYS.yr * H0;
      if (tt <= t[Nx - 1]) return interp1(lnT, xs, Math.log(tt));
      return x1 + sOL * (tt - t[Nx - 1]);
    },
    logTyrFromLna(x) {
      if (x <= x1) return (interp1(xs, lnT, x) - Math.log(PHYS.yr * H0)) / LN10;
      return Math.log10((t[Nx - 1] + (x - x1) / sOL) / (PHYS.yr * H0));
    },
    etaFromLna(x) { return x <= x1 ? interp1(xs, eta, x) : etaInf - Math.exp(-x) / sOL; },
    logTKfromLna(x) { return Math.log10(p.Tcmb) - x / LN10; },
  };
  bg.lnaNow = 0;
  bg.logTnow = bg.logTyrFromLna(0);
  bg.etaNow = bg.etaFromLna(0);
  bg.logSdS = logSdeSitter(Hinf);
  bg.TdS = deSitterT(Hinf);
  bg.aEq = p.Or / p.Om;
  bg.aLambda = Math.cbrt(p.Om / OL);
  return bg;
}

// temperature in kelvin → ln a
const lnaFromTK = (p, TK) => Math.log(p.Tcmb / TK);
const GeV_K = 1e9 / 8.617333262e-5; // 1 GeV in kelvin

export function buildCosmos(params = {}) {
  const p = { ...COSMO_DEFAULTS, ...params };
  const bg = buildBackground(p);
  const N = p.N;
  const u = linspace(0, 1, N);
  const logT = new Float64Array(N), lna = new Float64Array(N), eta = new Float64Array(N), logTK = new Float64Array(N);
  const logSrad = new Float64Array(N), logSbhArr = new Float64Array(N), logShawk = new Float64Array(N), logS = new Float64Array(N);
  const psi = new Float64Array(N), tGyr = new Float64Array(N), lnaClip = new Float64Array(N);

  // black-hole populations: stellar (small) and supermassive (dominant)
  const logSstellarNow = 98.0; // Egan–Lineweaver: 5.9e97 in stellar-mass holes today
  const pops = [
    { logS: logSstellarNow, logTev: logTevap(Math.pow(10, p.logMstellar)) },
    { logS: null, logTev: logTevap(Math.pow(10, p.logMsmbh)) },
  ];
  const gw = gaussianWeights(7, 3 * p.evapSpreadDex); // t_evap ∝ M^3 → spread ×3 in dex
  const remaining = (logt, logTev) => {
    let r = 0;
    for (let k = 0; k < gw.w.length; k++) {
      const d = logt - (logTev + gw.offs[k]);
      r += gw.w[k] * (d < 0 ? Math.pow(1 - Math.pow(10, d), 2 / 3) : 0); // S ∝ M², M ∝ (1−t/t_ev)^{1/3}
    }
    return r;
  };
  const logMid1 = Math.log10(p.bhGrowthMidGyr * 1e9);
  const smbhNow = Math.log10(Math.max(1e-30, Math.pow(10, p.logSbhNow) - Math.pow(10, logSstellarNow)));
  const smbhMaxLin = Math.max(0, Math.pow(10, p.logSbhMax) - Math.pow(10, smbhNow));

  for (let i = 0; i < N; i++) {
    const lt = p.logTstart + (p.logTend - p.logTstart) * u[i];
    logT[i] = lt;
    tGyr[i] = Math.pow(10, lt - 9);
    const x = bg.lnaFromLogTyr(lt);
    lna[i] = x; eta[i] = bg.etaFromLna(x); logTK[i] = bg.logTKfromLna(x);
    lnaClip[i] = Math.min(x, 120);
    logSrad[i] = p.logSrad; // comoving entropy of relic radiation is conserved under adiabatic expansion
    const g1 = sigmoid((lt - logMid1) / p.bhGrowthWidthDex);
    const g2 = sigmoid((lt - p.bhLateMidLogYr) / p.bhLateWidthDex);
    const formedStellar = Math.pow(10, logSstellarNow) * g1;
    const formedSmbh = Math.pow(10, smbhNow) * g1 + smbhMaxLin * g2;
    const remStellar = formedStellar * remaining(lt, pops[0].logTev);
    const remSmbh = formedSmbh * remaining(lt, pops[1].logTev);
    const bhNow = remStellar + remSmbh;
    const hawk = p.hawkingFactor * (formedStellar - remStellar + formedSmbh - remSmbh);
    logSbhArr[i] = bhNow > 0 ? Math.log10(bhNow) : -Infinity;
    logShawk[i] = hawk > 0 ? Math.log10(hawk) : -Infinity;
    logS[i] = logAdd(logAdd(logSrad[i], logSbhArr[i]), logShawk[i]);
    psi[i] = bhNow / (bhNow + hawk + Math.pow(10, p.logSrad));
  }
  const chi = derivative(logT, logS); // d log10 S / d log10 t: the winding density in the log-t clock

  // thresholds (u positions)
  const uOfLogT = (lt) => (lt - p.logTstart) / (p.logTend - p.logTstart);
  const uOfLna = (x) => uOfLogT(bg.logTyrFromLna(x));
  const TH = [];
  const add = (uu, label, note, kind) => { if (uu > 0 && uu < 1) TH.push({ u: uu, label, note, kind }); };
  add(uOfLogT(Math.log10(PHYS.tP / PHYS.yr)), 'Planck time', 't = 5.4×10⁻⁴⁴ s. Classical geometry starts; the Weyl curvature hypothesis puts C_abcd = 0 here.', 'hypothesis');
  add(uOfLna(lnaFromTK(p, 160 * GeV_K)), 'Electroweak crossover', 'T ≈ 160 GeV. A smooth crossover for m_H = 125 GeV, not a true phase transition; comoving entropy is conserved through it.', 'exact');
  add(uOfLna(lnaFromTK(p, 0.155 * GeV_K)), 'QCD crossover', 'T ≈ 155 MeV. Quarks confine into hadrons; also a crossover at zero baryon chemical potential.', 'exact');
  add(uOfLna(lnaFromTK(p, 1e-3 * GeV_K)), 'Neutrino decoupling', 'T ≈ 1 MeV, t ≈ 1 s. Relic neutrinos freeze out; nucleosynthesis follows within minutes.', 'exact');
  add(uOfLna(Math.log(bg.aEq)), 'Matter–radiation equality', `a = Ω_r/Ω_m = ${bg.aEq.toExponential(2)} (z ≈ ${Math.round(1 / bg.aEq - 1)}). Growth of structure begins in earnest.`, 'exact');
  add(uOfLna(Math.log(1 / 1091)), 'Recombination', 'z ≈ 1090. The CMB is released; its entropy is already 10⁸⁹ and will not change.', 'empirical');
  add(uOfLogT(logMid1 - 1.2), 'First black holes', 'First stars and stellar remnants, z ≈ 15–20. Gravitational entropy starts to grow.', 'model');
  add(uOfLna(Math.log(bg.aLambda)), 'Λ overtakes matter', `a = (Ω_m/Ω_Λ)^{1/3} = ${bg.aLambda.toFixed(3)}. Expansion starts to accelerate; the event horizon is set.`, 'exact');
  add(uOfLogT(bg.logTnow), 'Now', `t₀ = ${fmt(Math.pow(10, bg.logTnow - 9), 4)} Gyr. Entropy budget measured here (Egan & Lineweaver 2010).`, 'empirical');
  add(uOfLogT(14), 'Last stars', 't ≈ 10¹⁴ yr. Star formation ends; the stelliferous era closes.', 'model');
  add(uOfLogT(pops[0].logTev), 'Stellar holes evaporate', `t_evap(${Math.pow(10, p.logMstellar).toFixed(0)} M☉) = ${fmtPow(pops[0].logTev)} yr by Hawking's formula t ∝ M³.`, 'exact');
  add(uOfLogT(pops[1].logTev), 'Supermassive holes evaporate', `t_evap(10^${p.logMsmbh} M☉) = ${fmtPow(pops[1].logTev)} yr. Their entropy returns as radiation, ×${p.hawkingFactor}.`, 'exact');
  TH.push({ u: 1, label: 'Crossover (CCC)', note: 'Only massless fields remain; no clocks, no rulers. Penrose identifies this conformal boundary with the next Big Bang.', kind: 'hypothesis' });

  const clocks = {
    logt: { label: 'log₁₀ t  (cosmic time, decades)', short: 'log t', values: logT, unit: 'log₁₀ yr',
      note: 'Each decade of cosmic time gets equal height. The historian\'s clock: nothing is squeezed out.' },
    eta: { label: 'η  (conformal time)', short: 'η', values: eta, unit: 'c/H₀',
      note: 'Conformal time is finite in both directions for this universe: η runs 0 → η_∞ = ' + bg.etaInf.toFixed(3) + ' c/H₀. The CCC gluing is done in this clock. The whole future after today is the top ' + Math.round(100 * (1 - bg.etaNow / bg.etaInf)) + '% of the height; every black hole evaporation sits in the last sliver.' },
    lna: { label: 'ln a  (e-folds of expansion)', short: 'ln a', values: lnaClip, unit: 'e-folds',
      note: 'Scale factor in e-folds. Under Λ the e-fold count explodes (10⁹⁰ e-folds by the black-hole era), so it is clipped at 120 here: everything after ~10¹² yr collapses onto the top. That collapse is the point: scale is what conformal geometry forgets.' },
    t: { label: 't  (cosmic time, linear, Gyr)', short: 't', values: tGyr.map((v) => Math.min(v, 200)), unit: 'Gyr',
      note: 'Linear proper time, clipped at 200 Gyr. All 13.8 Gyr of history so far is a thin band at the bottom; the eternal de Sitter future owns the rest.' },
  };

  const readout = (i) => [
    ['cosmic time', fmtTime(logT[i])],
    ['scale factor a', lna[i] > 200 ? `e^${fmtPow(Math.log10(lna[i]))}` : fmtPow(lna[i] / LN10)],
    ['conformal time η', `${eta[i].toFixed(4)} c/H₀ of ${bg.etaInf.toFixed(4)}`],
    ['CMB temperature', fmtK(logTK[i])],
    ['S total', fmtPow(logS[i], 'k_B')],
    ['S radiation', fmtPow(logSrad[i], 'k_B')],
    ['S black holes', fmtPow(logSbhArr[i], 'k_B')],
    ['S Hawking radiation', fmtPow(logShawk[i], 'k_B')],
    ['gravitational fraction', (100 * psi[i]).toFixed(1) + '%'],
    ['headroom to de Sitter bound', fmtPow(bg.logSdS - logS[i]) + '×'],
  ];

  return {
    id: 'cosmos',
    title: 'One aeon: ΛCDM with its entropy budget',
    n: N, u,
    S: logS, Slabel: 'log₁₀ S/k_B', Sunit: 'decades', sTurnDefault: 5, sTurnRange: [1, 20],
    clocks, defaultClock: 'logt',
    psi, psiLabel: 'gravitational share of entropy  S_BH / S',
    chi, chiLabel: 'entropy production  d log S / d log t',
    thresholds: TH,
    ceiling: { S: bg.logSdS, label: 'de Sitter bound ' + fmtPow(bg.logSdS) },
    floor: { S: p.logSrad, label: 'relic radiation ' + fmtPow(p.logSrad) },
    extras: { logT, lna, eta, logTK, logSrad, logSbh: logSbhArr, logShawk, tGyr },
    bg, params: p, readout,
    ledger: [
      ['FLRW background a(t), η(a), T(a)', 'exact', 'Friedmann equation integrated numerically for flat ΛCDM with the parameters shown; conformal time converges to a finite η_∞ because of Λ.'],
      ['de Sitter entropy bound', 'exact', `S = πc⁵/(ħGH_∞²) = ${fmtPow(bg.logSdS)} k_B, T_dS = ${bg.TdS.toExponential(2)} K. This is Penrose's 10¹²³.`],
      ['Entropy budget today', 'empirical', 'Egan & Lineweaver 2010 (event-horizon volume): black holes 3×10¹⁰⁴, photons 2×10⁸⁹, neutrinos 2×10⁸⁹, stars 10⁷⁹.'],
      ['Radiation entropy constant in time', 'exact', 'Adiabatic expansion conserves comoving entropy, g_s T³a³ = const. The thermal spiral does not turn at all; every turn is gravitational.'],
      ['Black-hole entropy growth', 'model', 'Logistic in log t fitted to pass through today\'s value at cosmic noon, then a slow late rise to the chosen maximum.'],
      ['Black-hole evaporation', 'exact (formula) / model (population)', 'S(t) = S₀(1 − t/t_ev)^{2/3} from Hawking\'s dM/dt ∝ −M⁻², smeared over a log-normal mass spread.'],
      ['Hawking radiation entropy', 'model', 'Emitted entropy = 1.5 × hole entropy (Zurek 1982; Page 1983 gives 1.3–1.6 depending on species).'],
      ['Weyl curvature hypothesis', 'hypothesis', 'Gravitational entropy ≈ 0 at the Big Bang because the Weyl tensor vanishes there (Penrose 1979). Here it is the statement that S_BH starts at zero.'],
      ['CCC crossover', 'hypothesis', 'Future conformal infinity of this aeon is conformally identified with the Big Bang of the next (Penrose 2010). Applied by the lens layer.'],
    ],
  };
}
