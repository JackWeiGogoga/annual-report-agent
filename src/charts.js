// SVG/HTML chart builders. Thin marks, one hue (brand) + de-emphasis gray, hairline grids,
// hover/tap tooltips, and a .play() on every element for the enter animation.
import { fmt, tween, sleep, prefersReduced } from './fx/text.js';

const NS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  for (const c of kids.flat()) if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return e;
}
export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** Shared tooltip: host must be position:relative. rows = [[value, label], ...] */
export function tooltip(host) {
  const tip = el('div', 'tip'); tip.hidden = true; host.appendChild(tip);
  return {
    show(x, y, rows) {
      tip.replaceChildren(...rows.map(([v, l]) => { const r = el('div', 'tip-row'); r.append(el('b', null, v), el('span', null, l)); return r; }));
      tip.hidden = false;
      const hw = host.clientWidth;
      tip.style.left = Math.max(4, Math.min(hw - tip.offsetWidth - 4, x - tip.offsetWidth / 2)) + 'px';
      tip.style.top = Math.max(0, y - tip.offsetHeight - 12) + 'px';
    },
    hide() { tip.hidden = true; },
  };
}

// ---------------------------------------------------------------- line / area
export function lineChart(values, { width = 360, height = 168, pad = { l: 6, r: 6, t: 20, b: 20 }, highlight = null, ticks = [], area = true, yFormat = fmt.int, xLabel = () => '', callout = null } = {}) {
  const wrap = el('div', 'chart line-chart');
  const s = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg' });
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const X = (i) => pad.l + (i / (values.length - 1)) * (width - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - min) / span) * (height - pad.t - pad.b);
  for (let g = 0; g < 3; g++) { const y = pad.t + (g / 2) * (height - pad.t - pad.b); s.appendChild(svg('line', { x1: pad.l, x2: width - pad.r, y1: y, y2: y, class: 'grid' })); }
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const areaEl = area ? svg('path', { d: `${d} L${X(values.length - 1).toFixed(1)},${height - pad.b} L${X(0)},${height - pad.b} Z`, class: 'area', opacity: 0 }) : null;
  if (areaEl) s.appendChild(areaEl);
  const path = svg('path', { d, class: 'line' });
  s.appendChild(path);
  for (const tk of ticks) s.appendChild(svg('text', { x: X(tk.i), y: height - 4, class: 'lbl', 'text-anchor': tk.i === 0 ? 'start' : 'middle' }, tk.label));
  let hl = null;
  if (highlight != null) {
    const hx = X(highlight), hy = Y(values[highlight]);
    hl = svg('g', { class: 'hl', opacity: 0 });
    hl.appendChild(svg('line', { x1: hx, x2: hx, y1: hy, y2: height - pad.b, class: 'hl-line' }));
    hl.appendChild(svg('circle', { cx: hx, cy: hy, r: 7, class: 'ring' }));
    hl.appendChild(svg('circle', { cx: hx, cy: hy, r: 5, class: 'dot' }));
    if (callout) {
      const left = hx > width * 0.6;
      hl.appendChild(svg('text', { x: hx + (left ? -12 : 12), y: hy - 10, class: 'callout', 'text-anchor': left ? 'end' : 'start' }, callout));
    }
    s.appendChild(hl);
  }
  const cross = svg('g', { class: 'cross', opacity: 0 });
  const cl = svg('line', { y1: pad.t, y2: height - pad.b, class: 'cross-line' });
  const cr = svg('circle', { r: 7, class: 'ring' }), cd = svg('circle', { r: 5, class: 'dot' });
  cross.append(cl, cr, cd); s.appendChild(cross);
  wrap.appendChild(s);
  const tip = tooltip(wrap);
  const move = (ev) => {
    const rect = s.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * width;
    let i = Math.round(((px - pad.l) / (width - pad.l - pad.r)) * (values.length - 1));
    i = Math.max(0, Math.min(values.length - 1, i));
    const x = X(i), y = Y(values[i]);
    cl.setAttribute('x1', x); cl.setAttribute('x2', x); cd.setAttribute('cx', x); cd.setAttribute('cy', y); cr.setAttribute('cx', x); cr.setAttribute('cy', y);
    cross.setAttribute('opacity', 1);
    tip.show((x / width) * rect.width, (y / height) * rect.height, [[yFormat(values[i]), xLabel(i)]]);
  };
  s.addEventListener('pointermove', move); s.addEventListener('pointerdown', move);
  s.addEventListener('pointerleave', () => { cross.setAttribute('opacity', 0); tip.hide(); });
  wrap.showHighlight = () => { if (!hl) return; hl.style.transition = 'opacity .5s'; hl.setAttribute('opacity', 1); hl.classList.add('pop'); };
  wrap.play = async ({ highlight: showHl = true } = {}) => {
    const len = path.getTotalLength();
    path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
    path.getBoundingClientRect();
    path.style.transition = `stroke-dashoffset ${prefersReduced ? 0.2 : 2.2}s cubic-bezier(.3,.7,.2,1)`;
    path.style.strokeDashoffset = 0;
    if (areaEl) { areaEl.style.transition = 'opacity 1.2s ease .8s'; areaEl.setAttribute('opacity', 1); }
    if (hl && showHl) { await sleep(prefersReduced ? 200 : 1800); wrap.showHighlight(); }
  };
  return wrap;
}

// ---------------------------------------------------------------- horizontal bars
export function hBars(items, { width = 360, rowH = 38, labelW = 78, format = fmt.int } = {}) {
  const wrap = el('div', 'chart hbars');
  const height = items.length * rowH;
  const s = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg' });
  const max = Math.max(...items.map((i) => i.value));
  const barMax = width - labelW - 84, hgt = 12, r = 4;
  const bars = items.map((it, i) => {
    const y = i * rowH + rowH / 2;
    s.appendChild(svg('text', { x: 0, y: y + 4, class: 'lbl' }, it.label));
    const bar = svg('path', { class: 'bar', d: '' });
    const val = svg('text', { x: labelW, y: y + 4, class: 'val', opacity: 0 }, format(it.value));
    s.append(bar, val);
    const hit = svg('rect', { x: 0, y: i * rowH, width, height: rowH, fill: 'transparent' });
    s.appendChild(hit);
    hit.addEventListener('pointerenter', (ev) => show(ev, it)); hit.addEventListener('pointerdown', (ev) => show(ev, it));
    hit.addEventListener('pointerleave', () => tip.hide());
    return { bar, val, y, target: (it.value / max) * barMax };
  });
  wrap.appendChild(s);
  const tip = tooltip(wrap);
  function show(ev, it) { const rect = s.getBoundingClientRect(); tip.show(ev.clientX - rect.left, ev.clientY - rect.top - 6, [[format(it.value) + (it.unit ? ' ' + it.unit : ''), it.label + (it.share ? ` · ${it.share}` : '')]]); }
  const draw = (b, w) => {
    const x = labelW, y = b.y - hgt / 2, ww = Math.max(w, 1);
    b.bar.setAttribute('d', `M${x},${y} h${Math.max(0, ww - r)} a${r},${r} 0 0 1 ${r},${r} v${hgt - 2 * r} a${r},${r} 0 0 1 -${r},${r} h-${Math.max(0, ww - r)} z`);
    b.val.setAttribute('x', x + ww + 8);
  };
  bars.forEach((b) => draw(b, 0));
  wrap.play = () => bars.forEach((b, i) => setTimeout(() => tween({ to: b.target, duration: 900, onUpdate: (w) => draw(b, w), onDone: () => { b.val.style.transition = 'opacity .4s'; b.val.setAttribute('opacity', 1); } }), i * 140));
  return wrap;
}

// ---------------------------------------------------------------- radar
export function radar(axes, { size = 250, max = 100, sideRoom = 110 } = {}) {
  const wrap = el('div', 'chart radar');
  const width = size + sideRoom;
  const s = svg('svg', { viewBox: `0 0 ${width} ${size}`, class: 'chart-svg' });
  const cx = width / 2, cy = size / 2 + 6, R = size / 2 - 40, n = axes.length;
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (r, i) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  for (const f of [0.25, 0.5, 0.75, 1]) s.appendChild(svg('polygon', { points: axes.map((_, i) => pt(R * f, i).map((v) => v.toFixed(1)).join(',')).join(' '), class: 'grid-poly' }));
  axes.forEach((_, i) => { const [x, y] = pt(R, i); s.appendChild(svg('line', { x1: cx, y1: cy, x2: x, y2: y, class: 'grid' })); });
  const poly = svg('polygon', { class: 'radar-fill', points: '' });
  const line = svg('polygon', { class: 'radar-line', points: '' });
  s.append(poly, line);
  const dots = axes.map((a, i) => { const g = svg('g', { opacity: 0 }); g.append(svg('circle', { r: 6.5, class: 'ring' }), svg('circle', { r: 4.5, class: 'dot' })); s.appendChild(g); return g; });
  axes.forEach((a, i) => {
    const [x, y] = pt(R + 22, i); const c = Math.cos(ang(i));
    const anchor = c > 0.2 ? 'start' : c < -0.2 ? 'end' : 'middle';
    s.appendChild(svg('text', { x, y: y - 2, class: 'lbl', 'text-anchor': anchor }, a.label));
    s.appendChild(svg('text', { x, y: y + 12, class: 'val', 'text-anchor': anchor }, String(a.value)));
  });
  wrap.appendChild(s);
  const tip = tooltip(wrap);
  const setK = (k) => {
    const pts = axes.map((a, i) => pt((a.value / max) * R * k, i));
    const str = pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
    poly.setAttribute('points', str); line.setAttribute('points', str);
    pts.forEach((p, i) => dots[i].setAttribute('transform', `translate(${p[0].toFixed(1)},${p[1].toFixed(1)})`));
  };
  setK(0);
  dots.forEach((g, i) => {
    const show = () => { const rect = s.getBoundingClientRect(); const m = g.getAttribute('transform').match(/([\d.]+),([\d.]+)/); tip.show((+m[1] / width) * rect.width, (+m[2] / size) * rect.height, [[String(axes[i].value), axes[i].label]]); };
    g.addEventListener('pointerenter', show); g.addEventListener('pointerdown', show); g.addEventListener('pointerleave', () => tip.hide());
  });
  wrap.play = async () => { await tween({ to: 1, duration: 1200, onUpdate: setK }); dots.forEach((g, i) => setTimeout(() => { g.style.transition = 'opacity .3s'; g.setAttribute('opacity', 1); }, i * 80)); };
  return wrap;
}

// ---------------------------------------------------------------- year heatmap
export function yearHeatmap(levels, { year = 2025, cell = 6, gap = 2, monthLabels = ['Jan', 'Apr', 'Jul', 'Oct'], levelLabels = ['Quiet', 'Light', 'Active', 'Busy', 'On fire'], dateFmt = (d) => d.toDateString() } = {}) {
  const wrap = el('div', 'chart heatmap');
  const first = new Date(Date.UTC(year, 0, 1));
  const dow = (first.getUTCDay() + 6) % 7;
  const cols = Math.ceil((dow + levels.length) / 7);
  const step = cell + gap, width = cols * step - gap, height = 7 * step - gap + 16;
  const s = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg' });
  levels.forEach((lv, d) => {
    const idx = dow + d, col = Math.floor(idx / 7), row = idx % 7;
    const r = svg('rect', { x: col * step, y: row * step, width: cell, height: cell, rx: 1.5, class: `hm l${lv}`, 'data-d': d });
    r.style.animationDelay = `${col * 16 + row * 4}ms`;
    s.appendChild(r);
  });
  [0, 3, 6, 9].forEach((m, k) => {
    const d = Math.round((Date.UTC(year, m, 1) - first) / 86400000);
    const col = Math.floor((dow + d) / 7);
    s.appendChild(svg('text', { x: col * step, y: height - 2, class: 'lbl' }, monthLabels[k]));
  });
  wrap.appendChild(s);
  const tip = tooltip(wrap);
  const show = (ev) => {
    const r = ev.target.closest('rect.hm'); if (!r) return;
    const d = +r.dataset.d, rect = s.getBoundingClientRect();
    const date = new Date(Date.UTC(year, 0, 1 + d));
    const x = ((+r.getAttribute('x') + cell / 2) / width) * rect.width, y = (+r.getAttribute('y') / height) * rect.height;
    tip.show(x, y, [[dateFmt(date), levelLabels[levels[d]]]]);
  };
  s.addEventListener('pointermove', show); s.addEventListener('pointerdown', show);
  s.addEventListener('pointerleave', () => tip.hide());
  wrap.play = () => wrap.classList.add('go');
  return wrap;
}

// ---------------------------------------------------------------- grid bot
export function gridBot(series, { width = 360, height = 150, levels = [0.28, 0.39, 0.5, 0.61, 0.72], buyLabel = 'Grid buy', sellLabel = 'Grid sell', priceLabel = 'Price' } = {}) {
  const wrap = el('div', 'chart gridbot');
  const legend = el('div', 'legend');
  legend.append(legendItem('buy', buyLabel), legendItem('sell', sellLabel));
  const pad = { l: 6, r: 6, t: 10, b: 10 };
  const s = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg' });
  const X = (i) => pad.l + (i / (series.length - 1)) * (width - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - v) * (height - pad.t - pad.b);
  for (const L of levels) s.appendChild(svg('line', { x1: pad.l, x2: width - pad.r, y1: Y(L), y2: Y(L), class: 'grid-level' }));
  const d = series.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const path = svg('path', { d, class: 'line dim' });
  s.appendChild(path);
  const marks = [];
  for (let i = 1; i < series.length; i++) {
    for (const L of levels) {
      if (series[i - 1] > L && series[i] <= L) marks.push({ i, L, side: 'buy' });
      else if (series[i - 1] < L && series[i] >= L) marks.push({ i, L, side: 'sell' });
    }
  }
  const tip = tooltip(wrap);
  const mEls = marks.map((m) => {
    const g = svg('g', { class: `gm ${m.side}`, opacity: 0, transform: `translate(${X(m.i).toFixed(1)},${Y(m.L).toFixed(1)})` });
    g.append(svg('circle', { r: 11, fill: 'transparent' }), svg('circle', { r: 6, class: 'ring' }), svg('circle', { r: 4, class: m.side === 'buy' ? 'dot' : 'hollow' }));
    const show = () => { const rect = s.getBoundingClientRect(); tip.show((X(m.i) / width) * rect.width, (Y(m.L) / height) * rect.height, [[m.side === 'buy' ? buyLabel : sellLabel, `${priceLabel} · L${levels.indexOf(m.L) + 1}`]]); };
    g.addEventListener('pointerenter', show); g.addEventListener('pointerdown', show); g.addEventListener('pointerleave', () => tip.hide());
    s.appendChild(g); return g;
  });
  wrap.append(legend, s);
  wrap.play = async () => {
    const len = path.getTotalLength();
    path.style.strokeDasharray = len; path.style.strokeDashoffset = len; path.getBoundingClientRect();
    path.style.transition = `stroke-dashoffset ${prefersReduced ? 0.2 : 1.8}s linear`; path.style.strokeDashoffset = 0;
    const per = (prefersReduced ? 200 : 1800) / Math.max(1, marks.length);
    mEls.forEach((g, k) => setTimeout(() => { g.style.transition = 'opacity .25s'; g.setAttribute('opacity', 1); }, (marks[k].i / series.length) * (prefersReduced ? 200 : 1800)));
    await sleep(per);
  };
  return wrap;
}
function legendItem(kind, label) { const li = el('span', `lg ${kind}`); li.append(el('i'), el('span', null, label)); return li; }

// ---------------------------------------------------------------- flows (deposit / withdraw)
export function flowBars(items /* [{label, value, kind:'in'|'out'}] */, { format = fmt.int } = {}) {
  const wrap = el('div', 'flow');
  const max = Math.max(...items.map((i) => i.value));
  const rows = items.map((it) => {
    const row = el('div', 'flow-row');
    const k = el('span', 'flow-k', it.label);
    const track = el('div', 'flow-track'); const bar = el('div', `flow-bar ${it.kind}`); bar.style.width = '0%'; track.appendChild(bar);
    const v = el('b', 'flow-v', format(it.value));
    row.append(k, track, v); wrap.appendChild(row);
    return { bar, w: (it.value / max) * 100 };
  });
  wrap.playRow = (i) => { const r = rows[i]; if (r) r.bar.style.width = r.w + '%'; };
  wrap.play = () => rows.forEach((r, i) => setTimeout(() => wrap.playRow(i), i * 180));
  return wrap;
}

// ---------------------------------------------------------------- percentile meter
export function meter(p, { youLabel = 'YOU', caption = '' } = {}) {
  const wrap = el('div', 'meter');
  const track = el('div', 'meter-track'); const fill = el('div', 'meter-fill'); const you = el('div', 'meter-you'); you.append(el('span', null, youLabel));
  track.append(fill, you); wrap.append(track);
  const cap = el('div', 'meter-cap'); cap.append(el('span', null, '0'), el('span', null, caption), el('span', null, '100%')); wrap.append(cap);
  fill.style.width = '0%'; you.style.left = '0%';
  wrap.play = () => { fill.style.width = p + '%'; you.style.left = p + '%'; you.classList.add('on'); };
  return wrap;
}

// ---------------------------------------------------------------- sparkline
export function sparkline(values, { width = 140, height = 40 } = {}) {
  const s = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'spark' });
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${(2 + (i / (values.length - 1)) * (width - 4)).toFixed(1)},${(height - 4 - ((v - min) / span) * (height - 8)).toFixed(1)}`).join(' ');
  const p = svg('path', { d, class: 'line' }); s.appendChild(p);
  const last = values.length - 1;
  s.appendChild(svg('circle', { cx: width - 2, cy: height - 4 - ((values[last] - min) / span) * (height - 8), r: 3.5, class: 'dot' }));
  s.play = () => { const len = p.getTotalLength(); p.style.strokeDasharray = len; p.style.strokeDashoffset = len; p.getBoundingClientRect(); p.style.transition = 'stroke-dashoffset 1.4s ease'; p.style.strokeDashoffset = 0; };
  return s;
}

// ---------------------------------------------------------------- tenure strip
export function tenureStrip(joinedIso, endYear) {
  const wrap = el('div', 'tenure');
  const j = new Date(joinedIso + 'T00:00:00Z');
  const y0 = j.getUTCFullYear(), years = [];
  for (let y = y0; y <= endYear; y++) years.push(y);
  const startFrac = (Date.UTC(y0, j.getUTCMonth(), j.getUTCDate()) - Date.UTC(y0, 0, 1)) / (Date.UTC(y0 + 1, 0, 1) - Date.UTC(y0, 0, 1));
  const total = years.length;
  const track = el('div', 'tenure-track');
  const fill = el('div', 'tenure-fill'); fill.style.left = (startFrac / total) * 100 + '%'; fill.style.width = '0%';
  track.appendChild(fill);
  years.forEach((y, i) => { const tick = el('i'); tick.style.left = (i / total) * 100 + '%'; track.appendChild(tick); });
  const labels = el('div', 'tenure-labels');
  years.forEach((y) => labels.appendChild(el('span', null, String(y))));
  const origin = el('span', 'tenure-origin', '●'); origin.style.left = (startFrac / total) * 100 + '%';
  track.appendChild(origin);
  wrap.append(track, labels);
  wrap.play = () => { fill.style.width = (1 - startFrac / total) * 100 + '%'; };
  return wrap;
}
