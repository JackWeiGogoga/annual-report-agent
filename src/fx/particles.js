// GPU particle cloud (three.js Points + custom shaders). One full-viewport canvas; the cloud
// morphs between procedural shapes (one per chapter), each with its own brightness gradient,
// tilt, spin and point size. Reacts to the pointer with push + swirl; idles with drift/twinkle.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const randn = () => { let s = 0; for (let i = 0; i < 4; i++) s += Math.random(); return (s - 2) * 1.15; };
const put = (out, i, x, y, z) => { out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z; };
const rotX = (out, i, x, y, z, a) => { const c = Math.cos(a), s = Math.sin(a); put(out, i, x, y * c - z * s, y * s + z * c); };
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Per-shape presentation: tilt (rad, + = seen from above), spin (rad/s), point size factor,
 *  optional `angle` = yaw to snap to when the shape appears (hidden by the morph scatter). */
export const META = {
  sphere: { tilt: 0, spin: 0.12, size: 1 },
  seed: { tilt: 0, spin: 0.25, size: 1.1 },
  rose: { tilt: 0.9, spin: 0.16, size: 0.7 },
  galaxy: { tilt: 1.0, spin: 0.16, size: 0.72 },
  knot: { tilt: 0.4, spin: 0.3, size: 1 },
  columns: { tilt: 0.72, spin: 0.08, size: 0.7 },
  spike: { tilt: 0.55, spin: 0.14, size: 0.8 },
  gem: { tilt: 0.2, spin: 0.32, size: 1 },
  volumeBars: { tilt: 0.42, spin: 0.22, size: 0.9 },
  cone: { tilt: 0.3, spin: 0.4, size: 0.9 },
  lattice3d: { tilt: 0.45, spin: 0.24, size: 0.95 },
  terrain: { tilt: 0.62, spin: 0.1, size: 0.7 },
  infinity: { tilt: 0.25, spin: 0.28, size: 0.95 },
  dna: { tilt: 0.15, spin: 0.45, size: 1 },
  grid: { tilt: 0, spin: 0.1, size: 1 },
  scatter: { tilt: 0, spin: 0.3, size: 1 },
  ring: { tilt: 0.3, spin: 0.2, size: 1 },
  wave: { tilt: 0.5, spin: 0.12, size: 0.9 },
};

/** Each shape fills `out` (xyz) and `sh` (0..1 brightness) for n particles. */
export const SHAPES = {
  sphere(n, out, sh) {
    const r = 1.7;
    for (let i = 0; i < n; i++) {
      const k = i + 0.5, phi = Math.acos(1 - (2 * k) / n), th = Math.PI * (1 + Math.sqrt(5)) * k;
      const rr = r * (0.9 + Math.random() * 0.1);
      put(out, i, rr * Math.cos(th) * Math.sin(phi), rr * Math.sin(th) * Math.sin(phi), rr * Math.cos(phi));
      sh[i] = 0.55 + Math.random() * 0.45;
    }
  },
  seed(n, out, sh) {
    for (let i = 0; i < n; i++) {
      const r = Math.cbrt(Math.random()) * 0.42, u = Math.random() * TAU, v = Math.acos(2 * Math.random() - 1);
      put(out, i, r * Math.sin(v) * Math.cos(u), r * Math.sin(v) * Math.sin(u), r * Math.cos(v));
      sh[i] = 0.6 + 0.4 * (1 - r / 0.42);
    }
  },
  /** The classic parametric rose (petal spiral). Points sit on petal rims and contour lines so the
   *  petals read as drawn curves; a faint surface fill gives body. Blooms from `seed`. */
  rose(n, out, sh) {
    const k = 2.35;
    for (let i = 0; i < n; i++) {
      if (Math.random() < 0.08) {                                    // stem + two leaves
        const f = Math.random();
        if (f < 0.72) { const g = f / 0.72; put(out, i, 0.2 * g * g + randn() * 0.02, -0.55 - 2.2 * g, 0.05 * g + randn() * 0.02); sh[i] = 0.35 + 0.2 * Math.random(); }
        else { const side = f < 0.86 ? 1 : -1, g = Math.random(), w = Math.sin(g * Math.PI) * 0.24, bx = 0.2 * 0.5 * 0.5, by = -0.55 - 2.2 * 0.5;
          put(out, i, bx + side * (0.08 + g * 0.6) + randn() * 0.015, by + g * 0.3 * side + (Math.random() - 0.5) * w, randn() * 0.02 + (Math.random() - 0.5) * w); sh[i] = 0.45 + 0.25 * Math.random(); }
        continue;
      }
      // where on the petal: rim (x≈1), a contour line, or the surface fill
      const kind = Math.random();
      let x, shade;
      if (kind < 0.56) { x = 1 - Math.abs(randn()) * 0.03; shade = 0.92 + 0.08 * Math.random(); }
      else if (kind < 0.8) { x = [0.3, 0.55, 0.78][Math.floor(Math.random() * 3)] + randn() * 0.012; shade = 0.5 + 0.15 * Math.random(); }
      else { x = Math.random(); shade = 0.1 + 0.15 * Math.random(); }
      const t = -4 * Math.PI + Math.random() * 20 * Math.PI;        // spiral parameter
      const p = (Math.PI / 2) * Math.exp(-t / (8 * Math.PI));
      const m = (((3.6 * t) % TAU) + TAU) % TAU;
      const u = 1 - Math.pow(1 - m / Math.PI, 4) / 2;              // petal envelope
      const y = 2 * Math.pow(x * x - x, 2) * Math.sin(p);
      const r = u * (x * Math.sin(p) + y * Math.cos(p));
      const hgt = u * (x * Math.cos(p) - y * Math.sin(p));
      put(out, i, r * Math.cos(t) * k, (hgt - 0.3) * k + 0.35, r * Math.sin(t) * k);
      sh[i] = shade;
    }
  },
  /** Spiral galaxy: three log-spiral arms, bright core, thin disc. */
  galaxy(n, out, sh) {
    const arms = 3;
    for (let i = 0; i < n; i++) {
      const r = Math.pow(Math.random(), 0.65) * 2.3;
      const arm = i % arms;
      const ang = r * 2.6 + (arm * TAU) / arms + randn() * 0.28 * (0.35 + r / 2.3);
      const thick = 0.02 + 0.16 * Math.exp(-r * 1.2);
      put(out, i, r * Math.cos(ang), randn() * thick, r * Math.sin(ang));
      sh[i] = clamp01(1 - r / 2.6) * 0.75 + 0.25 * Math.random();
    }
  },
  /** Trefoil torus knot (p=2, q=3) with a soft tube. */
  knot(n, out, sh) {
    const R = 1.15, r = 0.42, tube = 0.11;
    for (let i = 0; i < n; i++) {
      const t = Math.random() * TAU;
      const cq = Math.cos(3 * t), sq = Math.sin(3 * t);
      const rr = R + r * cq;
      put(out, i, rr * Math.cos(2 * t) + randn() * tube, rr * Math.sin(2 * t) + randn() * tube, r * sq * 1.4 + randn() * tube);
      sh[i] = 0.4 + 0.6 * (0.5 + 0.5 * sq);
    }
  },
  /** A sharp signal spike rising from a rippled plane. */
  spike(n, out, sh) {
    for (let i = 0; i < n; i++) {
      const onSpike = Math.random() < 0.35;
      let x, z;
      if (onSpike) { const rr = Math.abs(randn()) * 0.22; const a = Math.random() * TAU; x = rr * Math.cos(a); z = rr * Math.sin(a); }
      else { x = rand(-2.5, 2.5); z = rand(-1.5, 1.5); }
      const h = 2.4 * Math.exp(-(x * x + z * z) / 0.09) + 0.14 * Math.sin(x * 3.1) * Math.cos(z * 2.4);
      put(out, i, x, h - 0.8, z);
      sh[i] = clamp01(0.3 + h / 2.4);
    }
  },
  /** Octahedral gem: bright edges, faint faces. */
  gem(n, out, sh) {
    const V = [[1.4, 0, 0], [-1.4, 0, 0], [0, 1.75, 0], [0, -1.75, 0], [0, 0, 1.4], [0, 0, -1.4]];
    const E = [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [2, 5], [3, 4], [3, 5]];
    for (let i = 0; i < n; i++) {
      if (Math.random() < 0.55) {
        const [a, b] = E[Math.floor(Math.random() * E.length)], f = Math.random();
        put(out, i, V[a][0] + (V[b][0] - V[a][0]) * f + randn() * 0.02, V[a][1] + (V[b][1] - V[a][1]) * f + randn() * 0.02, V[a][2] + (V[b][2] - V[a][2]) * f + randn() * 0.02);
        sh[i] = 0.85 + 0.15 * Math.random();
      } else {
        const x = rand(-1, 1), y = rand(-1, 1), z = rand(-1, 1), s = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1;
        put(out, i, (x / s) * 1.4, (y / s) * 1.75, (z / s) * 1.4);
        sh[i] = 0.3 + 0.25 * Math.random();
      }
    }
  },
  /** Conical spiral staircase — compounding growth. */
  cone(n, out, sh) {
    for (let i = 0; i < n; i++) {
      const f = Math.random();
      const r = 0.15 + 1.45 * f, y = -1.6 + 3.2 * f;
      if (Math.random() < 0.4) {                                   // faint cone surface
        const a = Math.random() * TAU;
        put(out, i, r * Math.cos(a), y, r * Math.sin(a)); sh[i] = 0.12 + 0.18 * f; continue;
      }
      const ang = f * TAU * 5.5, w = 0.22 * Math.random();       // bright spiral rail
      put(out, i, (r - w) * Math.cos(ang) + randn() * 0.02, y + randn() * 0.03, (r - w) * Math.sin(ang) + randn() * 0.02);
      sh[i] = 0.45 + 0.55 * f;
    }
  },
  /** 3D wireframe lattice (4×4×4), nodes bright. */
  lattice3d(n, out, sh) {
    const k = 4, s = 0.72, o = -((k - 1) * s) / 2;
    for (let i = 0; i < n; i++) {
      const a = Math.floor(Math.random() * k), b = Math.floor(Math.random() * k), c = Math.floor(Math.random() * k);
      if (Math.random() < 0.22) { put(out, i, o + a * s + randn() * 0.03, o + b * s + randn() * 0.03, o + c * s + randn() * 0.03); sh[i] = 1; continue; }
      const axis = Math.floor(Math.random() * 3), f = Math.random();
      const p = [o + a * s, o + b * s, o + c * s];
      if (p[axis] + s > o + (k - 1) * s + 1e-3) p[axis] -= s;
      p[axis] += f * s;
      put(out, i, p[0] + randn() * 0.012, p[1] + randn() * 0.012, p[2] + randn() * 0.012);
      sh[i] = 0.35 + 0.25 * Math.random();
    }
  },
  /** Mountain range heightfield with a dominant peak. */
  terrain(n, out, sh) {
    for (let i = 0; i < n; i++) {
      const x = rand(-2.6, 2.6), z = rand(-1.5, 1.5);
      const h = 1.9 * Math.exp(-((x - 0.5) ** 2 / 0.55 + (z + 0.15) ** 2 / 0.4))
        + 0.9 * Math.exp(-((x + 1.5) ** 2 / 0.8 + (z - 0.4) ** 2 / 0.6))
        + 0.5 * Math.exp(-((x - 1.9) ** 2 / 0.5 + (z - 0.6) ** 2 / 0.5))
        + 0.08 * Math.sin(x * 5.2 + z * 3.1) * Math.cos(z * 6.3);
      put(out, i, x, h - 0.9, z);
      sh[i] = clamp01(0.22 + h / 1.9);
    }
  },
  /** Infinity loop (lemniscate tube): inflow side bright, outflow side dim. */
  infinity(n, out, sh) {
    const a = 2.1, tube = 0.14;
    for (let i = 0; i < n; i++) {
      const t = Math.random() * TAU, d = 1 + Math.sin(t) ** 2;
      const x = (a * Math.cos(t)) / d, y = (a * Math.sin(t) * Math.cos(t)) / d;
      put(out, i, x + randn() * tube, y + randn() * tube, randn() * tube);
      sh[i] = x > 0 ? 0.85 + 0.15 * Math.random() : 0.35 + 0.15 * Math.random();
    }
  },
  /** Double helix with base-pair rungs — trading DNA. */
  dna(n, out, sh) {
    const R = 0.95, H = 3.8, turns = 2.6;
    for (let i = 0; i < n; i++) {
      const f = Math.random(), ang = f * TAU * turns, y = -H / 2 + f * H;
      if (Math.random() < 0.3) {
        const fr = Math.round(f * 26) / 26, ang2 = fr * TAU * turns, g = Math.random();
        const x1 = R * Math.cos(ang2), z1 = R * Math.sin(ang2);
        put(out, i, x1 * (1 - 2 * g) + randn() * 0.015, -H / 2 + fr * H + randn() * 0.015, z1 * (1 - 2 * g) + randn() * 0.015);
        sh[i] = 0.35 + 0.2 * Math.random();
      } else {
        const strand = Math.random() < 0.5 ? 0 : Math.PI;
        put(out, i, R * Math.cos(ang + strand) + randn() * 0.03, y, R * Math.sin(ang + strand) + randn() * 0.03);
        sh[i] = 0.75 + 0.25 * Math.random();
      }
    }
  },
  /** OKX-style block mark: 3×3, corners + centre filled. */
  grid(n, out, sh) {
    const blocks = [[-1, 1], [1, 1], [0, 0], [-1, -1], [1, -1]], s = 0.8, gap = 0.88;
    for (let i = 0; i < n; i++) {
      const b = blocks[i % 5];
      put(out, i, b[0] * gap + rand(-s / 2, s / 2), b[1] * gap + rand(-s / 2, s / 2), rand(-0.16, 0.16));
      sh[i] = 0.7 + 0.3 * Math.random();
    }
  },
  scatter(n, out, sh) { for (let i = 0; i < n; i++) { put(out, i, rand(-3.2, 3.2), rand(-4, 4), rand(-2.5, 2.5)); sh[i] = Math.random(); } },
  ring(n, out, sh) {
    const R = 1.6, r = 0.2;
    for (let i = 0; i < n; i++) {
      const u = Math.random() * TAU, v = Math.random() * TAU, rr = r * Math.sqrt(Math.random());
      rotX(out, i, (R + rr * Math.cos(v)) * Math.cos(u), (R + rr * Math.cos(v)) * Math.sin(u), rr * Math.sin(v), 1.1);
      sh[i] = 0.5 + 0.5 * Math.random();
    }
  },
  wave(n, out, sh) {
    for (let i = 0; i < n; i++) {
      const x = rand(-2.5, 2.5), z = rand(-1.5, 1.5), y = 0.34 * Math.sin(x * 2.0 + z * 1.4) + 0.1 * Math.sin(x * 5.0 + z);
      put(out, i, x, y, z); sh[i] = 0.4 + 0.6 * (0.5 + y);
    }
  },
};

/** Dense overlay shapes for hero moments (tens of thousands of soft points). Each fills
 *  xyz, shade (0..1) and birth (0..1 = when the point appears during the bloom). */
export const BLOOMS = {
  rose(n, out, sh, birth) {
    const k = 2.35;
    for (let i = 0; i < n; i++) {
      if (Math.random() < 0.07) {                                    // stem + leaves grow first
        const f = Math.random();
        if (f < 0.7) { const g = f / 0.7; put(out, i, 0.2 * g * g + randn() * 0.03, -0.55 - 2.2 * g, 0.05 * g + randn() * 0.03); sh[i] = 0.3 + 0.2 * Math.random(); birth[i] = 0.02 + 0.12 * (1 - g); }
        else { const side = f < 0.85 ? 1 : -1, g = Math.random(), w = Math.sin(g * Math.PI) * 0.26, bx = 0.05, by = -0.55 - 2.2 * 0.5;
          put(out, i, bx + side * (0.08 + g * 0.62) + randn() * 0.02, by + g * 0.3 * side + (Math.random() - 0.5) * w, randn() * 0.03 + (Math.random() - 0.5) * w); sh[i] = 0.45 + 0.3 * Math.random(); birth[i] = 0.12 + 0.1 * g; }
        continue;
      }
      const x = Math.pow(Math.random(), 0.8);                       // petal radial coord, slight rim bias
      const tn = Math.random();                                     // 0 = bud centre … 1 = outermost petal
      const t = -4 * Math.PI + tn * 20 * Math.PI;
      const p = (Math.PI / 2) * Math.exp(-t / (8 * Math.PI));
      const m = (((3.6 * t) % TAU) + TAU) % TAU;
      const u = 1 - Math.pow(1 - m / Math.PI, 4) / 2;
      const y = 2 * Math.pow(x * x - x, 2) * Math.sin(p);
      const r = u * (x * Math.sin(p) + y * Math.cos(p));
      const hgt = u * (x * Math.cos(p) - y * Math.sin(p));
      put(out, i, r * Math.cos(t) * k, (hgt - 0.3) * k + 0.35, r * Math.sin(t) * k);
      const rim = Math.exp(-Math.pow((1 - x) / 0.06, 2));           // bright petal edge
      sh[i] = clamp01(0.32 + 0.5 * Math.pow(x, 1.3) + 0.4 * rim + 0.1 * (Math.random() - 0.5));
      birth[i] = 0.18 + 0.72 * tn + 0.06 * Math.random();          // unfold from the centre outward
    }
  },
};

const VERT = /* glsl */ `
attribute vec3 aTo; attribute float aSeed; attribute float aSize; attribute float aShade; attribute float aShadeTo;
uniform float uTime, uProgress, uPush, uPR, uScale, uDrift, uSize; uniform vec3 uPointer;
varying float vA; varying float vShade;
void main(){
  float p = clamp((uProgress - aSeed*0.4)/0.6, 0.0, 1.0);
  p = p*p*(3.0-2.0*p);
  vec3 pos = mix(position, aTo, p);
  float arc = sin(p*3.14159) * 0.4;
  pos += normalize(pos + vec3(0.001)) * arc * (0.4 + aSeed);
  pos += uDrift * 0.018 * vec3(sin(uTime*0.9 + aSeed*40.0), cos(uTime*0.8 + aSeed*23.0), sin(uTime*1.1 + aSeed*11.0));
  vec2 d = pos.xy - uPointer.xy; float dist = length(d);
  float f = uPush * smoothstep(1.5, 0.0, dist);
  vec2 dn = d / max(dist, 0.0001);
  pos.xy += dn * f * 0.75 + vec2(-dn.y, dn.x) * f * 0.45;
  pos *= uScale;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  vShade = mix(aShade, aShadeTo, p);
  gl_PointSize = aSize * 1.9 * uSize * uPR * (5.5 / -mv.z) * (0.7 + 0.6 * vShade);
  vA = 0.4 + 0.6 * (0.5 + 0.5*sin(uTime*1.7 + aSeed*80.0));
}`;
const FRAG = /* glsl */ `
uniform vec3 uColor, uDeep, uHot; uniform float uOpacity; varying float vA; varying float vShade;
void main(){
  vec2 c = gl_PointCoord - 0.5; float r = length(c); if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.12, r);
  vec3 col = mix(uDeep, uColor, smoothstep(0.0, 0.8, vShade));
  col = mix(col, uHot, smoothstep(0.82, 1.0, vShade) * 0.85);
  gl_FragColor = vec4(col, a * vA * uOpacity * (0.55 + 0.45 * vShade));
}`;

const BLOOM_VERT = /* glsl */ `
attribute float aSeed; attribute float aSize; attribute float aShade; attribute float aBirth;
uniform float uTime, uGrow, uPush, uPR, uScale, uSize; uniform vec3 uPointer;
varying float vA; varying float vShade;
void main(){
  float g = smoothstep(aBirth, aBirth + 0.22, uGrow);
  vec3 pos = position * mix(0.12, 1.0, g);
  pos += 0.012 * vec3(sin(uTime*0.9 + aSeed*40.0), cos(uTime*0.8 + aSeed*23.0), sin(uTime*1.1 + aSeed*11.0));
  vec2 d = pos.xy - uPointer.xy; float dist = length(d);
  float f = uPush * smoothstep(1.5, 0.0, dist);
  vec2 dn = d / max(dist, 0.0001);
  pos.xy += dn * f * 0.75 + vec2(-dn.y, dn.x) * f * 0.45;
  pos *= uScale;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  vShade = aShade;
  gl_PointSize = aSize * 2.6 * uSize * uPR * (5.5 / -mv.z) * (0.75 + 0.5 * aShade);
  vA = g * (0.75 + 0.25 * sin(uTime*1.3 + aSeed*70.0));
}`;
const BLOOM_FRAG = /* glsl */ `
uniform vec3 uColor, uDeep, uHot; uniform float uOpacity; varying float vA; varying float vShade;
void main(){
  vec2 c = gl_PointCoord - 0.5; float r2 = dot(c, c); if (r2 > 0.25) discard;
  float a = exp(-r2 * 10.0);
  vec3 col = mix(uDeep, uColor, smoothstep(0.0, 0.65, vShade));
  col = mix(col, uHot, smoothstep(0.78, 1.0, vShade));
  gl_FragColor = vec4(col, a * vA * uOpacity * 0.6);
}`;

export function createParticles(canvas, { count = 12000, color = '#bcff2f', deep = '#2b6d17', hot = '#eaffbd', reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  const pr = Math.min(2, window.devicePixelRatio || 1);
  renderer.setPixelRatio(pr);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
  camera.position.set(0, 0, 7);

  const from = new Float32Array(count * 3), to = new Float32Array(count * 3);
  const seed = new Float32Array(count), size = new Float32Array(count);
  const shade = new Float32Array(count), shadeTo = new Float32Array(count);
  for (let i = 0; i < count; i++) { seed[i] = Math.random(); size[i] = 0.55 + Math.pow(Math.random(), 2.2) * 1.5; }
  SHAPES.sphere(count, from, shade); to.set(from); shadeTo.set(shade);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(from, 3));
  geo.setAttribute('aTo', new THREE.BufferAttribute(to, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));
  geo.setAttribute('aShadeTo', new THREE.BufferAttribute(shadeTo, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);

  const uniforms = {
    uTime: { value: 0 }, uProgress: { value: 1 }, uColor: { value: new THREE.Color(color) }, uDeep: { value: new THREE.Color(deep) }, uHot: { value: new THREE.Color(hot) },
    uPointer: { value: new THREE.Vector3(99, 99, 0) }, uPush: { value: 0 }, uPR: { value: pr },
    uOpacity: { value: 1 }, uScale: { value: 1 }, uDrift: { value: reduced ? 0.15 : 1 }, uSize: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const rig = new THREE.Group();          // both layers share position / rotation
  rig.add(points);
  scene.add(rig);

  // --- dense bloom overlay (hero moments), same rig so it rotates with the cloud
  const BLOOM_N = 48000;
  const bPos = new Float32Array(BLOOM_N * 3), bShade = new Float32Array(BLOOM_N), bBirth = new Float32Array(BLOOM_N);
  const bSeed = new Float32Array(BLOOM_N), bSize = new Float32Array(BLOOM_N);
  for (let i = 0; i < BLOOM_N; i++) { bSeed[i] = Math.random(); bSize[i] = 0.5 + Math.pow(Math.random(), 1.6) * 1.3; }
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  bGeo.setAttribute('aShade', new THREE.BufferAttribute(bShade, 1));
  bGeo.setAttribute('aBirth', new THREE.BufferAttribute(bBirth, 1));
  bGeo.setAttribute('aSeed', new THREE.BufferAttribute(bSeed, 1));
  bGeo.setAttribute('aSize', new THREE.BufferAttribute(bSize, 1));
  bGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);
  const bUniforms = {
    uTime: { value: 0 }, uGrow: { value: 0 }, uPush: { value: 0 }, uPR: { value: pr }, uScale: { value: 1 }, uSize: { value: 1 },
    uPointer: { value: new THREE.Vector3(99, 99, 0) }, uOpacity: { value: 0 },
    uColor: { value: new THREE.Color(color) }, uDeep: { value: new THREE.Color('#3c8f24') }, uHot: { value: new THREE.Color(hot) },
  };
  const bMat = new THREE.ShaderMaterial({ uniforms: bUniforms, vertexShader: BLOOM_VERT, fragmentShader: BLOOM_FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const bloomPts = new THREE.Points(bGeo, bMat);
  bloomPts.frustumCulled = false; bloomPts.visible = false;
  rig.add(bloomPts);
  let bloomName = null, bloomOpacityT = 0, bloomGrowT = 0, bloomToken = 0;
  function bloom(name, { duration = 3400 } = {}) {
    if (!BLOOMS[name]) return;
    if (bloomName !== name) { BLOOMS[name](BLOOM_N, bPos, bShade, bBirth); bGeo.attributes.position.needsUpdate = true; bGeo.attributes.aShade.needsUpdate = true; bGeo.attributes.aBirth.needsUpdate = true; bloomName = name; }
    bloomPts.visible = true; bloomOpacityT = 1; bUniforms.uGrow.value = 0; bloomGrowT = 1;
    const token = ++bloomToken, t0 = performance.now(), d = reduced ? 400 : duration;
    (function f(now) { if (token !== bloomToken) return; const p = Math.min(1, (now - t0) / d); bUniforms.uGrow.value = p; if (p < 1) requestAnimationFrame(f); })(t0);
  }
  function unbloom() { bloomOpacityT = 0; bloomToken++; }

  // --- layout: focus the cloud on a screen rect (world units at z=0 plane)
  let W = 1, H = 1;
  const focus = { x: 0, y: 0, tx: 0, ty: 0, s: 1, ts: 1 };
  function worldHalf() { const h = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z; return { hx: h * camera.aspect, hy: h }; }
  function setFocus(rect, { scale = 1 } = {}) {
    const { hx, hy } = worldHalf();
    const cx = (rect.left + rect.width / 2) / W, cy = (rect.top + rect.height / 2) / H;
    focus.tx = (cx * 2 - 1) * hx; focus.ty = (1 - cy * 2) * hy; focus.ts = scale;
  }
  function resize() {
    W = canvas.clientWidth || window.innerWidth; H = canvas.clientHeight || window.innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  // --- pointer (screen px → local space of points)
  const v3 = new THREE.Vector3();
  let pushTarget = 0;
  function setPointer(px, py) {
    v3.set((px / W) * 2 - 1, -((py / H) * 2 - 1), 0.5).unproject(camera);
    const dir = v3.sub(camera.position).normalize();
    const dist = -camera.position.z / dir.z;
    const p = camera.position.clone().add(dir.multiplyScalar(dist));
    rig.worldToLocal(p);
    uniforms.uPointer.value.copy(p); bUniforms.uPointer.value.copy(p);
    pushTarget = 1;
  }
  function releasePointer() { pushTarget = 0; }

  // --- morph
  let morphToken = 0, current = 'sphere';
  const view = { tilt: 0, tiltT: 0, spin: 0.12, spinT: 0.12, size: 1, sizeT: 1, angle: 0 };
  function bake() {
    const p = uniforms.uProgress.value;
    if (p >= 1) { from.set(to); shade.set(shadeTo); return; }
    for (let i = 0; i < count; i++) {
      let pi = Math.min(1, Math.max(0, (p - seed[i] * 0.4) / 0.6)); pi = pi * pi * (3 - 2 * pi);
      for (let k = 0; k < 3; k++) from[i * 3 + k] += (to[i * 3 + k] - from[i * 3 + k]) * pi;
      shade[i] += (shadeTo[i] - shade[i]) * pi;
    }
  }
  function morphTo(name, { duration = 1600 } = {}) {
    if (!SHAPES[name] || name === current) return Promise.resolve();
    current = name;
    bake();
    SHAPES[name](count, to, shadeTo);
    geo.attributes.position.needsUpdate = true; geo.attributes.aTo.needsUpdate = true;
    geo.attributes.aShade.needsUpdate = true; geo.attributes.aShadeTo.needsUpdate = true;
    const meta = META[name] || {};
    if (meta.tilt != null) view.tiltT = meta.tilt;
    if (meta.spin != null) view.spinT = meta.spin;
    if (meta.size != null) view.sizeT = meta.size;
    if (meta.angle != null) view.angle = meta.angle;
    if (BLOOMS[name]) bloom(name, { duration: Math.max(2600, duration) }); else unbloom();
    uniforms.uProgress.value = 0;
    const token = ++morphToken;
    const t0 = performance.now();
    const d = reduced ? 300 : duration;
    return new Promise((res) => {
      function f(now) {
        if (token !== morphToken) return res();
        const p = Math.min(1, (now - t0) / d);
        uniforms.uProgress.value = p;
        if (p < 1) requestAnimationFrame(f); else res();
      }
      requestAnimationFrame(f);
    });
  }

  // --- opacity / spin / pulse
  let opacity = 1, opacityT = 1, pulse = 0;
  function setOpacity(v) { opacityT = v; }
  function setSpin(v) { view.spinT = v; }
  function kick() { pulse = 1; }

  let running = true, last = performance.now(), t = 0;
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    uniforms.uTime.value = t;
    uniforms.uPush.value += (pushTarget - uniforms.uPush.value) * (pushTarget ? 0.18 : 0.06);
    opacity += (opacityT - opacity) * 0.06; uniforms.uOpacity.value = opacity;
    view.spin += (view.spinT - view.spin) * 0.05;
    view.tilt += (view.tiltT - view.tilt) * 0.04;
    view.size += (view.sizeT - view.size) * 0.05; uniforms.uSize.value = view.size;
    view.angle += view.spin * dt;
    pulse *= 0.92;
    focus.x += (focus.tx - focus.x) * 0.07; focus.y += (focus.ty - focus.y) * 0.07; focus.s += (focus.ts - focus.s) * 0.07;
    uniforms.uScale.value = focus.s * (1 + pulse * 0.18);
    rig.position.set(focus.x, focus.y + Math.sin(t * 0.6) * 0.06, 0);
    rig.rotation.y = view.angle;
    rig.rotation.x = view.tilt + Math.sin(t * 0.25) * 0.08;
    // bloom layer follows the cloud's uniforms
    bUniforms.uTime.value = t; bUniforms.uPush.value = uniforms.uPush.value; bUniforms.uScale.value = uniforms.uScale.value; bUniforms.uSize.value = view.size;
    bUniforms.uOpacity.value += (bloomOpacityT * opacity - bUniforms.uOpacity.value) * (bloomOpacityT ? 0.05 : 0.09);
    if (bUniforms.uOpacity.value < 0.005 && !bloomOpacityT) bloomPts.visible = false;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  return {
    morphTo, setFocus, setPointer, releasePointer, setOpacity, setSpin, kick, resize, bloom, unbloom,
    _debug() { return { bloomName, visible: bloomPts.visible, opacity: bUniforms.uOpacity.value, grow: bUniforms.uGrow.value, target: bloomOpacityT, pointsDrawn: renderer.info.render.points, programs: renderer.info.programs.map((p) => ({ name: p.name, used: p.usedTimes })), sampleShade: [bShade[0], bShade[1000]], samplePos: [bPos[0], bPos[1], bPos[2]] }; },
    registerShape(name, fn, meta) { SHAPES[name] = fn; if (meta) META[name] = meta; },
    setColor(hex) { uniforms.uColor.value.set(hex); },
    get shape() { return current; },
    destroy() { running = false; renderer.dispose(); geo.dispose(); mat.dispose(); bGeo.dispose(); bMat.dispose(); },
  };
}
