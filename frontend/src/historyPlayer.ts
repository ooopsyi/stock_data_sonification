// ═══════════════════════════════════════════════════════════════════
//  historyPlayer.ts — Pattern-First Daily K-line Sonification
//
//  Philosophy: analyze the full dataset → segment into emotional
//  chapters → compose music that tells the story. Data informs the
//  composition's mood, dynamics, tempo — NOT individual notes.
//
//  Style A: Sakamoto "Rain" — flowing piano, lyrical melody arcs
//  Style B: Zimmer "F1" — driving pulse, building tension layers
// ═══════════════════════════════════════════════════════════════════

export type HistoryStyle = 'sakamoto' | 'zimmer'

export interface DayBar {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// ── Chapter types represent market emotional states ──
type ChapterType = 'calm' | 'uptrend' | 'downtrend' | 'volatile' | 'crash' | 'recovery'

interface Chapter {
  type: ChapterType
  startIdx: number
  endIdx: number
  intensity: number      // 0..1 overall energy
  avgReturn: number      // average daily return in chapter
  maxDrop: number        // worst single day
  maxRise: number        // best single day
  volatility: number     // std of returns
  priceDirection: number // cumulative drift (-1..1)
}

interface PlaybackState {
  isPlaying: boolean
  currentDay: number
  totalDays: number
  style: HistoryStyle
  speed: number
}

type ProgressCallback = (state: PlaybackState) => void

// ═══════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}
// ═══════════════════════════════════════════════════════════════
//  PATTERN ANALYSIS — segment bars into emotional chapters
// ═══════════════════════════════════════════════════════════════

function analyzeChapters(bars: DayBar[]): Chapter[] {
  if (bars.length < 3) return []

  // Calculate daily returns
  const returns: number[] = [0]
  for (let i = 1; i < bars.length; i++) {
    returns.push((bars[i].close - bars[i - 1].close) / bars[i - 1].close)
  }

  // Rolling 5-day volatility
  const rollingVol: number[] = []
  for (let i = 0; i < bars.length; i++) {
    const window = returns.slice(Math.max(0, i - 4), i + 1)
    const mean = window.reduce((a, b) => a + b, 0) / window.length
    const variance = window.reduce((a, r) => a + (r - mean) ** 2, 0) / window.length
    rollingVol.push(Math.sqrt(variance))
  }

  // Classify each day
  const dayTypes: ChapterType[] = bars.map((_, i) => {
    const r = returns[i]
    const vol = rollingVol[i]
    if (r < -0.025) return 'crash'
    if (r > 0.02 && i > 0 && returns[i - 1] < -0.01) return 'recovery'
    if (vol > 0.02) return 'volatile'
    if (r > 0.005) return 'uptrend'
    if (r < -0.005) return 'downtrend'
    return 'calm'
  })

  // Merge consecutive same-type days into chapters (min 2 days)
  const raw: { type: ChapterType; start: number; end: number }[] = []
  let cStart = 0
  let cType = dayTypes[0]
  for (let i = 1; i <= dayTypes.length; i++) {
    if (i === dayTypes.length || dayTypes[i] !== cType) {
      raw.push({ type: cType, start: cStart, end: i - 1 })
      if (i < dayTypes.length) {
        cStart = i
        cType = dayTypes[i]
      }
    }
  }

  // Merge very short chapters (1 day) into neighbors
  const merged: typeof raw = []
  for (const ch of raw) {
    const len = ch.end - ch.start + 1
    if (len < 2 && merged.length > 0) {
      // Absorb into previous chapter
      merged[merged.length - 1].end = ch.end
    } else {
      merged.push({ ...ch })
    }
  }

  // Build full Chapter objects with stats
  return merged.map(ch => {
    const chReturns = returns.slice(ch.start, ch.end + 1)
    const avgReturn = chReturns.reduce((a, b) => a + b, 0) / chReturns.length
    const maxDrop = Math.min(...chReturns)
    const maxRise = Math.max(...chReturns)
    const mean = avgReturn
    const vol = Math.sqrt(chReturns.reduce((a, r) => a + (r - mean) ** 2, 0) / chReturns.length)
    const cumReturn = chReturns.reduce((a, r) => a * (1 + r), 1) - 1

    return {
      type: ch.type,
      startIdx: ch.start,
      endIdx: ch.end,
      intensity: clamp(vol * 40, 0.1, 1),
      avgReturn,
      maxDrop,
      maxRise,
      volatility: vol,
      priceDirection: clamp(cumReturn * 10, -1, 1),
    }
  })
}

// ═══════════════════════════════════════════════════════════════
//  AUDIO HELPERS
// ═══════════════════════════════════════════════════════════════

function createReverb(ctx: AudioContext, seconds: number, decay: number): ConvolverNode {
  const conv = ctx.createConvolver()
  const len = ctx.sampleRate * seconds
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < d.length; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, decay)
    }
  }
  conv.buffer = buf
  return conv
}

/** Play a single note with envelope */
function playNote(
  ctx: AudioContext, dest: GainNode, reverb: ConvolverNode | null,
  freq: number, startTime: number, duration: number,
  gain: number, wave: OscillatorType = 'triangle',
  opts?: { detune?: number; pan?: number; delay?: DelayNode; filterFreq?: number }
) {
  if (freq < 30 || freq > 4000) return
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  const filter = ctx.createBiquadFilter()

  osc.type = wave
  osc.frequency.setValueAtTime(freq, startTime)
  if (opts?.detune) osc.detune.setValueAtTime(opts.detune, startTime)

  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(opts?.filterFreq ?? 2400, startTime)
  filter.Q.setValueAtTime(0.5, startTime)

  // Piano-like envelope: fast attack, gradual decay
  const attack = wave === 'sine' ? 0.008 : 0.012
  g.gain.setValueAtTime(0.0001, startTime)
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), startTime + attack)
  g.gain.setTargetAtTime(gain * 0.35, startTime + attack, duration * 0.3)
  g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)

  osc.connect(g)
  g.connect(filter)

  if (opts?.pan !== undefined) {
    const panner = ctx.createStereoPanner()
    panner.pan.setValueAtTime(clamp(opts.pan, -1, 1), startTime)
    filter.connect(panner)
    panner.connect(dest)
    if (reverb) panner.connect(reverb)
  } else {
    filter.connect(dest)
    if (reverb) filter.connect(reverb)
  }
  if (opts?.delay) filter.connect(opts.delay)

  osc.start(startTime)
  osc.stop(startTime + duration + 0.05)
}

/** Compute per-day returns from bars */
function dailyReturns(bars: DayBar[]): number[] {
  const r = [0]
  for (let i = 1; i < bars.length; i++) {
    r.push((bars[i].close - bars[i - 1].close) / bars[i - 1].close)
  }
  return r
}

/**
 * Mournful cello — sawtooth + vibrato LFO, warm low-pass filter
 * Plays a short descending minor phrase in C3-C4 register
 */
function playCello(
  ctx: AudioContext, dest: GainNode, reverb: ConvolverNode,
  startTime: number, intensity: number, speed: number,
) {
  // Descending minor lament: A3 → G3 → F3 → E3 → D3
  const phrase = [0, -2, -4, -5, -7]
  const noteDur = (0.6 / speed)
  const gain = 0.025 * (0.6 + intensity * 0.6)

  phrase.forEach((semi, i) => {
    const t = startTime + i * noteDur * 0.85 // slight overlap for legato
    const freq = noteFreq(semi) // A3 register

    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    const filter = ctx.createBiquadFilter()

    // Sawtooth gives cello-like harmonic richness
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(freq, t)

    // Vibrato: LFO modulating pitch ~5Hz, ±6 cents
    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    lfo.type = 'sine'
    lfo.frequency.setValueAtTime(5.2, t)
    lfoGain.gain.setValueAtTime(8, t)  // cents of vibrato depth
    lfo.connect(lfoGain)
    lfoGain.connect(osc.detune)
    lfo.start(t)
    lfo.stop(t + noteDur + 0.3)

    // Warm low-pass: cello body resonance
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(700 + intensity * 300, t)
    filter.Q.setValueAtTime(1.2, t)

    // Slow bow-like attack, sustained, gentle release
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(gain, t + 0.12)
    g.gain.setTargetAtTime(gain * 0.7, t + 0.12, noteDur * 0.4)
    g.gain.exponentialRampToValueAtTime(0.0001, t + noteDur)

    osc.connect(g)
    g.connect(filter)

    // Pan slightly right for spatial separation from piano
    const panner = ctx.createStereoPanner()
    panner.pan.setValueAtTime(0.25, t)
    filter.connect(panner)
    panner.connect(dest)
    panner.connect(reverb)

    osc.start(t)
    osc.stop(t + noteDur + 0.1)
  })
}

/**
 * Urgent drum hits — rapid noise bursts with pitched bandpass
 * Creates an anxious, driving percussion flurry
 */
function playUrgentDrums(
  ctx: AudioContext, dest: GainNode,
  startTime: number, intensity: number, speed: number,
) {
  const numHits = 6 + Math.floor(intensity * 6) // 6–12 rapid hits
  const interval = (0.07 / speed)                // very fast
  const baseGain = 0.04 * (0.5 + intensity * 0.7)

  for (let i = 0; i < numHits; i++) {
    const t = startTime + i * interval
    // Accent pattern: first hit and every 3rd hit louder
    const accent = (i === 0 || i % 3 === 0) ? 1.3 : 0.8
    const hitGain = baseGain * accent * (1 - i / numHits * 0.3) // fade slightly

    // Low kick body (sine thump)
    const kick = ctx.createOscillator()
    const kickG = ctx.createGain()
    kick.type = 'sine'
    kick.frequency.setValueAtTime(120, t)
    kick.frequency.exponentialRampToValueAtTime(50, t + 0.06)
    kickG.gain.setValueAtTime(hitGain, t)
    kickG.gain.exponentialRampToValueAtTime(0.0001, t + 0.08)
    kick.connect(kickG)
    kickG.connect(dest)
    kick.start(t)
    kick.stop(t + 0.1)

    // Noise snap (attack transient)
    const snapLen = 0.025
    const nBuf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * snapLen), ctx.sampleRate)
    const nData = nBuf.getChannelData(0)
    for (let j = 0; j < nData.length; j++) {
      nData[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / nData.length, 3)
    }
    const nSrc = ctx.createBufferSource()
    nSrc.buffer = nBuf
    const nGain = ctx.createGain()
    const nFilter = ctx.createBiquadFilter()
    nFilter.type = 'bandpass'
    nFilter.frequency.setValueAtTime(200 + i * 40, t) // pitch rises with urgency
    nFilter.Q.setValueAtTime(2, t)
    nGain.gain.setValueAtTime(hitGain * 0.7, t)
    nGain.gain.exponentialRampToValueAtTime(0.0001, t + snapLen)
    nSrc.connect(nGain)
    nGain.connect(nFilter)
    nFilter.connect(dest)
    nSrc.start(t)
    nSrc.stop(t + snapLen + 0.01)
  }
}

// ═══════════════════════════════════════════════════════════════
//  MUSIC THEORY — pre-composed melodic phrases per emotion
// ═══════════════════════════════════════════════════════════════

// Frequencies relative to A3=220Hz
function noteFreq(semitonesFromA3: number): number {
  return 220 * Math.pow(2, semitonesFromA3 / 12)
}

// Semitone names: A=0, Bb=1, B=2, C=3, C#=4, D=5, D#=6, E=7, F=8, F#=9, G=10, G#=11

// ── Sakamoto melodic phrases (semitones from A3) ──
// These are emotional melodies, not data mappings
const SAK_PHRASES: Record<ChapterType, number[][]> = {
  calm: [
    [0, 3, 7, 12, 7, 3],           // Am arpeggio up & down
    [0, 5, 8, 12, 15, 12],         // Am → F extension
    [3, 7, 10, 7, 3, 0],           // C flowing back
    [0, 2, 3, 7, 3, 2, 0],         // stepwise sighing
  ],
  uptrend: [
    [0, 3, 7, 12, 15, 19],         // ascending with hope
    [3, 7, 12, 15, 19, 24],        // climbing higher (C → octave)
    [7, 10, 12, 15, 12, 10, 7],    // E joy phrase
    [0, 7, 12, 15, 19, 15, 12],    // wide ascending leap
  ],
  downtrend: [
    [12, 10, 8, 7, 3, 0],          // descending sigh
    [15, 12, 10, 8, 7, 5, 3],      // long descent
    [12, 11, 10, 8, 7, 3],         // chromatic sadness
    [7, 5, 3, 0, -2, -5],          // falling into low register
  ],
  volatile: [
    [0, 7, 3, 12, 5, 10],          // wide intervals, restless
    [12, 3, 15, 7, 0, 10],         // chaotic jumps
    [0, 12, 7, -5, 15, 3],         // extreme leaps
    [8, 1, 10, 5, 13, 0],          // diminished tension
  ],
  crash: [
    [12, 11, 10, 9, 8, 7, 5, 3, 0], // chromatic descent (dramatic)
    [24, 19, 15, 12, 7, 3, 0, -5],  // falling from height
    [12, 8, 5, 1, -2, -5],          // tritone-heavy descent
  ],
  recovery: [
    [0, 2, 3, 5, 7],               // tentative ascending
    [0, 3, 7, 8, 12],              // Am → F → resolution
    [-5, 0, 3, 7, 12, 15],         // climbing from depths
    [3, 5, 7, 10, 12, 15, 19],     // hopeful long ascent
  ],
}

// Bass note patterns (semitones from A2 = A an octave below)
const SAK_BASS: Record<ChapterType, number[]> = {
  calm:      [0, 0, 8, 8, 3, 3, 10, 10],     // Am → F → C → G pedal
  uptrend:   [3, 3, 10, 10, 0, 0, 7, 7],     // C → G → A → E (bright)
  downtrend: [0, 0, 5, 5, 8, 8, 3, 3],       // Am → Dm → F → C (dark)
  volatile:  [0, 5, 8, 1, 0, 10, 3, 7],      // restless bass
  crash:     [0, 0, 1, 1, 0, 0, 11, 11],     // Am → Bbm → Am → G#dim (dread)
  recovery:  [0, 3, 7, 3, 0, 8, 3, 10],      // Am → C → E → C → F → G
}

// ── Zimmer motifs ──
// D minor based (D=5 relative to A3)
const ZIM_MOTIFS: Record<ChapterType, number[][]> = {
  calm: [
    [5, 5, 5, 5],                             // single note pulse (ticking)
  ],
  uptrend: [
    [5, 10, 12, 17],                          // power ascent Dm → G → Am → D
    [5, 12, 17, 24],                          // octave climbing
    [5, 7, 10, 12, 17, 19],                   // scale run up
  ],
  downtrend: [
    [17, 12, 10, 5],                          // power descent
    [17, 15, 13, 12, 10, 8, 5],              // chromatic grind down
  ],
  volatile: [
    [5, 17, 5, 17, 5, 17],                   // octave thrash
    [5, 6, 5, 6, 12, 13, 12, 13],           // semitone tension
  ],
  crash: [
    [17, 16, 15, 14, 13, 12, 11, 10, 8, 5], // full chromatic crash
    [24, 17, 12, 5, 0, -7],                  // falling fifths
  ],
  recovery: [
    [5, 7, 10, 12],                          // tentative rise
    [5, 10, 12, 17, 19],                     // gaining confidence
  ],
}

// ═══════════════════════════════════════════════════════════════
//  SAKAMOTO "RAIN" ENGINE
//  Approach: each chapter gets a melodic section with its own
//  character. Melody phrases loop within the chapter.
//  3 layers: arpeggio rain + melody line + bass pedal
// ═══════════════════════════════════════════════════════════════

function scheduleSakamoto(
  ctx: AudioContext,
  master: GainNode,
  reverb: ConvolverNode,
  _bars: DayBar[],
  chapters: Chapter[],
  speed: number,
  onProgress: (day: number) => void,
): { stop: () => void } {
  let cancelled = false
  let scheduleTime = ctx.currentTime + 0.3

  // Pre-compute returns for big-drop detection
  const returns = dailyReturns(_bars)
  const BIG_DROP = -0.025 // -2.5% threshold for 大阴线

  // Wet gain for reverb
  const wetGain = ctx.createGain()
  wetGain.gain.value = 0.32
  reverb.connect(wetGain)
  wetGain.connect(ctx.destination)

  // Delay line for echo
  const delay = ctx.createDelay(2.0)
  delay.delayTime.value = 0.42
  const delayFb = ctx.createGain()
  delayFb.gain.value = 0.22
  delay.connect(delayFb)
  delayFb.connect(delay)
  delay.connect(wetGain)

  const timers: number[] = []
  let wallTimeOffset = 0.3  // for setTimeout progress tracking

  for (const chapter of chapters) {
    if (cancelled) break

    const chLen = chapter.endIdx - chapter.startIdx + 1
    const phrases = SAK_PHRASES[chapter.type]
    const bassNotes = SAK_BASS[chapter.type]

    // Chapter tempo: calm=slow, crash=fast
    const baseBPM = chapter.type === 'calm' ? 72 :
                    chapter.type === 'crash' ? 110 :
                    chapter.type === 'volatile' ? 100 :
                    chapter.type === 'recovery' ? 80 :
                    chapter.type === 'uptrend' ? 84 : 76
    const beat = (60 / baseBPM) / speed

    // Chapter dynamics
    const dynBase = chapter.type === 'calm' ? 0.015 :
                    chapter.type === 'crash' ? 0.04 :
                    chapter.type === 'volatile' ? 0.035 :
                    chapter.type === 'uptrend' ? 0.025 :
                    chapter.type === 'recovery' ? 0.02 : 0.018

    // How many beats to spend on this chapter
    // Each day gets ~2 beats of music (not 1:1, but proportional)
    const chapterBeats = chLen * 2
    const phrase = phrases[Math.floor(Math.random() * phrases.length)]

    // ── Schedule melodic phrases across the chapter ──
    for (let b = 0; b < chapterBeats; b++) {
      if (cancelled) break
      const beatTime = scheduleTime + b * beat
      const phraseIdx = b % phrase.length

      // ── Layer 1: Arpeggio Rain (16th note broken chords) ──
      // Density depends on chapter intensity
      const arpDensity = chapter.type === 'calm' ? 2 :
                         chapter.type === 'volatile' ? 4 :
                         chapter.type === 'crash' ? 4 : 3
      const arpChord = phrases[b % phrases.length]
      for (let s = 0; s < arpDensity; s++) {
        if (Math.random() < (chapter.type === 'calm' ? 0.35 : 0.15)) continue // skip some for breath
        const arpTime = beatTime + s * (beat / arpDensity) + (Math.random() - 0.5) * 0.01
        const arpNote = arpChord[s % arpChord.length]
        const arpOctave = chapter.type === 'crash' ? -12 : (chapter.type === 'uptrend' ? 12 : 0)
        const arpFreq = noteFreq(arpNote + arpOctave)
        const arpVel = dynBase * 0.5 * (s === 0 ? 1.2 : 0.7) * (1 + chapter.intensity * 0.3)
        const arpLen = beat / arpDensity * 1.6

        playNote(ctx, master, reverb, arpFreq, arpTime, arpLen, arpVel, 'triangle', {
          detune: (Math.random() - 0.5) * 6,
          filterFreq: 1600 + chapter.intensity * 800,
          delay: s === 0 ? delay : undefined,
        })
      }

      // ── Layer 2: Melody (plays phrase notes sequentially) ──
      // Melody doesn't play every beat — it breathes
      const melodyPlays = chapter.type === 'calm' ? (b % 3 === 0) :
                          chapter.type === 'crash' ? (b % 2 === 0) :
                          (b % 2 === 0 || Math.random() < 0.3)

      if (melodyPlays) {
        const melNote = phrase[phraseIdx]
        const melFreq = noteFreq(melNote + 12) // octave above for melody register
        const melTime = beatTime + 0.05 + (Math.random() - 0.5) * 0.015
        const melLen = beat * (chapter.type === 'calm' ? 1.8 : 1.2)
        const melVel = dynBase * (1 + chapter.intensity * 0.5)

        // Main melody note
        playNote(ctx, master, reverb, melFreq, melTime, melLen, melVel, 'sine', {
          pan: -0.15,
          delay,
          filterFreq: 2200,
        })
        // Subtle color note (3rd or 5th above) for richness
        if (Math.random() < 0.3 + chapter.intensity * 0.2) {
          const colorInterval = Math.random() < 0.5 ? 3 : 7
          playNote(ctx, master, reverb, noteFreq(melNote + 12 + colorInterval), melTime + 0.02, melLen * 0.7,
            melVel * 0.35, 'triangle', { pan: 0.1, filterFreq: 1800 })
        }

        // Grace note on emotional moments
        if ((chapter.type === 'crash' || chapter.type === 'recovery') && Math.random() < 0.4) {
          const graceDir = chapter.type === 'crash' ? 2 : -2
          playNote(ctx, master, reverb, noteFreq(melNote + 12 + graceDir), melTime - 0.04, 0.06,
            melVel * 0.6, 'sine', { filterFreq: 2000 })
        }
      }

      // ── Layer 3: Bass Pedal ──
      // Bass plays on downbeats (every 2 beats)
      if (b % 2 === 0) {
        const bassIdx = (b / 2) % bassNotes.length
        const bassNote = bassNotes[bassIdx]
        const bassFreq = noteFreq(bassNote - 12) // A2 register
        const bassLen = beat * 1.8
        const bassVel = dynBase * 0.6

        playNote(ctx, master, reverb, bassFreq, beatTime, bassLen, bassVel, 'sine', {
          filterFreq: 400,
        })
      }

      // ── Layer 4: Mournful Cello on 大阴线 (big bearish candle) ──
      if (b % 2 === 0) {
        const dayIdx = chapter.startIdx + Math.floor(b / 2)
        if (dayIdx < returns.length && returns[dayIdx] < BIG_DROP) {
          const dropMag = Math.abs(returns[dayIdx]) // larger drop → more intensity
          playCello(ctx, master, reverb, beatTime + 0.05,
            clamp(dropMag * 15, 0.3, 1), speed)
        }
      }

      // Schedule progress callback for each "day"
      if (b % 2 === 0) {
        const dayIdx = chapter.startIdx + Math.floor(b / 2)
        if (dayIdx <= chapter.endIdx) {
          const wallDelay = wallTimeOffset * 1000
          const capturedDay = dayIdx
          const tid = window.setTimeout(() => {
            if (!cancelled) onProgress(capturedDay)
          }, wallDelay)
          timers.push(tid)
        }
      }
      wallTimeOffset += beat
    }

    // ── Chapter transition: brief pause for breath ──
    const pauseBeats = chapter.type === 'crash' ? 3 : chapter.type === 'calm' ? 1 : 1.5
    const pauseDuration = beat * pauseBeats

    // Transition note (single held tone fading)
    if (chapter.type === 'crash') {
      // After crash: silence, then a single low held note
      const holdFreq = noteFreq(-5) // low D
      playNote(ctx, master, reverb, holdFreq, scheduleTime + chapterBeats * beat + beat,
        pauseDuration * 1.5, dynBase * 0.3, 'sine', { filterFreq: 300 })
    }

    scheduleTime += chapterBeats * beat + pauseDuration
    wallTimeOffset += pauseDuration
  }

  // End signal
  const endTid = window.setTimeout(() => {
    if (!cancelled) onProgress(-1)
  }, wallTimeOffset * 1000)
  timers.push(endTid)

  return {
    stop() {
      cancelled = true
      timers.forEach(t => window.clearTimeout(t))
      try { wetGain.disconnect() } catch { /* ok */ }
    },
  }
}


// ═══════════════════════════════════════════════════════════════
//  ZIMMER "F1" ENGINE
//  Approach: each chapter builds layers depending on intensity.
//  Calm = just ticking. Uptrend = accelerating pulse + pad.
//  Crash = full chromatic descent + brake FX. Recovery = rebuild.
//
//  4 layers: pulse engine + tension pad + clockwork + motif
// ═══════════════════════════════════════════════════════════════

function scheduleZimmer(
  ctx: AudioContext,
  master: GainNode,
  reverb: ConvolverNode,
  _bars: DayBar[],
  chapters: Chapter[],
  speed: number,
  onProgress: (day: number) => void,
): { stop: () => void } {
  let cancelled = false
  let scheduleTime = ctx.currentTime + 0.3

  // Pre-compute returns for big-drop detection
  const returns = dailyReturns(_bars)
  const BIG_DROP = -0.025 // -2.5% threshold for 大阴线

  // Less reverb for Zimmer (drier, more in-your-face)
  const wetGain = ctx.createGain()
  wetGain.gain.value = 0.12
  reverb.connect(wetGain)
  wetGain.connect(ctx.destination)

  const timers: number[] = []
  let wallTimeOffset = 0.3

  for (const chapter of chapters) {
    if (cancelled) break

    const chLen = chapter.endIdx - chapter.startIdx + 1
    const motifs = ZIM_MOTIFS[chapter.type]
    const motif = motifs[Math.floor(Math.random() * motifs.length)]

    // Zimmer: faster BPM, more driving
    const baseBPM = chapter.type === 'calm' ? 100 :
                    chapter.type === 'crash' ? 160 :
                    chapter.type === 'volatile' ? 150 :
                    chapter.type === 'uptrend' ? 130 :
                    chapter.type === 'recovery' ? 110 : 90
    const beat = (60 / baseBPM) / speed

    // Dynamics
    const dynBase = chapter.type === 'calm' ? 0.012 :
                    chapter.type === 'crash' ? 0.045 :
                    chapter.type === 'volatile' ? 0.04 :
                    chapter.type === 'uptrend' ? 0.03 :
                    chapter.type === 'recovery' ? 0.02 : 0.015

    // Beats per chapter
    const chapterBeats = chLen * 2.5  // more beats per day for Zimmer (faster notes)

    for (let b = 0; b < chapterBeats; b++) {
      if (cancelled) break
      const beatTime = scheduleTime + b * beat

      // Build factor: intensity ramps up within each chapter
      const buildFactor = Math.min(b / chapterBeats, 1)
      const layerGate = chapter.intensity * 0.5 + buildFactor * 0.5

      // ── Layer 1: Pulse Engine (sawtooth gated) ──
      // Always present in some form
      const gateSubDiv = chapter.type === 'crash' ? 4 :
                         chapter.type === 'volatile' ? 3 :
                         chapter.type === 'uptrend' ? 2 : 1
      for (let s = 0; s < gateSubDiv; s++) {
        const pTime = beatTime + s * (beat / gateSubDiv)
        const gateLen = (beat / gateSubDiv) * 0.55

        // Root note for pulse: follows motif pattern
        const motifNote = motif[b % motif.length]
        const pulseFreq = noteFreq(motifNote - 12) // low register

        const pVel = dynBase * (0.5 + layerGate * 0.5)
        playNote(ctx, master, null, pulseFreq, pTime, gateLen, pVel, 'sawtooth', {
          filterFreq: 200 + chapter.intensity * 600,
        })

        // Power fifth above for weight
        if (layerGate > 0.4 && s === 0) {
          playNote(ctx, master, null, pulseFreq * 1.5, pTime, gateLen * 0.8, pVel * 0.6, 'sawtooth', {
            filterFreq: 400 + chapter.intensity * 400,
          })
        }
      }

      // ── Layer 2: Tension Pad (detuned saw) ──
      // Only in higher intensity situations
      if (layerGate > 0.3 && b % 4 === 0) {
        const padNote = motif[0] // root of motif
        const padFreq = noteFreq(padNote - 12)
        const padLen = beat * 4
        const padVel = dynBase * 0.4 * layerGate

        for (const detune of [-7, 0, 7]) {
          const padOsc = ctx.createOscillator()
          const padGain = ctx.createGain()
          const padFilter = ctx.createBiquadFilter()

          padOsc.type = 'sawtooth'
          padOsc.frequency.setValueAtTime(clamp(padFreq, 40, 600), beatTime)
          padOsc.detune.setValueAtTime(detune, beatTime)

          padFilter.type = 'lowpass'
          padFilter.frequency.setValueAtTime(800 + chapter.intensity * 600, beatTime)

          padGain.gain.setValueAtTime(0.0001, beatTime)
          padGain.gain.exponentialRampToValueAtTime(Math.max(0.001, padVel), beatTime + 0.25)
          padGain.gain.setTargetAtTime(padVel * 0.5, beatTime + 0.25, padLen * 0.4)
          padGain.gain.exponentialRampToValueAtTime(0.0001, beatTime + padLen)

          padOsc.connect(padGain)
          padGain.connect(padFilter)
          padFilter.connect(master)
          padFilter.connect(reverb)

          padOsc.start(beatTime)
          padOsc.stop(beatTime + padLen + 0.1)
        }
      }

      // ── Layer 3: Clockwork Ticks ──
      // Always present — the heartbeat of Zimmer F1
      const ticksPerBeat = chapter.type === 'calm' ? 1 :
                           chapter.type === 'crash' ? 4 :
                           chapter.type === 'volatile' ? 3 : 2
      for (let t = 0; t < ticksPerBeat; t++) {
        const tTime = beatTime + t * (beat / ticksPerBeat)
        const tOsc = ctx.createOscillator()
        const tGain = ctx.createGain()
        tOsc.type = 'square'
        tOsc.frequency.setValueAtTime(800 + Math.random() * 200, tTime)

        const tVel = 0.006 + chapter.intensity * 0.004
        tGain.gain.setValueAtTime(tVel, tTime)
        tGain.gain.exponentialRampToValueAtTime(0.0001, tTime + 0.015)

        tOsc.connect(tGain)
        tGain.connect(master)

        tOsc.start(tTime)
        tOsc.stop(tTime + 0.02)
      }

      // ── Layer 4: Motif melody (sparse, punctuating) ──
      // Plays the motif notes at key rhythmic positions
      const motifPlays = chapter.type === 'calm' ? (b % 8 === 0) :
                         chapter.type === 'crash' ? (b % 2 === 0) :
                         (b % 3 === 0)

      if (motifPlays) {
        const mNote = motif[b % motif.length]
        const mFreq = noteFreq(mNote + 12) // upper register for cut-through
        const mLen = beat * 0.6
        const mVel = dynBase * (0.8 + chapter.intensity * 0.5)

        // Sine + square blend for Zimmer's signature penetrating tone
        playNote(ctx, master, reverb, mFreq, beatTime, mLen, mVel * 0.7, 'sine', {
          filterFreq: 2800,
        })
        playNote(ctx, master, null, mFreq, beatTime, mLen * 0.5, mVel * 0.3, 'square', {
          filterFreq: 1800,
        })
      }

      // ── Sub-bass drone (continuous) ──
      if (b % 2 === 0) {
        const subFreq = noteFreq(motif[0] - 24) // two octaves below root
        const subLen = beat * 2
        const subVel = dynBase * 0.5 * (0.5 + layerGate * 0.5)

        playNote(ctx, master, null, clamp(subFreq, 30, 80), beatTime, subLen, subVel, 'sine', {
          filterFreq: 100,
        })
      }

      // ── Special FX for crash chapters ──
      if (chapter.type === 'crash' && b > 0 && b % 4 === 0) {
        // Descending glissando
        const brakeOsc = ctx.createOscillator()
        const brakeGain = ctx.createGain()
        brakeOsc.type = 'sawtooth'
        brakeOsc.frequency.setValueAtTime(500, beatTime)
        brakeOsc.frequency.exponentialRampToValueAtTime(60, beatTime + beat * 2)
        brakeGain.gain.setValueAtTime(0.0001, beatTime)
        brakeGain.gain.exponentialRampToValueAtTime(dynBase * 0.5, beatTime + 0.01)
        brakeGain.gain.exponentialRampToValueAtTime(0.0001, beatTime + beat * 2)
        brakeOsc.connect(brakeGain)
        brakeGain.connect(master)
        brakeOsc.start(beatTime)
        brakeOsc.stop(beatTime + beat * 2 + 0.1)

        // Noise burst
        const noiseLen = 0.12
        const nBuf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * noiseLen), ctx.sampleRate)
        const nData = nBuf.getChannelData(0)
        for (let j = 0; j < nData.length; j++) {
          nData[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / nData.length, 4)
        }
        const nSrc = ctx.createBufferSource()
        nSrc.buffer = nBuf
        const nGain = ctx.createGain()
        nGain.gain.setValueAtTime(dynBase * 0.4, beatTime)
        nGain.gain.exponentialRampToValueAtTime(0.0001, beatTime + noiseLen)
        nSrc.connect(nGain)
        nGain.connect(master)
        nSrc.start(beatTime)
        nSrc.stop(beatTime + noiseLen + 0.02)
      }

      // ── Urgent drums on 大阴线 (big bearish candle) ──
      const beatsPerDay = chapterBeats / chLen
      const zimDayIdx = chapter.startIdx + Math.min(Math.floor(b / beatsPerDay), chLen - 1)
      // Trigger once per big-drop day (on the first beat of that day)
      if (Math.floor(b / beatsPerDay) !== Math.floor((b - 1) / beatsPerDay) || b === 0) {
        if (zimDayIdx < returns.length && returns[zimDayIdx] < BIG_DROP) {
          const dropMag = Math.abs(returns[zimDayIdx])
          playUrgentDrums(ctx, master, beatTime,
            clamp(dropMag * 15, 0.3, 1), speed)
        }
      }

      // Progress callbacks
      if (b % Math.round(chapterBeats / chLen) === 0) {
        const dayMap = chapter.startIdx + Math.min(Math.floor(b / (chapterBeats / chLen)), chLen - 1)
        const wallDelay = wallTimeOffset * 1000
        const capturedDay = dayMap
        const tid = window.setTimeout(() => {
          if (!cancelled) onProgress(capturedDay)
        }, wallDelay)
        timers.push(tid)
      }
      wallTimeOffset += beat
    }

    // ── Chapter transition ──
    const pauseBeats = chapter.type === 'crash' ? 4 : 1
    scheduleTime += chapterBeats * beat + beat * pauseBeats
    wallTimeOffset += beat * pauseBeats
  }

  // End signal
  const endTid = window.setTimeout(() => {
    if (!cancelled) onProgress(-1)
  }, wallTimeOffset * 1000)
  timers.push(endTid)

  return {
    stop() {
      cancelled = true
      timers.forEach(t => window.clearTimeout(t))
      try { wetGain.disconnect() } catch { /* ok */ }
    },
  }
}


// ═══════════════════════════════════════════════════════════════
//  PLAYBACK CONTROLLER — public API
// ═══════════════════════════════════════════════════════════════

export class HistoryPlayer {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private reverb: ConvolverNode | null = null
  private activeEngine: { stop: () => void } | null = null
  private _state: PlaybackState = {
    isPlaying: false,
    currentDay: 0,
    totalDays: 0,
    style: 'sakamoto',
    speed: 1,
  }
  private onProgress: ProgressCallback = () => {}

  get state(): PlaybackState {
    return { ...this._state }
  }

  setProgressCallback(cb: ProgressCallback) {
    this.onProgress = cb
  }

  start(bars: DayBar[], style: HistoryStyle, speed = 1, volumeLevel = 0.8) {
    this.stop()

    if (bars.length < 3) return

    // Pattern analysis
    const chapters = analyzeChapters(bars)
    if (chapters.length === 0) return

    // Create audio graph
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.master.gain.value = volumeLevel
    this.master.connect(this.ctx.destination)

    const reverbTime = style === 'sakamoto' ? 2.8 : 1.0
    const reverbDecay = style === 'sakamoto' ? 2.6 : 3.8
    this.reverb = createReverb(this.ctx, reverbTime, reverbDecay)

    this._state = {
      isPlaying: true,
      currentDay: 0,
      totalDays: bars.length,
      style,
      speed,
    }

    const handleProgress = (day: number) => {
      if (day === -1) {
        this._state.isPlaying = false
        this._state.currentDay = this._state.totalDays
        this.onProgress({ ...this._state })
        return
      }
      this._state.currentDay = day
      this.onProgress({ ...this._state })
    }

    if (style === 'sakamoto') {
      this.activeEngine = scheduleSakamoto(
        this.ctx, this.master, this.reverb, bars, chapters, speed, handleProgress,
      )
    } else {
      this.activeEngine = scheduleZimmer(
        this.ctx, this.master, this.reverb, bars, chapters, speed, handleProgress,
      )
    }

    this.onProgress({ ...this._state })
  }

  stop() {
    if (this.activeEngine) {
      this.activeEngine.stop()
      this.activeEngine = null
    }
    if (this.ctx) {
      void this.ctx.close()
      this.ctx = null
    }
    this.master = null
    this.reverb = null
    this._state.isPlaying = false
    this.onProgress({ ...this._state })
  }

  setVolume(v: number) {
    if (this.master && this.ctx) {
      this.master.gain.setValueAtTime(clamp(v, 0, 1), this.ctx.currentTime)
    }
  }
}
