import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { buildCosmos, COSMO_DEFAULTS } from './cosmos.js';
import { buildIsing, IsingMC, buildLogistic, buildKuramoto, buildPercolation, buildCustom } from './models.js';
import { LENSES, HEIGHT_MAPS, computeHeights, computeTheta, buildAeons, makeSurface, ringPositions, embedPoint, bearings, cameraFor } from './lenses.js';
import { buildInsights } from './insight.js';
import { drawUnrolled, drawModel, makeColorScale, cssVar } from './views.js';
import { fmt, deg, clamp } from './constants.js';

// ------------------------------------------------------------------ state
const state = {
  source: 'cosmos',
  params: {
    cosmos: { logSbhMax: COSMO_DEFAULTS.logSbhMax, logMsmbh: COSMO_DEFAULTS.logMsmbh, hawkingFactor: COSMO_DEFAULTS.hawkingFactor, logTend: COSMO_DEFAULTS.logTend, bhGrowthMidGyr: COSMO_DEFAULTS.bhGrowthMidGyr },
    ising: { Thot: 4.5, Tcold: 0.4 },
    logistic: { mode: 'r', rFixed: 3.72, nSteps: 70 },
    kuramoto: { gamma: 0.5, Kmax: 3.0 },
    percolation: { seed: 11 },
    custom: { expr: '2*t + 0.8*Math.tanh(12*(t-0.6))' },
  },
  clockKey: 'logt', reverse: false, heightMap: 'mercator', Y: 3.0,
  lens: 'sphere', nAeons: 3, rule: 'reset', lossFraction: 1, logOmega: 0, pitch: 0.35,
  sTurn: 5, sTurnFor: 'cosmos', flip: false,
  surfaceOpacity: 0.22, showGrid: true, showShadow: true, showLabels: true, showRings: true, autoRotate: false, camera: 'orbit',
  cursor: 0.62, playing: false, speed: 0.04,
};
const SOURCES = {
  cosmos: { label: 'One aeon: ΛCDM universe', build: (p) => buildCosmos(p) },
  ising: { label: '2D Ising model (Onsager)', build: (p) => buildIsing(p) },
  logistic: { label: 'Logistic map (Lyapunov / KS entropy)', build: (p) => buildLogistic(p) },
  kuramoto: { label: 'Kuramoto oscillators', build: (p) => buildKuramoto(p) },
  percolation: { label: 'Site percolation', build: (p) => buildPercolation(p) },
  custom: { label: 'Custom law S(τ)', build: (p) => buildCustom(p) },
};
const cache = new Map();
function getCurve() {
  const key = state.source + JSON.stringify(state.params[state.source]);
  if (!cache.has(key)) cache.set(key, SOURCES[state.source].build(state.params[state.source]));
  return cache.get(key);
}

// ------------------------------------------------------------------ three.js scene
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 200);
const ortho = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.01, 400);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(3, 5, 2); scene.add(sun);
const groups = {};
for (const k of ['surface', 'curve', 'rings', 'labels', 'shadow', 'cursor', 'ceiling']) { groups[k] = new THREE.Group(); scene.add(groups[k]); }

class Orbit {
  constructor(dom) {
    this.dom = dom; this.target = new THREE.Vector3(); this.theta = 0.7; this.phi = 1.15; this.dist = 3.4; this.orthoSize = 1.6;
    this.ptrs = new Map(); this.pinch = 0;
    dom.addEventListener('pointerdown', (e) => { this.ptrs.set(e.pointerId, [e.clientX, e.clientY, e.button, e.shiftKey]); dom.setPointerCapture(e.pointerId); this.pinch = this.pinchDist(); });
    dom.addEventListener('pointerup', (e) => { this.ptrs.delete(e.pointerId); });
    dom.addEventListener('pointercancel', (e) => { this.ptrs.delete(e.pointerId); });
    dom.addEventListener('pointermove', (e) => {
      const p = this.ptrs.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p[0], dy = e.clientY - p[1]; p[0] = e.clientX; p[1] = e.clientY;
      if (this.ptrs.size === 2) { const d = this.pinchDist(); if (this.pinch > 0) this.zoom(Math.pow(this.pinch / d, 1)); this.pinch = d; return; }
      if (p[2] === 2 || p[3]) this.pan(dx, dy);
      else if (state.camera !== 'top') { this.theta -= dx * 0.006; this.phi = clamp(this.phi - dy * 0.006, 0.03, Math.PI - 0.03); }
      else this.pan(dx, dy);
    });
    dom.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  pinchDist() { const a = [...this.ptrs.values()]; return a.length === 2 ? Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]) : 0; }
  zoom(f) { this.dist = clamp(this.dist * f, 0.3, 80); this.orthoSize = clamp(this.orthoSize * f, 0.05, 80); }
  pan(dx, dy) {
    const cam = state.camera === 'top' ? ortho : camera, s = (state.camera === 'top' ? this.orthoSize * 2 : this.dist) / this.dom.clientHeight;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    this.target.addScaledVector(right, -dx * s).addScaledVector(up, dy * s);
  }
  apply() {
    const sp = Math.sin(this.phi);
    camera.position.set(this.target.x + this.dist * sp * Math.sin(this.theta), this.target.y + this.dist * Math.cos(this.phi), this.target.z + this.dist * sp * Math.cos(this.theta));
    camera.up.set(0, 1, 0); camera.lookAt(this.target);
    ortho.position.set(this.target.x, this.target.y + 100, this.target.z); ortho.up.set(0, 0, -1); ortho.lookAt(this.target);
    const a = stage.clientWidth / Math.max(1, stage.clientHeight);
    ortho.left = -this.orthoSize * a; ortho.right = this.orthoSize * a; ortho.top = this.orthoSize; ortho.bottom = -this.orthoSize; ortho.updateProjectionMatrix();
  }
}
const orbit = new Orbit(renderer.domElement);

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(() => { resize(); redraw2D(); }).observe(stage);

// ------------------------------------------------------------------ colours
let colors, colorScale;
function refreshColors() {
  colors = { bg: new THREE.Color(cssVar('--bg')), surface: new THREE.Color(cssVar('--surface3d')), grid: new THREE.Color(cssVar('--grid3d')), accent: new THREE.Color(cssVar('--accent')), fg: new THREE.Color(cssVar('--fg')), muted: new THREE.Color(cssVar('--muted')) };
  colorScale = makeColorScale();
  renderer.setClearColor(colors.bg, 1);
  labelCache.clear();
}
const labelCache = new Map();
function makeLabel(text, kind) {
  const key = text + '|' + kind;
  if (labelCache.has(key)) return labelCache.get(key).clone();
  const c = document.createElement('canvas'), ctx = c.getContext('2d');
  const fnt = `500 26px ${cssVar('--font-ui') || 'sans-serif'}`; ctx.font = fnt;
  const wText = Math.ceil(ctx.measureText(text).width) + 28; c.width = wText; c.height = 44; ctx.font = fnt;
  ctx.fillStyle = cssVar('--panel'); ctx.globalAlpha = 0.82; roundRect(ctx, 0, 0, c.width, c.height, 10); ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = kind === 'hypothesis' ? cssVar('--accent') : cssVar('--fg'); ctx.textBaseline = 'middle'; ctx.fillText(text, 14, 23);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  const s = 0.0016; sp.scale.set(c.width * s, c.height * s, 1); sp.renderOrder = 10;
  labelCache.set(key, sp); return sp.clone();
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function clearGroup(g) { while (g.children.length) { const o = g.children.pop(); o.traverse?.((c) => { c.geometry?.dispose?.(); if (c.material && !c.material.isSpriteMaterial) c.material.dispose?.(); }); } }

// ------------------------------------------------------------------ build
let curve, h, theta, aeons, ctxLens, mc = null, lastLens = null;
function lensCtx() {
  return { heightMap: state.heightMap, Y: state.Y, nAeons: state.nAeons, rule: state.rule, lossFraction: state.lossFraction, omega: Math.pow(10, state.logOmega), pitch: state.pitch, surfaceOpacity: state.surfaceOpacity, levelOffset: 0 };
}
function rebuild(resetCam = false) {
  curve = getCurve();
  if (!curve.clocks[state.clockKey]) state.clockKey = curve.defaultClock;
  if (state.sTurnFor !== state.source) { state.sTurn = curve.sTurnDefault; state.sTurnFor = state.source; }
  h = computeHeights(curve, state.clockKey, { reverse: state.reverse });
  theta = computeTheta(curve, state.sTurn, { flip: state.flip });
  ctxLens = lensCtx();
  aeons = buildAeons(curve, h, theta, state.lens, ctxLens);
  if (state.lens === 'helicoid') {
    let mn = Infinity, mx = -Infinity; for (const A of aeons) for (let k = 0; k < A.theta.length; k++) { mn = Math.min(mn, A.theta[k]); mx = Math.max(mx, A.theta[k]); }
    ctxLens.thetaMin = mn - 0.3; ctxLens.thetaMax = mx + 0.3;
    // centre the stack vertically
    ctxLens.levelOffset = -0.5 * state.pitch * ((mn + mx) / 2) / (2 * Math.PI) * 2;
    aeons = buildAeons(curve, h, theta, state.lens, ctxLens);
  }
  for (const k in groups) clearGroup(groups[k]);
  // surface
  if (state.showGrid || state.surfaceOpacity > 0) {
    const s = makeSurface(state.lens, ctxLens, colors);
    s.traverse((o) => { if (o.isLineSegments || o.isLine) o.visible = state.showGrid; });
    groups.surface.add(s);
  }
  // curve tubes, one per aeon
  const tex = psiTexture();
  const radius = state.lens === 'pearls' ? 0.014 : state.lens === 'plane' ? 0.02 : 0.016;
  for (const A of aeons) {
    const pts = []; for (let k = 0; k < curve.n; k++) pts.push(new THREE.Vector3(A.positions[3 * k], A.positions[3 * k + 1], A.positions[3 * k + 2]));
    const path = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.0);
    const geo = new THREE.TubeGeometry(path, Math.min(1400, curve.n * 2), radius, 8, false);
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.3, roughness: 0.45, metalness: 0.05 });
    groups.curve.add(new THREE.Mesh(geo, mat));
    // reset drop on the helicoid: a dashed vertical at the axis
    if (state.lens === 'helicoid' && A.drop && A.k < aeons.length - 1) {
      const e = embedPoint('helicoid', 1, A.theta[curve.n - 1], ctxLens), b = embedPoint('helicoid', 0, A.theta[curve.n - 1] - 2 * Math.PI * A.drop, ctxLens);
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...e), new THREE.Vector3(0, e[1], 0), new THREE.Vector3(0, b[1], 0), new THREE.Vector3(...b)]);
      const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color: colors.accent, dashSize: 0.05, gapSize: 0.04 })); l.computeLineDistances(); groups.curve.add(l);
    }
  }
  // thresholds
  if (state.showRings) {
    for (const t of curve.thresholds) {
      const j = Math.min(curve.n - 1, Math.round(t.u * (curve.n - 1)));
      const nA = state.lens === 'pearls' ? aeons.length : 1;
      for (let k = 0; k < nA; k++) {
        const pos = ringPositions(state.lens, h[j], ctxLens, k, aeons[k === 0 ? 0 : k].theta[j]);
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const hyp = t.kind.startsWith('hyp');
        const mat = hyp ? new THREE.LineDashedMaterial({ color: colors.accent, dashSize: 0.04, gapSize: 0.03, transparent: true, opacity: 0.9 }) : new THREE.LineBasicMaterial({ color: colors.accent, transparent: true, opacity: 0.75 });
        const ls = new THREE.LineSegments(g, mat); if (hyp) ls.computeLineDistances(); groups.rings.add(ls);
      }
      if (state.showLabels) {
        const p = embedPoint(state.lens, h[j], aeons[0].theta[j], ctxLens, 0);
        const lab = makeLabel(t.label, t.kind); lab.position.set(p[0] * 1.08, p[1] + (state.lens === 'plane' ? 0.08 : 0.07), p[2] * 1.08); groups.labels.add(lab);
      }
    }
  }
  // ceiling (entropy bound): a horizontal disc on the helicoid, a label elsewhere handled in the strip view
  if (curve.ceiling && state.lens === 'helicoid') {
    const thC = 2 * Math.PI * (curve.ceiling.S - curve.S[0]) / state.sTurn * (state.flip ? -1 : 1);
    const yC = embedPoint('helicoid', 0.5, thC, ctxLens)[1];
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.1, 1.55, 64), new THREE.MeshBasicMaterial({ color: colors.accent, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = yC; groups.ceiling.add(disc);
    const lab = makeLabel(curve.ceiling.label, 'exact'); lab.position.set(1.2, yC + 0.08, 0); groups.ceiling.add(lab);
  }
  // shadow: orthographic projection of every aeon onto the floor
  if (state.showShadow && state.lens !== 'plane') {
    let yMin = Infinity; for (const A of aeons) for (let k = 1; k < A.positions.length; k += 3) yMin = Math.min(yMin, A.positions[k]);
    const floorY = yMin - 0.35;
    const disk = new THREE.Mesh(new THREE.CircleGeometry(state.lens === 'torus' ? 1.75 : 1.6, 72), new THREE.MeshBasicMaterial({ color: colors.grid, transparent: true, opacity: 0.12, depthWrite: false }));
    disk.rotation.x = -Math.PI / 2; disk.position.y = floorY; groups.shadow.add(disk);
    for (const A of aeons) {
      const pos = new Float32Array(A.positions); for (let k = 1; k < pos.length; k += 3) pos[k] = floorY + 0.002;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      groups.shadow.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: colors.muted, transparent: true, opacity: 0.55 })));
    }
  }
  // model-specific live objects
  if (curve.id === 'ising') { if (!mc) mc = new IsingMC(64, 7); } else mc = null;
  if (resetCam || lastLens !== state.lens) {
    const c = cameraFor(state.lens, ctxLens); orbit.dist = c.dist; orbit.orthoSize = c.dist * 0.45; orbit.target.set(...c.target);
    if (state.lens === 'plane' && lastLens !== 'plane') { state.camera = 'top'; syncCameraButtons(); }
    if (state.lens !== 'plane' && lastLens === 'plane') { state.camera = 'orbit'; syncCameraButtons(); }
    lastLens = state.lens;
  }
  document.getElementById('sourceTitle').textContent = curve.title;
  updateCursor(true);
  renderLedger();
}

function psiTexture() {
  const W = 512, data = new Uint8Array(W * 4);
  for (let k = 0; k < W; k++) {
    const i = Math.min(curve.n - 1, Math.round((k / (W - 1)) * (curve.n - 1)));
    const c = colorScale(curve.psi[i]); data[4 * k] = c[0]; data[4 * k + 1] = c[1]; data[4 * k + 2] = c[2]; data[4 * k + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, W, 1, THREE.RGBAFormat, THREE.UnsignedByteType); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  return tex;
}

// ------------------------------------------------------------------ cursor, readouts, insights
let cursorIdx = 0, bear = null;
function updateCursor(force = false) {
  const i = Math.min(curve.n - 1, Math.round(state.cursor * (curve.n - 1)));
  if (i === cursorIdx && !force) return;
  cursorIdx = i;
  clearGroup(groups.cursor);
  bear = bearings(h, theta, i, state.lens, ctxLens);
  // markers on every aeon at the same u: same shadow, different level
  aeons.forEach((A, k) => {
    const p = new THREE.Vector3(A.positions[3 * i], A.positions[3 * i + 1], A.positions[3 * i + 2]);
    const m = new THREE.Mesh(new THREE.SphereGeometry(k === 0 ? 0.045 : 0.03, 16, 12), new THREE.MeshBasicMaterial({ color: k === 0 ? colors.fg : colors.accent }));
    m.position.copy(p); groups.cursor.add(m);
    if (k === 0) {
      const i1 = Math.min(curve.n - 1, i + 2), i0 = Math.max(0, i - 2);
      const tan = new THREE.Vector3(A.positions[3 * i1] - A.positions[3 * i0], A.positions[3 * i1 + 1] - A.positions[3 * i0 + 1], A.positions[3 * i1 + 2] - A.positions[3 * i0 + 2]);
      const q1 = embedPoint(state.lens, Math.min(1, h[i] + 0.02), A.theta[i], ctxLens, 0), q0 = embedPoint(state.lens, Math.max(0, h[i] - 0.02), A.theta[i], ctxLens, 0);
      const mer = new THREE.Vector3(q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]);
      if (tan.lengthSq() > 1e-12 && mer.lengthSq() > 1e-12) {
        groups.cursor.add(new THREE.ArrowHelper(tan.normalize(), p, 0.32, colors.fg.getHex(), 0.08, 0.04));
        groups.cursor.add(new THREE.ArrowHelper(mer.normalize(), p, 0.32, colors.accent.getHex(), 0.08, 0.04));
      }
    }
  });
  if (mc) mc.setT(curve.extras.T[i]);
  document.getElementById('cursorOut').textContent = `${curve.clocks[state.clockKey].short} = ${fmt(curve.clocks[state.clockKey].values[i], 4)}`;
  redraw2D(); renderReadout(); renderInsights();
}
function stateFor2D() { return { curve, h, theta, i: cursorIdx, aeons, lens: state.lens, ctxLens, sTurn: state.sTurn, clockKey: state.clockKey, ceilingTurns: curve.ceiling ? (curve.ceiling.S - curve.S[0]) / state.sTurn * (state.flip ? -1 : 1) : null, ceilingLabel: curve.ceiling?.label }; }
function redraw2D() { if (!curve) return; drawUnrolled(document.getElementById('unrolled'), stateFor2D(), colorScale); drawModel(document.getElementById('modelView'), stateFor2D(), colorScale, mc); }
function renderReadout() {
  const rows = curve.readout(cursorIdx);
  rows.push(['conformal bearing β', `${deg(bear.conf).toFixed(1)}°`], ['drawn bearing (this lens)', `${deg(bear.geo).toFixed(1)}°`], ['winding density', `${fmt(bear.windingDensity, 3)} turns / unit height`], ['order parameter', `${fmt(curve.psi[cursorIdx], 3)}  (${curve.psiLabel})`], ['susceptibility', `${fmt(curve.chi[cursorIdx], 3)}  (${curve.chiLabel})`]);
  document.getElementById('readout').innerHTML = `<table class="kv">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>`;
}
function renderInsights() {
  const list = buildInsights({ curve, lens: state.lens, clockKey: state.clockKey, heightMap: state.heightMap, sTurn: state.sTurn, h, theta, i: cursorIdx, ctx: ctxLens, b: bear, aeons });
  document.getElementById('insights').innerHTML = list.map((c) => `<article class="card ${c.kind}"><h4>${c.title}</h4><p>${c.body}</p></article>`).join('');
}
function renderLedger() {
  document.getElementById('ledger').innerHTML = `<p class="hint">${curve.clocks[state.clockKey].note}</p><table class="ledger">${curve.ledger.map(([k, s, n]) => `<tr><th>${k}</th><td><span class="kind kind-${s.split(' ')[0]}">${s}</span></td><td>${n}</td></tr>`).join('')}</table>`;
}

// ------------------------------------------------------------------ controls
const $ = (id) => document.getElementById(id);
function control(spec) {
  const wrap = document.createElement('div'); wrap.className = 'ctl'; wrap.dataset.key = spec.key || '';
  const id = 'c_' + (spec.key || Math.random().toString(36).slice(2));
  const lab = document.createElement('label'); lab.htmlFor = id; lab.textContent = spec.label; wrap.appendChild(lab);
  let input;
  if (spec.type === 'select') {
    input = document.createElement('select'); input.id = id;
    for (const [v, t] of spec.options()) { const o = document.createElement('option'); o.value = v; o.textContent = t; input.appendChild(o); }
    input.value = spec.get(); input.addEventListener('change', () => { spec.set(input.value); afterChange(spec); });
    wrap.appendChild(input);
  } else if (spec.type === 'range') {
    input = document.createElement('input'); input.type = 'range'; input.id = id; input.min = spec.min; input.max = spec.max; input.step = spec.step; input.value = spec.get();
    const out = document.createElement('output'); out.textContent = spec.fmt ? spec.fmt(spec.get()) : spec.get();
    input.addEventListener('input', () => { spec.set(Number(input.value)); out.textContent = spec.fmt ? spec.fmt(Number(input.value)) : input.value; afterChange(spec); });
    lab.appendChild(out); wrap.appendChild(input);
  } else if (spec.type === 'toggle') {
    input = document.createElement('input'); input.type = 'checkbox'; input.id = id; input.checked = !!spec.get();
    input.addEventListener('change', () => { spec.set(input.checked); afterChange(spec); });
    wrap.classList.add('row'); wrap.insertBefore(input, lab);
  } else if (spec.type === 'text') {
    input = document.createElement('input'); input.type = 'text'; input.id = id; input.value = spec.get(); input.spellcheck = false;
    input.addEventListener('change', () => { spec.set(input.value); afterChange(spec); });
    wrap.appendChild(input);
  } else if (spec.type === 'buttons') {
    const bar = document.createElement('div'); bar.className = 'btns';
    for (const [v, t] of spec.options()) { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.dataset.v = v; b.className = spec.get() === v ? 'on' : ''; b.addEventListener('click', () => { spec.set(v); bar.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.v === v)); afterChange(spec); }); bar.appendChild(b); }
    wrap.appendChild(bar); wrap.bar = bar;
  }
  wrap.spec = spec; wrap.input = input;
  return wrap;
}
const ctlNodes = [];
function section(id, specs) { const host = $(id); for (const s of specs) { const n = control(s); host.appendChild(n); ctlNodes.push(n); } }
function afterChange(spec) {
  rebuild(spec.resetCam); if (spec.structural) rebuildControls();
}
function rebuildControls() {
  for (const n of ctlNodes) {
    const vis = n.spec.show ? n.spec.show() : true; n.hidden = !vis;
    if (n.spec.type === 'select' && n.spec.dynamic) { const cur = n.spec.get(); n.input.innerHTML = ''; for (const [v, t] of n.spec.options()) { const o = document.createElement('option'); o.value = v; o.textContent = t; n.input.appendChild(o); } n.input.value = cur; }
    if (n.spec.type === 'range' && n.spec.dynamicRange) { const r = n.spec.dynamicRange(); n.input.min = r[0]; n.input.max = r[1]; n.input.step = r[2]; n.input.value = n.spec.get(); n.querySelector('output').textContent = n.spec.fmt ? n.spec.fmt(n.spec.get()) : n.spec.get(); }
    if (n.spec.type === 'range' && !n.spec.dynamicRange) { n.input.value = n.spec.get(); const o = n.querySelector('output'); if (o) o.textContent = n.spec.fmt ? n.spec.fmt(n.spec.get()) : n.spec.get(); }
    if (n.spec.type === 'select' && !n.spec.dynamic) n.input.value = n.spec.get();
  }
}
function syncCameraButtons() { for (const n of ctlNodes) if (n.spec.key === 'camera') n.bar.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.v === state.camera)); }
const P = (k) => state.params[k];
const isSrc = (s) => () => state.source === s;
const sphereLike = () => ['sphere', 'pearls', 'plane'].includes(state.lens);
const multi = () => ['pearls', 'helicoid'].includes(state.lens);

section('sec-source', [
  { key: 'source', type: 'select', label: 'Source of the time–entropy curve', options: () => Object.entries(SOURCES).map(([k, v]) => [k, v.label]), get: () => state.source, set: (v) => { state.source = v; state.clockKey = getCurveClockDefault(v); }, structural: true, resetCam: true },
  { key: 'c1', type: 'range', label: 'Maximum black-hole entropy, log₁₀', min: 100, max: 118, step: 0.5, get: () => P('cosmos').logSbhMax, set: (v) => (P('cosmos').logSbhMax = v), show: isSrc('cosmos') },
  { key: 'c2', type: 'range', label: 'Mass of the last black holes, log₁₀ M/M☉', min: 6, max: 12, step: 0.25, get: () => P('cosmos').logMsmbh, set: (v) => (P('cosmos').logMsmbh = v), show: isSrc('cosmos') },
  { key: 'c3', type: 'range', label: 'Hawking entropy factor S_rad/S_hole', min: 1, max: 2, step: 0.05, get: () => P('cosmos').hawkingFactor, set: (v) => (P('cosmos').hawkingFactor = v), show: isSrc('cosmos') },
  { key: 'c4', type: 'range', label: 'Half of today\'s BH entropy formed by, Gyr', min: 0.5, max: 8, step: 0.25, get: () => P('cosmos').bhGrowthMidGyr, set: (v) => (P('cosmos').bhGrowthMidGyr = v), show: isSrc('cosmos') },
  { key: 'c5', type: 'range', label: 'Aeon cut at log₁₀ t/yr', min: 90, max: 130, step: 1, get: () => P('cosmos').logTend, set: (v) => (P('cosmos').logTend = v), show: isSrc('cosmos') },
  { key: 'i1', type: 'range', label: 'Start temperature T_hot', min: 2.5, max: 8, step: 0.1, get: () => P('ising').Thot, set: (v) => (P('ising').Thot = v), show: isSrc('ising') },
  { key: 'i2', type: 'range', label: 'End temperature T_cold', min: 0.2, max: 2.2, step: 0.05, get: () => P('ising').Tcold, set: (v) => (P('ising').Tcold = v), show: isSrc('ising') },
  { key: 'l1', type: 'buttons', label: 'Clock', options: () => [['r', 'sweep r'], ['n', 'iterate at fixed r']], get: () => P('logistic').mode, set: (v) => (P('logistic').mode = v), show: isSrc('logistic'), structural: true },
  { key: 'l2', type: 'range', label: 'r (fixed)', min: 2.9, max: 4, step: 0.001, get: () => P('logistic').rFixed, set: (v) => (P('logistic').rFixed = v), show: () => state.source === 'logistic' && P('logistic').mode === 'n', fmt: (v) => v.toFixed(3) },
  { key: 'l3', type: 'range', label: 'Iterations', min: 20, max: 160, step: 5, get: () => P('logistic').nSteps, set: (v) => (P('logistic').nSteps = v), show: () => state.source === 'logistic' && P('logistic').mode === 'n' },
  { key: 'k1', type: 'range', label: 'Frequency spread γ  (K_c = 2γ)', min: 0.2, max: 1.2, step: 0.05, get: () => P('kuramoto').gamma, set: (v) => (P('kuramoto').gamma = v), show: isSrc('kuramoto') },
  { key: 'k2', type: 'range', label: 'Coupling ramp to K_max', min: 1.5, max: 6, step: 0.25, get: () => P('kuramoto').Kmax, set: (v) => (P('kuramoto').Kmax = v), show: isSrc('kuramoto') },
  { key: 'p1', type: 'range', label: 'Random seed', min: 1, max: 99, step: 1, get: () => P('percolation').seed, set: (v) => (P('percolation').seed = v), show: isSrc('percolation') },
  { key: 'x1', type: 'text', label: 'S(t) for t in [0,1], JavaScript', get: () => P('custom').expr, set: (v) => (P('custom').expr = v), show: isSrc('custom') },
]);
function getCurveClockDefault(src) { const c = SOURCES[src].build(state.params[src]); cache.set(src + JSON.stringify(state.params[src]), c); return c.defaultClock; }
section('sec-clock', [
  { key: 'clock', type: 'select', dynamic: true, label: 'Clock (vertical axis)', options: () => Object.entries(getCurve().clocks).map(([k, v]) => [k, v.label]), get: () => state.clockKey, set: (v) => (state.clockKey = v), structural: true },
  { key: 'reverse', type: 'toggle', label: 'Reverse the clock', get: () => state.reverse, set: (v) => (state.reverse = v) },
  { key: 'hmap', type: 'select', label: 'Height map on the sphere', options: () => Object.entries(HEIGHT_MAPS).map(([k, v]) => [k, v.label]), get: () => state.heightMap, set: (v) => (state.heightMap = v), show: sphereLike, structural: true },
  { key: 'Y', type: 'range', label: 'Mercator range ±Y (pole focus)', min: 1, max: 6, step: 0.1, get: () => state.Y, set: (v) => (state.Y = v), show: () => sphereLike() && state.heightMap === 'mercator' },
]);
section('sec-topology', [
  { key: 'lens', type: 'select', label: 'Lens (surface and identification)', options: () => Object.entries(LENSES).map(([k, v]) => [k, v.label]), get: () => state.lens, set: (v) => (state.lens = v), structural: true, resetCam: true },
  { key: 'nA', type: 'range', label: 'Number of aeons', min: 1, max: 6, step: 1, get: () => state.nAeons, set: (v) => (state.nAeons = v), show: multi, resetCam: true },
  { key: 'rule', type: 'buttons', label: 'Crossover rule', options: () => [['reset', 'CCC reset'], ['conserve', 'conserve']], get: () => state.rule, set: (v) => (state.rule = v), show: multi, structural: true },
  { key: 'loss', type: 'range', label: 'Information lost at crossover', min: 0, max: 1, step: 0.05, get: () => state.lossFraction, set: (v) => (state.lossFraction = v), show: () => multi() && state.rule === 'reset', fmt: (v) => Math.round(v * 100) + '%' },
  { key: 'omega', type: 'range', label: 'Zoom Ω (conformal factor), log₁₀', min: -3, max: 3, step: 0.05, get: () => state.logOmega, set: (v) => (state.logOmega = v), show: () => state.lens === 'plane', fmt: (v) => 'Ω = ' + Math.pow(10, v).toPrecision(2) },
  { key: 'pitch', type: 'range', label: 'Storey height per turn', min: 0.1, max: 1, step: 0.05, get: () => state.pitch, set: (v) => (state.pitch = v), show: () => state.lens === 'helicoid', resetCam: true },
]);
section('sec-winding', [
  { key: 'sTurn', type: 'range', dynamicRange: () => { const r = getCurve().sTurnRange; return [Math.log10(r[0]), Math.log10(r[1]), 0.01]; }, label: 'Entropy per full turn', min: -2, max: 2, step: 0.01, get: () => Math.log10(state.sTurn), set: (v) => (state.sTurn = Math.pow(10, v)), fmt: (v) => Math.pow(10, v).toPrecision(3) + ' ' + (getCurve().Sunit || '') },
  { key: 'flip', type: 'toggle', label: 'Wind the other way', get: () => state.flip, set: (v) => (state.flip = v) },
]);
section('sec-display', [
  { key: 'camera', type: 'buttons', label: 'Camera', options: () => [['orbit', 'orbit'], ['top', 'top (shadow)'], ['side', 'side']], get: () => state.camera, set: (v) => { state.camera = v; if (v === 'side') { orbit.phi = Math.PI / 2 - 0.02; orbit.theta = Math.PI / 2; } if (v === 'orbit') { orbit.phi = 1.15; orbit.theta = 0.7; } } },
  { key: 'opacity', type: 'range', label: 'Surface opacity', min: 0, max: 0.8, step: 0.02, get: () => state.surfaceOpacity, set: (v) => (state.surfaceOpacity = v) },
  { key: 'grid', type: 'toggle', label: 'Graticule (clock lines & phase lines)', get: () => state.showGrid, set: (v) => (state.showGrid = v) },
  { key: 'rings', type: 'toggle', label: 'Threshold rings', get: () => state.showRings, set: (v) => (state.showRings = v) },
  { key: 'labels', type: 'toggle', label: 'Labels', get: () => state.showLabels, set: (v) => (state.showLabels = v) },
  { key: 'shadow', type: 'toggle', label: 'Shadow on the floor (orthographic)', get: () => state.showShadow, set: (v) => (state.showShadow = v) },
  { key: 'rot', type: 'toggle', label: 'Slow rotation', get: () => state.autoRotate, set: (v) => (state.autoRotate = v) },
]);
// cursor controls are static in the HTML
const cursorRange = $('cursor');
cursorRange.addEventListener('input', () => { state.cursor = Number(cursorRange.value); updateCursor(); });
$('play').addEventListener('click', () => { state.playing = !state.playing; $('play').textContent = state.playing ? 'Pause' : 'Play'; });
$('speed').addEventListener('input', () => (state.speed = Number($('speed').value)));
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tab').forEach((t) => (t.hidden = t.id !== b.dataset.tab));
}));
document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => applyPreset(b.dataset.preset)));

const PRESETS = {
  penrose: { source: 'cosmos', clockKey: 'eta', lens: 'pearls', heightMap: 'mercator', nAeons: 3, rule: 'reset', lossFraction: 1, camera: 'orbit', cursor: 0.75 },
  loxodrome: { source: 'cosmos', clockKey: 'logt', lens: 'sphere', heightMap: 'mercator', Y: 3, camera: 'orbit', cursor: 0.62 },
  staircase: { source: 'cosmos', clockKey: 'logt', lens: 'helicoid', nAeons: 3, rule: 'reset', lossFraction: 1, pitch: 0.4, cursor: 0.7 },
  torus: { source: 'cosmos', clockKey: 'eta', lens: 'torus', cursor: 0.95 },
  critical: { source: 'ising', clockKey: 'lnInvT', lens: 'sphere', heightMap: 'mercator', Y: 2.2, cursor: 0.5 },
  arrow: { source: 'logistic', clockKey: 'r', lens: 'cylinder', cursor: 0.64 },
  clock: { source: 'kuramoto', clockKey: 'K', lens: 'sphere', heightMap: 'linear', cursor: 0.33 },
  zoom: { source: 'cosmos', clockKey: 'lna', lens: 'plane', heightMap: 'mercator', Y: 3.5, logOmega: 0, cursor: 0.4 },
};
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  Object.assign(state, p); state.sTurnFor = ''; if (p.source === 'logistic') P('logistic').mode = 'r';
  rebuildControls(); rebuild(true); cursorRange.value = state.cursor; syncCameraButtons();
  if (state.camera === 'side') { orbit.phi = Math.PI / 2 - 0.02; orbit.theta = Math.PI / 2; } else if (state.camera === 'orbit') { orbit.phi = 1.15; orbit.theta = 0.7; }
}

// ------------------------------------------------------------------ theme
// Day/night: an explicit choice is stored per viewer; without one the page follows the system setting.
const mq = window.matchMedia('(prefers-color-scheme: dark)');
const themeBtn = $('themeBtn');
const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : mq.matches; };
const syncThemeBtn = () => { themeBtn.textContent = isDark() ? 'Day mode' : 'Night mode'; };
function setTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  try { if (t) localStorage.setItem('aeon-theme', t); else localStorage.removeItem('aeon-theme'); } catch (e) { /* storage unavailable: the choice lasts for this page only */ }
  syncThemeBtn();
}
try { const saved = localStorage.getItem('aeon-theme'); if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved; } catch (e) { /* ignore */ }
themeBtn.addEventListener('click', () => setTheme(isDark() ? 'light' : 'dark'));
function onTheme() { refreshColors(); rebuild(); syncThemeBtn(); }
mq.addEventListener?.('change', onTheme);
new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
syncThemeBtn();

// ------------------------------------------------------------------ loop
let last = performance.now(), frame = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; frame++;
  if (state.playing) { state.cursor = (state.cursor + state.speed * dt) % 1; cursorRange.value = state.cursor; updateCursor(); }
  if (state.autoRotate && state.camera !== 'top') orbit.theta += 0.25 * dt;
  if (mc) { mc.sweep(2); if (frame % 2 === 0) drawModel(document.getElementById('modelView'), stateFor2D(), colorScale, mc); }
  orbit.apply();
  renderer.render(scene, state.camera === 'top' ? ortho : camera);
  requestAnimationFrame(loop);
}
document.fonts?.ready?.then(() => { labelCache.clear(); rebuild(); });
refreshColors(); resize(); rebuildControls(); rebuild(true); cursorRange.value = state.cursor;
requestAnimationFrame(loop);
