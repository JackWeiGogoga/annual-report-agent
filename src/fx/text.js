// Text & motion primitives: sleep, tween, decrypt reveal, typewriter, count-up, formatters.
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function tween({ from = 0, to = 1, duration = 600, ease = easeOut, onUpdate, onDone }) {
  return new Promise((res) => {
    const t0 = performance.now();
    const d = prefersReduced ? Math.min(duration, 200) : duration;
    function f(now) {
      const p = Math.min(1, (now - t0) / d);
      onUpdate(from + (to - from) * ease(p), p);
      if (p < 1) requestAnimationFrame(f);
      else { onDone?.(); res(); }
    }
    requestAnimationFrame(f);
  });
}

const GLYPHS = '!<>-_\\/[]{}=+*^?#0123456789ABCDEF';
const glyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

/** Scramble → resolve text, left to right with jitter (canvasui "decrypt reveal" feel). */
export function decrypt(el, text, { duration = 900, delay = 0 } = {}) {
  return new Promise((res) => {
    if (prefersReduced) { el.textContent = text; res(); return; }
    const chars = [...text];
    const n = chars.length;
    const reveal = chars.map((_, i) => (i / n) * duration * 0.7 + Math.random() * duration * 0.3);
    el.textContent = '';
    el.classList.add('decrypting');
    const spans = chars.map((ch) => {
      const s = document.createElement('span');
      if (ch === ' ') s.textContent = ' ';
      else { s.textContent = glyph(); s.className = 'g'; }
      el.appendChild(s);
      return s;
    });
    const t0 = performance.now() + delay;
    let lastScr = 0;
    function f(now) {
      const e = now - t0;
      if (e < 0) { requestAnimationFrame(f); return; }
      let done = true;
      const scr = now - lastScr > 45;
      for (let i = 0; i < n; i++) {
        if (chars[i] === ' ') continue;
        if (e >= reveal[i]) {
          if (spans[i].className) { spans[i].textContent = chars[i]; spans[i].className = ''; }
        } else { done = false; if (scr) spans[i].textContent = glyph(); }
      }
      if (scr) lastScr = now;
      if (!done) requestAnimationFrame(f);
      else { el.textContent = text; el.classList.remove('decrypting'); res(); }
    }
    requestAnimationFrame(f);
  });
}

/** Stream text into el at `cps` chars/sec. Returns a promise; call the returned .skip? no—keep simple. */
export function typewrite(el, text, { cps = 46, onTick } = {}) {
  return new Promise((res) => {
    if (prefersReduced) { el.textContent = text; res(); return; }
    const chars = [...text];
    let i = 0;
    const t0 = performance.now();
    function f(now) {
      const target = Math.min(chars.length, Math.floor(((now - t0) / 1000) * cps));
      if (target > i) { i = target; el.textContent = chars.slice(0, i).join(''); onTick?.(); }
      if (i < chars.length) requestAnimationFrame(f);
      else res();
    }
    requestAnimationFrame(f);
  });
}

export function countUp(el, to, { duration = 1400, from = 0, format = fmtInt, ease = easeOut } = {}) {
  return tween({ from, to, duration, ease, onUpdate: (v) => { el.textContent = format(v); } });
}

export const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
export const fmt = {
  int: fmtInt,
  usdt: (n) => fmtInt(n) + ' USDT',
  compact: (n) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n),
  date(iso, lang = 'en') {
    const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
    if (lang === 'zh') return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },
  dateShort(iso, lang = 'en') {
    const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
    if (lang === 'zh') return `${d.getMonth() + 1}月${d.getDate()}日`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },
  time(iso) { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; },
};
