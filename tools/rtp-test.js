/* RTP 驗證：node tools/rtp-test.js
   1) 用真實引擎（含 SHA-256 洗牌）模擬各種「地雷數 × 翻格數」的兌現策略，確認回報率 ≈ 98%
   2) 檢查 SHA-256 與 Node crypto 一致、地雷分布均勻 */
'use strict';
require('../js/sha256.js');
const { MinesGame, multiplier, minePositions, TILES } = require('../js/engine.js');
const crypto = require('crypto');

let ok = true;
const check = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) ok = false; };

for (const s of ['', 'abc', 'seed:client:1:0', 'x'.repeat(200)]) {
  check(globalThis.sha256(s) === crypto.createHash('sha256').update(s).digest('hex'), `sha256("${s.slice(0, 20)}")`);
}

// 地雷位置均勻：每格被選為地雷的頻率應 ≈ mines/25
{
  const N = 40000, mines = 5, hits = new Array(TILES).fill(0);
  for (let n = 1; n <= N; n++) for (const t of minePositions('server', 'client', n, mines)) hits[t]++;
  const expect = N * mines / TILES;
  const maxDev = Math.max(...hits.map(h => Math.abs(h - expect) / expect));
  check(maxDev < 0.05, `地雷分布均勻（最大偏差 ${(maxDev * 100).toFixed(2)}%）`);
}

// 理論 RTP：每種策略都是 0.98
for (const m of [1, 3, 5, 10, 24]) {
  for (let k = 1; k <= TILES - m; k++) {
    const p = require('../js/engine.js').survival(m, k);
    if (Math.abs(p * multiplier(m, k) - 0.98) > 1e-9) check(false, `理論 RTP m=${m} k=${k}`);
  }
}
check(true, '理論 RTP：所有 地雷數×翻格數 組合皆為 98.00%');

// 蒙地卡羅：用真引擎跑
const cases = [[1, 1], [1, 5], [3, 3], [5, 2], [5, 8], [10, 3], [24, 1]];
const N = 60000;
for (const [m, k] of cases) {
  const g = new MinesGame({ balance: 1e12 });
  let paid = 0;
  for (let i = 0; i < N; i++) {
    g.start(100, m);
    let dead = false;
    for (let j = 0; j < k && !dead; j++) dead = g.reveal(g.randomUnrevealed()).mine;
    if (!dead && g.active) paid += g.cashout().payout; else if (!dead) paid += g.round.payout;
  }
  const rtp = paid / N / 100;
  // 分分進位（向下取整到分）會讓小額下注略低於 98%
  const tol = 4 * Math.sqrt(multiplier(m, k) * 0.98 / N) + 0.01;
  check(Math.abs(rtp - 0.98) < tol, `模擬 地雷${m} 翻${k}格 ×${multiplier(m, k).toFixed(4)}：RTP ${(rtp * 100).toFixed(2)}%（${N} 局）`);
}

process.exit(ok ? 0 : 1);
