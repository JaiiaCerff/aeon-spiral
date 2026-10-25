// Insight engine: reads the current configuration (source curve, clock, lens, cursor) and states what is
// rigorously true about it, which thresholds are near, which quantities are invariant, and what to try next.

import { fmt, fmtPow, deg, clamp } from './constants.js';
import { ISING_TC, FEIGENBAUM_RINF, PC_SITE_SQUARE } from './models.js';
import { LENSES } from './lenses.js';

const esc = (s) => String(s).replace(/</g, '&lt;');

function linearFit(xs, ys, i0, i1) {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (let i = i0; i <= i1; i++) { n++; sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; syy += ys[i] * ys[i]; }
  const den = n * sxx - sx * sx; if (Math.abs(den) < 1e-18 || n < 4) return null;
  const slope = (n * sxy - sx * sy) / den, icpt = (sy - slope * sx) / n;
  const ssTot = syy - (sy * sy) / n; let ssRes = 0;
  for (let i = i0; i <= i1; i++) { const r = ys[i] - (slope * xs[i] + icpt); ssRes += r * r; }
  return { slope, r2: ssTot > 0 ? 1 - ssRes / ssTot : 1 };
}

export function buildInsights(st) {
  const { curve, lens, clockKey, heightMap, sTurn, h, theta, i, ctx, b, aeons } = st;
  const out = [];
  const clock = curve.clocks[clockKey];
  const cv = clock.values, n = curve.n;
  const add = (kind, title, body) => out.push({ kind, title, body });

  // 1. the cursor, in invariant terms
  const wd = b.windingDensity;
  add('invariant', 'At the cursor',
    `<b>${esc(clock.short)} = ${fmt(cv[i], 4)}</b>, ${esc(curve.Slabel)} = <b>${fmt(curve.S[i], 4)}</b>. ` +
    `Conformal bearing <b>β = ${deg(b.conf).toFixed(1)}°</b> (angle to the clock direction in the Mercator strip; the same for every conformal lens). ` +
    `Drawn angle on this surface: ${deg(b.geo).toFixed(1)}°${Math.abs(b.geo - b.conf) > 0.02 ? ' <span class="warn">— this lens is not conformal here, so the picture distorts the invariant.</span>' : ' — equal: this lens is conformal.'} ` +
    `Winding density ${fmt(wd, 3)} turns per unit height, i.e. dS/dh = ${fmt(wd * sTurn, 3)} ${esc(curve.Sunit)} per unit height.`);

  // 2. nearest threshold
  let best = null;
  for (const t of curve.thresholds) { const d = Math.abs(t.u - curve.u[i]); if (d < 0.03 && (!best || d < best.d)) best = { ...t, d }; }
  if (best) add('threshold', `Near: ${esc(best.label)} <span class="kind kind-${best.kind.split(' ')[0]}">${esc(best.kind)}</span>`, esc(best.note));

  // 3. scale-invariance / loxodrome test in a window around the cursor
  const w = Math.max(6, Math.floor(0.06 * n));
  const fitS = linearFit(cv, curve.S, Math.max(0, i - w), Math.min(n - 1, i + w));
  let Smin = Infinity, Smax = -Infinity; for (let k = 0; k < n; k++) { if (curve.S[k] < Smin) Smin = curve.S[k]; if (curve.S[k] > Smax) Smax = curve.S[k]; }
  const dSloc = Math.abs(curve.S[Math.min(n - 1, i + w)] - curve.S[Math.max(0, i - w)]);
  if (dSloc < 2e-3 * (Smax - Smin || 1)) {
    add('invariant', 'Height without turning', `Entropy is constant along this stretch (ΔS = ${fmt(dSloc, 2)} ${esc(curve.Sunit)} over the window). The clock advances but nothing irreversible happens: time passes without an arrow. ` +
      (curve.id === 'cosmos' ? 'The universe is expanding adiabatically: scale changes, entropy does not. Only when gravity clumps matter into black holes does the spiral begin to turn.' : curve.id === 'logistic' ? 'The orbit is periodic here; no information is being lost.' : ''));
  } else if (fitS) {
    const straight = fitS.r2 > 0.995;
    let msg = `Locally S ≈ ${fmt(fitS.slope, 3)} · ${esc(clock.short)} + const (R² = ${fitS.r2.toFixed(3)}). `;
    if (straight) {
      msg += `<b>Constant bearing: a loxodrome.</b> In the Mercator strip this stretch is a straight line; on the conformal sphere it winds at a fixed angle to the meridians. `;
      if (clockKey === 'lna' || clockKey === 'lnInvT') msg += `A fixed entropy gain per e-fold means the accessible phase-space volume grows as a power law, V ∝ a^${fmt(fitS.slope / (curve.id === 'cosmos' ? Math.LOG10E : 1), 3)}: scale-free dynamics. Conformal rescaling (Penrose's Ω) maps this stretch onto itself.`;
      else if (clockKey === 'logt') msg += `Entropy ∝ log t: a power law S ∝ t^${fmt(fitS.slope, 3)} in linear time, so there is no preferred scale in this era.`;
      else msg += `No preferred scale along this stretch: rescaling the clock just translates the curve.`;
    } else {
      msg += `Bearing is changing: the entropy law has a scale here. ${curve.chi[i] > 0 ? `Production rate ${esc(curve.chiLabel)} = ${fmt(curve.chi[i], 3)}.` : ''}`;
    }
    add(straight ? 'invariant' : 'idea', straight ? 'Scale-free stretch' : 'A scale is set here', msg);
  }

  // 4. source-specific rigour
  if (curve.id === 'cosmos') {
    const ex = curve.extras, bg = curve.bg;
    const gravShare = curve.psi[i];
    add('physics', 'Where the turning comes from',
      `Relic radiation holds ${fmtPow(ex.logSrad[i])} k_B and does not change: adiabatic expansion conserves comoving entropy. Every turn of this spiral is gravitational, ` +
      `black holes carry ${(100 * gravShare).toFixed(1)}% of the total here. This is Penrose's point: the early universe was in thermal equilibrium yet had low entropy, because the gravitational field was unexcited (Weyl curvature ≈ 0).`);
    const head = bg.logSdS - curve.S[i];
    add('physics', 'Headroom under the de Sitter ceiling',
      `The event horizon of this universe can hold at most ${fmtPow(bg.logSdS)} k_B. The spiral is ${fmtPow(head)} times below it, so the second law has ${fmt(head, 3)} decades of room; the ring at the top of the surface marks the ceiling. ` +
      `Penrose's specialness measure for a Big Bang state is the phase-space fraction e^{S₀−S_max} ≈ 10^(−10^${fmt(Math.log10(Math.pow(10, bg.logSdS) * Math.LOG10E), 3)}), which is the famous one part in 10^(10^123).`);
    if (clockKey === 'eta') add('ccc', 'The conformal clock', `η is finite: ${bg.etaInf.toFixed(3)} c/H₀ for the whole aeon, ${(100 * (1 - bg.etaNow / bg.etaInf)).toFixed(1)}% of it still ahead of us. Every black-hole evaporation happens inside the top sliver, which is why CCC can treat the remote future as a smooth boundary surface: in the clock massless fields see, it is close.`);
    if (clockKey === 'lna') add('ccc', 'Scale explodes, conformal geometry does not', `Under Λ the scale factor grows as e^{H t}, so by the black-hole era there have been ~10^90 e-folds. The clipped top of this surface holds all of it. The conformal structure (angles, light cones) is unchanged by any of that growth: a universe of massless particles cannot tell the difference, and that is what lets CCC glue the top pole to a new bottom pole.`);
    if (curve.psi[i] < 0.02 && curve.u[i] > 0.8) add('ccc', 'Conformally like the beginning', `Gravitational share has fallen to ${(100 * curve.psi[i]).toFixed(2)}%: black holes have evaporated and only radiation remains, as at the start. The two poles of the sphere are the same kind of state, radiation with vanishing Weyl curvature, distinguished only by scale. That is the sense in which the end is indistinguishable from the beginning except by level.`);
  }
  if (curve.id === 'ising') {
    const T = curve.extras.T[i];
    if (clockKey === 'lnInvT') add('physics', 'Winding density is the heat capacity', `dS/d ln(1/T) = −T dS/dT = −C. The spiral tightens exactly as the heat capacity grows, and at T_c = ${ISING_TC.toFixed(4)} it winds infinitely tightly in an infinitesimal band: C ~ −ln|T−T_c| (α = 0). Here C = ${fmt(curve.chi[i], 3)} k_B per spin at T = ${fmt(T, 4)}.`);
    add('physics', 'A subsystem, not a universe', `The spin system's entropy falls as it is cooled: ${fmt(curve.S[i], 4)} of ln 2 = 0.693 remains. Clausius demands the bath gains at least as much. The universe has no bath, so its thermal entropy is conserved under expansion and the universe's spiral turns only through gravity. Compare with the aeon source.`);
    if (Math.abs(T - ISING_TC) < 0.15) add('threshold', 'Critical region', `Correlation length ξ ~ |T−T_c|^{−1} is comparable to the lattice; fluctuations at every scale. Scale invariance here is the conformal symmetry of the critical point, the same mathematics that CCC applies at the aeon boundary. Watch the live lattice.`);
  }
  if (curve.id === 'logistic' && clockKey === 'r') {
    const r = curve.extras.r[i], lam = curve.extras.lam[i];
    add('physics', lam > 0 ? 'An arrow of time is on' : 'No arrow of time', lam > 0
      ? `λ = ${fmt(lam, 4)} > 0: nearby states separate exponentially and the map produces ${fmt(lam / Math.LN2, 3)} bits per iteration (Pesin: h_KS = λ⁺). The past is being forgotten, so entropy of any coarse-grained description grows. Reversible rule, irreversible behaviour.`
      : `λ = ${fmt(lam, 4)} ≤ 0 at r = ${fmt(r, 4)}: the orbit is periodic; information is preserved and no coarse-grained entropy is produced. The height still advances (r grows) but the spiral does not turn: time passes without an arrow.`);
    if (Math.abs(r - FEIGENBAUM_RINF) < 0.02) add('threshold', 'Feigenbaum point', `r_∞ = 3.5699456… Period doublings accumulate with ratio δ = 4.669; here the KS entropy switches on continuously from zero. The arrow of time of this system is born at a critical point.`);
  }
  if (curve.id === 'kuramoto') {
    const K = curve.extras.K[i], Kc = curve.extras.Kc, r = curve.extras.r[i], rx = curve.extras.rEx[i];
    add('physics', K < Kc ? 'No shared clock yet' : 'A collective clock exists', K < Kc
      ? `K/K_c = ${fmt(K / Kc, 3)}. Each oscillator keeps its own time; the mean field r ≈ ${fmt(r, 3)} is noise of order 1/√N = ${fmt(1 / Math.sqrt(400), 3)}. There is no collective phase to call "now".`
      : `K/K_c = ${fmt(K / Kc, 3)}; r = ${fmt(r, 3)} measured against √(1−K_c/K) = ${fmt(rx, 3)} exact. The order parameter's phase ψ(t) advances at the mean frequency: an emergent clock shared by the locked fraction. Time as a coordinate exists only above the threshold.`);
    if (Math.abs(K - Kc) < 0.3) add('threshold', 'Critical slowing down', `Relaxation time ~ 2/(K−K_c) diverges at K_c, so the ramped simulation lags the exact curve (measured r − exact = ${fmt(r - rx, 3)}). The susceptibility N·Var(r) peaks here.`);
  }
  if (curve.id === 'percolation') {
    const p = curve.extras.pp[i], L = curve.extras.L;
    add('physics', p < PC_SITE_SQUARE ? 'Only local structure' : 'A global structure exists', p < PC_SITE_SQUARE
      ? `p = ${fmt(p, 3)} < p_c = ${PC_SITE_SQUARE}: all clusters are finite, correlation length ξ ~ |p−p_c|^{−4/3} ≈ ${fmt(Math.pow(Math.abs(p - PC_SITE_SQUARE), -4 / 3), 3)} sites. No path crosses the system.`
      : `p = ${fmt(p, 3)} ≥ p_c: a cluster of fraction ${fmt(curve.psi[i], 3)} spans the lattice and the membership entropy collapses as it swallows the rest. Global connectivity is an emergent, all-or-nothing property, like a causal structure appearing.`);
    add('idea', 'Finite-size shift', `On ${L}×${L} the apparent threshold moves by ~L^{−1/ν} = L^{−3/4} = ${fmt(Math.pow(L, -0.75), 3)}; the measured χ peak is listed among the thresholds for comparison with the exact p_c.`);
  }

  // 5. lens statements
  const L = LENSES[lens];
  add('lens', L.label, esc(L.note));
  if (lens === 'sphere' && heightMap === 'linear') add('warning', 'Linear latitude distorts angles', 'The sphere is conformal to the strip only under the Mercator map. Switch the height map to Mercator to make the drawn bearing equal the invariant one; with a Mercator sphere a constant-bearing stretch is a true loxodrome.');
  if (lens === 'torus') {
    const mism = ((theta[n - 1] - theta[0]) / (2 * Math.PI));
    const frac = mism - Math.round(mism);
    add('ccc', 'The seam', `Closing time into a circle demands S_end ≡ S_start. The curve has advanced ${fmt(mism, 3)} turns (ΔS = ${fmt(curve.S[n - 1] - curve.S[0], 4)} ${esc(curve.Sunit)}); the gap at the seam is ${fmt(Math.abs(frac), 3)} of a turn, and even a perfect match would only hide, not undo, the ${fmt(Math.abs(mism), 2)} turns of entropy produced. A strict cycle needs the second law to run backwards somewhere. CCC avoids this by letting the level change.`);
  }
  if ((lens === 'pearls' || lens === 'helicoid') && aeons && aeons.length > 1) {
    const tot = aeons.reduce((a, A) => a + A.windings, 0), dropped = aeons.reduce((a, A) => a + A.drop, 0);
    add('ccc', `${aeons.length} aeons, rule: ${esc(ctx.rule)}`, ctx.rule === 'conserve'
      ? `Entropy phase carries straight across each crossover: after ${aeons.length} aeons the curve has wound ${fmt(tot, 2)} turns in total. Every aeon casts the same shadow on the floor (same conformal history) but each starts one level higher. The second law is a covering-space statement: the level, not the position, is monotone.`
      : `At each crossover ${Math.round(100 * (ctx.lossFraction ?? 1))}% of the aeon's entropy gain (${fmt(aeons[0].drop, 2)} turns) is discounted, Penrose's claim that information lost into black holes shrinks the phase space so the new aeon's entropy is measured against a new maximum. Net climb across ${aeons.length} aeons: ${fmt(tot - dropped, 2)} turns. On the helicoid this is a vertical drop at the axis; on the chain it is the same spiral restarting. Set the loss to 0 to see the strictly conserving alternative.`);
  }
  if (lens === 'plane') add('ccc', 'Zoom is the conformal factor', `The Zoom slider multiplies every radius by Ω. If the curve looks the same after zooming, the entropy law on that stretch is scale-free (a logarithmic spiral). CCC asserts the physics at the end of an aeon is scale-free in this sense: only angles survive, and Ω can be swapped for 1/Ω across the boundary without any massless field noticing.`);

  // 6. configuration-driven suggestions
  const ideas = [];
  if (curve.id === 'cosmos' && clockKey !== 'eta') ideas.push('switch the clock to η to see the whole black-hole future compressed into the top sliver, the view CCC takes');
  if (curve.id === 'cosmos' && lens !== 'pearls') ideas.push('switch to the CCC chain with 3 aeons and compare the rules conserve / reset in the orthographic top view: identical shadows, different levels');
  if (curve.id !== 'ising') ideas.push('load the Ising source with clock ln(1/T): the spiral\'s tightness becomes the heat capacity and the critical point is where it winds infinitely fast');
  if (curve.id !== 'logistic') ideas.push('load the logistic map: entropy production switches on at a critical point, and before it there is height without turning: time without an arrow');
  if (heightMap !== 'mercator' && (lens === 'sphere' || lens === 'pearls')) ideas.push('set the height map to Mercator so that drawn angles equal the conformal invariant');
  if (ideas.length) add('idea', 'Try next', ideas.slice(0, 3).map((s) => `• ${esc(s)}`).join('<br>'));
  return out;
}
