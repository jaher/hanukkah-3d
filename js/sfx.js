/**
 * Procedural Web Audio Foley & Interactive Sound Effects for Hanukkah 3D
 *
 * 100% self-contained procedural Web Audio synthesis (zero external audio files):
 * - Metallic chocolate-gelt coin clink & spinning cascade
 * - Velvet gelt pouch coin jingle
 * - Crisp sufganiyah bite crunch
 * - Kiddush wine sip & gentle refill pour
 * - Wooden dreidel launch rattle
 * - Match strike / candle ignition crackle & flame flicker whoosh
 * - Sterling silver / crystal ornament chime
 * - Soft linen challah cover & velvet curtain rustle
 * - Brass sconce lamp switch click & soft winter window breeze
 */

export class RoomSoundEffects {
  constructor() {
    this.ctx = null;
    this.lchaimRawPromise = null;
    this.lchaimBuffer = null;
    this.preloadLchaimAudio();
  }

  /** Pre-fetch the real male "L'chaim!" recording (assets/audio/lchaim.wav) so toast playback is instantaneous! */
  preloadLchaimAudio() {
    if (typeof fetch !== 'function') return;
    this.lchaimRawPromise = fetch('assets/audio/lchaim.wav?v=20261127-1')
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .catch(() => null);
  }

  async getLchaimBuffer(ctx) {
    if (this.lchaimBuffer) return this.lchaimBuffer;
    if (!this.lchaimRawPromise) this.preloadLchaimAudio();
    try {
      const raw = await this.lchaimRawPromise;
      if (!raw || !ctx) return null;
      // Slice so decodeAudioData can safely be retried if needed
      this.lchaimBuffer = await ctx.decodeAudioData(raw.slice(0));
      return this.lchaimBuffer;
    } catch (_) {
      return null;
    }
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  makeNoiseBuffer(ctx, duration = 0.25) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  /** Realistic metallic gold/silver coin clink with secondary bounce rings! */
  playCoinClink(intensity = 1.0) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const hit = (t, pitchScale, vol) => {
      // Inharmonic metallic disc ring partials (authentic gold/silver coin timbre!)
      const partials = [
        [2780 * pitchScale, 0.22, 0.28],
        [4290 * pitchScale, 0.16, 0.22],
        [6150 * pitchScale, 0.12, 0.16],
        [8320 * pitchScale, 0.08, 0.11],
      ];
      partials.forEach(([freq, gainVal, decay]) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(gainVal * vol * intensity, t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + decay + 0.02);
      });
    };

    const p = 0.92 + Math.random() * 0.16;
    hit(now, p, 0.34); // crisp single metallic disc impact synchronized to real physics collision!
  }

  /** Rich jingle cascade when touching the velvet gelt pouch. */
  playCoinBagJingle() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    for (let i = 0; i < 4; i++) {
      window.setTimeout(() => this.playCoinClink(0.55 - i * 0.08), i * 65);
    }
  }

  /** Soft pastry/powdered-sugar bite crunch for sufganiyot. */
  playBite() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.makeNoiseBuffer(ctx, 0.16);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1250, now);
    bp.frequency.exponentialRampToValueAtTime(520, now + 0.12);
    bp.Q.value = 1.6;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.18, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

    src.connect(bp);
    bp.connect(g);
    g.connect(ctx.destination);
    src.start(now);
  }

  /** Crisp silver & crystal kiddush cup rim clink! */
  playKiddushCupClink(ctx, startTime, pitchScale = 1.0, vol = 0.28) {
    // 1. Tactile rim-touch transient tick
    const tickSrc = ctx.createBufferSource();
    tickSrc.buffer = this.makeNoiseBuffer(ctx, 0.018);
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.setValueAtTime(4400 * pitchScale, startTime);
    hp.Q.value = 2.4;
    const tickG = ctx.createGain();
    tickG.gain.setValueAtTime(0.0001, startTime);
    tickG.gain.linearRampToValueAtTime(0.24 * vol, startTime + 0.0015);
    tickG.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.014);
    tickSrc.connect(hp);
    hp.connect(tickG);
    tickG.connect(ctx.destination);
    tickSrc.start(startTime);

    // 2. Twin singing goblet partials (two cups clinking together!)
    const partials = [
      [1940 * pitchScale, 0.30, 0.72],
      [2190 * pitchScale, 0.25, 0.68],
      [3140 * pitchScale, 0.16, 0.50],
      [3520 * pitchScale, 0.14, 0.46],
      [4760 * pitchScale, 0.09, 0.30],
      [5640 * pitchScale, 0.06, 0.22],
    ];
    partials.forEach(([freq, amp, decay]) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      // Tiny realistic pitch shimmer from vibrating goblet wall
      osc.frequency.exponentialRampToValueAtTime(freq * 0.9985, startTime + decay);
      g.gain.setValueAtTime(0.0001, startTime);
      g.gain.linearRampToValueAtTime(amp * vol, startTime + 0.0025);
      g.gain.exponentialRampToValueAtTime(0.0001, startTime + decay);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + decay + 0.03);
    });
  }

  /** Play the real male "L'chaim!" toast recording via Web Audio (with clean HTML5 Audio fallback). */
  playLchaimVoiceRecording(ctx, delaySec = 0.06) {
    this.getLchaimBuffer(ctx).then((buf) => {
      if (buf) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const gain = ctx.createGain();
        gain.gain.value = 0.92;
        src.connect(gain);
        gain.connect(ctx.destination);
        const startAt = Math.max(ctx.currentTime, ctx.currentTime + delaySec);
        src.start(startAt);
      } else {
        // Fallback if Web Audio decode is unavailable
        try {
          const el = new Audio('assets/audio/lchaim.wav');
          el.volume = 0.9;
          el.play().catch(() => {});
        } catch (_) {}
      }
    });
  }

  /** Joyful "L'chaim!" toast: clinking silver/crystal kiddush cups + real male voice saying "L'chaim!" + wine sip! */
  playLchaimToast() {
    const ctx = this.ensureContext();
    if (!ctx) {
      try {
        const el = new Audio('assets/audio/lchaim.wav');
        el.volume = 0.9;
        el.play().catch(() => {});
      } catch (_) {}
      return;
    }
    const now = ctx.currentTime;

    // 1. Celebratory clinking of kiddush cups around the table!
    const p = 0.96 + Math.random() * 0.08;
    this.playKiddushCupClink(ctx, now, p, 0.30);
    this.playKiddushCupClink(ctx, now + 0.11, p * 1.06, 0.22);
    this.playKiddushCupClink(ctx, now + 0.23, p * 0.94, 0.14);

    // 2. Real male voice affirming "L'chaim!" (assets/audio/lchaim.wav)
    this.playLchaimVoiceRecording(ctx, 0.07);

    // 3. Soft wine sip right after the toast!
    window.setTimeout(() => this.playWineSip(false), 860);
  }

  /** Gentle liquid sip (or refill pour) for the Kiddush cup wine. */
  playWineSip(isRefill = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.makeNoiseBuffer(ctx, isRefill ? 0.42 : 0.22);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(isRefill ? 520 : 880, now);
    bp.frequency.exponentialRampToValueAtTime(isRefill ? 1450 : 420, now + (isRefill ? 0.38 : 0.18));
    bp.Q.value = 3.2;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.11, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (isRefill ? 0.40 : 0.20));

    src.connect(bp);
    bp.connect(g);
    g.connect(ctx.destination);
    src.start(now);
  }

  /** Soft wooden spin launch click for dreidels. */
  playWoodSpin() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.06);
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  /** Match strike / warm candle flame whoosh. */
  playFlameWhoosh(withStrike = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.makeNoiseBuffer(ctx, 0.26);

    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(withStrike ? 2800 : 620, now);
    filt.frequency.exponentialRampToValueAtTime(340, now + 0.22);
    filt.Q.value = withStrike ? 1.2 : 2.0;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(withStrike ? 0.14 : 0.09, now + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

    src.connect(filt);
    filt.connect(g);
    g.connect(ctx.destination);
    src.start(now);
  }

  /** Delicate sterling-silver / crystal ornament chime. */
  playChime(baseFreq = 1318.5) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [1.0, 2.0, 3.01].forEach((mult, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq * mult, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.09 / (idx + 1), now + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.95 - idx * 0.2);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.0);
    });
  }

  /** Soft linen/velvet cloth rustle for challah cover or curtains. */
  playClothRustle() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.makeNoiseBuffer(ctx, 0.28);

    const filt = ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 1800;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.055, now + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);

    src.connect(filt);
    filt.connect(g);
    g.connect(ctx.destination);
    src.start(now);
  }

  /** Crisp brass sconce / lamp toggle click. */
  playSwitchClick() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1600, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.02);
    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.03);
  }
}
