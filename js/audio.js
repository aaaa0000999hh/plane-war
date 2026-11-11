// Web Audio 合成音效（无素材依赖）
class AudioMgr {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    } catch (e) { this.enabled = false; }
  }

  _tone(freq, dur, type, vol, slideTo) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    gain.gain.setValueAtTime(vol || 0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  _noise(dur, vol, type, cutoff) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const filter = this.ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = cutoff || 900;
    src.connect(filter).connect(gain).connect(this.ctx.destination);
    src.start(t);
  }

  // 开火：街机/飞机大战经典 “pew” 激光音（快速下滑 + 高频起音）
  shoot() {
    this._tone(1300, 0.07, 'square', 0.055, 380);
    this._tone(1900, 0.03, 'sine', 0.03, 900);
    this._noise(0.008, 0.02, 'highpass', 4000);
  }
  hit() { this._tone(1300, 0.028, 'square', 0.03, 800); }
  bossHit() { this._tone(1600, 0.035, 'triangle', 0.055, 1000); }
  explode() {
    this._noise(0.32, 0.32, 'lowpass', 1600);
    this._tone(200, 0.22, 'triangle', 0.1, 70);
    this._noise(0.06, 0.12, 'highpass', 2200);
  }
  bossExplode() {
    this._noise(0.8, 0.5, 'lowpass', 1500);
    this._tone(80, 0.6, 'sawtooth', 0.2, 40);
    this._noise(0.15, 0.18, 'highpass', 1800);
  }
  pickup() { this._tone(900, 0.08, 'triangle', 0.15, 1600); }
  shield() { this._tone(600, 0.35, 'triangle', 0.16, 1200); }
  bomb() {
    this._noise(0.5, 0.45, 'lowpass', 1200);
    this._tone(100, 0.5, 'sawtooth', 0.2, 30);
    this._noise(0.08, 0.15, 'highpass', 2000);
  }
  playerHit() { this._noise(0.18, 0.28, 'highpass', 600); this._tone(300, 0.18, 'square', 0.12, 90); }
  warn() { this._tone(200, 0.5, 'sawtooth', 0.2, 200); }
  medal() { this._tone(880, 0.12, 'triangle', 0.12, 1320); this._tone(1320, 0.2, 'sine', 0.1, 1760); }

  // ---------- 多阶段背景音乐（合成循环） ----------
  // stage: null | 'calm' | 'build' | 'tense' | 'boss'
  setMusic(stage) {
    if (!this.ctx) return;                      // AudioContext 未就绪时稍后由 refreshMusic 重试
    if (this._musicStage === stage) return;
    this._musicStage = stage;
    if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
    if (!stage || !this.ctx) return;
    this._musicStep = 0;
    const spec = {
      calm:  { interval: 420, notes: [523, 659, 784, 659, 587, 698, 880, 698], type: 'sine', vol: 0.035, dur: 0.3 },
      build: { interval: 260, notes: [440, 523, 659, 880, 659, 523, 440, 523], type: 'triangle', vol: 0.042, dur: 0.2 },
      tense: { interval: 180, notes: [220, 0, 233, 0, 220, 262, 233, 196], type: 'square', vol: 0.03, dur: 0.12, beat: true },
      boss:  { interval: 140, notes: [110, 110, 131, 98, 110, 110, 147, 98], type: 'sawtooth', vol: 0.05, dur: 0.1, beat: true, heavy: true },
    }[stage];
    if (!spec) return;
    this._musicTimer = setInterval(() => {
      if (!this.enabled || !this.ctx) return;
      const f = spec.notes[this._musicStep % spec.notes.length];
      if (f) this._tone(f, spec.dur, spec.type, spec.vol, f * 0.985);
      if (spec.beat && this._musicStep % 2 === 0) this._noise(0.03, spec.heavy ? 0.06 : 0.03, 'lowpass', 300);
      this._musicStep++;
    }, spec.interval);
  }
  stopMusic() { this.setMusic(null); }
}