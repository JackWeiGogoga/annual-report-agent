// Annual report data (demo values from last year's brief) + deterministic synthetic series.
export const YEAR = 2025;

export const report = {
  user: { joined: '2021-03-14' },
  first: { ts: '2025-01-01T22:50:00', instId: 'BTC-USDT', side: 'buy', sz: 0.0125, px: 93412.5 },
  activity: { activeDays: 315, trades: 87, topPair: 'DOGE-USDT', topToken: 'OKB' },
  best: { date: '2025-10-10', instId: 'BTC-USDT', market: 'Spot', pnl: 1223 },
  pnl: { total: 21887, yieldPct: 138, beats: 82 },
  volume: {
    total: 1998887,
    breakdown: [
      { k: 'spot', v: 1243000 },
      { k: 'futures', v: 612887 },
      { k: 'dex', v: 143000 },
    ],
  },
  earn: { subscribed: 1234, earned: 988, product: 'USDT Simple Earn' },
  bots: { trades: 23, volume: 1234, earned: 2521, strategy: 'Spot grid' },
  peak: { date: '2025-08-31', value: 21887, topPct: 30 },
  flow: { deposit: 21887, withdraw: 2521 },
  radar: [
    { k: 'automation', v: 94 },
    { k: 'consistency', v: 90 },
    { k: 'yield', v: 86 },
    { k: 'risk', v: 78 },
    { k: 'diversity', v: 64 },
  ],
};

export function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}
export function dayOfYear(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return Math.round((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000);
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function buildSeries() {
  const rnd = mulberry32(20250101);
  const N = 365;

  // --- daily activity levels (0..4), exactly `activeDays` non-zero days
  const idx = [...Array(N).keys()];
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const rest = new Set(idx.slice(0, N - report.activity.activeDays));
  const activity = Array.from({ length: N }, (_, d) => (rest.has(d) ? 0 : 1 + Math.floor(Math.pow(rnd(), 1.5) * 4)));

  // --- equity curve, exact peak on Aug 31
  const peakDay = dayOfYear(report.peak.date);
  const equity = [];
  let v = 8200;
  for (let d = 0; d < N; d++) {
    const target = d <= peakDay
      ? 8200 + (report.peak.value - 8200) * easeInOut(d / peakDay)
      : report.peak.value - 3600 * Math.sin(((d - peakDay) / (N - 1 - peakDay)) * Math.PI) - 900 * ((d - peakDay) / (N - peakDay));
    v = v * 0.6 + target * 0.4 + (rnd() - 0.5) * 700;
    equity.push(v);
  }
  equity[peakDay] = report.peak.value;
  for (let d = 0; d < N; d++) if (d !== peakDay && equity[d] > report.peak.value - 250) equity[d] = report.peak.value - 250 - rnd() * 400;

  // --- cumulative realized pnl, biggest single step on Oct 10 (= best trade)
  const bestDay = dayOfYear(report.best.date);
  const inc = Array.from({ length: N }, (_, d) => (d === bestDay ? 0 : activity[d] ? (rnd() - 0.4) * 160 : 0));
  const sum = inc.reduce((a, b) => a + b, 0);
  const scale = (report.pnl.total - report.best.pnl) / sum;
  const pnl = []; let c = 0;
  for (let d = 0; d < N; d++) { c += d === bestDay ? report.best.pnl : inc[d] * scale; pnl.push(c); }

  // --- grid bot price path (normalised 0..1) oscillating through grid levels
  const grid = [];
  for (let i = 0; i < 96; i++) {
    const t = i / 95;
    grid.push(0.5 + 0.30 * Math.sin(t * Math.PI * 4.2) * (0.75 + 0.25 * Math.sin(t * 9)) + (rnd() - 0.5) * 0.10);
  }
  // --- earn accrual sparkline
  const earn = Array.from({ length: 24 }, (_, i) => Math.pow(i / 23, 0.85) * report.earn.earned * (0.97 + rnd() * 0.06));
  earn[23] = report.earn.earned;

  return { activity, equity, pnl, grid, earn };
}
