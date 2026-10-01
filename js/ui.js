/* 畫面：盤面、下注面板、自動投注、紀錄、公平性視窗 */
(function () {
  'use strict';
  const { TILES, MIN_MINES, MAX_MINES, multiplier, survival, minePositions, randomHex, cents, MinesGame } = window.Mines;
  const $ = s => document.querySelector(s);
  const fmt = x => (+x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtMult = x => (x >= 1000 ? x.toLocaleString('en-US', { maximumFractionDigits: 2 }) : x.toFixed(2)) + '×';
  const pct = x => (x * 100 >= 99.995 ? '100' : (x * 100).toFixed(x < 0.001 ? 4 : 2)) + '%';
  const wait = ms => new Promise(r => setTimeout(r, ms));

  const KEY = 'mines.v1';
  const START_BALANCE = 1000;

  const el = {
    balance: $('#balance'), wallet: $('.wallet'), bet: $('#betAmount'), mines: $('#minesSel'), gems: $('#gemsOut'),
    board: $('#board'), ladder: $('#ladder'), main: $('#mainBtn'),
    nextChance: $('#nextChance'), nextMult: $('#nextMult'), curMult: $('#curMult'), curProfit: $('#curProfit'),
    roundChance: $('#roundChance'), nonce: $('#nonceOut'), winPop: $('#winPop'), winMult: $('#winMult'), winPay: $('#winPay'),
    modeSeg: $('#modeSeg'), autoFields: $('#autoFields'), autoPickCount: $('#autoPickCount'),
    autoCount: $('#autoCount'), onWin: $('#onWin'), onLoss: $('#onLoss'), stopProfit: $('#stopProfit'), stopLoss: $('#stopLoss'),
    myList: $('#myList'), summary: $('#summary'), multTable: $('#multTable'), tableMines: $('#tableMines'),
    sound: $('#soundBtn'), back: $('#backBtn'),
    fair: $('#fairDialog'), clientSeed: $('#clientSeed'), nextHash: $('#nextHash'),
    vServer: $('#vServer'), vClient: $('#vClient'), vNonce: $('#vNonce'), vMines: $('#vMines'), verifyOut: $('#verifyOut'), verifyBoard: $('#verifyBoard')
  };

  // ---------- 存檔 ----------
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { saved = {}; }
  const game = new MinesGame({ balance: saved.balance ?? START_BALANCE, clientSeed: saved.clientSeed, nonce: saved.nonce });
  if (saved.nextServerSeed) game.nextServerSeed = saved.nextServerSeed;
  const history = Array.isArray(saved.history) ? saved.history : [];
  // 重新整理時還原進行中的局
  if (saved.round && saved.round.status === 'playing') {
    const r = saved.round;
    game.round = { ...r, mineSet: new Set(minePositions(r.serverSeed, r.clientSeed, r.nonce, r.mines)) };
  }
  let mode = 'manual';
  let autoPicks = new Set(Array.isArray(saved.autoPicks) ? saved.autoPicks : []);
  let autoRunning = false;
  let autoStopReq = false;
  let busy = false;
  if (saved.bet) el.bet.value = saved.bet;
  const initialMines = saved.mines || 3;

  function save() {
    const r = game.round && game.round.status === 'playing' ? { ...game.round, mineSet: undefined } : null;
    try {
      localStorage.setItem(KEY, JSON.stringify({
        balance: game.balance, clientSeed: game.clientSeed, nonce: game.nonce, nextServerSeed: game.nextServerSeed,
        history: history.slice(0, 100), round: r, bet: el.bet.value, mines: +el.mines.value, autoPicks: [...autoPicks]
      }));
    } catch (e) { /* storage unavailable */ }
  }

  // ---------- 返回大廳：預設回 Boss88VIP 大廳；帶 return 參數時只接受自家網域，避免被當成跳轉跳板 ----------
  (function () {
    const ret = new URLSearchParams(location.search).get('return');
    if (!ret) return;
    try {
      const u = new URL(ret);
      const okHost = u.hostname === 'acc2023156.github.io' || u.hostname === location.hostname || u.hostname === 'localhost' || u.hostname === '127.0.0.1';
      if (/^https?:$/.test(u.protocol) && okHost) el.back.href = u.href;
    } catch (e) { /* invalid url */ }
  })();

  // ---------- 跑馬燈：兩份相同文字捲動一半寬度做無縫循環，每圈重新洗牌祝福語 ----------
  (function () {
    const track = $('#marquee');
    const brand = '寶石探險';
    const cheers = ['祝你高倍', '寶石滿盤', '加油加油', '好運連連', '大吉大利', '一翻入魂', '財源滾滾', '倍數噴發', '旗開得勝', '手氣長紅', '閃耀全場', '避雷高手'];
    const sep = '　✦　';
    const build = () => {
      const c = cheers.slice().sort(() => Math.random() - 0.5);
      const text = [brand, c[0], c[1], brand, c[2], c[3]].join(sep) + sep;
      track.innerHTML = '';
      for (let i = 0; i < 2; i++) track.appendChild(document.createElement('span')).textContent = text;
      track.style.animationDuration = text.length * 0.32 + 's';
    };
    track.addEventListener('animationiteration', build);
    build();
  })();

  // ---------- 小提示 ----------
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;left:50%;top:70px;transform:translateX(-50%);background:#ed4163;color:#fff;padding:8px 16px;border-radius:99px;font-weight:700;z-index:50;display:none;box-shadow:0 4px 16px rgba(0,0,0,.4)';
  document.body.appendChild(toast);
  let toastTimer = 0;
  function say(msg, ok) {
    toast.textContent = msg;
    toast.style.background = ok ? '#1f8a2c' : '#ed4163';
    toast.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 2200);
  }

  // ---------- 盤面 ----------
  const tiles = [];
  for (let i = 0; i < TILES; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tile';
    b.setAttribute('aria-label', `第 ${i + 1} 格`);
    b.addEventListener('click', () => onTile(i));
    el.board.appendChild(b);
    tiles.push(b);
  }

  function resetBoard() {
    tiles.forEach(t => { t.className = 'tile'; t.innerHTML = ''; });
    el.winPop.hidden = true;
    el.board.classList.remove('shake');
  }

  function openTile(i, kind, ghost) {
    const t = tiles[i];
    t.className = `tile open ${kind}${ghost ? ' ghost' : ''}`;
    t.innerHTML = `<span class="ico">${kind === 'mine' || kind === 'mine hit' ? '💣' : '💎'}</span>`;
  }

  // 本局結束：翻開剩下所有格子
  function revealAll(r) {
    for (let i = 0; i < TILES; i++) {
      if (r.picks.includes(i)) continue;
      if (i === r.hitTile) openTile(i, 'mine hit');
      else openTile(i, r.mineSet.has(i) ? 'mine' : 'gem', true);
    }
  }

  function drawBoardFromRound() {
    resetBoard();
    const r = game.round;
    if (!r) return;
    r.picks.forEach(i => openTile(i, 'gem'));
    if (r.status !== 'playing') revealAll(r);
  }

  function paintAutoPicks() {
    if (mode !== 'auto' || game.active) return;
    tiles.forEach((t, i) => t.classList.toggle('selected', autoPicks.has(i)));
    el.autoPickCount.textContent = autoPicks.size;
  }

  // ---------- 倍數階梯 / 倍數表 ----------
  function renderLadder() {
    const m = +el.mines.value;
    const k = game.active ? game.safeCount : 0;
    const maxK = TILES - m;
    const target = mode === 'auto' && !game.active ? autoPicks.size : -1;
    let html = '';
    for (let s = 1; s <= maxK; s++) {
      const cls = s <= k ? 'done' : s === k + 1 && game.active ? 'next' : s === target ? 'next' : '';
      html += `<div class="step ${cls}"><b>${fmtMult(multiplier(m, s))}</b><span>${s} 顆</span></div>`;
    }
    el.ladder.innerHTML = html;
    const cur = el.ladder.querySelector('.next') || el.ladder.querySelector('.done:last-of-type');
    if (cur) el.ladder.scrollTo({ left: cur.offsetLeft - el.ladder.clientWidth / 2 + cur.clientWidth / 2, behavior: 'smooth' });
  }

  function renderTable() {
    const m = +el.mines.value;
    el.tableMines.textContent = m;
    let html = '';
    for (let s = 1; s <= TILES - m; s++) {
      html += `<div class="row three"><span>${s} 顆</span><span>${fmtMult(multiplier(m, s))}</span><span>${pct(survival(m, s))}</span></div>`;
    }
    el.multTable.innerHTML = html;
  }

  // ---------- 面板狀態 ----------
  function renderPanel() {
    el.balance.textContent = fmt(game.balance);
    const m = game.active ? game.round.mines : +el.mines.value;
    el.gems.textContent = TILES - m;
    const playing = game.active;
    const lock = playing || autoRunning;
    el.bet.disabled = lock;
    el.mines.disabled = lock;
    document.querySelectorAll('[data-amt]').forEach(b => { b.disabled = lock; });
    el.modeSeg.querySelectorAll('button').forEach(b => { b.disabled = lock; });
    [el.autoCount, el.onWin, el.onLoss, el.stopProfit, el.stopLoss].forEach(i => { i.disabled = autoRunning; });

    if (playing) {
      const r = game.round;
      el.nextChance.textContent = pct(game.nextWinChance);
      el.nextMult.textContent = fmtMult(game.nextMultiplier);
      el.curMult.textContent = fmtMult(game.currentMultiplier);
      const profit = game.safeCount ? cents(r.bet * game.currentMultiplier) - r.bet : 0;
      el.curProfit.textContent = fmt(profit);
      el.curProfit.className = profit > 0 ? 'g' : '';
      el.roundChance.textContent = pct(survival(r.mines, game.safeCount + 1)) + '（再翻 1 格）';
      el.nonce.textContent = r.nonce;
    } else {
      const k = mode === 'auto' ? Math.max(1, autoPicks.size) : 1;
      el.nextChance.textContent = pct((TILES - m) / TILES);
      el.nextMult.textContent = fmtMult(multiplier(m, 1));
      el.curMult.textContent = mode === 'auto' && autoPicks.size ? fmtMult(multiplier(m, autoPicks.size)) : '1.00×';
      el.curProfit.textContent = '0.00';
      el.curProfit.className = '';
      el.roundChance.textContent = mode === 'auto' && autoPicks.size ? pct(survival(m, k)) + `（翻 ${k} 格）` : '-';
      el.nonce.textContent = game.nonce + 1;
    }

    // 主按鈕
    el.main.classList.remove('cash', 'stop');
    el.main.disabled = false;
    if (autoRunning) {
      el.main.classList.add('stop');
      el.main.innerHTML = autoStopReq ? '停止中…' : '停止自動投注';
    } else if (mode === 'auto') {
      el.main.innerHTML = '開始自動投注';
      el.main.disabled = autoPicks.size === 0;
    } else if (playing && !game.safeCount) {
      // 下注後還沒翻任何一格：主按鈕就是「隨機翻一格」（也可以直接點盤面）
      el.main.innerHTML = '隨機翻一格<small>或直接點選盤面格子</small>';
      el.main.disabled = busy;
    } else if (playing) {
      el.main.classList.add('cash');
      const pay = cents(game.round.bet * game.currentMultiplier);
      el.main.innerHTML = `兌現<small>${fmt(pay)}（${fmtMult(game.currentMultiplier)}）</small>`;
      el.main.disabled = !game.canCashout || busy;
    } else {
      el.main.innerHTML = '下注';
    }
    tiles.forEach((t, i) => {
      if (mode === 'auto' && !autoRunning && !playing) t.disabled = false;
      else t.disabled = !playing || autoRunning || busy || game.round.picks.includes(i);
    });
    renderLadder();
  }

  // ---------- 紀錄 ----------
  function renderHistory() {
    if (!history.length) {
      el.myList.innerHTML = '<div class="empty">還沒有紀錄，下一注吧！</div>';
    } else {
      el.myList.innerHTML = history.slice(0, 50).map(h => {
        const win = h.payout > 0;
        return `<div class="row"><span>#${h.nonce}</span><span>${h.mines}</span><span>${fmt(h.bet)}</span>` +
          `<span class="${win ? 'g' : 'r'}">${win ? fmtMult(h.mult) : '💣'}</span><span class="${win ? 'g' : 'r'}">${win ? fmt(h.payout) : '-' + fmt(h.bet)}</span></div>`;
      }).join('');
    }
    const n = history.length;
    const wagered = history.reduce((s, h) => s + h.bet, 0);
    const paid = history.reduce((s, h) => s + h.payout, 0);
    const wins = history.filter(h => h.payout > 0).length;
    const net = paid - wagered;
    el.summary.innerHTML =
      `<div>局數<b>${n}</b></div>` +
      `<div>勝率<b>${n ? pct(wins / n) : '-'}</b></div>` +
      `<div>淨損益<b class="${net > 0 ? 'g' : net < 0 ? 'r' : ''}">${fmt(net)}</b></div>` +
      `<div>總下注<b>${fmt(wagered)}</b></div>` +
      `<div>總派彩<b>${fmt(paid)}</b></div>` +
      `<div>實際回報<b>${wagered ? pct(paid / wagered) : '-'}</b></div>`;
  }

  function record(r) {
    history.unshift({
      nonce: r.nonce, mines: r.mines, bet: r.bet, payout: r.payout, mult: r.payout ? r.multiplier : 0,
      picks: r.picks.slice(), serverSeed: r.serverSeed, clientSeed: r.clientSeed, t: Date.now()
    });
    if (history.length > 100) history.length = 100;
    renderHistory();
  }

  function bumpWallet() {
    el.wallet.classList.remove('bump');
    void el.wallet.offsetWidth;
    el.wallet.classList.add('bump');
  }

  // 餘額用完自動補回
  function refillIfBroke() {
    if (!game.active && game.balance < 0.1) {
      game.balance = START_BALANCE;
      say(`遊戲幣用完了，已補回 ${START_BALANCE}`, true);
    }
  }

  // ---------- 流程 ----------
  function finishRound(r) {
    revealAll(r);
    if (r.status === 'won') {
      el.winMult.textContent = fmtMult(r.multiplier);
      el.winPay.textContent = fmt(r.payout);
      el.winPop.hidden = false;
      Sound.cashout();
      bumpWallet();
    } else {
      el.board.classList.add('shake');
      Sound.mine();
    }
    record(r);
    refillIfBroke();
    save();
    renderPanel();
  }

  function startRound() {
    const bet = readBet();
    try {
      game.start(bet, +el.mines.value);
    } catch (e) {
      say(e.message);
      return false;
    }
    resetBoard();
    Sound.bet();
    save();
    renderPanel();
    return true;
  }

  function reveal(i) {
    const res = game.reveal(i);
    if (!res) return null;
    if (res.mine) {
      finishRound(game.round);
    } else {
      openTile(i, 'gem');
      Sound.gem(game.safeCount);
      if (res.auto) finishRound(game.round);
      else { save(); renderPanel(); }
    }
    return res;
  }

  function cashout() {
    if (!game.canCashout) return;
    try { finishRound(game.cashout()); } catch (e) { say(e.message); }
  }

  function onTile(i) {
    if (autoRunning || busy) return;
    if (mode === 'auto' && !game.active) {
      if (game.round && game.round.status !== 'playing') { game.round = null; resetBoard(); }
      if (autoPicks.has(i)) autoPicks.delete(i);
      else if (autoPicks.size < TILES - +el.mines.value) autoPicks.add(i);
      else { say(`最多只能選 ${TILES - +el.mines.value} 格`); return; }
      Sound.select();
      paintAutoPicks();
      save();
      renderPanel();
      return;
    }
    if (!game.active) return;
    reveal(i);
  }

  function readBet() {
    const v = cents(Math.max(0, +el.bet.value || 0));
    el.bet.value = v.toFixed(2);
    return v;
  }

  // ---------- 自動投注 ----------
  async function runAuto() {
    if (!autoPicks.size) { say('請先在盤面選格子'); return; }
    const picks = [...autoPicks];
    const baseBet = readBet();
    const rounds = Math.max(0, Math.floor(+el.autoCount.value || 0));
    const onWin = Math.max(0, +el.onWin.value || 0);
    const onLoss = Math.max(0, +el.onLoss.value || 0);
    const stopProfit = Math.max(0, +el.stopProfit.value || 0);
    const stopLoss = Math.max(0, +el.stopLoss.value || 0);
    let bet = baseBet;
    let net = 0;
    let done = 0;
    autoRunning = true;
    autoStopReq = false;
    renderPanel();
    while (!autoStopReq && (rounds === 0 || done < rounds)) {
      if (bet > game.balance) { say('餘額不足，自動投注停止'); break; }
      el.bet.value = bet.toFixed(2);
      if (!startRound()) break;
      for (const i of picks) {
        await wait(170);
        const res = reveal(i);
        if (!res || res.mine || !game.active) break;
      }
      if (game.active) cashout();
      const r = game.round;
      net += r.payout - r.bet;
      done += 1;
      if (rounds) el.autoCount.value = rounds - done;
      if (r.payout > 0) bet = onWin ? cents(bet * (1 + onWin / 100)) : baseBet;
      else bet = onLoss ? cents(bet * (1 + onLoss / 100)) : baseBet;
      bet = Math.max(0.01, bet);
      if (stopProfit && net >= stopProfit) { say(`已達獲利目標 ${fmt(net)}`, true); break; }
      if (stopLoss && -net >= stopLoss) { say(`已達虧損上限 ${fmt(net)}`); break; }
      await wait(r.payout > 0 ? 650 : 900);
    }
    if (rounds) el.autoCount.value = rounds;
    el.bet.value = baseBet.toFixed(2);
    autoRunning = false;
    autoStopReq = false;
    save();
    renderPanel();
  }

  // ---------- 事件 ----------
  el.main.addEventListener('click', () => {
    if (autoRunning) { autoStopReq = true; renderPanel(); return; }
    if (mode === 'auto') { runAuto(); return; }
    if (game.active && !game.safeCount) { if (!busy) reveal(game.randomUnrevealed()); }
    else if (game.active) cashout();
    else startRound();
  });

  document.querySelectorAll('[data-amt]').forEach(b => b.addEventListener('click', () => {
    const v = +el.bet.value || 0;
    const a = b.dataset.amt;
    const n = a === 'half' ? v / 2 : a === 'double' ? v * 2 : game.balance;
    el.bet.value = Math.min(game.balance, Math.max(0.01, cents(n))).toFixed(2);
    save();
  }));
  el.bet.addEventListener('change', () => { readBet(); save(); });

  for (let m = MIN_MINES; m <= MAX_MINES; m++) {
    const o = document.createElement('option');
    o.value = m;
    o.textContent = m;
    el.mines.appendChild(o);
  }
  el.mines.value = initialMines;
  el.mines.addEventListener('change', () => {
    const maxPicks = TILES - +el.mines.value;
    if (autoPicks.size > maxPicks) autoPicks = new Set([...autoPicks].slice(0, maxPicks));
    paintAutoPicks();
    renderTable();
    save();
    renderPanel();
  });

  el.modeSeg.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled || game.active || autoRunning) return;
    mode = b.dataset.mode;
    el.modeSeg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    el.autoFields.hidden = mode !== 'auto';
    if (mode === 'auto') { game.round = null; resetBoard(); paintAutoPicks(); }
    else tiles.forEach(t => t.classList.remove('selected'));
    renderPanel();
  });

  document.querySelector('.tabs').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('.tab-body').forEach(x => { x.hidden = x.id !== 'tab-' + b.dataset.tab; });
  });

  el.sound.addEventListener('click', () => { el.sound.classList.toggle('off', !Sound.toggle()); });
  el.sound.classList.toggle('off', !Sound.enabled);

  document.addEventListener('keydown', e => {
    if (e.target.closest('input, select, textarea, dialog')) return;
    if (e.code === 'Space') { e.preventDefault(); if (!el.main.disabled) el.main.click(); }
    else if (e.key === 'r' || e.key === 'R') { if (mode === 'manual' && game.active && !busy && !autoRunning) reveal(game.randomUnrevealed()); }
  });

  // ---------- 公平性 ----------
  function renderVerify() {
    const s = el.vServer.value.trim(), c = el.vClient.value.trim();
    const n = Math.floor(+el.vNonce.value), m = Math.floor(+el.vMines.value);
    if (!s || !c || !(n >= 1) || !(m >= MIN_MINES && m <= MAX_MINES)) {
      el.verifyOut.innerHTML = '<span class="r">請填入完整資料</span>';
      el.verifyBoard.innerHTML = '';
      return;
    }
    let pos;
    try { pos = minePositions(s, c, n, m); } catch (e) { el.verifyOut.innerHTML = '<span class="r">種子只能包含英數字元</span>'; return; }
    el.verifyOut.innerHTML = `SHA256(伺服器種子) = <span class="g">${window.sha256(s)}</span><br>地雷位置：${pos.map(p => p + 1).join(', ')}`;
    const set = new Set(pos);
    el.verifyBoard.innerHTML = Array.from({ length: TILES }, (_, i) => `<span>${set.has(i) ? '💣' : '💎'}</span>`).join('');
  }

  $('#fairBtn').addEventListener('click', () => {
    el.clientSeed.value = game.clientSeed;
    el.nextHash.textContent = game.nextServerHash;
    const last = history[0];
    if (last) {
      el.vServer.value = last.serverSeed; el.vClient.value = last.clientSeed; el.vNonce.value = last.nonce; el.vMines.value = last.mines;
    } else {
      el.vServer.value = ''; el.vClient.value = ''; el.vNonce.value = ''; el.vMines.value = '';
    }
    renderVerify();
    el.fair.showModal();
  });
  [el.vServer, el.vClient, el.vNonce, el.vMines].forEach(i => i.addEventListener('input', renderVerify));
  el.clientSeed.addEventListener('change', () => {
    const v = el.clientSeed.value.replace(/[^\x20-\x7e]/g, '').trim();
    if (!v) { el.clientSeed.value = game.clientSeed; return; }
    game.clientSeed = v;
    el.clientSeed.value = v;
    save();
  });
  $('#seedRandom').addEventListener('click', () => {
    game.clientSeed = randomHex(8);
    game.nextServerSeed = randomHex(32);
    el.clientSeed.value = game.clientSeed;
    el.nextHash.textContent = game.nextServerHash;
    save();
  });

  // ---------- 初始化 ----------
  drawBoardFromRound();
  renderTable();
  renderHistory();
  renderPanel();
  window.addEventListener('beforeunload', save);
})();
