// Renders the shareable persona card to a PNG data URL (1080×1440, 3:4).
const LIME = '#bcff2f';

function wrapText(g, text, x, y, maxW, lh) {
  const words = /[一-鿿]/.test(text) ? [...text] : text.split(' ');
  const joiner = /[一-鿿]/.test(text) ? '' : ' ';
  let line = '';
  for (const w of words) {
    const test = line ? line + joiner + w : w;
    if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y); y += lh; line = w; }
    else line = test;
  }
  if (line) { g.fillText(line, x, y); y += lh; }
  return y;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function drawMark(g, x, y, s) {
  const c = s / 3;
  g.fillStyle = LIME;
  for (const [i, j] of [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]]) g.fillRect(x + i * c + 1, y + j * c + 1, c - 2, c - 2);
}

export function renderShareCard({ t, persona, stats, footer }) {
  const W = 1080, H = 1440;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);

  // ascii field texture (quiet in the middle, brighter at the edges)
  const chars = ' .:-=+*#%@';
  g.font = '22px "JetBrains Mono", ui-monospace, monospace'; g.textBaseline = 'top';
  for (let y = 0; y < H; y += 26) for (let x = 0; x < W; x += 16) {
    const v = (Math.sin(x * 0.013 + y * 0.007) * Math.cos(y * 0.011 - x * 0.004) + 1) / 2;
    const dx = x / W - 0.5, dy = y / H - 0.5, r = Math.sqrt(dx * dx + dy * dy);
    const a = v * (0.02 + r * 0.42) - 0.06;
    if (a < 0.015) continue;
    g.fillStyle = `rgba(188,255,47,${Math.min(0.5, a).toFixed(3)})`;
    g.fillText(chars[Math.floor(v * (chars.length - 1))], x, y);
  }

  // header
  g.fillStyle = '#fff'; g.font = '800 54px Inter, -apple-system, sans-serif'; g.textBaseline = 'alphabetic';
  g.fillText('OKX', 80, 128);
  drawMark(g, 80 + g.measureText('OKX').width + 22, 86, 42);
  g.fillStyle = LIME; g.font = '600 26px "JetBrains Mono", ui-monospace, monospace'; g.textAlign = 'right';
  g.fillText(t('card.title'), W - 80, 124); g.textAlign = 'left';

  // hairline
  g.fillStyle = '#262626'; g.fillRect(80, 170, W - 160, 2);

  // large ghost mark (echoes the particle mark)
  g.save(); g.globalAlpha = 0.14; drawMark(g, W - 80 - 300, 190, 300); g.restore();
  g.save(); g.globalAlpha = 0.5; drawMark(g, W - 80 - 300 + 200, 190 + 200, 100); g.restore();

  // persona
  g.fillStyle = LIME; g.font = '600 26px "JetBrains Mono", ui-monospace, monospace';
  g.fillText(`12 / ${t('ch13.name')}`.toUpperCase(), 80, 420);
  g.fillStyle = '#fff'; g.font = '800 100px Inter, -apple-system, sans-serif';
  let y = wrapText(g, persona.name, 80, 540, W - 160, 112);
  g.fillStyle = '#cfcfcf'; g.font = '500 36px Inter, -apple-system, "PingFang SC", sans-serif';
  y = wrapText(g, persona.tag, 80, y + 20, W - 200, 50);

  // traits
  let tx = 80; y += 30;
  g.font = '600 26px "JetBrains Mono", ui-monospace, monospace';
  for (const tr of persona.traits) {
    const w = g.measureText(tr).width + 44;
    g.fillStyle = 'rgba(188,255,47,0.14)'; roundRect(g, tx, y, w, 56, 12); g.fill();
    g.strokeStyle = 'rgba(188,255,47,0.45)'; g.lineWidth = 2; g.stroke();
    g.fillStyle = LIME; g.fillText(tr, tx + 22, y + 38);
    tx += w + 14;
  }

  // stats 2×2
  const gy = 1010, colW = (W - 160) / 2;
  stats.forEach(([label, value], i) => {
    const cx = 80 + (i % 2) * colW, cy = gy + Math.floor(i / 2) * 150;
    g.fillStyle = '#969696'; g.font = '500 24px "JetBrains Mono", ui-monospace, monospace'; g.fillText(label.toUpperCase(), cx, cy);
    g.fillStyle = i === 0 ? LIME : '#fff'; g.font = '700 58px Inter, -apple-system, sans-serif'; g.fillText(value, cx, cy + 68);
  });

  // footer
  g.fillStyle = '#262626'; g.fillRect(80, H - 150, W - 160, 2);
  g.fillStyle = '#636363'; g.font = '500 22px "JetBrains Mono", ui-monospace, monospace';
  g.fillText(footer, 80, H - 96);
  return cv.toDataURL('image/png');
}
