# Aeon Spiral

An interactive 3D instrument for time–entropy relations on different topologies, built around
Penrose's conformal cyclic cosmology (CCC) and exact results from statistical physics and dynamics.

The whole program rests on one abstraction. An **aeon is a curve (τ, S)**: a clock τ and an entropy S.
The clock becomes height, the entropy becomes a winding phase θ = 2π (S − S₀)/S_turn, and a **lens** decides
how the (height, phase) strip is embedded in space and how its ends are identified. Everything else is
derived from that, so the same physical history can be looked at through every topology, and every toy
model of emergence can be looked at through the same geometry as the cosmos.

## Running it

Open `index.html` through any static server (ES modules do not load from `file://`):

```bash
python3 -m http.server 8765
```

then visit http://localhost:8765. Three.js is loaded from jsDelivr; everything else is in this folder.

## What is on screen

| Region | Contents |
|---|---|
| Left panel | Source of the curve and its parameters; clock; topology lens; entropy per turn; display options |
| Centre | The 3D lens. Dark arrow at the cursor: curve tangent. Copper arrow: clock direction. Copper rings: thresholds (dashed = hypothesis). The floor shows the orthographic shadow |
| Bottom left | Source view: the entropy stack for the cosmos; the live Metropolis lattice; the bifurcation diagram; the oscillator circle; the percolation grid |
| Bottom right | Unrolled strip: the (phase, height) data before any lens, with thresholds, aeon boundaries and the entropy ceiling |
| Right desk | **Insight** (what is rigorously true at the cursor and what to try next), **Readout**, **Rigour** (every ingredient labelled exact / empirical / measured / model / hypothesis), **Mathematics** |

Scenes along the top are starting points: CCC chain, Conformal sphere, Entropy staircase, Eternal return,
Conformal zoom, Critical point, Arrow switches on, Clock emerges.

## Sources

- **One aeon (ΛCDM).** Exact flat-FLRW background with Planck parameters: a(t), finite conformal time η_∞,
  T_CMB(a), the de Sitter entropy bound πc⁵/(ħGH_∞²) ≈ 10^122.5 k_B. Entropy budget anchored to Egan & Lineweaver
  (2010) today, with black-hole growth modelled as a logistic in log t, evaporation from Hawking's t_ev ∝ M³ with
  S ∝ (1 − t/t_ev)^{2/3}, and Hawking-radiation entropy 1.5× the hole's. Relic radiation entropy is held constant,
  which is exact for adiabatic expansion: every turn of the cosmic spiral is gravitational.
  Clocks: log t, conformal η, ln a, linear t.
- **2D Ising model.** Onsager's exact free energy, energy, heat capacity and entropy per spin (elliptic integrals by
  AGM), Yang's magnetisation, the McCoy–Wu correlation length. A 64×64 Metropolis lattice follows the cursor
  temperature. In the clock ln(1/T) the winding density is minus the heat capacity.
- **Logistic map.** Lyapunov exponent λ(r) and the Pesin identity h_KS = λ⁺; the spiral turns only where an arrow of
  time exists. Alternative clock: iterations of a 20 000-point ensemble, whose coarse-grained entropy grows at λ
  per step after a latency set by the coarse graining.
- **Kuramoto oscillators.** 400 oscillators with Lorentzian frequencies, K_c = 2γ exactly, r = √(1 − K_c/K); phase
  entropy and fluctuation susceptibility N·Var(r); the order parameter's phase is an emergent shared clock.
- **Site percolation.** One exact Newman–Ziff sweep on 128×128; largest-cluster fraction, mean finite-cluster size,
  cluster-membership entropy; p_c = 0.59274605.
- **Custom law.** Any JavaScript expression S(t) on [0, 1].

## Lenses

Sphere (linear or Mercator latitude; Mercator makes it the stereographic image of the strip, so angles are
preserved and constant bearing is a loxodrome), cylinder (the strip rolled up), CCC chain of aeons (north pole of
one glued to the south pole of the next; crossover rule *conserve* or *reset* with an adjustable information-loss
fraction), torus (strict eternal return; the second law appears as a seam), conformal plane (Big Bang at the origin,
infinity at the rim, zoom = Penrose's conformal factor Ω), and the helicoid (entropy unwrapped into height, the
covering space in which "same position, higher level" is literal and a CCC reset is a drop at the axis).

The invariant reported at the cursor is the **conformal bearing**, the angle between the curve and the clock
direction in the Mercator strip. All conformal lenses agree on it; the sphere with linear latitude does not, and the
insight panel says so.

## Files

- `js/constants.js` physical constants, Bekenstein–Hawking and Hawking formulas, de Sitter entropy, quadrature, AGM elliptic integrals, seeded RNG
- `js/cosmos.js` FLRW background and the aeon's entropy budget, thresholds, rigour ledger
- `js/models.js` Ising (exact + Monte Carlo), logistic map, Kuramoto, percolation, custom law
- `js/lenses.js` height maps, embeddings, surfaces, graticules, threshold rings, bearings
- `js/insight.js` the insight engine
- `js/views.js` the unrolled strip and the source views
- `js/app.js` scene, controls, cursor, presets

## Extending

A new source is a function returning a curve object with `u, S, clocks, psi, chi, thresholds, ledger, readout`
(see any builder in `models.js`); register it in `SOURCES` in `app.js`. A new lens needs an `embedPoint` case, a
surface in `makeSurface`, a ring in `ringPositions` and a geometric bearing in `bearings`, all in `lenses.js`.
