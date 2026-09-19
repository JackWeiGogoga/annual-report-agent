// ASCII field: a flowing scalar field rendered as brightness-ranked glyphs, with sweep bands.
// Cheap: glyph atlas + drawImage at 24fps, vignette keeps the centre quiet for legibility.
const CHARS = ' .:-=+*#%@';
const LEVELS = 12;

export function createAsciiField(canvas, opts = {}) {
  const ctx = canvas.getContext('2d', { alpha: true });
  const color = opts.color || [188, 255, 47];
  const cell = opts.cell || 13;
  let cols = 0, rows = 0, W = 0, H = 0, dpr = 1;
  let intensity = opts.intensity ?? 0.5, target = intensity;
  let mode = 'calm', t = 0, last = 0, running = true, sweeps = [];
  let atlas = [];

  function buildAtlas() {
    atlas = [];
    for (let c = 0; c < CHARS.length; c++) {
      const row = [];
      for (let l = 0; l < LEVELS; l++) {
        const cv = document.createElement('canvas');
        cv.width = Math.ceil(cell * dpr); cv.height = Math.ceil(cell * dpr);
        const g = cv.getContext('2d');
        g.scale(dpr, dpr);
        g.font = `${Math.round(cell * 0.92)}px "JetBrains Mono", ui-monospace, Menlo, monospace`;
        g.textBaseline = 'middle'; g.textAlign = 'center';
        g.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${((l + 1) / LEVELS).toFixed(3)})`;
        g.fillText(CHARS[c], cell / 2, cell / 2 + 0.5);
        row.push(cv);
      }
      atlas.push(row);
    }
  }
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(W / cell); rows = Math.ceil(H / cell);
    buildAtlas();
  }
  function field(i, j, t) {
    const v = Math.sin(i * 0.11 + t * 0.5) * Math.cos(j * 0.13 - t * 0.35)
      + 0.7 * Math.sin((i + j) * 0.06 + t * 0.2)
      + 0.5 * Math.sin(i * 0.03 - j * 0.08 + t * 0.8);
    return (v + 2.2) / 4.4;
  }
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (document.hidden || now - last < 41) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    t += dt * (mode === 'storm' ? 3 : 1);
    intensity += (target - intensity) * 0.08;
    ctx.clearRect(0, 0, W, H);
    for (const s of sweeps) s.y += s.speed * dt;
    sweeps = sweeps.filter((s) => s.y < H + s.width * 2);
    const storm = mode === 'storm' ? 0.28 : 0;
    const floor = 0.24;
    for (let j = 0; j < rows; j++) {
      const y = j * cell;
      let sb = 0;
      for (const s of sweeps) { const d = Math.abs(y - s.y); if (d < s.width) sb = Math.max(sb, 1 - d / s.width); }
      const vy = y / H - 0.5;
      for (let i = 0; i < cols; i++) {
        const x = i * cell;
        const vx = x / W - 0.5;
        const r = Math.sqrt(vx * vx + vy * vy);
        let v = field(i, j, t) * intensity * Math.min(1, 0.18 + r * 1.5) + storm * field(j, i, t * 1.3) * 0.7 + sb * 0.9;
        if (v < floor) continue;
        const nv = Math.min(1, (v - floor) / (1 - floor));
        const ci = Math.min(CHARS.length - 1, 1 + Math.floor(nv * (CHARS.length - 1)));
        const a = Math.min(0.95, nv * 0.7 + sb * 0.45);
        const li = Math.min(LEVELS - 1, Math.floor(a * LEVELS));
        ctx.drawImage(atlas[ci][li], x, y, cell, cell);
      }
    }
  }
  resize();
  window.addEventListener('resize', resize);
  document.fonts?.ready.then(buildAtlas);
  requestAnimationFrame(frame);

  return {
    sweep({ speed = 1200, width = 120 } = {}) { sweeps.push({ y: -width, speed, width }); },
    setMode(m) { mode = m; },
    setIntensity(v) { target = v; },
    destroy() { running = false; window.removeEventListener('resize', resize); },
  };
}
