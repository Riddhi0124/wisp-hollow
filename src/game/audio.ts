/** Fully procedural audio: zero asset downloads, instant cold start. */
export class Sound {
  private ctx?: AudioContext;
  private master?: GainNode;
  private rainGain?: GainNode;
  private padGain?: GainNode;
  private noiseBuf?: AudioBuffer;
  muted = false;

  ensure(): void {
    try {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') void this.ctx.resume();
        return;
      }
      const C = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new C();
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(ctx.destination);
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.startPad();
      this.startRain();
    } catch {
      /* audio unavailable */
    }
  }

  private startPad(): void {
    const ctx = this.ctx!;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.05;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    lp.connect(this.padGain).connect(this.master!);
    [110, 164.81, 220.5, 277.18].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sawtooth';
      o.frequency.value = f;
      o.detune.value = (i - 1.5) * 6;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07 + i * 0.03;
      const lg = ctx.createGain();
      lg.gain.value = 0.12;
      lfo.connect(lg).connect(g.gain);
      lfo.start();
      o.connect(g).connect(lp);
      o.start();
    });
  }

  private startRain(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf!;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 0.5;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    src.connect(bp).connect(this.rainGain).connect(this.master!);
    src.start();
  }

  setRain(level: number): void {
    if (!this.ctx || !this.rainGain) return;
    this.rainGain.gain.setTargetAtTime(this.muted ? 0 : level * 0.16, this.ctx.currentTime, 0.4);
  }

  setTension(t: number): void {
    if (!this.ctx || !this.padGain) return;
    this.padGain.gain.setTargetAtTime(this.muted ? 0 : 0.05 + t * 0.05, this.ctx.currentTime, 0.6);
  }

  chime(degree: number, vol = 0.16, pan = 0): void {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const scale = [0, 2, 4, 7, 9];
    const oct = Math.floor(degree / 5);
    const semis = scale[((degree % 5) + 5) % 5] + 12 * oct;
    const f = 392 * Math.pow(2, semis / 12);
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = f * 2.005;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    o.connect(g);
    o2.connect(g);
    g.connect(p).connect(this.master!);
    o.start(t);
    o2.start(t);
    o.stop(t + 1.4);
    o2.stop(t + 1.4);
  }

  private burst(freq: number, dur: number, vol: number, type: BiquadFilterType, pan = 0): void {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf!;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    s.connect(f).connect(g).connect(p).connect(this.master!);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  pop(pan = 0): void {
    this.burst(900, 0.12, 0.25, 'bandpass', pan);
    this.chime(7, 0.08, pan);
  }
  thunder(): void {
    this.burst(140, 1.6, 0.6, 'lowpass');
  }
  splash(pan = 0): void {
    this.burst(1800, 0.35, 0.3, 'bandpass', pan);
  }
  thud(pan = 0): void {
    this.burst(220, 0.18, 0.4, 'lowpass', pan);
  }
  fanfare(): void {
    [0, 2, 4, 7, 9, 12].forEach((d, i) => setTimeout(() => this.chime(d, 0.14), i * 110));
  }
}
