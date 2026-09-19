// GPU particle cloud (three.js Points + custom shaders). Morphs between procedural shapes,
// reacts to pointer with push + swirl, idles with drift & twinkle. One full-viewport canvas;
// the cloud is re-centred on any screen rect via setFocus().
import * as THREE from 'three';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const rotX = (out, i, x, y, z, a) => { const c = Math.cos(a), s = Math.sin(a); out[i] = x; out[i + 1] = y * c - z * s; out[i + 2] = y * s + z * c; };

export const SHAPES = {
  sphere(n, out) {
    const r = 1.7;
    for (let i = 0; i < n; i++) {
      const k = i + 0.5, phi = Math.acos(1 - (2 * k) / n), th = Math.PI * (1 + Math.sqrt(5)) * k;
      const rr = r * (0.9 + Math.random() * 0.1);
      out[i * 3] = rr * Math.cos(th) * Math.sin(phi); out[i * 3 + 1] = rr * Math.sin(th) * Math.sin(phi); out[i * 3 + 2] = rr * Math.cos(phi);
    }
  },
  seed(n, out) {
    for (let i = 0; i < n; i++) {
      const r = Math.cbrt(Math.random()) * 0.42, u = Math.random() * TAU, v = Math.acos(2 * Math.random() - 1);
      out[i * 3] = r * Math.sin(v) * Math.cos(u); out[i * 3 + 1] = r * Math.sin(v) * Math.sin(u); out[i * 3 + 2] = r * Math.cos(v);
    }
  },
  ring(n, out) {
    const R = 1.6, r = 0.2;
    for (let i = 0; i < n; i++) {
      const u = Math.random() * TAU, v = Math.random() * TAU, rr = r * Math.sqrt(Math.random());
      rotX(out, i * 3, (R + rr * Math.cos(v)) * Math.cos(u), (R + rr * Math.cos(v)) * Math.sin(u), rr * Math.sin(v), 1.1);
    }
  },
  grid(n, out) {
    // OKX-style block mark: 3×3, corners + centre filled
    const blocks = [[-1, 1], [1, 1], [0, 0], [-1, -1], [1, -1]], s = 0.8, gap = 0.88;
    for (let i = 0; i < n; i++) {
      const b = blocks[i % 5];
      out[i * 3] = b[0] * gap + rand(-s / 2, s / 2); out[i * 3 + 1] = b[1] * gap + rand(-s / 2, s / 2); out[i * 3 + 2] = rand(-0.16, 0.16);
    }
  },
  wave(n, out) {
    for (let i = 0; i < n; i++) {
      const x = rand(-2.5, 2.5), z = rand(-1.5, 1.5);
      const y = 0.34 * Math.sin(x * 2.0 + z * 1.4) + 0.1 * Math.sin(x * 5.0 + z);
      rotX(out, i * 3, x, y, z, 0.95);
    }
  },
  helix(n, out) {
    for (let i = 0; i < n; i++) {
      const strand = i % 2, f = i / n, ang = f * TAU * 3 + strand * Math.PI, r = 1.0 + rand(-0.06, 0.06);
      out[i * 3] = r * Math.cos(ang) + rand(-0.04, 0.04); out[i * 3 + 1] = f * 3.8 - 1.9; out[i * 3 + 2] = r * Math.sin(ang) + rand(-0.04, 0.04);
    }
  },
  scatter(n, out) {
    for (let i = 0; i < n; i++) { out[i * 3] = rand(-3.2, 3.2); out[i * 3 + 1] = rand(-4, 4); out[i * 3 + 2] = rand(-2.5, 2.5); }
  },
  diamond(n, out) {
    for (let i = 0; i < n; i++) {
      const x = rand(-1, 1), y = rand(-1, 1), z = rand(-1, 1), s = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1, k = 1.7 / s;
      out[i * 3] = x * k; out[i * 3 + 1] = y * k * 1.2; out[i * 3 + 2] = z * k;
    }
  },
  bars(n, out) {
    const hs = [2.6, 1.4, 0.5], xs = [-1.15, 0, 1.15];
    for (let i = 0; i < n; i++) {
      const c = i % 3;
      out[i * 3] = xs[c] + rand(-0.3, 0.3); out[i * 3 + 1] = -1.3 + Math.random() * hs[c]; out[i * 3 + 2] = rand(-0.3, 0.3);
    }
  },
  peak(n, out) {
    // mountain silhouette: y = envelope(x) noise volume
    for (let i = 0; i < n; i++) {
      const x = rand(-2.6, 2.6);
      const env = Math.max(0, 2.2 * Math.exp(-Math.pow((x - 0.6) / 0.9, 2)) + 1.0 * Math.exp(-Math.pow((x + 1.4) / 0.8, 2)));
      out[i * 3] = x; out[i * 3 + 1] = -1.4 + Math.random() * env; out[i * 3 + 2] = rand(-0.5, 0.5);
    }
  },
  lattice(n, out) {
    // flat grid plane (for the grid-bot chapter)
    const k = 14;
    for (let i = 0; i < n; i++) {
      const gx = Math.floor(Math.random() * k), gy = Math.floor(Math.random() * k);
      rotX(out, i * 3, (gx / (k - 1) - 0.5) * 4.2 + rand(-0.03, 0.03), (gy / (k - 1) - 0.5) * 4.2 + rand(-0.03, 0.03), rand(-0.05, 0.05), 1.15);
    }
  },
};

const VERT = /* glsl */ `
attribute vec3 aTo; attribute float aSeed; attribute float aSize;
uniform float uTime, uProgress, uPush, uPR, uScale, uDrift; uniform vec3 uPointer;
varying float vA;
void main(){
  float p = clamp((uProgress - aSeed*0.4)/0.6, 0.0, 1.0);
  p = p*p*(3.0-2.0*p);
  vec3 pos = mix(position, aTo, p);
  float arc = sin(p*3.14159) * 0.4;
  pos += normalize(pos + vec3(0.001)) * arc * (0.4 + aSeed);
  pos += uDrift * 0.04 * vec3(sin(uTime*0.9 + aSeed*40.0), cos(uTime*0.8 + aSeed*23.0), sin(uTime*1.1 + aSeed*11.0));
  vec2 d = pos.xy - uPointer.xy; float dist = length(d);
  float f = uPush * smoothstep(1.5, 0.0, dist);
  vec2 dn = d / max(dist, 0.0001);
  pos.xy += dn * f * 0.75 + vec2(-dn.y, dn.x) * f * 0.45;
  pos *= uScale;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * 2.4 * uPR * (5.5 / -mv.z);
  vA = 0.4 + 0.6 * (0.5 + 0.5*sin(uTime*1.7 + aSeed*80.0));
}`;
const FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uOpacity; varying float vA;
void main(){
  vec2 c = gl_PointCoord - 0.5; float r = length(c); if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.12, r);
  gl_FragColor = vec4(uColor, a * vA * uOpacity);
}`;

export function createParticles(canvas, { count = 5200, color = '#bcff2f', reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  const pr = Math.min(2, window.devicePixelRatio || 1);
  renderer.setPixelRatio(pr);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
  camera.position.set(0, 0, 7);

  const from = new Float32Array(count * 3), to = new Float32Array(count * 3);
  const seed = new Float32Array(count), size = new Float32Array(count);
  for (let i = 0; i < count; i++) { seed[i] = Math.random(); size[i] = 0.55 + Math.pow(Math.random(), 2.2) * 1.5; }
  SHAPES.sphere(count, from); to.set(from);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(from, 3));
  geo.setAttribute('aTo', new THREE.BufferAttribute(to, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);

  const uniforms = {
    uTime: { value: 0 }, uProgress: { value: 1 }, uColor: { value: new THREE.Color(color) },
    uPointer: { value: new THREE.Vector3(99, 99, 0) }, uPush: { value: 0 }, uPR: { value: pr },
    uOpacity: { value: 1 }, uScale: { value: 1 }, uDrift: { value: reduced ? 0.15 : 1 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

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
    points.worldToLocal(p);
    uniforms.uPointer.value.copy(p);
    pushTarget = 1;
  }
  function releasePointer() { pushTarget = 0; }

  // --- morph
  let morphToken = 0;
  function bake() {
    const p = uniforms.uProgress.value;
    if (p >= 1) { from.set(to); return; }
    for (let i = 0; i < count; i++) {
      let pi = Math.min(1, Math.max(0, (p - seed[i] * 0.4) / 0.6)); pi = pi * pi * (3 - 2 * pi);
      for (let k = 0; k < 3; k++) from[i * 3 + k] += (to[i * 3 + k] - from[i * 3 + k]) * pi;
    }
  }
  let current = 'sphere';
  function morphTo(name, { duration = 1600 } = {}) {
    if (!SHAPES[name] || name === current) return Promise.resolve();
    current = name;
    bake();
    SHAPES[name](count, to);
    geo.attributes.position.needsUpdate = true; geo.attributes.aTo.needsUpdate = true;
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

  // --- opacity / scale / spin
  let opacity = 1, opacityT = 1, spin = 0.12, spinT = 0.12, pulse = 0;
  function setOpacity(v) { opacityT = v; }
  function setSpin(v) { spinT = v; }
  function kick() { pulse = 1; }

  let running = true, t0 = performance.now();
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const t = (now - t0) / 1000;
    uniforms.uTime.value = t;
    uniforms.uPush.value += (pushTarget - uniforms.uPush.value) * (pushTarget ? 0.18 : 0.06);
    opacity += (opacityT - opacity) * 0.06; uniforms.uOpacity.value = opacity;
    spin += (spinT - spin) * 0.05;
    pulse *= 0.92;
    focus.x += (focus.tx - focus.x) * 0.07; focus.y += (focus.ty - focus.y) * 0.07; focus.s += (focus.ts - focus.s) * 0.07;
    uniforms.uScale.value = focus.s * (1 + pulse * 0.18);
    points.position.set(focus.x, focus.y + Math.sin(t * 0.6) * 0.06, 0);
    points.rotation.y = t * spin;
    points.rotation.x = Math.sin(t * 0.25) * 0.12;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  return {
    morphTo, setFocus, setPointer, releasePointer, setOpacity, setSpin, kick, resize,
    setColor(hex) { uniforms.uColor.value.set(hex); },
    get shape() { return current; },
    destroy() { running = false; renderer.dispose(); geo.dispose(); mat.dispose(); },
  };
}
