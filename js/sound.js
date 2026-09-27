/* 合成音效（Web Audio，不需音檔）：第一次使用者操作後才建立 AudioContext */
(function (global) {
  'use strict';
  let ctx = null;
  let enabled = true;
  let noiseBuf = null;
  try { enabled = localStorage.getItem('mines.sound') !== 'off'; } catch (e) { /* storage unavailable */ }

  function audio() {
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, { at = 0, dur = 0.08, type = 'sine', gain = 0.12, slide = 0 } = {}) {
    const ac = enabled && audio();
    if (!ac) return;
    const t = ac.currentTime + at;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise({ dur = 0.6, gain = 0.3, from = 3000, to = 120 } = {}) {
    const ac = enabled && audio();
    if (!ac) return;
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    const f = ac.createBiquadFilter();
    const g = ac.createGain();
    src.buffer = noiseBuf;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(ac.destination);
    src.start(t);
    src.stop(t + dur);
  }

  const Sound = {
    get enabled() { return enabled; },
    toggle() {
      enabled = !enabled;
      try { localStorage.setItem('mines.sound', enabled ? 'on' : 'off'); } catch (e) { /* ignore */ }
      if (enabled) tone(660, { dur: 0.06 });
      return enabled;
    },
    bet() { tone(300, { dur: 0.07, type: 'triangle', gain: 0.1 }); tone(450, { at: 0.05, dur: 0.07, type: 'triangle', gain: 0.1 }); },
    select() { tone(520, { dur: 0.04, type: 'square', gain: 0.04 }); },
    // 寶石：音高隨翻開格數往上
    gem(step) {
      const base = 620 * Math.pow(2, Math.min(step, 20) / 12);
      tone(base, { dur: 0.12, gain: 0.12 });
      tone(base * 1.5, { at: 0.04, dur: 0.16, gain: 0.07 });
    },
    mine() { noise({ dur: 0.7, gain: 0.45, from: 2500, to: 80 }); tone(140, { dur: 0.5, type: 'sawtooth', gain: 0.12, slide: 0.35 }); },
    cashout() { [523, 659, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.18, type: 'triangle', gain: 0.1 })); }
  };
  global.Sound = Sound;
})(window);
