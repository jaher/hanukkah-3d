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
    this.voices = [];
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const loadVoices = () => {
        try {
          this.voices = window.speechSynthesis.getVoices() || [];
        } catch (_) {
          this.voices = [];
        }
      };
      loadVoices();
      if (window.speechSynthesis.addEventListener) {
        window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
      }
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

    const p = 0.94 + Math.random() * 0.14;
    hit(now, p, 0.34);            // initial flip flick
    hit(now + 0.42, p * 1.03, 0.24); // landing bounce 1
    hit(now + 0.54, p * 0.99, 0.14); // settle clink 2
    hit(now + 0.62, p * 1.01, 0.08); // final settle
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

  /** Warm multi-voice dining-table chorus cheering "L'chaim!" using formant vocal synthesis + cozy room bloom. */
  playLchaimChorusBed(ctx, startTime, masterVol = 0.16) {
    // Cozy room short reflections bus
    const bus = ctx.createGain();
    bus.gain.value = masterVol;

    const dry = ctx.createGain();
    dry.gain.value = 0.85;
    bus.connect(dry);
    dry.connect(ctx.destination);

    [0.029, 0.053].forEach((dTime, i) => {
      const delay = ctx.createDelay(0.15);
      delay.delayTime.value = dTime;
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 2200 - i * 400;
      const wet = ctx.createGain();
      wet.gain.value = 0.24 - i * 0.06;
      bus.connect(delay);
      delay.connect(damp);
      damp.connect(wet);
      wet.connect(ctx.destination);
    });

    // 4 joyful family voices around the Hanukkah table (baritone, tenor, alto, soprano)
    const voices = [
      { f0: 138, offset: 0.000, fShift: 0.92, gain: 0.34, dur: 0.72 },
      { f0: 186, offset: 0.018, fShift: 0.98, gain: 0.30, dur: 0.74 },
      { f0: 256, offset: 0.032, fShift: 1.06, gain: 0.26, dur: 0.70 },
      { f0: 322, offset: 0.046, fShift: 1.12, gain: 0.22, dur: 0.68 },
    ];

    voices.forEach((v) => {
      const t0 = startTime + v.offset;
      const d = v.dur;

      // Glottal voice source (sawtooth + gentle vibrato)
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      // Celebratory pitch contour: "L'-" (pickup) -> "CHAI-" (joyful lift!) -> "-im!" (warm resolve)
      osc.frequency.setValueAtTime(v.f0 * 0.95, t0);
      osc.frequency.linearRampToValueAtTime(v.f0 * 1.00, t0 + d * 0.14);
      osc.frequency.setValueAtTime(v.f0 * 1.04, t0 + d * 0.26);
      osc.frequency.linearRampToValueAtTime(v.f0 * 1.18, t0 + d * 0.48);
      osc.frequency.linearRampToValueAtTime(v.f0 * 1.12, t0 + d * 0.68);
      osc.frequency.linearRampToValueAtTime(v.f0 * 0.96, t0 + d);

      const vib = ctx.createOscillator();
      const vibG = ctx.createGain();
      vib.frequency.value = 5.4 + Math.random() * 0.8;
      vibG.gain.value = v.f0 * 0.016;
      vib.connect(vibG);
      vibG.connect(osc.frequency);
      vib.start(t0);
      vib.stop(t0 + d + 0.05);

      // Voice amplitude envelope (soft "L'", pause for "ch", full joyful "AI-IM!")
      const vEnv = ctx.createGain();
      vEnv.gain.setValueAtTime(0.0001, t0);
      vEnv.gain.linearRampToValueAtTime(v.gain * 0.45, t0 + d * 0.05);
      vEnv.gain.linearRampToValueAtTime(v.gain * 0.10, t0 + d * 0.15); // brief dip during 'ch' fricative
      vEnv.gain.linearRampToValueAtTime(v.gain * 1.00, t0 + d * 0.29); // joyful "AI!" peak
      vEnv.gain.setValueAtTime(v.gain * 0.92, t0 + d * 0.62);
      vEnv.gain.linearRampToValueAtTime(v.gain * 0.50, t0 + d * 0.80); // warm "-im"
      vEnv.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.04);

      osc.connect(vEnv);

      // 3 parallel vocal-tract formants articulating /l ə - x - aɪ - ɪ m/
      const formantSpecs = [
        // [L',  AH,   EE,   IM,  Q,   gain]
        [340, 760, 340, 300, 5.5, 1.0],
        [1180, 1240, 2240, 1480, 7.5, 0.72],
        [2520, 2580, 2940, 2400, 9.0, 0.35],
      ];
      formantSpecs.forEach(([fL, fAh, fEe, fIm, q, fg]) => {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = q;
        bp.frequency.setValueAtTime(fL * v.fShift, t0);
        bp.frequency.setValueAtTime(fAh * v.fShift, t0 + d * 0.24);
        bp.frequency.exponentialRampToValueAtTime(fEe * v.fShift, t0 + d * 0.58);
        bp.frequency.exponentialRampToValueAtTime(fIm * v.fShift, t0 + d * 0.88);
        const fGain = ctx.createGain();
        fGain.gain.value = fg;
        vEnv.connect(bp);
        bp.connect(fGain);
        fGain.connect(bus);
      });

      osc.start(t0);
      osc.stop(t0 + d + 0.06);

      // Authentic breathy Hebrew "ch" (/x/ chet) fricative right between "L'" and "aim!"
      const chStart = t0 + d * 0.12;
      const chDur = d * 0.15;
      const chSrc = ctx.createBufferSource();
      chSrc.buffer = this.makeNoiseBuffer(ctx, chDur + 0.02);
      const chBp = ctx.createBiquadFilter();
      chBp.type = 'bandpass';
      chBp.frequency.setValueAtTime(1650 * v.fShift, chStart);
      chBp.Q.value = 2.1;
      const chG = ctx.createGain();
      chG.gain.setValueAtTime(0.0001, chStart);
      chG.gain.linearRampToValueAtTime(v.gain * 0.42, chStart + chDur * 0.35);
      chG.gain.exponentialRampToValueAtTime(0.0001, chStart + chDur);
      chSrc.connect(chBp);
      chBp.connect(chG);
      chG.connect(bus);
      chSrc.start(chStart);
    });
  }

  /** Speak joyful "L'chaim!" with natural browser TTS voice (Hebrew if installed, else natural English). */
  speakLchaimVoice() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
    try {
      const synth = window.speechSynthesis;
      const voices = this.voices.length ? this.voices : synth.getVoices() || [];
      const heVoice = voices.find((v) => /^(he|iw)/i.test(v.lang));
      const naturalEn =
        voices.find((v) => /^en/i.test(v.lang) && /(natural|neural|google|samantha|daniel|karen|moira|alex)/i.test(v.name)) ||
        voices.find((v) => /^en/i.test(v.lang));

      const utter = new SpeechSynthesisUtterance(heVoice ? 'לְחַיִּים!' : "L'chaim!");
      if (heVoice) {
        utter.voice = heVoice;
        utter.lang = heVoice.lang;
      } else if (naturalEn) {
        utter.voice = naturalEn;
        utter.lang = naturalEn.lang;
      } else {
        utter.lang = 'en-US';
      }
      utter.rate = 1.04;
      utter.pitch = 1.12;
      utter.volume = 0.84;

      synth.cancel();
      synth.speak(utter);
      return true;
    } catch (_) {
      return false;
    }
  }

  /** Joyful "L'chaim!" toast: clinking silver/crystal kiddush cups + cheerful voices + warm wine sip! */
  playLchaimToast() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. Celebratory clinking of kiddush cups around the table!
    const p = 0.96 + Math.random() * 0.08;
    this.playKiddushCupClink(ctx, now, p, 0.30);
    this.playKiddushCupClink(ctx, now + 0.11, p * 1.06, 0.22);
    this.playKiddushCupClink(ctx, now + 0.23, p * 0.94, 0.14);

    // 2. Voices joyfully cheering "L'chaim!"
    const hasSpeech = this.speakLchaimVoice();
    this.playLchaimChorusBed(ctx, now + 0.07, hasSpeech ? 0.14 : 0.24);

    // 3. Soft wine sip right after the toast!
    window.setTimeout(() => this.playWineSip(false), 680);
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
