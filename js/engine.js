/* Mines 遊戲引擎：倍數、地雷位置（可驗證公平）、下注結算。不碰 DOM，Node 也能跑（見 tools/rtp-test.js）。 */
(function (global) {
  'use strict';

  const TILES = 25;
  const RTP = 0.98;
  const MIN_MINES = 1;
  const MAX_MINES = 24;
  const sha256 = global.sha256 || (typeof require !== 'undefined' && require('./sha256.js') && global.sha256);

  // 連續翻開 k 格都是寶石的機率 = C(25-m, k) / C(25, k)
  function survival(mines, k) {
    let p = 1;
    for (let i = 0; i < k; i++) p *= (TILES - mines - i) / (TILES - i);
    return p;
  }

  // 公平倍數 = RTP / 存活機率。任何兌現策略的期望回報都是 RTP（98%）
  function multiplier(mines, k) {
    if (k <= 0) return 1;
    return RTP / survival(mines, k);
  }

  function randomHex(bytes) {
    const a = new Uint8Array(bytes);
    const c = global.crypto || (typeof require !== 'undefined' ? require('crypto').webcrypto : null);
    c.getRandomValues(a);
    return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
  }

  // 由種子產生 0~1 浮點數串流：每個 SHA-256 取 8 組 32-bit
  function floats(serverSeed, clientSeed, nonce, count) {
    const out = [];
    for (let cursor = 0; out.length < count; cursor++) {
      const h = sha256(`${serverSeed}:${clientSeed}:${nonce}:${cursor}`);
      for (let i = 0; i < 64 && out.length < count; i += 8) out.push(parseInt(h.slice(i, i + 8), 16) / 0x100000000);
    }
    return out;
  }

  // Fisher–Yates 洗牌 0~24，前 mines 個格子就是地雷
  function minePositions(serverSeed, clientSeed, nonce, mines) {
    const cells = Array.from({ length: TILES }, (_, i) => i);
    const f = floats(serverSeed, clientSeed, nonce, TILES - 1);
    for (let i = 0; i < TILES - 1; i++) {
      const j = i + Math.floor(f[i] * (TILES - i));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    return cells.slice(0, mines).sort((a, b) => a - b);
  }

  const cents = x => Math.floor(x * 100 + 1e-7) / 100;

  class MinesGame {
    constructor(opts = {}) {
      this.balance = opts.balance ?? 1000;
      this.clientSeed = opts.clientSeed || randomHex(8);
      this.nonce = opts.nonce || 0;
      this.round = null;
      this.nextServerSeed = randomHex(32);
    }

    get nextServerHash() { return sha256(this.nextServerSeed); }
    get active() { return !!this.round && this.round.status === 'playing'; }

    start(bet, mines) {
      if (this.active) throw new Error('本局尚未結束');
      bet = cents(+bet);
      mines = Math.round(+mines);
      if (!(bet > 0)) throw new Error('請輸入下注金額');
      if (bet > this.balance + 1e-9) throw new Error('餘額不足');
      if (mines < MIN_MINES || mines > MAX_MINES) throw new Error('地雷數需為 1–24');
      const serverSeed = this.nextServerSeed;
      this.nextServerSeed = randomHex(32);
      this.nonce += 1;
      this.balance = cents(this.balance - bet);
      this.round = {
        bet, mines, serverSeed, serverHash: sha256(serverSeed), clientSeed: this.clientSeed, nonce: this.nonce,
        mineSet: new Set(minePositions(serverSeed, this.clientSeed, this.nonce, mines)),
        picks: [], status: 'playing', payout: 0, hitTile: -1
      };
      return this.round;
    }

    get safeCount() { return this.round ? this.round.picks.length : 0; }
    get currentMultiplier() { return this.round ? multiplier(this.round.mines, this.safeCount) : 1; }
    get nextMultiplier() { return this.round ? multiplier(this.round.mines, this.safeCount + 1) : 1; }
    // 下一格是寶石的機率
    get nextWinChance() {
      if (!this.round) return 0;
      const left = TILES - this.safeCount;
      return (left - this.round.mines) / left;
    }
    get canCashout() { return this.active && this.safeCount > 0; }

    reveal(tile) {
      const r = this.round;
      if (!this.active) throw new Error('請先下注');
      if (tile < 0 || tile >= TILES || r.picks.includes(tile)) return null;
      if (r.mineSet.has(tile)) {
        r.status = 'lost';
        r.hitTile = tile;
        r.payout = 0;
        return { mine: true, round: r };
      }
      r.picks.push(tile);
      // 所有寶石都翻完 → 自動兌現
      if (r.picks.length === TILES - r.mines) return { mine: false, auto: this.cashout(), round: r };
      return { mine: false, round: r };
    }

    cashout() {
      if (!this.canCashout) throw new Error('至少要翻開一格');
      const r = this.round;
      r.status = 'won';
      r.multiplier = this.currentMultiplier;
      r.payout = cents(r.bet * r.multiplier);
      this.balance = cents(this.balance + r.payout);
      return r;
    }

    randomUnrevealed() {
      if (!this.active) return -1;
      const left = [];
      for (let i = 0; i < TILES; i++) if (!this.round.picks.includes(i)) left.push(i);
      const a = new Uint32Array(1);
      (global.crypto || require('crypto').webcrypto).getRandomValues(a);
      return left[a[0] % left.length];
    }
  }

  global.Mines = { TILES, RTP, MIN_MINES, MAX_MINES, survival, multiplier, minePositions, randomHex, cents, MinesGame };
  if (typeof module !== 'undefined') module.exports = global.Mines;
})(typeof window !== 'undefined' ? window : globalThis);
