// Story engine: agent console (thinking → tool calls → narration, with human-in-the-loop
// approvals and choices) driving a stage of data scenes, particles and ASCII field.
import { createAsciiField } from './fx/ascii.js';
import { createParticles } from './fx/particles.js';
import { decrypt, typewrite, countUp, sleep, fmt, prefersReduced } from './fx/text.js';
import * as C from './charts.js';
import { report, buildSeries, daysBetween, dayOfYear, YEAR } from './data.js';
import { copy, SKILLS } from './copy.js';
import { renderShareCard } from './share.js';

const params = new URLSearchParams(location.search);
const AUTOPLAY_MS = params.get('auto') === '0' ? 0 : 9000;   // ?auto=0 → manual advance only
const FROM = Math.max(0, parseInt(params.get('from') || '0', 10) || 0); // ?from=N → jump to chapter N (0 = session … 12 = persona)
const $ = (s) => document.querySelector(s);
const app = $('#app'), stage = $('#stage'), sceneHost = $('#sceneHost'), thread = $('#thread');
const nextBtn = $('#next'), nextRing = $('#nextRing'), nextLabel = $('#nextLabel'), progress = $('#progress');
const composer = $('#composer'), composerBox = $('#composerBox'), input = $('#composerInput'), chips = $('#chips');
const sendBtn = $('#send'), slash = $('#slash'), slashBtn = $('#slashBtn'), statusEl = $('#status');
const consoleEl = $('#console'), stripStatus = $('#stripStatus'), stripChip = $('#stripChip'), stripAsk = $('#stripAsk');
const toggleBtn = $('#toggleThread'), digestLive = $('#digestLive');

let lang = params.get('lang') ? (params.get('lang') === 'zh' ? 'zh' : 'en') : ((navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en');
const t = (key, vars = {}) => {
  const s = copy[lang][key] ?? copy.en[key] ?? key;
  if (Array.isArray(s)) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
};
const S = buildSeries();

// ---------------------------------------------------------------- tiny DOM helper
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; e.append(c instanceof Node ? c : document.createTextNode(String(c))); }
  return e;
}

// ---------------------------------------------------------------- effects
const ascii = createAsciiField($('#ascii'), { intensity: 0.62 });
const particles = createParticles($('#gl'), { reduced: prefersReduced });
function focusParticles() {
  if (app.dataset.phase === 'entry') {
    const r = app.getBoundingClientRect();
    particles.setFocus({ left: r.left, top: r.top + r.height * 0.02, width: r.width, height: r.height * 0.62 }, { scale: 0.72 });
    particles.setOpacity(1);
  } else {
    const r = stage.getBoundingClientRect();
    const final = app.dataset.phase === 'final';
    particles.setFocus({ left: r.left + (final ? r.width * 0.3 : 0), top: r.top, width: r.width, height: r.height * (final ? 0.36 : 0.62) }, { scale: final ? 0.36 : 0.5 });
    particles.setOpacity(final ? 0.55 : 0.85);
  }
}
focusParticles();
window.addEventListener('resize', focusParticles);
stage.addEventListener('transitionend', focusParticles);
let releaseTimer = 0;
window.addEventListener('pointermove', (e) => { particles.setPointer(e.clientX, e.clientY); clearTimeout(releaseTimer); releaseTimer = setTimeout(() => particles.releasePointer(), 220); });
window.addEventListener('pointerdown', (e) => { particles.setPointer(e.clientX, e.clientY); particles.kick(); });
window.addEventListener('pointerup', () => { clearTimeout(releaseTimer); releaseTimer = setTimeout(() => particles.releasePointer(), 300); });

// ---------------------------------------------------------------- static UI / i18n
function setStatus(kind, text) { for (const el of [statusEl, stripStatus]) { el.className = 'status ' + kind; el.textContent = el === stripStatus ? text.replace(/^okx-trade-mcp\s·\s/, '') : text; } }
function applyStatic() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  $('#brandSub').textContent = t('ui.brand');
  $('#langBtn').textContent = t('ui.lang');
  $('#coverEyebrow').textContent = t('cover.eyebrow');
  $('#coverSub').textContent = t('cover.sub');
  $('#coverHint').textContent = t('cover.hint');
  $('#slashBtnLabel').textContent = t('ui.skills');
  nextLabel.textContent = t('ui.continue');
  $('#sheetHint').textContent = t('sheet.hint');
  $('#sheetDl').textContent = t('sheet.download');
  $('#sheetClose').textContent = t('sheet.close');
  stripAsk.textContent = t('ui.followup');
  $('#toggleLabel').textContent = collapsed ? t('ui.process') : t('ui.collapse');
  if (!storyStarted) { input.placeholder = t('composer.placeholder'); setStatus('', t('ui.status.idle')); }
  else if (app.dataset.phase === 'final') input.placeholder = t('ui.followup');
}
$('#langBtn').addEventListener('click', () => {
  lang = lang === 'en' ? 'zh' : 'en';
  applyStatic();
  if (app.dataset.phase === 'entry') decrypt($('#coverTitle'), t('cover.title'), { duration: 700 });
  if (!slash.hidden) renderSlash(input.value.startsWith('/') ? input.value.slice(1) : '');
});
for (let i = 0; i < 12; i++) progress.appendChild(h('i'));
function setProgress(n) {
  [...progress.children].forEach((seg, i) => { seg.classList.toggle('done', i < n); seg.classList.toggle('active', i === n); });
  progress.setAttribute('aria-valuenow', n);
}

// ---------------------------------------------------------------- digest (collapsed console)
const digest = {
  ic: $('#dgIc'), txt: $('#dgTxt'), trail: $('#dgTrail'),
  live(kind, content) {
    this.ic.className = 'dg-ic ' + kind; this.ic.textContent = '';
    this.txt.className = 'txt' + (kind === 'think' || kind === 'tool' || kind === 'done' ? ' mono' : '');
    if (typeof content === 'string') this.txt.textContent = content; else this.txt.replaceChildren(...[].concat(content));
  },
  mirror(text) { this.txt.textContent = text; },
  push(kind, label, ok) {
    this.trail.appendChild(h('span', { class: 'tr ' + kind }, h('span', { text: label }), ok ? h('b', { text: '✓' }) : null));
    while (this.trail.children.length > 5) this.trail.firstChild.remove();
  },
  reset() { this.trail.replaceChildren(); },
  decide(question, node, { icon = '?', small = false } = {}) { this.live('ask', question); this.ic.textContent = icon; $('#dgDecide').replaceChildren(node); app.classList.add('deciding'); app.classList.toggle('deciding-sm', small); },
  undecide() { $('#dgDecide').replaceChildren(); app.classList.remove('deciding', 'deciding-sm'); },
};
let collapsed = true;
function setCollapsed(v) {
  collapsed = v;
  app.classList.toggle('console-collapsed', v);
  $('#toggleLabel').textContent = v ? t('ui.process') : t('ui.collapse');
  if (!v) requestAnimationFrame(scrollEnd);
  setTimeout(focusParticles, 60); setTimeout(focusParticles, 1000);
}
toggleBtn.addEventListener('click', () => setCollapsed(!collapsed));
$('#digest').addEventListener('click', (e) => { if (!e.target.closest('button')) setCollapsed(false); });

// ---------------------------------------------------------------- agent console
function scrollEnd() { thread.scrollTop = thread.scrollHeight; }
function push(node) { thread.appendChild(node); scrollEnd(); requestAnimationFrame(scrollEnd); setTimeout(scrollEnd, 380); return node; }
new ResizeObserver(scrollEnd).observe(thread);
const fmtArgs = (args) => Object.entries(args).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : v}`).join(' ');

const agent = {
  user(text, skill) {
    digest.live('say', [skill ? h('span', { class: 'chip', text: '/' + skill }) : null, h('span', { text })].filter(Boolean));
    return push(h('div', { class: 'msg user' }, h('div', { class: 'bubble' }, skill ? h('span', { class: 'chip', text: '/' + skill }) : null, h('span', { text }))));
  },
  async think(lines, { perLine = 600 } = {}) {
    const body = h('div', { class: 'think-body' });
    const label = h('span', { text: t('ui.thinking') });
    const head = h('button', { class: 'think-head', type: 'button' }, h('i', { class: 'pulse' }), label, h('i', { class: 'chev', text: '⌄' }));
    const msg = push(h('div', { class: 'msg think' }, head, body));
    head.addEventListener('click', () => msg.classList.toggle('collapsed'));
    const t0 = performance.now();
    digest.live('think', t('ui.thinking') + '…');
    for (const line of lines) { body.appendChild(h('div', { class: 'line', text: line })); digest.live('think', '› ' + line); scrollEnd(); await sleep(prefersReduced ? 80 : perLine); }
    await sleep(220);
    head.classList.add('done');
    const thought = t('ui.thought', { s: ((performance.now() - t0) / 1000).toFixed(1) });
    label.textContent = thought;
    digest.live('done', thought); digest.push('think', thought.replace(/[^0-9.]*([0-9.]+).*/, '$1s'));
    msg.classList.add('collapsed');
    return msg;
  },
  async tool(name, args, result, { ms = 620, summary } = {}) {
    const status = h('span', { class: 'tool-status' }, h('i', { class: 'spin' }), h('span', { text: t('ui.running') }));
    const msg = push(h('div', { class: 'msg tool' },
      h('div', { class: 'tool-row' }, h('span', { class: 'tool-ic', text: '⌘' }), h('code', { class: 'tool-name', text: name }), h('code', { class: 'tool-args', text: fmtArgs(args) }), status)));
    setStatus('busy', t('ui.status.working'));
    digest.live('tool', `⌘ ${name} ${fmtArgs(args)}`);
    await sleep(prefersReduced ? 120 : ms);
    status.replaceChildren(h('span', { class: 'ok', text: '✓' }), h('span', { text: `${ms}ms` }));
    const sum = summary ?? JSON.stringify(result);
    digest.live('done', `✓ ${name} · ${ms}ms → ${sum}`); digest.push('tool', name, true);
    msg.append(h('div', { class: 'tool-res', text: sum }), h('pre', { class: 'tool-json', text: JSON.stringify(result, null, 2) }));
    msg.addEventListener('click', () => msg.classList.toggle('open'));
    scrollEnd();
    setStatus('live', t('ui.status.live'));
    await sleep(520);
    return result;
  },
  async say(text) {
    const span = h('span'), caret = h('i', { class: 'caret' });
    push(h('div', { class: 'msg ai' }, h('div', { class: 'ai-text' }, span, caret)));
    digest.live('say', '');
    await typewrite(span, text, { cps: lang === 'zh' ? 17 : 38, onTick: () => { scrollEnd(); digest.mirror(span.textContent); } });
    digest.mirror(text);
    caret.remove();
  },
  choice(question, options) {
    return new Promise((res) => {
      const sets = [];
      const pick = (key) => {
        for (const set of sets) { set.classList.add('done'); [...set.children].forEach((c) => { c.disabled = true; c.classList.toggle('picked', c.dataset.key === key); }); }
        digest.undecide(); res(key);
      };
      const make = () => {
        const el = h('div', { class: 'cards' }, options.map((o, i) => h('button', { class: 'ccard', type: 'button', 'data-key': o.key, 'data-idx': String(i + 1).padStart(2, '0'), style: `--i:${i}`, onClick: () => pick(o.key) },
          h('span', { class: 'glyph', text: o.glyph || '›' }), h('b', { text: o.label }), o.hint ? h('span', { class: 'hint', text: o.hint }) : null)));
        sets.push(el); return el;
      };
      push(h('div', { class: 'msg choice' }, h('div', { class: 'eyebrow sm', text: t('choice.eyebrow') }), h('div', { class: 'q', text: question }), make()));
      digest.decide(question, make());
    });
  },
  approval({ title, body, accept, decline, okLabel, noLabel }) {
    return new Promise((res) => {
      const rows = [];
      const verdict = h('div', { class: 'verdict' });
      const done = (ok) => {
        card.classList.add('resolved');
        verdict.textContent = ok ? '✓ ' + (okLabel || t('ui.accepted')) : '✕ ' + (noLabel || t('ui.declined'));
        verdict.classList.toggle('neg', !ok);
        rows.forEach((r) => [...r.children].forEach((b) => (b.disabled = true)));
        digest.undecide(); res(ok);
      };
      const makeRow = () => {
        const r = h('div', { class: 'card-actions' },
          decline ? h('button', { class: 'btn', type: 'button', text: decline, onClick: () => done(false) }) : null,
          h('button', { class: 'btn primary', type: 'button', text: accept, onClick: () => done(true) }));
        rows.push(r); return r;
      };
      const card = h('div', { class: 'card' },
        h('div', { class: 'card-h' }, h('span', { class: 'shield', text: '◈' }), h('span', { text: title })),
        h('p', { text: body }), makeRow(), verdict);
      push(h('div', { class: 'msg approval' }, card));
      digest.decide(title, makeRow(), { icon: '◈', small: true });
    });
  },
};

// ---------------------------------------------------------------- stage
let currentScene = null;
async function showScene(node, { shape, sweep = true } = {}) {
  if (shape) particles.morphTo(shape);
  if (sweep) ascii.sweep();
  const old = currentScene; currentScene = node;
  if (old) { old.classList.remove('in'); old.classList.add('out'); setTimeout(() => old.remove(), 700); }
  sceneHost.appendChild(node);
  requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('in')));
  await sleep(380);
  node.play?.();
}
function scene(idx, nameKey, src, ...kids) {
  return h('section', { class: 'scene' },
    h('div', { class: 'eyebrow' }, h('span', { text: String(idx).padStart(2, '0') }), h('span', { class: 'sep', text: '/' }), h('span', { text: t(nameKey) }), h('code', { class: 'src', text: src })),
    ...kids);
}
const viz = (title, node, right) => h('div', { class: 'viz' }, title ? h('div', { class: 'viz-title' }, h('span', { text: title }), right ? h('b', { text: right }) : null) : null, node);
const stat = (value, label) => h('div', { class: 'stat' }, h('b', { text: value }), h('span', { text: label }));
const hero = (value, label, { lime = false, pill = null } = {}) => h('div', { class: 'hero' + (lime ? ' lime' : '') }, h('span', { class: 'num', text: value }), label ? h('small', { text: label }) : null, pill);

function waitNext({ auto = AUTOPLAY_MS } = {}) {
  return new Promise((res) => {
    nextBtn.classList.add('show');
    const circ = 2 * Math.PI * 9;
    nextRing.style.transition = 'none'; nextRing.style.strokeDasharray = circ; nextRing.style.strokeDashoffset = circ;
    nextRing.getBoundingClientRect();
    if (auto) { nextRing.style.transition = `stroke-dashoffset ${auto}ms linear`; nextRing.style.strokeDashoffset = 0; }
    let done = false;
    const finish = () => { if (done) return; done = true; cleanup(); res(); };
    const onStage = (e) => { if (e.target.closest('.viz, .tile, .receipt, button, a, .no-advance')) return; finish(); };
    const onKey = (e) => { if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { if (document.activeElement === input) return; e.preventDefault(); finish(); } };
    const timer = auto ? setTimeout(finish, auto) : 0;
    stage.addEventListener('click', onStage); nextBtn.addEventListener('click', finish); document.addEventListener('keydown', onKey);
    function cleanup() { clearTimeout(timer); stage.removeEventListener('click', onStage); nextBtn.removeEventListener('click', finish); document.removeEventListener('keydown', onKey); nextBtn.classList.remove('show'); }
  });
}

// ---------------------------------------------------------------- composer / slash menu
let pickedSkill = null, demoCancelled = false, storyStarted = false;
function renderSlash(filter = '') {
  const items = SKILLS.filter((s) => s.id.includes(filter.toLowerCase()));
  slash.replaceChildren(h('div', { class: 'group', text: t('skills.group') }),
    ...items.map((s, i) => h('button', { class: 'skill' + (i === 0 ? ' active' : ''), type: 'button', 'data-id': s.id, onClick: () => pickSkill(s.id) },
      h('span', { class: 'ic', text: '/' }),
      h('span', { class: 'tx' }, h('div', { class: 'nm', text: s.id }), h('div', { class: 'ds', text: t('skills.' + s.id) })),
      s.badge ? h('span', { class: 'badge', text: t('ui.new') }) : null)));
}
function openSlash(filter = '') { renderSlash(filter); slash.hidden = false; }
function closeSlash() { slash.hidden = true; }
function pickSkill(id, { focus = true } = {}) {
  pickedSkill = id;
  chips.replaceChildren(h('span', { class: 'chip', text: '/' + id }));
  input.value = input.value.replace(/^\/\S*\s?/, '');
  closeSlash(); composerBox.classList.add('hot');
  if (focus) input.focus();
}
input.addEventListener('input', () => { demoCancelled = true; if (storyStarted) return; const v = input.value; if (v.startsWith('/')) openSlash(v.slice(1)); else closeSlash(); });
input.addEventListener('keydown', (e) => {
  if (slash.hidden) { if (e.key === 'Enter' && !e.isComposing && !input.disabled) { e.preventDefault(); composer.requestSubmit(); } return; }
  const items = [...slash.querySelectorAll('.skill')];
  let i = items.findIndex((x) => x.classList.contains('active'));
  if (e.key === 'ArrowDown') { e.preventDefault(); i = (i + 1) % items.length; }
  else if (e.key === 'ArrowUp') { e.preventDefault(); i = (i - 1 + items.length) % items.length; }
  else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); items[i]?.click(); return; }
  else if (e.key === 'Escape') { closeSlash(); return; }
  else return;
  items.forEach((x, k) => x.classList.toggle('active', k === i));
});
slashBtn.addEventListener('click', () => { if (storyStarted) return; demoCancelled = true; slash.hidden ? openSlash() : closeSlash(); });
document.addEventListener('pointerdown', (e) => { if (!slash.hidden && !e.target.closest('.composer')) closeSlash(); });
composer.addEventListener('submit', (e) => {
  e.preventDefault();
  if (storyStarted) { followUp(); return; }
  demoCancelled = true;
  startStory(input.value.trim() || t('user.prompt'));
});

async function runDemo() {
  await sleep(1800); if (demoCancelled) return;
  composerBox.classList.add('hot');
  input.value = '/'; openSlash(''); await sleep(1000); if (demoCancelled) return;
  pickSkill('okx-year-in-review', { focus: false });
  await sleep(420);
  const text = t('user.prompt');
  for (const ch of text) { if (demoCancelled) return; input.value += ch; await sleep(prefersReduced ? 10 : 36 + Math.random() * 40); }
  await sleep(600); if (demoCancelled) return;
  sendBtn.classList.add('pulse'); await sleep(320);
  startStory(text);
}

/** The composer's content lifts off as a ghost and chases the real bubble into the thread while the
 *  console re-lays out underneath; its style morphs from input box to user bubble on the way. */
function flyToThread(text, skill) {
  const src = composerBox.getBoundingClientRect();
  const ghost = h('div', { class: 'ghost' }, skill ? h('span', { class: 'chip', text: '/' + skill }) : null, h('span', { text }));
  Object.assign(ghost.style, { left: src.left + 'px', top: src.top + 'px', width: src.width + 'px', height: src.height + 'px' });
  document.body.appendChild(ghost);
  const msg = agent.user(text, skill);
  msg.classList.add('landing'); digestLive.classList.add('landing');
  const bubble = collapsed ? digestLive : msg.querySelector('.bubble');
  const cur = { x: src.left, y: src.top, w: src.width, h: src.height };
  const t0 = performance.now();
  return new Promise((res) => {
    function f(now) {
      const e = now - t0;
      const r = bubble.getBoundingClientRect();
      const k = e < 220 ? 0.05 : 0.15;
      cur.x += (r.left - cur.x) * k; cur.y += (r.top - cur.y) * k; cur.w += (r.width - cur.w) * k; cur.h += (r.height - cur.h) * k;
      Object.assign(ghost.style, { left: cur.x + 'px', top: cur.y + 'px', width: cur.w + 'px', height: cur.h + 'px' });
      if (e > 260) ghost.classList.add('to-bubble');
      const settled = Math.abs(r.left - cur.x) + Math.abs(r.top - cur.y) + Math.abs(r.width - cur.w) < 2;
      if ((settled && e > 1000) || e > 1700 || prefersReduced) { ghost.remove(); msg.classList.remove('landing'); digestLive.classList.remove('landing'); res(); }
      else requestAnimationFrame(f);
    }
    requestAnimationFrame(f);
  });
}

async function startStory(text) {
  if (storyStarted) return;
  storyStarted = true; demoCancelled = true; closeSlash();
  const skill = pickedSkill || 'okx-year-in-review';
  const flight = flyToThread(text, skill);
  // collapse the composer to a status strip; the ghost is now carrying its content
  input.value = ''; chips.replaceChildren(); input.disabled = true; input.placeholder = t('ui.status.working'); sendBtn.disabled = true;
  composerBox.classList.remove('hot');
  stripChip.textContent = '/' + skill;
  consoleEl.classList.add('compact');
  app.dataset.phase = 'story';
  ascii.sweep({ speed: 1700, width: 170 });
  particles.morphTo('scatter', { duration: 900 }); particles.setSpin(0.3);
  setTimeout(focusParticles, 60); setTimeout(focusParticles, 1000);
  await flight;
  await sleep(300);
  await runChapters();
}
function openComposer() {
  setCollapsed(false);
  consoleEl.classList.remove('compact'); app.classList.add('compose-open');
  stripAsk.hidden = true;
  setTimeout(focusParticles, 60); setTimeout(focusParticles, 1000);
  setTimeout(() => input.focus(), 350);
}
stripAsk.addEventListener('click', openComposer);

// ---------------------------------------------------------------- chapters
// Every chapter unfolds in beats: the agent says one thing, the stage reveals one layer.
const D = (iso) => fmt.date(iso, lang);
const B = (el) => { el.classList.add('beat'); return el; };
async function beat(els, play, text, { pause = 650 } = {}) {
  for (const el of [].concat(els || [])) el?.classList.add('on');
  play?.();
  if (text) await agent.say(text);
  await sleep(prefersReduced ? 100 : pause);
}

async function chConnect() {
  setStatus('busy', t('ui.status.connecting'));
  await agent.think(t('ch1.think'), { perLine: 640 });
  const mods = [['account', 22], ['market', 24], ['spot', 18], ['swap', 21], ['bot', 14], ['earn', 12], ['dex', 16], ['smartmoney', 11], ['copytrade', 10], ['options', 9], ['system', 10]];
  const map = h('div', { class: 'modmap' }, mods.map(([m, n], i) => { const row = h('div', { class: 'm' + (['account', 'spot', 'bot', 'earn'].includes(m) ? '' : ' dim') }, h('span', { text: m }), h('b', { text: '▮'.repeat(Math.round(n / 3)) + ' ' + n })); row.style.animationDelay = `${i * 70}ms`; return row; }));
  const hr = B(hero('167', 'tools · 11 modules'));
  const vz = B(viz('okx-trade-mcp · stdio', h('div', {}, map, h('div', { class: 'session-meta' }, h('span', {}, 'mode ', h('i', { text: 'replay' })), h('span', {}, 'scope ', h('i', { text: 'read-only' })), h('span', {}, 'v', h('i', { text: '1.4.2' }))))));
  const sc = scene(0, 'SESSION', 'okx-trade-mcp', hr, vz);
  sc.querySelector('.eyebrow span:nth-child(3)').textContent = 'SESSION';
  await agent.tool('mcp.connect', { server: 'okx-trade-mcp', transport: 'stdio' }, { status: 'ok', tools: 167, modules: 11, version: '1.4.2' }, { ms: 860, summary: 'connected · 167 tools · 11 modules' });
  await showScene(sc, { shape: 'ring' });
  particles.setSpin(0.14);
  await beat(hr, null, null, { pause: 300 });
  await beat(vz, () => map.classList.add('go'), t('session.ready'));
  setStatus('live', t('ui.status.live'));
  await sleep(prefersReduced ? 200 : 1400);
}

async function chGenesis() {
  await agent.think(t('ch2.think'));
  const days = daysBetween(report.user.joined, `${YEAR}-12-31`);
  await agent.tool('account_profile', { fields: ['registered'] }, { registered: report.user.joined, days }, { ms: 410, summary: `registered ${report.user.joined} · ${days} days` });
  const hr = B(hero('0', t('ch2.label')));
  const lead = B(h('p', { class: 'lead', text: t('ch2.since', { date: D(report.user.joined) }) }));
  const strip = C.tenureStrip(report.user.joined, YEAR);
  const vz = B(viz(null, strip));
  const sc = scene(1, 'ch2.name', 'account_profile', hr, lead, vz);
  await showScene(sc, { shape: 'helix' });
  const v = { date: D(report.user.joined), days: fmt.int(days), years: Math.floor(days / 365) };
  await beat([hr, lead], () => countUp(hr.querySelector('.num'), days, { duration: 1800 }), t('ch2.b1', v));
  await beat(vz, () => strip.play(), t('ch2.b2', v));
  await beat(null, null, t('ch2.b3', v));
  await waitNext();
}

async function chFirst() {
  await agent.think(t('ch3.think'));
  const f = report.first;
  await agent.tool('spot_fills', { begin: `${YEAR}-01-01`, limit: 1 }, { ts: f.ts, instId: f.instId, side: f.side, sz: f.sz, px: f.px }, { ms: 530, summary: `${f.side.toUpperCase()} ${f.sz} ${f.instId.split('-')[0]} @ ${fmt.int(f.px)}` });
  const rows = [
    ['h', t('ch3.receipt'), f.ts.replace('T', ' ').slice(0, 16)],
    ['', 'side', h('span', { class: 'buy', text: f.side.toUpperCase() })],
    ['', 'inst', f.instId + ' · SPOT'],
    ['', 'size', `${f.sz} BTC`],
    ['', 'price', `${f.px.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT`],
    ['', 'ordId', '2025010122500001'],
  ];
  const rc = B(h('div', { class: 'receipt' }, rows.map(([cls, k, v], i) => { const r = h('div', { class: 'r ' + cls }, h('span', { class: 'k', text: k }), h('span', { class: 'v' }, v)); r.style.animationDelay = `${i * 140}ms`; return r; })));
  const hr = B(hero(fmt.time(f.ts), fmt.date(f.ts, lang)));
  const sc = scene(2, 'ch3.name', 'spot_fills', hr, rc);
  await showScene(sc, { shape: 'seed' });
  const v = { date: D(f.ts), time: fmt.time(f.ts), sz: f.sz, px: f.px.toLocaleString('en-US', { minimumFractionDigits: 2 }) };
  await beat(hr, null, t('ch3.b1', v));
  await beat(rc, () => rc.classList.add('go'), t('ch3.b2', v));
  await beat(null, () => particles.morphTo('sphere', { duration: 2600 }), t('ch3.b3', v));
  await waitNext();
}

async function chActivity() {
  await agent.think(t('ch4.think'));
  const a = report.activity;
  await agent.tool('account_bills', { year: YEAR, agg: 'daily' }, { activeDays: a.activeDays, trades: a.trades, topPair: a.topPair, topToken: a.topToken }, { ms: 720, summary: `${a.activeDays} active days · ${a.trades} fills · ${a.topPair}` });
  const hm = C.yearHeatmap(S.activity, {
    year: YEAR,
    monthLabels: lang === 'zh' ? ['1月', '4月', '7月', '10月'] : ['Jan', 'Apr', 'Jul', 'Oct'],
    levelLabels: lang === 'zh' ? ['休息', '轻度', '活跃', '忙碌', '火力全开'] : ['Quiet', 'Light', 'Active', 'Busy', 'On fire'],
    dateFmt: (d) => fmt.dateShort(d.toISOString().slice(0, 10), lang),
  });
  const pill = B(h('span', { class: 'pill ghost', text: `${a.trades} ${t('ch4.trades')}` }));
  const hr = B(hero('0', t('ch4.days'), { pill }));
  const vz = B(viz(`${YEAR}`, hm, `${a.activeDays}/365`));
  const stats = B(h('div', { class: 'stat-row' }, stat(a.topPair, t('ch4.pair')), stat(a.topToken, t('ch4.token'))));
  const sc = scene(3, 'ch4.name', 'account_bills', hr, vz, stats);
  await showScene(sc, { shape: 'lattice' });
  const v = { days: a.activeDays, trades: a.trades, pair: a.topPair, token: a.topToken };
  await beat(vz, () => hm.play(), t('ch4.b1', v));
  await beat([hr, pill], () => countUp(hr.querySelector('.num'), a.activeDays, { duration: 1600 }), t('ch4.b2', v));
  await beat(stats, null, t('ch4.b3', v));
  await waitNext();
}

const monthTicks = () => [0, 90, 181, 273].map((i, k) => ({ i, label: (lang === 'zh' ? ['1月', '4月', '7月', '10月'] : ['Jan', 'Apr', 'Jul', 'Oct'])[k] }));
const dayLabel = (i) => fmt.dateShort(new Date(Date.UTC(YEAR, 0, 1 + i)).toISOString().slice(0, 10), lang);

async function chBest() {
  await agent.think(t('ch5.think'));
  const b = report.best;
  await agent.tool('trade_pnl', { year: YEAR, sort: 'pnl', limit: 1 }, { date: b.date, instId: b.instId, market: b.market, pnl: b.pnl }, { ms: 640, summary: `${b.date} · ${b.instId} ${b.market} · +${fmt.int(b.pnl)} USDT` });
  const chart = C.lineChart(S.pnl, { highlight: dayOfYear(b.date), ticks: monthTicks(), callout: `+${fmt.int(b.pnl)}`, yFormat: (v) => fmt.int(v) + ' USDT', xLabel: dayLabel });
  const hr = B(hero(`+${fmt.int(b.pnl)}`, `USDT · ${b.instId} ${b.market}`, { lime: true }));
  const lead = B(h('p', { class: 'lead', text: t('ch5.label', { date: D(b.date) }) }));
  const vz = B(viz(t('ch5.curve'), chart));
  const sc = scene(4, 'ch5.name', 'trade_pnl', hr, lead, vz);
  await showScene(sc, { shape: 'wave' });
  const v = { date: D(b.date), inst: b.instId, market: b.market, pnl: fmt.int(b.pnl) };
  await beat(vz, () => chart.play({ highlight: false }), t('ch5.b1', v));
  await beat([hr, lead], () => chart.showHighlight(), t('ch5.b2', v));
  await beat(null, null, t('ch5.b3', v));
  await waitNext();
}

let branchOrder = ['volume', 'earn', 'bots'];
async function chHarvest() {
  await agent.think(t('ch6.think'));
  const p = report.pnl;
  await agent.tool('account_pnl', { year: YEAR, benchmark: true }, { total: p.total, yieldPct: p.yieldPct, percentile: p.beats }, { ms: 780, summary: `+${fmt.int(p.total)} USDT · ${p.yieldPct}% · p${p.beats}` });
  const pill = B(h('span', { class: 'pill', text: `+${p.yieldPct}%` }));
  const hr = B(hero('0', 'USDT', { lime: true, pill }));
  const lead = B(h('p', { class: 'lead', text: t('ch6.label') }));
  const m = C.meter(p.beats, { youLabel: t('ch6.you'), caption: t('ch6.beats', { beats: p.beats }) });
  const vz = B(viz(null, m));
  const sc = scene(5, 'ch6.name', 'account_pnl', hr, lead, vz);
  await showScene(sc, { shape: 'diamond' });
  const v = { total: fmt.int(p.total), pct: p.yieldPct, beats: p.beats };
  await beat([hr, lead], () => countUp(hr.querySelector('.num'), p.total, { duration: 2000 }), t('ch6.b1', v));
  await beat(pill, () => particles.kick(), t('ch6.b2', v));
  await beat(vz, () => m.play(), t('ch6.b3', v));
  await waitNext({ auto: AUTOPLAY_MS && 6000 });
  const pick = await agent.choice(t('choice.q'), [
    { key: 'volume', label: t('choice.volume'), glyph: '▂▅▇', hint: fmt.compact(report.volume.total) + ' USDT' },
    { key: 'earn', label: t('choice.earn'), glyph: '◔', hint: '+' + fmt.int(report.earn.earned) + ' USDT' },
    { key: 'bots', label: t('choice.bots'), glyph: '⌗', hint: '+' + fmt.int(report.bots.earned) + ' USDT' },
  ]);
  branchOrder = [pick, ...['volume', 'earn', 'bots'].filter((k) => k !== pick)];
  await agent.say(t('choice.ack', { what: t('choice.' + pick) }));
}

async function chVolume(idx) {
  await agent.think(t('ch7.think'));
  const v = report.volume;
  await agent.tool('account_volume', { year: YEAR, breakdown: 'venue' }, { total: v.total, breakdown: v.breakdown }, { ms: 690, summary: `${fmt.int(v.total)} USDT · spot › futures › dex` });
  const items = v.breakdown.map((b) => ({ label: t('ch7.' + b.k), value: b.v, unit: 'USDT', share: Math.round((b.v / v.total) * 100) + '%' }));
  const bars = C.hBars(items, { format: (n) => fmt.compact(n) });
  const hr = B(hero('0', t('ch7.label')));
  const vz = B(viz('TOP 3', bars, 'USDT'));
  const sc = scene(idx, 'ch7.name', 'account_volume', hr, vz);
  await showScene(sc, { shape: 'bars' });
  const by = Object.fromEntries(v.breakdown.map((b) => [b.k, fmt.compact(b.v)]));
  const vars = { total: fmt.int(v.total), spot: by.spot, futures: by.futures, dex: by.dex };
  await beat(hr, () => countUp(hr.querySelector('.num'), v.total, { duration: 2000 }), t('ch7.b1', vars));
  await beat(vz, () => bars.play(), t('ch7.b2', vars));
  await beat(null, null, t('ch7.b3', vars));
  await waitNext();
}

async function chEarn(idx) {
  await agent.think(t('ch8.think'));
  const e = report.earn;
  await agent.tool('earn_positions', { year: YEAR, includeRewards: true }, { subscribed: e.subscribed, earned: e.earned, product: e.product }, { ms: 560, summary: `${fmt.int(e.subscribed)} → +${fmt.int(e.earned)} USDT · ${e.product}` });
  const spark = C.sparkline(S.earn);
  const pct = Math.round((e.earned / e.subscribed) * 100);
  const subB = h('b', { text: '0' }), earnB = h('b', { class: 'lime', text: '0' });
  const hr = B(hero(`+${pct}%`, e.product, { lime: true }));
  const tileSub = B(h('div', { class: 'tile' }, h('span', { text: t('ch8.sub') + ' · USDT' }), subB));
  const tileEarn = B(h('div', { class: 'tile' }, h('span', { text: t('ch8.earned') + ' · USDT' }), earnB));
  const vz = B(viz(t('ch8.accrual'), spark, `${YEAR}`));
  const sc = scene(idx, 'ch8.name', 'earn_positions', hr, h('div', { class: 'tiles' }, tileSub, tileEarn), vz);
  await showScene(sc, { shape: 'ring' });
  const v = { sub: fmt.int(e.subscribed), earned: fmt.int(e.earned), product: e.product, pct };
  await beat(tileSub, () => countUp(subB, e.subscribed, { duration: 1400 }), t('ch8.b1', v));
  await beat([tileEarn, vz], () => { countUp(earnB, e.earned, { duration: 1800 }); spark.play(); }, t('ch8.b2', v));
  await beat(hr, null, t('ch8.b3', v));
  await waitNext();
}

async function chBots(idx) {
  await agent.think(t('ch9.think'));
  const b = report.bots;
  await agent.tool('bot_orders_history', { year: YEAR, algoType: 'grid' }, { trades: b.trades, volume: b.volume, earned: b.earned, strategy: b.strategy }, { ms: 740, summary: `${b.trades} fills · ${fmt.int(b.volume)} USDT · +${fmt.int(b.earned)} USDT` });
  const g = C.gridBot(S.grid, { buyLabel: t('ch9.buy'), sellLabel: t('ch9.sell'), priceLabel: lang === 'zh' ? '网格' : 'Grid' });
  const hr = B(hero('0', `USDT · ${t('ch9.label')}`, { lime: true }));
  const vz = B(viz(b.strategy.toUpperCase(), g, `${b.trades} ${t('ch9.trades')} · ${fmt.int(b.volume)} ${t('ch9.vol')}`));
  const sc = scene(idx, 'ch9.name', 'bot_orders_history', hr, vz);
  await showScene(sc, { shape: 'lattice' });
  const v = { trades: b.trades, vol: fmt.int(b.volume), earned: fmt.int(b.earned) };
  await beat(vz, () => g.play(), t('ch9.b1', v));
  await beat(hr, () => countUp(hr.querySelector('.num'), b.earned, { duration: 1800 }), t('ch9.b2', v));
  await beat(null, null, t('ch9.b3', v));
  await waitNext();
}

async function chPeak() {
  await agent.think(t('ch10.think'));
  const p = report.peak;
  await agent.tool('asset_valuation', { year: YEAR, interval: '1D' }, { peakDate: p.date, peakValue: p.value, percentile: 100 - p.topPct }, { ms: 810, summary: `ATH ${p.date} · ${fmt.int(p.value)} USDT · top ${p.topPct}%` });
  const chart = C.lineChart(S.equity, { highlight: dayOfYear(p.date), ticks: monthTicks(), callout: fmt.int(p.value), yFormat: (v) => fmt.int(v) + ' USDT', xLabel: dayLabel });
  const pill = B(h('span', { class: 'pill', text: t('ch10.top', { pct: p.topPct }) }));
  const hr = B(hero('0', 'USDT', { pill }));
  const lead = B(h('p', { class: 'lead', text: `${t('ch10.label')} · ${D(p.date)}` }));
  const vz = B(viz(t('ch10.curve'), chart));
  const sc = scene(9, 'ch10.name', 'asset_valuation', hr, lead, vz);
  await showScene(sc, { shape: 'peak' });
  const v = { date: D(p.date), value: fmt.int(p.value), pct: p.topPct };
  await beat(vz, () => chart.play({ highlight: false }), t('ch10.b1', v));
  await beat([hr, lead], () => { chart.showHighlight(); countUp(hr.querySelector('.num'), p.value, { duration: 1800 }); }, t('ch10.b2', v));
  await beat(pill, () => particles.kick(), t('ch10.b3', v));
  await waitNext();
}

async function chFlow() {
  await agent.think(t('ch11.think'));
  const f = report.flow;
  await agent.tool('funding_flow', { year: YEAR }, { deposit: f.deposit, withdraw: f.withdraw, net: f.deposit - f.withdraw }, { ms: 470, summary: `in ${fmt.int(f.deposit)} · out ${fmt.int(f.withdraw)} · net +${fmt.int(f.deposit - f.withdraw)}` });
  const flow = C.flowBars([{ label: t('ch11.in'), value: f.deposit, kind: 'in' }, { label: t('ch11.out'), value: f.withdraw, kind: 'out' }]);
  const rowOut = flow.children[1]; rowOut.classList.add('beat');
  const hr = B(hero('0', `USDT · ${t('ch11.net')}`));
  const vz = B(viz(null, flow));
  const sc = scene(10, 'ch11.name', 'funding_flow', hr, vz);
  await showScene(sc, { shape: 'sphere' });
  const v = { dep: fmt.int(f.deposit), wd: fmt.int(f.withdraw), net: fmt.int(f.deposit - f.withdraw) };
  await beat(vz, () => flow.playRow(0), t('ch11.b1', v));
  await beat(rowOut, () => flow.playRow(1), t('ch11.b2', v));
  await beat(hr, () => countUp(hr.querySelector('.num'), f.deposit - f.withdraw, { duration: 1600 }), t('ch11.b3', v));
  await waitNext();
}

async function chDNA() {
  await agent.think(t('ch12.think'));
  const axes = report.radar.map((r) => ({ label: t('radar.' + r.k), value: r.v, k: r.k }));
  await agent.tool('analyze_behavior', { year: YEAR, signals: report.radar.map((r) => r.k) }, Object.fromEntries(report.radar.map((r) => [r.k, r.v])), { ms: 920, summary: report.radar.map((r) => `${r.k} ${r.v}`).join(' · ') });
  const rd = C.radar(axes, { size: 250 });
  const vz = B(viz(t('ch12.name'), rd, '/100'));
  const sc = scene(11, 'ch12.name', 'analyze_behavior', vz);
  await showScene(sc, { shape: 'diamond' });
  const v = Object.fromEntries(report.radar.map((r) => [r.k, r.v]));
  await beat(vz, () => rd.play(), t('ch12.b1', v));
  await beat(null, null, t('ch12.b2', v));
  await beat(null, null, t('ch12.b3', v));
  await waitNext();
}

function pickPersona() {
  const top = [...report.radar].sort((a, b) => b.v - a.v)[0].k;
  const key = { automation: 'gridArchitect', yield: 'alphaHarvester', consistency: 'steadyCompounder', diversity: 'explorer', risk: 'sentinel' }[top];
  return { key, name: t(`persona.${key}.name`), tag: t(`persona.${key}.tag`), traits: t(`persona.${key}.traits`) };
}
function cardStats() {
  return [[t('card.earned'), fmt.int(report.pnl.total) + ' USDT'], [t('card.yield'), '+' + report.pnl.yieldPct + '%'], [t('card.days'), String(report.activity.activeDays)], [t('card.volume'), fmt.compact(report.volume.total) + ' USDT']];
}
function openSheet(persona) {
  const url = renderShareCard({ t, persona, stats: cardStats(), footer: 'okx-year-in-review · powered by OKX Agent Trade Kit' });
  $('#sheetImg').src = url; $('#sheetDl').href = url; $('#sheet').hidden = false;
}
$('#sheetClose').addEventListener('click', () => { $('#sheet').hidden = true; });
$('#sheet').addEventListener('click', (e) => { if (e.target === e.currentTarget) $('#sheet').hidden = true; });

async function chPersona() {
  // analyzing transition
  const label = h('div', { class: 'analyzing' });
  const an = h('section', { class: 'scene center' }, h('div', { class: 'scan' }), label, h('div', { class: 'analyzing-sub', text: 'okx-year-in-review · inference' }));
  let alive = true;
  an.play = async () => { while (alive) { await decrypt(label, t('ch13.analyzing'), { duration: 900 }); await sleep(600); } };
  ascii.setMode('storm'); ascii.setIntensity(0.8);
  particles.setSpin(0.6);
  await showScene(an, { shape: 'scatter' });
  const cycle = ['sphere', 'diamond', 'helix', 'grid'];
  for (const [i, s] of cycle.entries()) setTimeout(() => particles.morphTo(s, { duration: 900 }), 700 + i * 950);
  await agent.think(t('ch13.think'), { perLine: 900 });
  alive = false;
  ascii.setMode('calm'); ascii.setIntensity(0.62);
  particles.setSpin(0.1);

  const persona = pickPersona();
  const minted = await agent.approval({ title: t('mint.title'), body: t('mint.body'), accept: t('mint.accept'), decline: t('mint.later'), okLabel: t('mint.done'), noLabel: t('mint.skipped') });
  if (!minted) await agent.say(t('mint.declined'));

  const nameEl = h('h2', { class: 'p-name' });
  const cmd = 'npm i -g @okx_ai/okx-trade-mcp';
  const copyBtn = h('button', { class: 'mini', type: 'button', text: t('cta.copy'), onClick: async () => { try { await navigator.clipboard.writeText(cmd); copyBtn.textContent = t('cta.copied'); setTimeout(() => (copyBtn.textContent = t('cta.copy')), 1500); } catch {} } });
  const tag = B(h('p', { class: 'p-tag', text: persona.tag }));
  const traits = B(h('div', { class: 'traits' }, persona.traits.map((x) => h('span', { class: 'trait', text: x }))));
  const stats = B(h('div', { class: 'p-stats' }, cardStats().map(([k, v]) => h('div', { class: 'p-stat' }, h('b', { text: v }), h('span', { text: k })))));
  const actions = B(h('div', { class: 'p-actions' },
    h('button', { class: 'btn primary', type: 'button', text: t('cta.save'), onClick: () => openSheet(persona) }),
    h('button', { class: 'btn', type: 'button', text: t('cta.replay'), onClick: () => location.reload() })));
  const cta = B(h('div', { class: 'cta' }, h('div', { class: 'cta-h', text: t('cta.title') }), h('p', { text: t('cta.body') }),
    h('div', { class: 'code' }, h('code', { text: '$ ' + cmd }), copyBtn),
    h('a', { class: 'repo', href: 'https://github.com/okx/agent-trade-kit', target: '_blank', rel: 'noopener', text: t('cta.repo') + ' ↗' })));
  const sc = scene(12, 'ch13.name', 'okx-year-in-review', h('div', { class: 'persona' }, nameEl, tag, traits), stats, actions, cta);
  sc.classList.add('scroll');
  app.dataset.phase = 'final';
  setTimeout(focusParticles, 60); setTimeout(focusParticles, 1000);
  await showScene(sc, { shape: 'grid' });
  particles.kick();
  decrypt(nameEl, persona.name, { duration: 1500 });
  await beat(null, null, t('ch13.b1', { persona: persona.name }));
  await beat([tag, traits], null, t('ch13.b2', { tagline: persona.tag }));
  await beat([stats, actions], null, null, { pause: 500 });
  if (minted) { openSheet(persona); await sleep(600); }
  await beat(cta, null, t('ch13.closing'));
  input.disabled = false; sendBtn.disabled = false; input.placeholder = t('ui.followup');
  stripChip.hidden = true; stripAsk.hidden = false;
  setStatus('live', t('ui.status.live'));
}

async function followUp() {
  const text = input.value.trim(); if (!text) return;
  input.value = ''; input.disabled = true; sendBtn.disabled = true;
  agent.user(text);
  await agent.think([lang === 'zh' ? '检索 2025 蓝图上下文' : 'Searching 2025 blueprint context', lang === 'zh' ? '演示环境 · 无实时工具' : 'Demo sandbox · no live tools']);
  await agent.say(t('followup.reply'));
  input.disabled = false; sendBtn.disabled = false; input.focus();
}

async function runChapters() {
  const branch = { volume: chVolume, earn: chEarn, bots: chBots };
  const flat = [chConnect, chGenesis, chFirst, chActivity, chBest, chHarvest, 'branch', 'branch', 'branch', chPeak, chFlow, chDNA, chPersona];
  let n = 0, b = 0;
  for (let i = 0; i < flat.length; i++) {
    const step = flat[i];
    const fn = step === 'branch' ? branch[branchOrder[b++]] : step;
    if (i > 0) setProgress(n);
    digest.reset();
    if (i >= FROM) {
      if (i > 0 && FROM === i && FROM > 0) setStatus('live', t('ui.status.live'));
      await fn(step === 'branch' ? n + 1 : undefined);
    }
    if (i > 0) n++;
  }
  setProgress(12);
}

// ---------------------------------------------------------------- boot
app.classList.add('console-collapsed');
applyStatic();
(async () => {
  await sleep(300);
  ascii.sweep({ speed: 1500, width: 140 });
  await decrypt($('#coverTitle'), t('cover.title'), { duration: 1100 });
  if (FROM > 0) { pickSkill('okx-year-in-review', { focus: false }); startStory(t('user.prompt')); }
  else runDemo();
})();
