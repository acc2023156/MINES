/* 從大廳（GDBO）進入時使用 SHA Platform：地雷位置、派彩與餘額皆由伺服器決定，餘額為會員的 GDBO 錢包。
   網址帶 ?api=<SHA API>&return=<大廳> 與 #token=<launch token>；沒有 token 時沿用本機試玩（engine.js）。 */
(function (global) {
  'use strict';
  const { MinesGame, multiplier } = global.Mines;

  const query = new URLSearchParams(global.location.search);
  let token = new URLSearchParams(global.location.hash.slice(1)).get('token');
  try {
    if (token) global.sessionStorage.setItem('mines.launchToken', token);
    else token = global.sessionStorage.getItem('mines.launchToken');
  } catch (e) { /* ignore */ }
  if (global.location.hash) global.history.replaceState(null, '', global.location.pathname + global.location.search);
  // api 只接受 Cloudflare Workers 或本機，launch token 不會送到其他主機
  const apiBase = (() => {
    try {
      const u = new URL(query.get('api') || 'https://sha-platform-dev.sha-platform.workers.dev/api/v1');
      return /\.workers\.dev$|^(localhost|127\.0\.0\.1)$/.test(u.hostname) ? u.href.replace(/\/$/, '') : '';
    } catch (e) { return ''; }
  })();

  const toUnits = coins => String(Math.round(coins * 100) * 10);
  const fromMoney = money => Number(money.units) / 10 ** money.scale;

  class RemoteMinesGame extends MinesGame {
    constructor(opts) {
      super({ ...opts, balance: 0 });
      this.remote = true;
      this.commitment = null;
    }

    get nextServerHash() { return this.commitment ? this.commitment.server_seed_hash : ''; }

    async api(path, body) {
      const response = await fetch(apiBase + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(body || {}),
        cache: 'no-store'
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const messages = { INSUFFICIENT_FUNDS: '餘額不足', INVALID_LAUNCH_TOKEN: '登入已逾時，請回大廳重新進入', ACTIVE_ROUND_EXISTS: '請先完成進行中的一局' };
        const error = new Error(messages[payload.error && payload.error.code] || (payload.error && payload.error.message) || `連線錯誤 (${response.status})`);
        error.code = payload.error && payload.error.code;
        throw error;
      }
      return payload;
    }

    /** 取得餘額與承諾；有進行中的局時還原已翻開的格子。 */
    async connect() {
      const session = await this.api('/games/mines/session');
      this.balance = fromMoney(session.balance);
      this.commitment = session.commitment;
      const r = session.active_round;
      this.round = r ? {
        id: r.id, bet: fromMoney(r.wager), mines: r.mines, picks: r.revealed_tiles.slice(), status: 'playing',
        payout: 0, hitTile: -1, mineSet: new Set(), nonce: '-', clientSeed: this.clientSeed, serverHash: ''
      } : null;
    }

    async start(bet, mines) {
      if (this.active) throw new Error('本局尚未結束');
      bet = Math.floor(+bet * 100 + 1e-7) / 100;
      if (!(bet > 0)) throw new Error('請輸入下注金額');
      if (bet > this.balance + 1e-9) throw new Error('餘額不足');
      const res = await this.api('/games/mines/rounds', {
        request_id: global.crypto.randomUUID(), commitment_id: this.commitment.id, client_seed: this.clientSeed,
        wager: { units: toUnits(bet), currency: 'TWD', scale: 3 }, mines: +mines
      });
      this.balance = fromMoney(res.balance);
      this.nonce = +res.fairness.nonce;
      this.round = {
        id: res.round.id, bet, mines: +mines, picks: [], status: 'playing', payout: 0, hitTile: -1, mineSet: new Set(),
        nonce: this.nonce, clientSeed: res.fairness.client_seed, serverHash: res.fairness.server_seed_hash
      };
      return this.round;
    }

    /** 伺服器回傳的結算結果寫回本局（翻到地雷、全部翻完或兌現）。 */
    settle(res) {
      const r = this.round;
      r.status = res.round.status;
      r.payout = fromMoney(res.round.payout);
      r.multiplier = +res.round.multiplier;
      r.hitTile = res.round.hit_tile ?? -1;
      r.mineSet = new Set(res.round.mine_positions);
      r.serverSeed = res.fairness.server_seed;
      r.nonce = +res.fairness.nonce;
      this.balance = fromMoney(res.balance);
      this.commitment = res.next_commitment;
      return r;
    }

    async reveal(tile) {
      const r = this.round;
      if (!this.active) throw new Error('請先下注');
      if (tile < 0 || r.picks.includes(tile)) return null;
      const res = await this.api(`/games/mines/rounds/${encodeURIComponent(r.id)}/reveals`, { request_id: global.crypto.randomUUID(), tile });
      if (res.outcome.result === 'mine') return { mine: true, round: this.settle(res) };
      r.picks = res.round.revealed_tiles.slice();
      if (res.round.status !== 'active') return { mine: false, auto: this.settle(res), round: r };
      this.balance = fromMoney(res.balance);
      return { mine: false, round: r };
    }

    async cashout() {
      if (!this.canCashout) throw new Error('至少要翻開一格');
      const res = await this.api(`/games/mines/rounds/${encodeURIComponent(this.round.id)}/cashout`, { request_id: global.crypto.randomUUID() });
      return this.settle(res);
    }
  }

  global.Mines.remote = token && apiBase ? { RemoteMinesGame, multiplier } : null;
})(window);
