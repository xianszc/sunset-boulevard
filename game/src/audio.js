// SUNSET BOULEVARD — sound. All synthesized with WebAudio, no audio files.
// Engine hum, two-tone police siren, gunshot, pickup chime, mission jingle.
// Created lazily on the first user gesture; M toggles mute.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenT = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      // Engine: a low sawtooth through a low-pass filter.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 320;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(filt).connect(this.engineGain).connect(this.ctx.destination);
      this.engineOsc.start();
      // Siren: a triangle that alternates between two tones.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 720;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain).connect(this.ctx.destination);
      this.sirenOsc.start();
    } catch (e) {
      this.ctx = null;
    }
  }

  setEngine(speed01) {
    if (!this.ctx || this.muted) return;
    const g = speed01 > 0.02 ? 0.05 + speed01 * 0.05 : 0;
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : g, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, this.ctx.currentTime, 0.1);
  }

  setSiren(on, dt) {
    if (!this.ctx) return;
    this.sirenT += dt;
    if (on && !this.muted) {
      const f = Math.floor(this.sirenT * 2.2) % 2 === 0 ? 720 : 960;
      this.sirenOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
      this.sirenGain.gain.setTargetAtTime(0.035, this.ctx.currentTime, 0.1);
    } else {
      this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }
  }

  blip(freq, dur, type = 'sine', vol = 0.12) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur);
  }

  shot() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = 0.12;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 0.25;
    src.connect(g).connect(this.ctx.destination);
    src.start(t);
    this.blip(180, 0.08, 'square', 0.08);
  }

  pickup() { this.blip(880, 0.12); setTimeout(() => this.blip(1320, 0.15), 90); }

  jingle() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.18, 'triangle', 0.12), i * 110));
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) {
      const t = this.ctx.currentTime;
      if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, t, 0.05);
      if (this.sirenGain) this.sirenGain.gain.setTargetAtTime(0, t, 0.05);
    }
    return this.muted;
  }
}
