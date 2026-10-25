// Topology lenses: how the abstract (clock, entropy-phase) data is embedded in 3-space.
//
// The data of an aeon is a curve (h, θ): h ∈ [0,1] is the chosen clock, normalised; θ is the entropy phase,
// θ = 2π (S − S₀)/S_turn. A lens is a map (h, θ) → ℝ³ together with an identification rule at the ends.
// Conformal lenses (sphere with Mercator latitude, cylinder, plane, helicoid) preserve the angle between the
// curve and the clock direction; that angle (the bearing) is the invariant content shared by all clocks.

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { clamp } from './constants.js';

export const LENSES = {
  sphere: { label: 'Sphere', note: 'Both ends of the aeon are compactified to points: the Big Bang is the south pole, conformal infinity the north pole. With the Mercator latitude map this is the stereographic image of the (clock, phase) strip, so angles are preserved and a constant-bearing spiral is a loxodrome.' },
  cylinder: { label: 'Cylinder (Mercator strip)', note: 'The strip itself, rolled up. Height is the clock, azimuth is entropy phase. Conformal: the curve\'s bearing here is the invariant. The poles are at ±∞ and never reached, which is why the sphere has to compactify them.' },
  pearls: { label: 'CCC chain of aeons', note: 'Penrose\'s conformal cyclic cosmology: the north pole of one aeon is glued to the south pole of the next. Scale (the conformal factor Ω) jumps from ∞ to 0 across the junction while the conformal structure continues. All aeons cast the same shadow on the floor; they differ only in level.' },
  torus: { label: 'Torus (strict eternal return)', note: 'The clock itself is made periodic: the end of time is identified with its beginning at the same scale. The curve closes only if the entropy phase returns to its starting value, so the second law shows up as a seam. This is the identification CCC rejects.' },
  plane: { label: 'Conformal plane (stereographic)', note: 'The Riemann sphere flattened: Big Bang at the origin, conformal infinity at radius ∞, radius = e^(Mercator clock). Penrose\'s conformal rescaling is literally a zoom here; a scale-free entropy law is a logarithmic spiral that looks the same at every zoom.' },
  helicoid: { label: 'Helicoid (entropy as level)', note: 'The covering space: entropy phase is unwrapped into height, so each full turn of entropy lifts one storey, while the radius is the clock (axis = Big Bang, rim = conformal infinity). Same floor position, higher level: the second law is the climb, and a CCC reset is a drop at the axis.' },
};

export const HEIGHT_MAPS = {
  linear: { label: 'linear in latitude', note: 'Latitude ∝ clock. Simple, but not conformal on the sphere: angles on the surface differ from the strip\'s.' },
  mercator: { label: 'Mercator (conformal)', note: 'Latitude = gd(y), the inverse Mercator map of the clock y. The sphere is then the stereographic image of the strip and angles are preserved.' },
};

// normalised clock values → h in [0,1] (monotone if the clock is)
export function computeHeights(curve, clockKey, opts = {}) {
  const v = curve.clocks[clockKey].values, n = v.length;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { if (v[i] < lo) lo = v[i]; if (v[i] > hi) hi = v[i]; }
  const span = hi - lo || 1, h = new Float64Array(n);
  for (let i = 0; i < n; i++) { const t = (v[i] - lo) / span; h[i] = opts.reverse ? 1 - t : t; }
  return h;
}
export function computeTheta(curve, sTurn, opts = {}) {
  const n = curve.n, th = new Float64Array(n), s0 = curve.S[0];
  for (let i = 0; i < n; i++) th[i] = (2 * Math.PI * (curve.S[i] - s0)) / sTurn * (opts.flip ? -1 : 1);
  return th;
}

// Mercator coordinate y of a height h: y ∈ [−Y, Y]
export const mercY = (h, Y) => Y * (2 * h - 1);
// latitude φ ∈ (−π/2, π/2) of a height h under a height map
export function latitude(h, ctx) {
  const eps = 0.012;
  if (ctx.heightMap === 'mercator') return 2 * Math.atan(Math.exp(mercY(h, ctx.Y))) - Math.PI / 2;
  return -Math.PI / 2 + Math.PI * clamp(h, eps / Math.PI, 1 - eps / Math.PI);
}
// conformal (stereographic) radius of a height: ρ = tan(π/4 + φ/2) = e^y for the Mercator map
export function confRadius(h, ctx) { return Math.tan(Math.PI / 4 + latitude(h, ctx) / 2); }

export function embedPoint(lens, h, theta, ctx, k = 0) {
  switch (lens) {
    case 'sphere': { const f = latitude(h, ctx), c = Math.cos(f); return [c * Math.cos(theta), Math.sin(f), c * Math.sin(theta)]; }
    case 'pearls': { const f = latitude(h, ctx), c = Math.cos(f); return [c * Math.cos(theta), 2 * k - (ctx.nAeons - 1) + Math.sin(f), c * Math.sin(theta)]; }
    case 'cylinder': return [Math.cos(theta), 2 * h - 1, Math.sin(theta)];
    case 'torus': { const R = 1.1, r = 0.5, a = 2 * Math.PI * h, w = R + r * Math.cos(theta); return [w * Math.cos(a), r * Math.sin(theta), w * Math.sin(a)]; }
    case 'plane': { const rho = clamp(confRadius(h, ctx) * (ctx.omega || 1), 1e-4, 60); return [rho * Math.cos(theta), 0, rho * Math.sin(theta)]; }
    case 'helicoid': { const rho = 0.15 + 1.35 * h; return [rho * Math.cos(theta), (ctx.pitch || 0.35) * (theta / (2 * Math.PI)) + (ctx.levelOffset || 0), rho * Math.sin(theta)]; }
  }
  return [0, 0, 0];
}

// Build the list of aeons to draw. Each: { k, h, theta, positions(Float32Array), startS, endS, drop }
export function buildAeons(curve, h, theta, lens, ctx) {
  const n = curve.n, nA = lens === 'pearls' || lens === 'helicoid' ? ctx.nAeons : 1;
  const out = [];
  let thetaBase = 0;
  for (let k = 0; k < nA; k++) {
    const th = new Float64Array(n), pos = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) {
      th[i] = thetaBase + theta[i];
      const p = embedPoint(lens, h[i], th[i], ctx, k);
      pos[3 * i] = p[0]; pos[3 * i + 1] = p[1]; pos[3 * i + 2] = p[2];
    }
    const total = theta[n - 1] - theta[0];
    let drop = 0;
    if (ctx.rule === 'conserve') thetaBase += total;
    else if (ctx.rule === 'reset') { drop = total * (ctx.lossFraction ?? 1); thetaBase += total - drop; }
    out.push({ k, theta: th, positions: pos, windings: total / (2 * Math.PI), drop: drop / (2 * Math.PI) });
  }
  return out;
}

// ---------- surfaces & graticules ----------
function paramSurface(fn, nu, nv, closedU = false) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const p = fn(i / nu, j / nv); pos.push(p[0], p[1], p[2]); uv.push(i / nu, j / nv);
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + nv + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function makeSurface(lens, ctx, colors) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: colors.surface, transparent: true, opacity: ctx.surfaceOpacity ?? 0.22, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, depthWrite: false });
  const lineMat = new THREE.LineBasicMaterial({ color: colors.grid, transparent: true, opacity: 0.35 });
  const addLines = (segs) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3)); group.add(new THREE.LineSegments(g, lineMat)); };
  const polyline = (pts, segs) => { for (let i = 0; i + 1 < pts.length; i++) segs.push(...pts[i], ...pts[i + 1]); };
  const nA = lens === 'pearls' ? ctx.nAeons : 1;

  if (lens === 'sphere' || lens === 'pearls') {
    for (let k = 0; k < nA; k++) {
      const geo = new THREE.SphereGeometry(1, 64, 48);
      const m = new THREE.Mesh(geo, mat); m.position.y = lens === 'pearls' ? 2 * k - (nA - 1) : 0; group.add(m);
      const segs = [];
      // parallels: at equal clock spacing (so the Mercator map shows conformal squares as compression toward the poles)
      for (let q = 1; q < 12; q++) { const pts = []; for (let a = 0; a <= 96; a++) pts.push(embedPoint(lens, q / 12, (2 * Math.PI * a) / 96, ctx, k)); polyline(pts, segs); }
      for (let mI = 0; mI < 12; mI++) { const pts = []; for (let a = 0; a <= 64; a++) pts.push(embedPoint(lens, a / 64, (Math.PI * mI) / 6, ctx, k)); polyline(pts, segs); }
      addLines(segs);
    }
  } else if (lens === 'cylinder') {
    group.add(new THREE.Mesh(paramSurface((a, b) => embedPoint('cylinder', b, 2 * Math.PI * a, ctx), 64, 2), mat));
    const segs = [];
    for (let q = 0; q <= 12; q++) { const pts = []; for (let a = 0; a <= 96; a++) pts.push(embedPoint('cylinder', q / 12, (2 * Math.PI * a) / 96, ctx)); polyline(pts, segs); }
    for (let mI = 0; mI < 12; mI++) segs.push(...embedPoint('cylinder', 0, (Math.PI * mI) / 6, ctx), ...embedPoint('cylinder', 1, (Math.PI * mI) / 6, ctx));
    addLines(segs);
  } else if (lens === 'torus') {
    group.add(new THREE.Mesh(paramSurface((a, b) => embedPoint('torus', a, 2 * Math.PI * b, ctx), 96, 32), mat));
    const segs = [];
    for (let q = 0; q < 24; q++) { const pts = []; for (let a = 0; a <= 48; a++) pts.push(embedPoint('torus', q / 24, (2 * Math.PI * a) / 48, ctx)); polyline(pts, segs); }
    for (let mI = 0; mI < 12; mI++) { const pts = []; for (let a = 0; a <= 128; a++) pts.push(embedPoint('torus', a / 128, (Math.PI * mI) / 6, ctx)); polyline(pts, segs); }
    addLines(segs);
    // seam: the identification circle h = 0 ≡ 1
    const seam = []; for (let a = 0; a <= 64; a++) seam.push(embedPoint('torus', 0, (2 * Math.PI * a) / 64, ctx));
    const sg = []; polyline(seam, sg);
    const sgeo = new THREE.BufferGeometry(); sgeo.setAttribute('position', new THREE.Float32BufferAttribute(sg, 3));
    group.add(new THREE.LineSegments(sgeo, new THREE.LineBasicMaterial({ color: colors.accent, transparent: true, opacity: 0.9 })));
  } else if (lens === 'plane') {
    const segs = [];
    // circles at each unit of Mercator clock (each e-fold of conformal radius) and 12 radial lines
    const Y = ctx.Y, om = ctx.omega || 1;
    for (let y = -Math.ceil(Y) - 4; y <= Math.ceil(Y) + 4; y++) {
      const rho = Math.exp(y) * om; if (rho > 60 || rho < 1e-3) continue;
      const pts = []; for (let a = 0; a <= 128; a++) pts.push([rho * Math.cos((2 * Math.PI * a) / 128), 0, rho * Math.sin((2 * Math.PI * a) / 128)]); polyline(pts, segs);
    }
    for (let mI = 0; mI < 12; mI++) { const c = Math.cos((Math.PI * mI) / 6), s = Math.sin((Math.PI * mI) / 6); segs.push(0.001 * c, 0, 0.001 * s, 60 * c, 0, 60 * s); }
    addLines(segs);
    const disk = new THREE.Mesh(new THREE.CircleGeometry(60, 96), mat); disk.rotation.x = -Math.PI / 2; group.add(disk);
  } else if (lens === 'helicoid') {
    const th0 = ctx.thetaMin ?? 0, th1 = ctx.thetaMax ?? 4 * Math.PI, turns = Math.max(1, (th1 - th0) / (2 * Math.PI));
    group.add(new THREE.Mesh(paramSurface((a, b) => embedPoint('helicoid', b, th0 + (th1 - th0) * a, ctx), Math.ceil(48 * turns), 10), mat));
    const segs = [];
    for (let q = 0; q <= 10; q++) { const pts = []; const nn = Math.ceil(64 * turns); for (let a = 0; a <= nn; a++) pts.push(embedPoint('helicoid', q / 10, th0 + ((th1 - th0) * a) / nn, ctx)); polyline(pts, segs); }
    const nr = Math.ceil(12 * turns); for (let mI = 0; mI <= nr; mI++) { const t = th0 + ((th1 - th0) * mI) / nr; segs.push(...embedPoint('helicoid', 0, t, ctx), ...embedPoint('helicoid', 1, t, ctx)); }
    addLines(segs);
    // the axis: every aeon's Big Bang lies on it
    const ag = new THREE.BufferGeometry(); ag.setAttribute('position', new THREE.Float32BufferAttribute([0, embedPoint('helicoid', 0, th0, ctx)[1] - 0.3, 0, 0, embedPoint('helicoid', 0, th1, ctx)[1] + 0.3, 0], 3));
    group.add(new THREE.Line(ag, new THREE.LineBasicMaterial({ color: colors.accent, transparent: true, opacity: 0.8 })));
  }
  return group;
}

// latitude circle (or equivalent) at height h, as flat position array; for helicoid a short pin at the curve point
export function ringPositions(lens, h, ctx, k = 0, thetaAt = 0) {
  const pts = [];
  if (lens === 'helicoid') {
    const p = embedPoint('helicoid', h, thetaAt, ctx); const q = embedPoint('helicoid', Math.min(1, h + 0.08), thetaAt, ctx);
    const r = embedPoint('helicoid', Math.max(0, h - 0.08), thetaAt, ctx);
    pts.push(...r, ...p, ...p, ...q); return new Float32Array(pts);
  }
  const n = 96;
  for (let a = 0; a < n; a++) { const t0 = (2 * Math.PI * a) / n, t1 = (2 * Math.PI * (a + 1)) / n; pts.push(...embedPoint(lens, h, t0, ctx, k), ...embedPoint(lens, h, t1, ctx, k)); }
  return new Float32Array(pts);
}

// Bearings at sample i: conformal (in the Mercator strip, the invariant) and geometric (on the displayed surface).
// Returns radians in [0, π]: 0 = along the clock direction (meridian), π/2 = pure entropy winding (parallel).
export function bearings(h, theta, i, lens, ctx) {
  const n = h.length, i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
  const dth = theta[i1] - theta[i0];
  const yA = mercY(h[i0], ctx.Y), yB = mercY(h[i1], ctx.Y);
  const conf = Math.atan2(Math.abs(dth), Math.abs(yB - yA));
  let geo = conf;
  if (lens === 'sphere' || lens === 'pearls' || lens === 'plane') {
    const fA = latitude(h[i0], ctx), fB = latitude(h[i1], ctx), fm = 0.5 * (fA + fB);
    geo = Math.atan2(Math.abs(dth) * Math.cos(fm), Math.abs(fB - fA));
  } else if (lens === 'cylinder') geo = Math.atan2(Math.abs(dth), 2 * Math.abs(h[i1] - h[i0]));
  else if (lens === 'torus') { const R = 1.1, r = 0.5, w = R + r * Math.cos(theta[i]); geo = Math.atan2(r * Math.abs(dth), w * 2 * Math.PI * Math.abs(h[i1] - h[i0])); }
  else if (lens === 'helicoid') { const rho = 0.15 + 1.35 * h[i], pitch = ctx.pitch || 0.35; geo = Math.atan2(Math.abs(dth) * Math.hypot(rho, pitch / (2 * Math.PI)), 1.35 * Math.abs(h[i1] - h[i0])); }
  return { conf, geo, windingDensity: dth / ((h[i1] - h[i0]) || 1e-12) / (2 * Math.PI) };
}

export function cameraFor(lens, ctx) {
  if (lens === 'pearls') return { dist: 2.9 * ctx.nAeons + 2.0, target: [0, 0, 0] };
  if (lens === 'plane') return { dist: 6, target: [0, 0, 0], top: true };
  if (lens === 'helicoid') { const y0 = embedPoint('helicoid', 0.5, ctx.thetaMin ?? 0, ctx)[1], y1 = embedPoint('helicoid', 0.5, ctx.thetaMax ?? 0, ctx)[1]; return { dist: 3.2 + 0.5 * Math.abs(y1 - y0), target: [0, 0.5 * (y0 + y1), 0] }; }
  if (lens === 'torus') return { dist: 5.2, target: [0, 0, 0] };
  return { dist: 4.6, target: [0, 0, 0] };
}
