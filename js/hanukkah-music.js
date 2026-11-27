/**
 * Subtle Traditional Hanukkah Room Music Player (Web Audio API — 100% Public Domain Melodies)
 *
 * Plays a warm, acoustic felt-piano / harp / soft-strings arrangement of classic
 * public-domain Hanukkah melodies with gentle room reverb at a subtle background level
 * so it enhances the room atmosphere without overpowering narration or conversation:
 *   1. Ma'oz Tzur (Rock of Ages) — Traditional Ashkenazi melody (F Major)
 *   2. I Have a Little Dreidel — Traditional folk song (G Major)
 *   3. Hanukkah, Oh Hanukkah (Oy Chanukah) — Traditional Yiddish folk melody (D Minor)
 */

const NOTE_FREQ = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, Bb3: 233.08, B3: 246.94,
  C4: 261.63, Cs4: 277.18, D4: 293.66, Eb4: 311.13, E4: 329.63, F4: 349.23, Fs4: 369.99,
  G4: 392.00, Gs4: 415.30, A4: 440.00, Bb4: 466.16, B4: 493.88,
  C5: 523.25, Cs5: 554.37, D5: 587.33, Eb5: 622.25, E5: 659.25, F5: 698.46, G5: 783.99,
};

// [melodyNote, durationBeats, harmonyChordArrayOrNull]
const TRACKS = [
  {
    id: 'maoz-tzur',
    title: "Ma'oz Tzur",
    bpm: 92,
    notes: [
      // Phrase 1: Ma'oz tzur yeshu'ati
      ['F4', 1.0, ['F3', 'A3', 'C4']], ['C4', 1.0, null], ['F4', 1.0, ['F3', 'A3', 'C4']], ['Bb4', 1.0, ['Bb3', 'D4']],
      ['A4', 1.0, ['F3', 'C4']], ['G4', 1.0, ['C3', 'G3', 'Bb3']], ['F4', 2.0, ['F3', 'A3', 'C4']],
      // Phrase 2: Lecha na'eh leshabe'ach
      ['G4', 1.0, ['C3', 'G3', 'Bb3']], ['A4', 1.0, ['F3', 'C4']], ['Bb4', 1.0, ['Bb3', 'D4']], ['C5', 1.0, ['C3', 'G3', 'C4']],
      ['A4', 1.5, ['F3', 'A3', 'C4']], ['G4', 0.5, null], ['G4', 2.0, ['C3', 'G3', 'C4']],
      // Phrase 3: Tikon beit tefilati
      ['F4', 1.0, ['F3', 'A3', 'C4']], ['C4', 1.0, null], ['F4', 1.0, ['F3', 'A3', 'C4']], ['Bb4', 1.0, ['Bb3', 'D4']],
      ['A4', 1.0, ['F3', 'C4']], ['G4', 1.0, ['C3', 'G3', 'Bb3']], ['F4', 2.0, ['F3', 'A3', 'C4']],
      // Phrase 4: Vesham todah nezabe'ach
      ['G4', 1.0, ['C3', 'G3', 'Bb3']], ['A4', 1.0, ['F3', 'C4']], ['Bb4', 1.0, ['Bb3', 'D4']], ['C5', 1.0, ['C3', 'G3', 'C4']],
      ['A4', 1.5, ['F3', 'A3', 'C4']], ['G4', 0.5, null], ['G4', 2.0, ['C3', 'G3', 'C4']],
      // Bridge: Le'et tachin matbe'ach
      ['C5', 1.0, ['C3', 'G3', 'C4']], ['C5', 1.0, null], ['D5', 1.0, ['Bb3', 'D4']], ['A4', 1.0, ['F3', 'C4']],
      ['Bb4', 1.0, ['G3', 'Bb3']], ['A4', 1.0, ['F3', 'C4']], ['G4', 2.0, ['C3', 'G3', 'Bb3']],
      // Mitzar hamenabe'ach
      ['C5', 1.0, ['C3', 'G3', 'Bb3']], ['Bb4', 0.5, null], ['A4', 0.5, null], ['G4', 1.0, ['C3', 'G3']], ['F4', 1.0, ['F3', 'A3']],
      ['G4', 1.0, ['C3', 'G3', 'Bb3']], ['A4', 1.0, ['F3', 'C4']], ['G4', 1.0, ['C3', 'G3', 'Bb3']], ['F4', 1.0, ['F3', 'A3', 'C4']],
      // Climax: Az egmor beshir mizmor
      ['C5', 1.0, ['C3', 'G3', 'C4']], ['C5', 1.0, null], ['D5', 1.0, ['Bb3', 'D4']], ['E5', 1.0, ['C3', 'G3', 'C4']],
      ['F5', 1.5, ['F3', 'A3', 'C4']], ['E5', 0.5, null], ['D5', 1.0, ['Bb3', 'D4']], ['C5', 1.0, ['F3', 'A3', 'C4']],
      // Cadence: Chanukat hamizbe'ach
      ['D5', 1.0, ['Bb3', 'D4']], ['C5', 1.0, ['F3', 'A3', 'C4']], ['Bb4', 1.0, ['G3', 'Bb3']], ['A4', 1.0, ['F3', 'C4']],
      ['G4', 1.5, ['C3', 'G3', 'Bb3']], ['F4', 2.5, ['F3', 'A3', 'C4']],
      [null, 2.0, null],
    ],
  },
  {
    id: 'dreidel-song',
    title: 'The Dreidel Song',
    bpm: 112,
    notes: [
      // I have a little dreidel
      ['D4', 0.5, ['G3', 'B3']], ['G4', 0.5, null], ['G4', 0.5, null], ['A4', 0.5, ['D3', 'A3']],
      ['A4', 0.5, null], ['B4', 1.0, ['G3', 'B3', 'D4']], ['G4', 0.5, null],
      // I made it out of clay
      ['B4', 0.5, ['G3', 'D4']], ['D5', 1.0, ['G3', 'B3', 'D4']], ['C5', 0.5, ['C3', 'G3', 'C4']],
      ['B4', 0.5, ['G3', 'D4']], ['A4', 1.5, ['D3', 'A3', 'D4']],
      // And when it's dry and ready
      ['D4', 0.5, ['D3', 'A3']], ['A4', 0.5, null], ['A4', 0.5, null], ['B4', 0.5, ['G3', 'D4']],
      ['B4', 0.5, null], ['C5', 1.0, ['C3', 'G3', 'C4']], ['A4', 0.5, null],
      // Then dreidel I shall play
      ['C5', 0.5, ['D3', 'A3']], ['B4', 1.0, ['G3', 'B3', 'D4']], ['A4', 0.5, ['D3', 'A3']],
      ['G4', 2.0, ['G3', 'B3', 'D4']],
      // Chorus: Oh dreidel, dreidel, dreidel
      ['B4', 0.5, ['G3', 'B3', 'D4']], ['B4', 0.5, null], ['B4', 0.5, null], ['A4', 0.5, ['D3', 'A3']],
      ['G4', 1.0, ['G3', 'B3', 'D4']], ['G4', 1.0, null],
      // I made it out of clay
      ['B4', 0.5, ['G3', 'D4']], ['D5', 1.0, ['G3', 'B3', 'D4']], ['C5', 0.5, ['C3', 'G3', 'C4']],
      ['B4', 0.5, ['G3', 'D4']], ['A4', 1.5, ['D3', 'A3', 'D4']],
      // And when it's dry and ready
      ['A4', 0.5, ['D3', 'A3']], ['A4', 0.5, null], ['A4', 0.5, null], ['G4', 0.5, null],
      ['Fs4', 1.0, ['D3', 'A3']], ['D4', 1.0, null],
      // Then dreidel I shall play!
      ['C5', 0.5, ['D3', 'A3', 'C4']], ['B4', 1.0, ['G3', 'B3', 'D4']], ['A4', 0.5, ['D3', 'A3']],
      ['G4', 2.5, ['G3', 'B3', 'D4']],
      [null, 2.0, null],
    ],
  },
  {
    id: 'oh-hanukkah',
    title: 'Hanukkah, Oh Hanukkah',
    bpm: 108,
    notes: [
      // Hanukkah, oh Hanukkah, come light the menorah
      ['A4', 0.5, ['D3', 'A3', 'D4']], ['A4', 0.5, null], ['A4', 0.5, null], ['Bb4', 0.5, ['G3', 'Bb3']],
      ['A4', 0.5, ['D3', 'A3']], ['G4', 0.5, null], ['F4', 0.5, ['D3', 'F3', 'A3']], ['G4', 0.5, null],
      ['A4', 1.0, ['D3', 'A3', 'D4']], ['F4', 1.0, null], ['D4', 1.5, ['D3', 'F3', 'A3']], [null, 0.5, null],
      // Let's have a party, we'll all dance the horah
      ['A4', 0.5, ['D3', 'A3', 'D4']], ['A4', 0.5, null], ['A4', 0.5, null], ['Bb4', 0.5, ['G3', 'Bb3']],
      ['A4', 0.5, ['D3', 'A3']], ['G4', 0.5, null], ['F4', 0.5, ['D3', 'F3', 'A3']], ['G4', 0.5, null],
      ['A4', 2.0, ['A3', 'Cs4', 'E4']], [null, 1.0, null],
      // Gather round the table, we'll give you a treat
      ['D5', 0.5, ['D3', 'A3', 'D4']], ['D5', 0.5, null], ['D5', 0.5, null], ['C5', 0.5, ['C3', 'G3', 'C4']],
      ['Bb4', 0.5, ['G3', 'Bb3']], ['C5', 0.5, null], ['Bb4', 0.5, null], ['A4', 0.5, ['F3', 'A3', 'C4']],
      ['G4', 0.5, ['G3', 'Bb3']], ['A4', 0.5, null], ['Bb4', 1.5, ['G3', 'Bb3', 'D4']], [null, 0.5, null],
      // Dreidels to play with and latkes to eat
      ['A4', 0.5, ['A3', 'Cs4', 'E4']], ['A4', 0.5, null], ['G4', 0.5, null], ['F4', 0.5, ['D3', 'F3', 'A3']],
      ['E4', 0.5, ['A3', 'Cs4', 'E4']], ['F4', 0.5, null], ['G4', 0.5, null], ['A4', 0.5, null],
      ['F4', 1.0, ['D3', 'F3', 'A3']], ['D4', 2.0, ['D3', 'A3', 'D4']],
      // Chorus: And while we are playing, the candles are burning low
      ['D5', 1.0, ['D3', 'A3', 'D4']], ['C5', 0.5, ['C3', 'G3', 'C4']], ['Bb4', 0.5, null],
      ['A4', 1.0, ['F3', 'A3', 'C4']], ['A4', 1.0, null],
      ['Bb4', 1.0, ['G3', 'Bb3', 'D4']], ['A4', 0.5, null], ['G4', 0.5, null], ['F4', 2.0, ['D3', 'F3', 'A3']],
      // One for each night, they shed a sweet light...
      ['G4', 0.5, ['G3', 'Bb3']], ['A4', 0.5, null], ['G4', 0.5, null], ['F4', 0.5, ['D3', 'F3', 'A3']],
      ['E4', 0.5, ['A3', 'Cs4', 'E4']], ['F4', 0.5, null], ['G4', 0.5, null], ['A4', 0.5, null],
      ['F4', 1.0, ['D3', 'F3', 'A3']], ['D4', 2.5, ['D3', 'A3', 'D4']],
      [null, 2.0, null],
    ],
  },
];

function createRoomImpulseResponse(ctx, duration = 2.1, decay = 2.6) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * duration);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const env = Math.pow(1.0 - i / length, decay);
      // Gently low-pass filtered warm wooden room tail
      data[i] = (Math.random() * 2 - 1) * env * 0.35;
    }
  }
  return impulse;
}

export class HanukkahMusicPlayer {
  constructor(onStateChange) {
    this.onStateChange = onStateChange;
    this.ctx = null;
    this.masterGain = null;
    this.dryGain = null;
    this.wetGain = null;
    this.isPlaying = true;         // ON by default!
    this.schedulerRunning = false; // true once AudioContext is running and notes are actively scheduled
    this.trackIndex = 0;
    this.noteIndex = 0;
    this.timerId = null;
    // Subtle room-level background volume so narration is never overpowered
    this.baseVolume = 0.14;
  }

  get currentTrack() {
    return TRACKS[this.trackIndex];
  }

  ensureContext() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.0001;

    // Gentle warm low-pass master tone shaping
    const masterFilter = this.ctx.createBiquadFilter();
    masterFilter.type = 'lowpass';
    masterFilter.frequency.value = 2600;
    masterFilter.Q.value = 0.6;

    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.value = 0.72;

    this.wetGain = this.ctx.createGain();
    this.wetGain.gain.value = 0.34;

    const convolver = this.ctx.createConvolver();
    convolver.buffer = createRoomImpulseResponse(this.ctx, 2.0, 2.8);

    this.dryGain.connect(masterFilter);
    this.wetGain.connect(convolver);
    convolver.connect(masterFilter);
    masterFilter.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  playTone(freq, startTime, duration, { gain = 0.22, warm = false } = {}) {
    if (!this.ctx || !freq) return;

    // Warm acoustic felt-piano / harp voice: fundamental sine + gentle 2nd harmonic triangle
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc2.type = warm ? 'sine' : 'triangle';
    osc1.frequency.setValueAtTime(freq, startTime);
    osc2.frequency.setValueAtTime(warm ? freq * 0.5 : freq * 2.0, startTime);

    const osc2Gain = this.ctx.createGain();
    osc2Gain.gain.value = warm ? 0.18 : 0.11;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(warm ? 900 : 2100, startTime);
    filter.frequency.exponentialRampToValueAtTime(warm ? 420 : 620, startTime + Math.max(0.15, duration));

    const env = this.ctx.createGain();
    const attack = warm ? 0.08 : 0.018;
    const release = Math.max(0.28, duration * 1.15);
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(gain, startTime + attack);
    env.gain.exponentialRampToValueAtTime(gain * 0.42, startTime + attack + duration * 0.45);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + release);

    osc1.connect(filter);
    osc2.connect(osc2Gain);
    osc2Gain.connect(filter);
    filter.connect(env);
    env.connect(this.dryGain);
    env.connect(this.wetGain);

    osc1.start(startTime);
    osc2.start(startTime);
    const stopTime = startTime + release + 0.05;
    osc1.stop(stopTime);
    osc2.stop(stopTime);
  }

  scheduleNext() {
    if (!this.isPlaying || !this.ctx) return;

    const track = TRACKS[this.trackIndex];
    const [noteName, beats, chord] = track.notes[this.noteIndex];
    const beatSec = 60.0 / track.bpm;
    const durSec = beats * beatSec;
    const now = this.ctx.currentTime + 0.03;

    if (noteName && NOTE_FREQ[noteName]) {
      this.playTone(NOTE_FREQ[noteName], now, durSec, { gain: 0.28, warm: false });
    }
    if (chord && chord.length) {
      // Gentle arpeggiated warm felt-harp chord accompaniment
      chord.forEach((cn, idx) => {
        if (NOTE_FREQ[cn]) {
          this.playTone(NOTE_FREQ[cn], now + idx * 0.035, durSec * 1.6, { gain: 0.10, warm: true });
        }
      });
    }

    this.noteIndex += 1;
    if (this.noteIndex >= track.notes.length) {
      this.noteIndex = 0;
      this.trackIndex = (this.trackIndex + 1) % TRACKS.length;
      this.emitState();
    }

    this.timerId = window.setTimeout(() => this.scheduleNext(), Math.max(60, durSec * 1000));
  }

  beginPlayback() {
    if (!this.isPlaying || !this.ctx || this.ctx.state !== 'running') return;
    if (this.schedulerRunning) return;
    this.schedulerRunning = true;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(Math.max(0.0001, this.masterGain.gain.value), now);
    this.masterGain.gain.linearRampToValueAtTime(this.baseVolume, now + 0.8);
    this.emitState();
    this.scheduleNext();
  }

  /** Attempt immediate autoplay on load; if blocked by browser policy, stays armed (isPlaying=true) for first gesture. */
  tryAutoplay() {
    this.isPlaying = true;
    this.emitState();
    this.ensureContext();
    if (!this.ctx) return;
    if (this.ctx.state === 'running') {
      this.beginPlayback();
    } else if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => {
        if (this.isPlaying && this.ctx && this.ctx.state === 'running') {
          this.beginPlayback();
        }
      }).catch(() => {});
    }
  }

  /** Called inside a user gesture to unlock AudioContext when default-ON music was waiting on autoplay policy. */
  async unlockFromGesture() {
    if (!this.isPlaying || this.schedulerRunning) return;
    this.ensureContext();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (_) {
        return;
      }
    }
    if (this.isPlaying && this.ctx.state === 'running') {
      this.beginPlayback();
    }
  }

  async start() {
    this.isPlaying = true;
    this.emitState();
    this.ensureContext();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (_) {
        return;
      }
    }
    if (this.isPlaying && this.ctx.state === 'running') {
      this.beginPlayback();
    }
  }

  stop() {
    this.isPlaying = false;
    this.schedulerRunning = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.35);
    }
    this.emitState();
  }

  async toggle() {
    if (this.isPlaying) {
      this.stop();
    } else {
      await this.start();
    }
  }

  async nextTrack() {
    this.trackIndex = (this.trackIndex + 1) % TRACKS.length;
    this.noteIndex = 0;
    if (this.isPlaying) {
      if (this.timerId) {
        clearTimeout(this.timerId);
        this.timerId = null;
      }
      this.emitState();
      if (this.schedulerRunning) {
        this.scheduleNext();
      } else {
        await this.unlockFromGesture();
      }
    } else {
      await this.start();
    }
  }

  emitState() {
    if (this.onStateChange) {
      this.onStateChange({
        isPlaying: this.isPlaying,
        trackTitle: this.currentTrack.title,
        trackId: this.currentTrack.id,
      });
    }
  }
}
