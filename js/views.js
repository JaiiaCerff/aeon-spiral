// 2D views: the unrolled strip (the data as it is, before any lens) and the model view (what the source is doing).

import { fmt, fmtPow, clamp, LN10 } from './constants.js';
import { percolationLabels } from './models.js';

export function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function hexToRgb(hex) { const h = hex.replace('#', ''); const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
export function makeColorScale() {
  const lo = hexToRgb(cssVar('--seq-lo') || '#c9d2f5'), hi = hexToRgb(cssVar('--seq-hi') || '#1f2a7a');
  return (t) => { t = clamp(t, 0, 1); const g = Math.pow(t, 0.85); return [lo[0] + (hi[0] - lo[0]) * g, lo[1] + (hi[1] - lo[1]) * g, lo[2] + (hi[2] - lo[2]) * g]; };
}
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

function prep(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth, hgt = canvas.clientHeight;
  if (canvas.width !== (w * dpr) | 0 || canvas.height !== (hgt * dpr) | 0) { canvas.width = (w * dpr) | 0; canvas.height = (hgt * dpr) | 0; }
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, hgt);
  return { ctx, w, h: hgt };
}
const font = (sz, mono = false) => `${sz}px ${mono ? cssVar('--font-mono') || 'ui-monospace, monospace' : cssVar('--font-ui') || 'system-ui, sans-serif'}`;

// ---------- unrolled strip: x = entropy phase in turns, y = clock height ----------
export function drawUnrolled(canvas, st, scale) {
  const { ctx, w, h } = prep(canvas);
  const { curve, h: hh, theta, i, aeons, lens, ctxLens } = st;
  const fg = cssVar('--fg'), muted = cssVar('--muted'), grid = cssVar('--grid'), accent = cssVar('--accent');
  const padL = 44, padR = 12, padT = 18, padB = 26;
  const W = w - padL - padR, H = h - padT - padB;
  const nA = aeons.length;
  let tmin = Infinity, tmax = -Infinity;
  for (const A of aeons) for (let k = 0; k < A.theta.length; k++) { const v = A.theta[k] / (2 * Math.PI); if (v < tmin) tmin = v; if (v > tmax) tmax = v; }
  if (tmax - tmin < 1e-9) { tmin -= 0.5; tmax += 0.5; }
  // include the entropy ceiling (e.g. the de Sitter bound) when it is within reach of the data
  let ceilX = null;
  if (st.ceilingTurns != null && isFinite(st.ceilingTurns) && Math.abs(st.ceilingTurns) < 3 * (tmax - tmin) + 2) { ceilX = st.ceilingTurns; tmin = Math.min(tmin, ceilX); tmax = Math.max(tmax, ceilX); }
  const span = tmax - tmin, m = 0.04 * span;
  const X = (turns) => padL + ((turns - (tmin - m)) / (span + 2 * m)) * W;
  const Y = (hv, k) => padT + H - ((k + hv) / nA) * H;
  // frame & grid
  ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.fillStyle = muted; ctx.font = font(10, true); ctx.textAlign = 'center';
  const step = span > 20 ? 5 : span > 8 ? 2 : span > 3 ? 1 : span > 1 ? 0.5 : 0.1;
  for (let t = Math.ceil((tmin - m) / step) * step; t <= tmax + m; t += step) { const x = X(t); ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + H); ctx.stroke(); ctx.fillText(fmt(t, 3), x, h - 10); }
  ctx.textAlign = 'right';
  for (let k = 0; k < nA; k++) for (let q = 0; q <= 4; q++) { if (k > 0 && q === 0) continue; const y = Y(q / 4, k); ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + W, y); ctx.stroke(); ctx.fillText((q / 4).toFixed(2), padL - 6, y + 3); }
  // aeon boundaries
  for (let k = 1; k < nA; k++) { const y = Y(0, k); ctx.setLineDash([4, 4]); ctx.strokeStyle = accent; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + W, y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = accent; ctx.textAlign = 'left'; ctx.fillText('crossover', padL + 4, y - 4); }
  if (ceilX != null) {
    const x = X(ceilX); ctx.setLineDash([3, 3]); ctx.strokeStyle = accent; ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + H); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = accent; ctx.font = font(10); ctx.textAlign = 'right'; ctx.fillText(st.ceilingLabel || 'ceiling', x - 4, padT + 12);
  }
  // thresholds
  ctx.font = font(10); ctx.textAlign = 'left';
  const placed = [];
  const thSorted = curve.thresholds.map((t) => { const j = Math.min(curve.n - 1, Math.round(t.u * (curve.n - 1))); return { t, y: Y(hh[j], 0) }; }).sort((a, b) => b.y - a.y);
  for (const { t, y } of thSorted) {
    ctx.strokeStyle = accent; ctx.globalAlpha = 0.55; ctx.setLineDash(t.kind.startsWith('hyp') ? [2, 3] : []);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + W, y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    if (placed.some((py) => Math.abs(py - y) < 11)) continue; // skip a label that would overprint a neighbour
    placed.push(y);
    const txt = t.label.length > 34 ? t.label.slice(0, 32) + '…' : t.label;
    ctx.fillStyle = muted; ctx.fillText(txt, padL + W - 4 - ctx.measureText(txt).width, y - 3);
  }
  // curve(s)
  ctx.lineWidth = 2; ctx.lineJoin = 'round';
  for (const A of aeons) {
    for (let k = 1; k < A.theta.length; k++) {
      ctx.strokeStyle = rgb(scale(curve.psi[k]));
      ctx.beginPath(); ctx.moveTo(X(A.theta[k - 1] / (2 * Math.PI)), Y(hh[k - 1], A.k)); ctx.lineTo(X(A.theta[k] / (2 * Math.PI)), Y(hh[k], A.k)); ctx.stroke();
    }
    if (A.drop && A.k < nA - 1) { // reset drop between aeons
      const x0 = X(A.theta[A.theta.length - 1] / (2 * Math.PI)), x1 = X((A.theta[A.theta.length - 1] - 2 * Math.PI * A.drop) / (2 * Math.PI)), y = Y(1, A.k);
      ctx.strokeStyle = accent; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  // cursor
  const cx = X(aeons[0].theta[i] / (2 * Math.PI)), cy = Y(hh[i], 0);
  ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, 2 * Math.PI); ctx.fill();
  ctx.strokeStyle = cssVar('--bg'); ctx.lineWidth = 1.5; ctx.stroke();
  // axis titles
  ctx.fillStyle = muted; ctx.font = font(10); ctx.textAlign = 'left';
  ctx.fillText('entropy phase, turns  →   (' + curve.Slabel + ' / ' + fmt(st.sTurn, 3) + ' per turn)', padL, 11);
  ctx.save(); ctx.translate(11, padT + H / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('clock height h  (' + curve.clocks[st.clockKey].short + ')', 0, 0); ctx.restore();
}

// ---------- model view ----------
export function drawModel(canvas, st, scale, live) {
  const { curve, i } = st;
  switch (curve.id) {
    case 'cosmos': return drawCosmosStack(canvas, curve, i, scale);
    case 'ising': return drawIsing(canvas, curve, i, live);
    case 'logistic': return curve.extras.hist ? drawHistogram(canvas, curve, i, scale) : drawBifurcation(canvas, curve, i, scale);
    case 'kuramoto': return drawKuramoto(canvas, curve, i, scale);
    case 'percolation': return drawPercolation(canvas, curve, i, scale);
    default: return drawCustom(canvas, curve, i, scale);
  }
}

function axes(ctx, w, h, pad, xl, yl) {
  const muted = cssVar('--muted'), grid = cssVar('--grid');
  ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, h - pad.b); ctx.lineTo(w - pad.r, h - pad.b); ctx.stroke();
  ctx.fillStyle = muted; ctx.font = font(10); ctx.textAlign = 'right'; ctx.fillText(xl, w - pad.r, h - 6);
  ctx.save(); ctx.translate(11, pad.t); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'right'; ctx.fillText(yl, 0, 0); ctx.restore();
}

function drawCosmosStack(canvas, curve, i, scale) {
  const { ctx, w, h } = prep(canvas); const pad = { l: 46, r: 10, t: 16, b: 26 };
  const ex = curve.extras, n = curve.n, lo = 86, hi = curve.bg.logSdS + 2;
  const X = (k) => pad.l + (k / (n - 1)) * (w - pad.l - pad.r), Y = (v) => pad.t + (1 - (clamp(v, lo, hi) - lo) / (hi - lo)) * (h - pad.t - pad.b);
  axes(ctx, w, h, pad, 'log₁₀ t  (yr)', 'log₁₀ S / k_B');
  const muted = cssVar('--muted'), grid = cssVar('--grid'), accent = cssVar('--accent');
  ctx.font = font(10, true); ctx.fillStyle = muted; ctx.textAlign = 'right';
  for (let v = 90; v <= 120; v += 10) { ctx.fillText(String(v), pad.l - 5, Y(v) + 3); ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(w - pad.r, Y(v)); ctx.stroke(); }
  ctx.textAlign = 'center'; for (let lt = -40; lt <= 100; lt += 20) { const k = ((lt - ex.logT[0]) / (ex.logT[n - 1] - ex.logT[0])) * (n - 1); if (k >= 0 && k <= n - 1) ctx.fillText(String(lt), X(k), h - pad.b + 13); }
  // ceiling
  ctx.setLineDash([3, 3]); ctx.strokeStyle = accent; ctx.beginPath(); ctx.moveTo(pad.l, Y(curve.bg.logSdS)); ctx.lineTo(w - pad.r, Y(curve.bg.logSdS)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = accent; ctx.textAlign = 'left'; ctx.font = font(10); ctx.fillText('de Sitter bound', pad.l + 4, Y(curve.bg.logSdS) - 4);
  const series = [[ex.logSrad, 'radiation', 0.25], [ex.logSbh, 'black holes', 0.6], [ex.logShawk, 'Hawking radiation', 0.9], [curve.S, 'total', 1]];
  for (const [arr, label, t] of series) {
    ctx.strokeStyle = rgb(scale(t)); ctx.lineWidth = label === 'total' ? 2.2 : 1.4; ctx.beginPath(); let started = false;
    for (let k = 0; k < n; k++) { const v = arr[k]; if (!isFinite(v) || v < lo) { started = false; continue; } if (!started) { ctx.moveTo(X(k), Y(v)); started = true; } else ctx.lineTo(X(k), Y(v)); }
    ctx.stroke();
  }
  // legend (direct labels at right end)
  ctx.font = font(10); ctx.textAlign = 'left'; ctx.fillStyle = muted;
  let ly = pad.t + 2; for (const [, label, t] of series) { ctx.fillStyle = rgb(scale(t)); ctx.fillRect(w - pad.r - 118, ly, 10, 3); ctx.fillStyle = muted; ctx.fillText(label, w - pad.r - 104, ly + 4); ly += 13; }
  // cursor
  ctx.strokeStyle = cssVar('--fg'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(i), pad.t); ctx.lineTo(X(i), h - pad.b); ctx.stroke();
  ctx.fillStyle = cssVar('--fg'); ctx.beginPath(); ctx.arc(X(i), Y(curve.S[i]), 4, 0, 2 * Math.PI); ctx.fill();
}

function drawIsing(canvas, curve, i, live) {
  const { ctx, w, h } = prep(canvas);
  if (!live) return;
  const L = live.L, cell = Math.floor(Math.min(w - 150, h - 8) / L), ox = 6, oy = Math.floor((h - cell * L) / 2);
  const up = rgb(hexToRgb(cssVar('--seq-hi') || '#1f2a7a')), down = rgb(hexToRgb(cssVar('--seq-lo') || '#c9d2f5'));
  for (let a = 0; a < L; a++) for (let b = 0; b < L; b++) { ctx.fillStyle = live.s[a * L + b] > 0 ? up : down; ctx.fillRect(ox + b * cell, oy + a * cell, cell, cell); }
  const m = live.measure(), ex = curve.extras;
  const muted = cssVar('--muted'), fg = cssVar('--fg');
  ctx.font = font(11); ctx.fillStyle = fg; ctx.textAlign = 'left';
  const x0 = ox + cell * L + 12; let y = oy + 14;
  const row = (k, v) => { ctx.fillStyle = muted; ctx.fillText(k, x0, y); ctx.fillStyle = fg; ctx.font = font(11, true); ctx.fillText(v, x0, y + 14); ctx.font = font(11); y += 32; };
  row('Metropolis, 64×64', `T = ${fmt(live.T, 4)}`);
  row('|m| measured / exact', `${fmt(m.m, 3)} / ${fmt(ex.m[i], 3)}`);
  row('E per spin measured / exact', `${fmt(m.e, 3)} / ${fmt(ex.U[i], 3)}`);
  row('T − T_c', fmt(live.T - 2.269185, 3));
}

function drawBifurcation(canvas, curve, i, scale) {
  const { ctx, w, h } = prep(canvas); const pad = { l: 36, r: 8, t: 10, b: 24 };
  const r = curve.extras.r, n = curve.n, lam = curve.extras.lam;
  axes(ctx, w, h, pad, 'r', 'x');
  const X = (k) => pad.l + (k / (n - 1)) * (w - pad.l - pad.r), Y = (x) => pad.t + (1 - x) * (h - pad.t - pad.b);
  if (!curve.extras.bif) { // cache orbit samples
    const pts = []; for (let k = 0; k < n; k += 2) { let x = 0.5; for (let q = 0; q < 300; q++) x = r[k] * x * (1 - x); const arr = new Float32Array(120); for (let q = 0; q < 120; q++) { x = r[k] * x * (1 - x); arr[q] = x; } pts.push([k, arr]); } curve.extras.bif = pts;
  }
  for (const [k, arr] of curve.extras.bif) { ctx.fillStyle = rgb(scale(clamp(lam[k] / Math.LN2, 0, 1)), 0.55); for (let q = 0; q < arr.length; q++) ctx.fillRect(X(k), Y(arr[q]), 1.2, 1.2); }
  const muted = cssVar('--muted'); ctx.fillStyle = muted; ctx.font = font(10, true); ctx.textAlign = 'center';
  for (let rv = 2.8; rv <= 4.001; rv += 0.2) { const k = ((rv - r[0]) / (r[n - 1] - r[0])) * (n - 1); if (k >= 0 && k <= n - 1) ctx.fillText(rv.toFixed(1), X(k), h - pad.b + 13); }
  ctx.strokeStyle = cssVar('--fg'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(i), pad.t); ctx.lineTo(X(i), h - pad.b); ctx.stroke();
  ctx.fillStyle = muted; ctx.textAlign = 'left'; ctx.font = font(10); ctx.fillText(`λ = ${fmt(lam[i], 4)}   (colour: λ⁺/ln2)`, pad.l + 6, pad.t + 12);
}

function drawHistogram(canvas, curve, i, scale) {
  const { ctx, w, h } = prep(canvas); const pad = { l: 36, r: 8, t: 10, b: 24 };
  const hist = curve.extras.hist[i], bins = hist.length; let mx = 0; for (let b = 0; b < bins; b++) mx = Math.max(mx, hist[b]);
  axes(ctx, w, h, pad, 'x (128 cells)', 'count');
  const bw = (w - pad.l - pad.r) / bins;
  for (let b = 0; b < bins; b++) { const v = hist[b] / mx; ctx.fillStyle = rgb(scale(0.35 + 0.6 * v)); const bh = v * (h - pad.t - pad.b); ctx.fillRect(pad.l + b * bw, h - pad.b - bh, Math.max(1, bw - 1), bh); }
  ctx.fillStyle = cssVar('--muted'); ctx.font = font(10); ctx.textAlign = 'left';
  ctx.fillText(`n = ${i}   S = ${fmt(curve.S[i], 3)} nats   r = ${curve.extras.r}   λ = ${fmt(curve.extras.lambda, 3)}`, pad.l + 6, pad.t + 12);
}

function drawKuramoto(canvas, curve, i, scale) {
  const { ctx, w, h } = prep(canvas);
  const th = curve.extras.snaps[i], om = curve.extras.om, N = th.length, R = Math.min(w, h) * 0.4, cx = R + 16, cy = h / 2;
  const muted = cssVar('--muted'), fg = cssVar('--fg'), grid = cssVar('--grid'), accent = cssVar('--accent');
  ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke();
  let sx = 0, sy = 0;
  for (let k = 0; k < N; k++) { const t = clamp(0.5 + Math.atan(om[k] / 1.5) / Math.PI, 0, 1); ctx.fillStyle = rgb(scale(t), 0.8); const x = cx + R * Math.cos(th[k]), y = cy + R * Math.sin(th[k]); ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 2 * Math.PI); ctx.fill(); sx += Math.cos(th[k]); sy += Math.sin(th[k]); }
  const r = Math.hypot(sx, sy) / N, ps = Math.atan2(sy, sx);
  ctx.strokeStyle = accent; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * r * Math.cos(ps), cy + R * r * Math.sin(ps)); ctx.stroke();
  ctx.fillStyle = fg; ctx.font = font(11); ctx.textAlign = 'left'; const x0 = cx + R + 18; let y = cy - 40;
  const row = (k, v) => { ctx.fillStyle = muted; ctx.fillText(k, x0, y); ctx.fillStyle = fg; ctx.font = font(11, true); ctx.fillText(v, x0, y + 14); ctx.font = font(11); y += 32; };
  row('coupling K / K_c', `${fmt(curve.extras.K[i], 3)} / ${fmt(curve.extras.Kc, 2)}`);
  row('order parameter r (snapshot / exact)', `${fmt(r, 3)} / ${fmt(curve.extras.rEx[i], 3)}`);
  row('mean-field phase ψ', `${fmt(ps, 3)} rad`);
  ctx.fillStyle = muted; ctx.font = font(10); ctx.fillText('colour: natural frequency ω (Lorentzian, γ = 0.5)', x0, y);
}

function drawPercolation(canvas, curve, i, scale) {
  const { ctx, w, h } = prep(canvas);
  if (!curve.extras._labCache || curve.extras._labCache.i !== i) curve.extras._labCache = { i, lab: percolationLabels(curve, i) };
  const lab = curve.extras._labCache.lab, L = curve.extras.L, cell = Math.max(1, Math.floor(Math.min(w - 150, h - 8) / L)), ox = 6, oy = Math.floor((h - cell * L) / 2);
  const big = rgb(scale(1)), small = rgb(scale(0.35)), fg = cssVar('--fg'), muted = cssVar('--muted');
  for (let a = 0; a < L; a++) for (let b = 0; b < L; b++) { const v = lab[a * L + b]; if (!v) continue; ctx.fillStyle = v === 2 ? big : small; ctx.fillRect(ox + b * cell, oy + a * cell, cell, cell); }
  ctx.font = font(11); const x0 = ox + cell * L + 12; let y = oy + 14;
  const row = (k, v) => { ctx.fillStyle = muted; ctx.fillText(k, x0, y); ctx.fillStyle = fg; ctx.font = font(11, true); ctx.fillText(v, x0, y + 14); ctx.font = font(11); y += 32; };
  ctx.textAlign = 'left';
  row(`site percolation ${L}×${L}`, `p = ${fmt(curve.extras.pp[i], 4)}`);
  row('largest cluster (dark)', fmt(curve.psi[i], 4));
  row('spans', curve.extras.span[i] ? 'yes' : 'no');
  row('p − p_c', fmt(curve.extras.pp[i] - 0.59274605, 4));
}

function drawCustom(canvas, curve, i, scale) {
  const { ctx, w, h } = prep(canvas); const pad = { l: 40, r: 8, t: 10, b: 24 };
  axes(ctx, w, h, pad, 'τ', 'S');
  let lo = Infinity, hi = -Infinity; for (let k = 0; k < curve.n; k++) { lo = Math.min(lo, curve.S[k]); hi = Math.max(hi, curve.S[k]); } if (hi - lo < 1e-9) hi = lo + 1;
  const X = (k) => pad.l + (k / (curve.n - 1)) * (w - pad.l - pad.r), Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);
  ctx.lineWidth = 2; for (let k = 1; k < curve.n; k++) { ctx.strokeStyle = rgb(scale(curve.psi[k])); ctx.beginPath(); ctx.moveTo(X(k - 1), Y(curve.S[k - 1])); ctx.lineTo(X(k), Y(curve.S[k])); ctx.stroke(); }
  ctx.strokeStyle = cssVar('--fg'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(i), pad.t); ctx.lineTo(X(i), h - pad.b); ctx.stroke();
  if (curve.error) { ctx.fillStyle = cssVar('--accent'); ctx.font = font(11); ctx.textAlign = 'left'; ctx.fillText('expression error: ' + curve.error, pad.l + 6, pad.t + 14); }
}
