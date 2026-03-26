import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import './App.css'
import { GENRE_MELODY, DEFAULT_GENRE_MELODY } from './melodyConfig'
import { HistoryPlayer, type HistoryStyle, type DayBar } from './historyPlayer'

type Mood = 'Calm' | 'Bullish' | 'Bearish' | 'Turbulent'
type StreamMode = 'live' | 'replay'
type ABMode = 'raw' | 'smoothed'

interface QuoteEvent {
  symbol: string
  timestamp: number
  price: number
  volume: number
  chgPct: number
  momentum: number
  preClose: number
}

interface Candle {
  start: number
  open: number
  high: number
  low: number
  close: number
}

interface GenreProfile {
  id: string
  name: string
  waveform: OscillatorType
  baseHz: number
  modeName: string
  scale: number[]
  harmony: number[]
  pulseStep: number
  syncopation: number
  attack: number
  release: number
  brightness: number
  vibratoRate: number
  vibratoDepth: number
  harmonicBlend: number
  detuneCents: number
}

interface SceneStyle extends CSSProperties {
  '--bg-base': string
  '--bg-accent': string
  '--bg-glow': string
  '--bg-secondary-glow': string
  '--bg-grid': string
  '--bg-pulse-scale': string
  '--bg-pulse-opacity': string
  '--bg-grid-size': string
  '--orb-primary-duration': string
  '--orb-secondary-duration': string
}

interface CanvasTheme {
  top: string
  bottom: string
  grid: string
  up: string
  down: string
  wickUp: string
  wickDown: string
}

interface VisualTheme {
  scene: SceneStyle
  canvas: CanvasTheme
  rippleHue: number
}

interface TickRipple {
  id: number
  x: number
  y: number
  size: number
  color: string
  glow: string
}

interface GenreVisualProfile {
  hue: number
  saturationBoost: number
  motion: number
  gridSize: number
}

const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  majorPent: [0, 2, 4, 7, 9],
  minorPent: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
}

const GENRES: GenreProfile[] = [
  { id: 'ambient', name: 'Ambient', waveform: 'sine', baseHz: 220, modeName: 'Lydian', scale: MODES.lydian, harmony: [7, 12], pulseStep: 3, syncopation: 0.12, attack: 0.05, release: 0.44, brightness: 0.28, vibratoRate: 4.2, vibratoDepth: 3, harmonicBlend: 0.2, detuneCents: 3 },
  { id: 'classical', name: 'Classical', waveform: 'triangle', baseHz: 196, modeName: 'Ionian', scale: MODES.ionian, harmony: [4, 7, 12], pulseStep: 2, syncopation: 0.08, attack: 0.03, release: 0.38, brightness: 0.46, vibratoRate: 5.1, vibratoDepth: 4, harmonicBlend: 0.35, detuneCents: 4 },
  { id: 'jazz', name: 'Jazz', waveform: 'triangle', baseHz: 174.61, modeName: 'Dorian', scale: MODES.dorian, harmony: [3, 7, 10], pulseStep: 2, syncopation: 0.22, attack: 0.012, release: 0.24, brightness: 0.62, vibratoRate: 5.8, vibratoDepth: 6, harmonicBlend: 0.46, detuneCents: 6 },
  { id: 'lofi', name: 'Lo-fi', waveform: 'triangle', baseHz: 164.81, modeName: 'Minor Pentatonic', scale: MODES.minorPent, harmony: [3, 7, 10], pulseStep: 2, syncopation: 0.18, attack: 0.03, release: 0.34, brightness: 0.22, vibratoRate: 3.4, vibratoDepth: 2, harmonicBlend: 0.22, detuneCents: 14 },
  { id: 'orchestral', name: 'Cinematic', waveform: 'triangle', baseHz: 196, modeName: 'Aeolian', scale: MODES.aeolian, harmony: [3, 7, 12], pulseStep: 2, syncopation: 0.09, attack: 0.035, release: 0.42, brightness: 0.4, vibratoRate: 5.2, vibratoDepth: 4, harmonicBlend: 0.38, detuneCents: 3 },
  { id: 'downtempo', name: 'Downtempo', waveform: 'sine', baseHz: 130.81, modeName: 'Aeolian', scale: MODES.aeolian, harmony: [3, 7], pulseStep: 2, syncopation: 0.15, attack: 0.02, release: 0.3, brightness: 0.36, vibratoRate: 4.5, vibratoDepth: 3, harmonicBlend: 0.2, detuneCents: 4 },
]

const GENRE_VISUALS: Record<string, GenreVisualProfile> = {
  ambient: { hue: 198, saturationBoost: -0.06, motion: 0.52, gridSize: 42 },
  classical: { hue: 206, saturationBoost: -0.04, motion: 0.64, gridSize: 34 },
  jazz: { hue: 46, saturationBoost: 0.02, motion: 0.9, gridSize: 30 },
  lofi: { hue: 28, saturationBoost: -0.08, motion: 0.46, gridSize: 38 },
  orchestral: { hue: 224, saturationBoost: -0.02, motion: 0.66, gridSize: 33 },
  downtempo: { hue: 186, saturationBoost: -0.04, motion: 0.62, gridSize: 35 },
}

function quantizeSemitone(raw: number, scale: number[]) {
  const octave = Math.floor(raw / 12)
  const inOctave = raw - octave * 12
  let nearest = scale[0]
  let diff = Number.POSITIVE_INFINITY
  for (const candidate of scale) {
    const d = Math.abs(candidate - inOctave)
    if (d < diff) {
      nearest = candidate
      diff = d
    }
  }
  return octave * 12 + nearest
}

/** Returns the scale-degree index nearest to a semitone offset within octave */
function scaleIndex(semitone: number, scale: number[]) {
  const inOctave = ((semitone % 12) + 12) % 12
  let best = 0
  let diff = 999
  for (let i = 0; i < scale.length; i++) {
    const d = Math.abs(scale[i] - inOctave)
    if (d < diff) { best = i; diff = d }
  }
  return best
}

/** Walk one scale step from `current` toward `target`, preferring step-wise motion */
function melodyStep(current: number, target: number, scale: number[], stepBias = 0.7): number {
  const diff = target - current
  if (Math.abs(diff) <= 2) return target // close enough, snap
  // Decide: step-wise (±1-2 semitones in scale) or leap toward target
  const direction = diff > 0 ? 1 : -1
  const curIdx = scaleIndex(current, scale)
  const octave = Math.floor(current / 12)
  const leap = Math.random() > stepBias
  if (leap) {
    // Jump halfway toward target
    const mid = current + Math.round(diff * 0.5)
    return quantizeSemitone(mid, scale)
  }
  // Step-wise: move 1 scale degree
  const nextIdx = (curIdx + direction + scale.length) % scale.length
  const nextOctave = direction > 0 && nextIdx < curIdx ? octave + 1 : direction < 0 && nextIdx > curIdx ? octave - 1 : octave
  return nextOctave * 12 + scale[nextIdx]
}

/** Arpeggio patterns for different feels */
const ARP_PATTERNS: Record<string, number[][]> = {
  up:      [[0], [1], [2], [3]],
  down:    [[3], [2], [1], [0]],
  upDown:  [[0], [1], [2], [3], [2], [1]],
  chord:   [[0, 2, 4]],
  broken:  [[0, 2], [1, 3], [0, 4]],
  fifths:  [[0], [4], [0], [3]],
}

interface MelodyEngine {
  lastSemitone: number
  phrasePosition: number
  padOsc: OscillatorNode | null
  padGain: GainNode | null
  padFilter: BiquadFilterNode | null
  arpStep: number
  lastPlayTime: number        // for humanize timing
  consecutiveSilence: number  // Eno: count rests for tension build
  prevDirection: number       // Sakamoto: remember melodic direction
  intensityAcc: number        // Zimmer: accumulated intensity
  // ─── Volume / Market-driven percussion state ──────────
  volumeHistory: number[]     // sliding window for spike detection
  volumeMA: number            // exponential moving average of volume
  lastPercTime: number        // debounce percussion
  momentumHistory: number[]   // recent momentum for volatility calc
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getVisualTheme(latest: QuoteEvent | null, mood: Mood, genreId: string): VisualTheme {
  const genreVisual = GENRE_VISUALS[genreId] ?? { hue: 198, saturationBoost: 0, motion: 1, gridSize: 32 }
  const genreHue = genreVisual.hue
  const satBoost = genreVisual.saturationBoost
  const motion = genreVisual.motion

  if (!latest) {
    return {
      scene: {
        '--bg-base': '#07131d',
        '--bg-accent': '#0f2f46',
        '--bg-glow': 'rgba(78, 171, 214, 0.28)',
        '--bg-secondary-glow': 'rgba(121, 229, 196, 0.16)',
        '--bg-grid': 'rgba(129, 189, 211, 0.09)',
        '--bg-pulse-scale': '1',
        '--bg-pulse-opacity': '0.28',
        '--bg-grid-size': `${genreVisual.gridSize}px`,
        '--orb-primary-duration': `${(12 / motion).toFixed(2)}s`,
        '--orb-secondary-duration': `${(15 / motion).toFixed(2)}s`,
      },
      canvas: {
        top: '#0a1c2a',
        bottom: '#08131f',
        grid: 'rgba(138, 202, 225, 0.08)',
        up: '#3ebf86',
        down: '#f85b3d',
        wickUp: '#64dca4',
        wickDown: '#ff866f',
      },
      rippleHue: genreHue,
    }
  }

  const move = clamp(latest.chgPct / 4, -1, 1)
  const energy = clamp(Math.abs(latest.momentum) / 2.4, 0, 1)
  const liquidity = clamp(Math.log10(Math.max(10, latest.volume)) / 6, 0, 1)

  let hue = genreHue
  if (mood === 'Bullish') hue += 16
  if (mood === 'Bearish') hue -= 18
  if (mood === 'Turbulent') hue += move >= 0 ? 28 : -28
  hue = ((hue % 360) + 360) % 360

  const accentHue = hue + 28 + energy * 18
  const glowHue = hue - 18 + move * 22
  const sceneSat = 52 + satBoost * 100
  const accentSat = 62 + satBoost * 100
  const baseLightness = 8 + liquidity * 4
  const accentLightness = 17 + energy * 11
  const glowLightness = 44 + liquidity * 10
  const pulseScale = 1 + energy * (0.2 + motion * 0.14)
  const pulseOpacity = 0.2 + energy * 0.32

  const bullishHue = (hue + 20) % 360
  const bearishHue = (hue - 26 + 360) % 360

  return {
    scene: {
      '--bg-base': `hsl(${hue} ${sceneSat}% ${baseLightness}%)`,
      '--bg-accent': `hsl(${accentHue} ${accentSat}% ${accentLightness}%)`,
      '--bg-glow': `hsla(${glowHue} 88% ${glowLightness}% / ${0.24 + liquidity * 0.26})`,
      '--bg-secondary-glow': `hsla(${accentHue + 32} 90% ${52 + energy * 12}% / ${0.1 + energy * 0.2})`,
      '--bg-grid': `hsla(${hue + 8} 45% 72% / ${0.06 + liquidity * 0.08})`,
      '--bg-pulse-scale': pulseScale.toFixed(3),
      '--bg-pulse-opacity': pulseOpacity.toFixed(3),
      '--bg-grid-size': `${genreVisual.gridSize}px`,
      '--orb-primary-duration': `${(12 / motion).toFixed(2)}s`,
      '--orb-secondary-duration': `${(15 / motion).toFixed(2)}s`,
    },
    canvas: {
      top: `hsl(${hue} 54% ${13 + energy * 8}%)`,
      bottom: `hsl(${(hue + 24) % 360} 48% ${7 + liquidity * 5}%)`,
      grid: `hsla(${hue} 35% 72% / ${0.06 + liquidity * 0.1})`,
      up: `hsl(${bullishHue} 82% ${47 + energy * 7}%)`,
      down: `hsl(${bearishHue} 84% ${53 + energy * 5}%)`,
      wickUp: `hsl(${bullishHue} 88% ${66 + energy * 6}%)`,
      wickDown: `hsl(${bearishHue} 94% ${70 + energy * 6}%)`,
    },
    rippleHue: hue,
  }
}

// In production (same-origin deploy), use window.location.host; in dev, use localhost:8000
const API_HOST = import.meta.env.VITE_API_HOST || (import.meta.env.DEV ? 'localhost:8000' : window.location.host)

function App() {
  const [symbol, setSymbol] = useState('CL')
  const [status, setStatus] = useState('Idle')
  const [isRunning, setIsRunning] = useState(false)
  const [mode, setMode] = useState<StreamMode>('live')
  const [mood, setMood] = useState<Mood>('Calm')
  const [genreId, setGenreId] = useState('orchestral')
  const [fidelity, setFidelity] = useState(0.3)
  const [volume, setVolume] = useState(0.8)
  const [abMode, setAbMode] = useState<ABMode>('smoothed')
  const [latest, setLatest] = useState<QuoteEvent | null>(null)
  const [candles, setCandles] = useState<Candle[]>([])
  const candlesRef = useRef<Candle[]>([])

  const wsRef = useRef<WebSocket | null>(null)
  const replayTimerRef = useRef<number | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const chartRef = useRef<HTMLCanvasElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)

  const eventBufferRef = useRef<QuoteEvent[]>([])
  const basePriceRef = useRef<number | null>(null)
  const connectedSymbolRef = useRef('')
  const wantLiveRef = useRef(false)
  const melodyRef = useRef<MelodyEngine>({
    lastSemitone: 12,
    phrasePosition: 0,
    padOsc: null,
    padGain: null,
    padFilter: null,
    arpStep: 0,
    lastPlayTime: 0,
    consecutiveSilence: 0,
    prevDirection: 0,
    intensityAcc: 0.3,
    volumeHistory: [],
    volumeMA: 0,
    lastPercTime: 0,
    momentumHistory: [],
  })
  const smoothedPriceRef = useRef<number | null>(null)
  const canvasThemeRef = useRef<CanvasTheme>({
    top: '#0a1c2a',
    bottom: '#08131f',
    grid: 'rgba(138, 202, 225, 0.08)',
    up: '#3ebf86',
    down: '#f85b3d',
    wickUp: '#64dca4',
    wickDown: '#ff866f',
  })
  const rippleIdRef = useRef(0)
  const rippleTimerIdsRef = useRef<number[]>([])
  const [ripples, setRipples] = useState<TickRipple[]>([])

  const [showSettings, setShowSettings] = useState(false)
  const toggleSettings = useCallback(() => setShowSettings(s => !s), [])

  // ── History mode state ──
  const [viewMode, setViewMode] = useState<'live' | 'history'>('live')
  const [historyStyle, setHistoryStyle] = useState<HistoryStyle>('sakamoto')
  const [historyBars, setHistoryBars] = useState<DayBar[]>([])
  const [historyDay, setHistoryDay] = useState(-1)
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyPlaying, setHistoryPlaying] = useState(false)
  const [historySpeed, setHistorySpeed] = useState(1)
  const [historyLoading, setHistoryLoading] = useState(false)
  const historyPlayerRef = useRef<HistoryPlayer>(new HistoryPlayer())
  const historyCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const genre = useMemo(
    () => GENRES.find((g) => g.id === genreId) ?? GENRES[0],
    [genreId],
  )

  const visualTheme = useMemo(() => getVisualTheme(latest, mood, genreId), [latest, mood, genreId])
  const sceneStyle = visualTheme.scene

  // Ref to always call the latest handleTick / connectLive from stale closures
  const handleTickRef = useRef<(tick: QuoteEvent, fromReplay?: boolean) => void>(() => {})
  const connectLiveRef = useRef<() => void>(() => {})

  useEffect(() => {
    return () => {
      wantLiveRef.current = false
      stopAll()
      stopPad()
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current)
      }
      for (const timerId of rippleTimerIdsRef.current) {
        window.clearTimeout(timerId)
      }
      if (audioCtxRef.current) {
        void audioCtxRef.current.close()
      }
    }
  }, [])



  useEffect(() => {
    canvasThemeRef.current = visualTheme.canvas
    drawCandles(candles)
  }, [candles, visualTheme])

  // Sync volume to master gain
  useEffect(() => {
    if (masterGainRef.current && audioCtxRef.current) {
      masterGainRef.current.gain.setValueAtTime(volume, audioCtxRef.current.currentTime)
    }
  }, [volume])

  const reverbRef = useRef<ConvolverNode | null>(null)
  const delayNodeRef = useRef<DelayNode | null>(null)
  const delayFeedbackRef = useRef<GainNode | null>(null)
  const wetGainRef = useRef<GainNode | null>(null)

  function initAudio() {
    if (!audioCtxRef.current) {
      const ctx = new AudioContext()
      const master = ctx.createGain()
      master.gain.value = volume
      master.connect(ctx.destination)
      audioCtxRef.current = ctx
      masterGainRef.current = master

      // --- Reverb (Eno-style ambient tail) ---
      const convolver = ctx.createConvolver()
      const sampleRate = ctx.sampleRate
      const reverbLen = 3.2 // seconds
      const buf = ctx.createBuffer(2, sampleRate * reverbLen, sampleRate)
      for (let ch = 0; ch < 2; ch++) {
        const data = buf.getChannelData(ch)
        for (let i = 0; i < data.length; i++) {
          // Exponential decay with diffusion
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.8)
        }
      }
      convolver.buffer = buf
      const wetGain = ctx.createGain()
      wetGain.gain.value = 0.35
      convolver.connect(wetGain)
      wetGain.connect(ctx.destination)
      reverbRef.current = convolver
      wetGainRef.current = wetGain

      // --- Delay (Sakamoto-style echo) ---
      const delay = ctx.createDelay(2.0)
      delay.delayTime.value = 0.42
      const feedback = ctx.createGain()
      feedback.gain.value = 0.28
      delay.connect(feedback)
      feedback.connect(delay)
      delay.connect(wetGain) // delay → reverb wet path
      delayNodeRef.current = delay
      delayFeedbackRef.current = feedback
    }
    if (audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume()
    }
  }

  function getMood(tick: QuoteEvent): Mood {
    const volShock = Math.abs(tick.momentum) > 1.1
    const moveShock = Math.abs(tick.chgPct) > 2.4
    if (volShock || moveShock) return 'Turbulent'
    if (tick.chgPct > 0.35) return 'Bullish'
    if (tick.chgPct < -0.35) return 'Bearish'
    return 'Calm'
  }

  function pushBuffer(tick: QuoteEvent) {
    eventBufferRef.current.push(tick)
    const minTs = tick.timestamp - 180000
    eventBufferRef.current = eventBufferRef.current.filter((item) => item.timestamp >= minTs)
  }

  function updateCandles(tick: QuoteEvent) {
    const bucket = 5000
    const start = Math.floor(tick.timestamp / bucket) * bucket

    setCandles((prev) => {
      const next = [...prev]
      const last = next[next.length - 1]
      if (!last) {
        next.push({ start, open: tick.price, high: tick.price, low: tick.price, close: tick.price })
      } else if (last.start === start) {
        last.high = Math.max(last.high, tick.price)
        last.low = Math.min(last.low, tick.price)
        last.close = tick.price
      } else {
        // Fill time gaps with flat candles so K-line stays continuous
        const fillPrice = last.close
        const gapStart = last.start + bucket
        const maxGapCandles = 60 // cap gap-fill to avoid runaway
        let filled = 0
        for (let t = gapStart; t < start && filled < maxGapCandles; t += bucket) {
          next.push({ start: t, open: fillPrice, high: fillPrice, low: fillPrice, close: fillPrice })
          filled++
        }
        next.push({ start, open: tick.price, high: tick.price, low: tick.price, close: tick.price })
      }
      const result = next.slice(-120)
      candlesRef.current = result
      return result
    })
  }

  function drawCandles(items: Candle[]) {
    const canvas = chartRef.current
    if (!canvas) return

    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width < 10 || height < 10) return
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const theme = canvasThemeRef.current

    ctx.clearRect(0, 0, width, height)
    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, theme.top)
    gradient.addColorStop(1, theme.bottom)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)

    ctx.strokeStyle = theme.grid
    ctx.lineWidth = 1
    for (let x = 0; x < width; x += 32) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    for (let y = 0; y < height; y += 28) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }

    if (items.length === 0) return

    // Fixed-width candles, right-aligned
    const candleBody = 7
    const gap = 2
    const step = candleBody + gap
    const maxVisible = Math.floor(width / step)
    const visible = items.slice(-maxVisible)

    const highs = visible.map((c) => c.high)
    const lows = visible.map((c) => c.low)
    const maxP = Math.max(...highs)
    const minP = Math.min(...lows)
    const pad = (maxP - minP) * 0.1 + 0.001
    const top = maxP + pad
    const bottom = minP - pad
    const span = top - bottom

    // Right-align: newest candle at right edge
    const offsetX = width - visible.length * step

    for (let i = 0; i < visible.length; i += 1) {
      const c = visible[i]
      const cx = offsetX + i * step + candleBody / 2
      const wickTop = ((top - c.high) / span) * height
      const wickBottom = ((top - c.low) / span) * height
      const openY = ((top - c.open) / span) * height
      const closeY = ((top - c.close) / span) * height
      const up = c.close >= c.open

      // Wick
      ctx.strokeStyle = up ? theme.wickUp : theme.wickDown
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx, wickTop)
      ctx.lineTo(cx, wickBottom)
      ctx.stroke()

      // Body
      const bodyTop = Math.min(openY, closeY)
      const bodyHeight = Math.max(1, Math.abs(closeY - openY))
      ctx.fillStyle = up ? theme.up : theme.down
      ctx.fillRect(cx - candleBody / 2, bodyTop, candleBody, bodyHeight)
    }
  }

  function spawnRipple(tick: QuoteEvent) {
    const id = ++rippleIdRef.current

    // ─── Ripple tracks the latest candle on the K-line chart ───
    const currentCandles = candlesRef.current
    let x = 92  // default right edge
    let y = 50  // default center
    if (currentCandles.length > 0) {
      const canvas = chartRef.current
      const cWidth = canvas?.clientWidth ?? 300
      const candleBody = 7
      const gap = 2
      const step = candleBody + gap
      const maxVisible = Math.floor(cWidth / step)
      const visible = currentCandles.slice(-maxVisible)
      // X: rightmost candle position (percentage of chart width)
      const offsetX = cWidth - visible.length * step
      const lastCX = offsetX + (visible.length - 1) * step + candleBody / 2
      x = clamp((lastCX / cWidth) * 100, 5, 98)
      // Y: map current price onto chart Y axis
      const highs = visible.map((c) => c.high)
      const lows = visible.map((c) => c.low)
      const maxP = Math.max(...highs)
      const minP = Math.min(...lows)
      const pad = (maxP - minP) * 0.1 + 0.001
      const top = maxP + pad
      const bottom = minP - pad
      const span = top - bottom
      y = clamp(((top - tick.price) / span) * 100, 3, 97)
    }

    const size = 22 + Math.min(58, Math.log10(Math.max(20, tick.volume)) * 12)
    const intensity = clamp(Math.abs(tick.momentum) / 2.3 + Math.log10(Math.max(20, tick.volume)) / 5, 0.3, 1)
    const hue = (visualTheme.rippleHue + tick.chgPct * 7 + (tick.momentum >= 0 ? 6 : -6) + 360) % 360

    const ripple: TickRipple = {
      id,
      x,
      y,
      size,
      color: `hsla(${hue} 94% 72% / ${0.22 + intensity * 0.34})`,
      glow: `hsla(${hue} 100% 72% / ${0.24 + intensity * 0.36})`,
    }

    setRipples((prev) => [...prev.slice(-7), ripple])
    const timerId = window.setTimeout(() => {
      setRipples((prev) => prev.filter((item) => item.id !== id))
      rippleTimerIdsRef.current = rippleTimerIdsRef.current.filter((item) => item !== timerId)
    }, 720)
    rippleTimerIdsRef.current.push(timerId)
  }

  // ═══════════════════════════════════════════════════════════════
  //  Percussion synthesizer — driven by volume spikes & momentum
  //  Kick = sine pitch sweep, Snare = noise burst + body,
  //  Hi-hat = filtered noise, Rim = high-freq click
  // ═══════════════════════════════════════════════════════════════
  function playPercussion(
    ctx: AudioContext,
    master: GainNode,
    spikeLevel: number,   // 0..1 how much above normal volume
    momentum: number,     // raw momentum value
    intensity: number,    // accumulated intensity 0..1
  ) {
    const now = ctx.currentTime
    const reverbSend = reverbRef.current
    const hitGain = 0.06 + spikeLevel * 0.12  // percussion loudness scales with spike

    // ─── Kick drum (volume spike → boom) ───
    if (spikeLevel > 0.3) {
      const kickOsc = ctx.createOscillator()
      const kickGain = ctx.createGain()
      const kickFilter = ctx.createBiquadFilter()
      kickOsc.type = 'sine'
      // Pitch sweep from 150Hz → 45Hz (characteristic kick sound)
      kickOsc.frequency.setValueAtTime(150 + spikeLevel * 60, now)
      kickOsc.frequency.exponentialRampToValueAtTime(45, now + 0.12)
      kickFilter.type = 'lowpass'
      kickFilter.frequency.setValueAtTime(300, now)
      kickGain.gain.setValueAtTime(hitGain * 1.2, now)
      kickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25)
      kickOsc.connect(kickGain)
      kickGain.connect(kickFilter)
      kickFilter.connect(master)
      if (reverbSend) kickGain.connect(reverbSend)
      kickOsc.start(now)
      kickOsc.stop(now + 0.3)
    }

    // ─── Snare (momentum burst → crack) ───
    if (spikeLevel > 0.5 || Math.abs(momentum) > 1.5) {
      const snareLen = 0.12 + spikeLevel * 0.06
      // Noise component
      const bufLen = Math.ceil(ctx.sampleRate * snareLen)
      const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate)
      const noiseData = noiseBuf.getChannelData(0)
      for (let i = 0; i < bufLen; i++) {
        noiseData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 3)
      }
      const noiseSrc = ctx.createBufferSource()
      noiseSrc.buffer = noiseBuf
      const snareFilter = ctx.createBiquadFilter()
      snareFilter.type = 'highpass'
      snareFilter.frequency.setValueAtTime(1800 + spikeLevel * 2000, now)
      const snareGain = ctx.createGain()
      snareGain.gain.setValueAtTime(hitGain * 0.7, now)
      snareGain.gain.exponentialRampToValueAtTime(0.0001, now + snareLen)
      noiseSrc.connect(snareFilter)
      snareFilter.connect(snareGain)
      snareGain.connect(master)
      if (reverbSend) snareGain.connect(reverbSend)
      noiseSrc.start(now + 0.01) // slight offset from kick
      noiseSrc.stop(now + snareLen + 0.02)

      // Body tone (adds punch)
      const bodyOsc = ctx.createOscillator()
      const bodyGain = ctx.createGain()
      bodyOsc.type = 'triangle'
      bodyOsc.frequency.setValueAtTime(220, now + 0.01)
      bodyOsc.frequency.exponentialRampToValueAtTime(120, now + 0.06)
      bodyGain.gain.setValueAtTime(hitGain * 0.35, now + 0.01)
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)
      bodyOsc.connect(bodyGain)
      bodyGain.connect(master)
      bodyOsc.start(now + 0.01)
      bodyOsc.stop(now + 0.1)
    }

    // ─── Hi-hat (rapid ticks proportional to volume level) ───
    const hihatCount = spikeLevel > 0.7 ? 3 : spikeLevel > 0.4 ? 2 : intensity > 0.5 ? 1 : 0
    for (let h = 0; h < hihatCount; h++) {
      const hTime = now + h * (0.06 + Math.random() * 0.04)
      const hhLen = 0.025 + Math.random() * 0.02
      const hhBufLen = Math.ceil(ctx.sampleRate * hhLen)
      const hhBuf = ctx.createBuffer(1, hhBufLen, ctx.sampleRate)
      const hhData = hhBuf.getChannelData(0)
      for (let i = 0; i < hhBufLen; i++) {
        hhData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / hhBufLen, 6)
      }
      const hhSrc = ctx.createBufferSource()
      hhSrc.buffer = hhBuf
      const hhFilter = ctx.createBiquadFilter()
      hhFilter.type = 'bandpass'
      hhFilter.frequency.setValueAtTime(7000 + Math.random() * 3000, hTime)
      hhFilter.Q.setValueAtTime(1.5, hTime)
      const hhGain = ctx.createGain()
      hhGain.gain.setValueAtTime(hitGain * 0.4, hTime)
      hhGain.gain.exponentialRampToValueAtTime(0.0001, hTime + hhLen)
      hhSrc.connect(hhFilter)
      hhFilter.connect(hhGain)
      hhGain.connect(master)
      hhSrc.start(hTime)
      hhSrc.stop(hTime + hhLen + 0.01)
    }

    // ─── Rim click (sharp momentum change → metallic tick) ───
    if (Math.abs(momentum) > 2.0 && Math.random() < 0.5) {
      const rimOsc = ctx.createOscillator()
      const rimGain = ctx.createGain()
      rimOsc.type = 'square'
      rimOsc.frequency.setValueAtTime(800 + Math.random() * 400, now)
      rimGain.gain.setValueAtTime(hitGain * 0.25, now)
      rimGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03)
      rimOsc.connect(rimGain)
      rimGain.connect(master)
      rimOsc.start(now)
      rimOsc.stop(now + 0.04)
    }
  }

  function playTick(tick: QuoteEvent, processedPrice: number) {
    const ctx = audioCtxRef.current
    const master = masterGainRef.current
    if (!ctx || !master) return

    if (!basePriceRef.current) {
      basePriceRef.current = processedPrice
    }
    const base = basePriceRef.current
    const rel = (processedPrice - base) / base
    const me = melodyRef.current
    const gm = GENRE_MELODY[genre.id] ?? DEFAULT_GENRE_MELODY
    const now = ctx.currentTime

    // ─── Eno: Probabilistic silence (chance operations) ───
    // More likely to rest when price is flat; NEVER silent on volume spike
    const priceChange = Math.abs(rel) * 100
    const volActive = me.volumeMA > 10 && tick.volume > me.volumeMA * 1.8
    const silenceProb = volActive ? 0 : (priceChange < 0.02 ? 0.45 : priceChange < 0.1 ? 0.2 : 0.05)
    if (Math.random() < silenceProb && me.phrasePosition > 2) {
      me.consecutiveSilence++
      me.phrasePosition++
      // Even in silence, slowly evolve the pad (Eno: "let the system breathe")
      if (me.padOsc && me.padGain && me.padFilter) {
        const driftFreq = Math.max(60, Math.min(400, me.lastSemitone * 8 + Math.sin(now * 0.3) * 20))
        me.padOsc.frequency.exponentialRampToValueAtTime(driftFreq, now + 2.0)
        me.padFilter.frequency.linearRampToValueAtTime(300 + Math.sin(now * 0.1) * 200, now + 1.5)
      }
      return
    }

    // ─── Sakamoto: intensity from restraint ───
    // After silence, the returning note is more present
    const returnBoost = Math.min(me.consecutiveSilence * 0.12, 0.5)
    me.consecutiveSilence = 0

    // ─── Zimmer: accumulated intensity tracks momentum ───
    const momentumAbs = Math.abs(tick.momentum)
    me.intensityAcc = me.intensityAcc * 0.92 + momentumAbs * 0.08
    const intensity = clamp(me.intensityAcc, 0.1, 1.0)

    // ─── Volume spike detection & percussion ─────────────────
    // Track volume with EMA; spike = current >> moving average
    const vol = tick.volume
    me.volumeMA = me.volumeMA * 0.88 + vol * 0.12
    me.volumeHistory.push(vol)
    if (me.volumeHistory.length > 30) me.volumeHistory.shift()

    // Track momentum for volatility detection
    me.momentumHistory.push(momentumAbs)
    if (me.momentumHistory.length > 20) me.momentumHistory.shift()
    const volatility = me.momentumHistory.length > 3
      ? me.momentumHistory.reduce((a, b) => a + b, 0) / me.momentumHistory.length
      : 0

    // Spike level: how far above the moving average (0 = normal, 1+ = massive spike)
    const spikeThreshold = Math.max(me.volumeMA * 2.5, 50)  // at least 2.5x average
    const spikeLevel = me.volumeMA > 10
      ? clamp((vol - spikeThreshold) / Math.max(spikeThreshold, 1), 0, 1)
      : 0
    // Also trigger percussion on sharp momentum (even without volume data)
    const momentumSpike = clamp((momentumAbs - 1.2) / 2.0, 0, 1)
    const percLevel = Math.max(spikeLevel, momentumSpike * 0.7)

    // Fire percussion if spike detected (with debounce)
    if (percLevel > 0.15 && now - me.lastPercTime > 0.18) {
      playPercussion(ctx, master, percLevel, tick.momentum, intensity)
      me.lastPercTime = now
    }

    // ─── Gentle background hi-hat pulse at high volatility ───
    if (volatility > 0.8 && percLevel < 0.15 && Math.random() < 0.25 && now - me.lastPercTime > 0.3) {
      playPercussion(ctx, master, 0.12, 0, intensity)
      me.lastPercTime = now
    }

    // ─── Melodic motion (Sakamoto: sparse, purposeful intervals) ───
    const rawTarget = rel * 120 + tick.momentum * 4 + 12  // wider mapping range
    const snappedTarget = quantizeSemitone(rawTarget, genre.scale)
    const walked = melodyStep(me.lastSemitone, snappedTarget, genre.scale, gm.stepBias)

    // Sakamoto: occasional octave displacement for emotional punctuation
    let semitone = walked
    if (Math.random() < 0.08 && Math.abs(walked - me.lastSemitone) < 3) {
      semitone = walked + (Math.random() > 0.5 ? 12 : -12) // octave jump
    }

    const direction = semitone > me.lastSemitone ? 1 : semitone < me.lastSemitone ? -1 : 0
    me.prevDirection = direction
    me.lastSemitone = walked // store unmodified for continuity
    me.phrasePosition++

    const finalSemitone = semitone * (1 - fidelity) + rawTarget * fidelity
    const rootFreq = genre.baseHz * Math.pow(2, finalSemitone / 12)

    // ─── Humanize timing (±15-40ms jitter) ───
    const humanize = (Math.random() - 0.5) * 0.03 * (1 + intensity * 0.3)
    const startBase = now + Math.max(0, humanize)

    // ─── Velocity: volume-driven dynamics ───
    // Volume spike makes notes louder; momentum makes them brighter & sharper
    const volumeVelocity = me.volumeMA > 10
      ? clamp(vol / Math.max(me.volumeMA, 1), 0.3, 3.0)  // relative to average
      : 1.0
    const volBoost = (volumeVelocity - 1) * 0.04  // above-average = louder
    const baseGain = 0.018 + (volBoost + returnBoost * 0.03) * (0.5 + intensity * 0.5)
      + spikeLevel * 0.025  // volume spike adds punch to melody too

    // ─── Note length: volume spike = staccato (urgent), calm = legato ───
    const articulation = 1 - Math.min(momentumAbs / 2.2, 1)
    const spikeStaccato = spikeLevel > 0.3 ? (1 - spikeLevel * 0.4) : 1  // volume spike → shorter notes
    const baseLength = genre.release * (0.8 + articulation * 0.8) * gm.legato * spikeStaccato
    // Zimmer: high intensity = shorter, sharper notes
    const noteLength = baseLength * (1.2 - intensity * 0.5)

    // ─── Arpeggio sub-notes ───
    const arpDef = ARP_PATTERNS[gm.arpPattern] ?? ARP_PATTERNS.chord
    // More layers when volume spikes or high intensity
    const noteCount = (intensity > 0.6 || spikeLevel > 0.5) ? gm.noteCount + 1 : gm.noteCount

    // Send to reverb + delay for ambient space
    const reverbSend = reverbRef.current
    const delaySend = delayNodeRef.current

    for (let n = 0; n < noteCount; n++) {
      const arpIdx = (me.arpStep + n) % arpDef.length
      const arpDegrees = arpDef[arpIdx]
      // Eno: irregular sub-note spacing
      const subDelay = n * gm.subNoteSpacing * (0.85 + Math.random() * 0.3)
      const startTime = startBase + subDelay
      const thisNoteLen = noteLength * (1 - n * 0.06)

      for (const degree of arpDegrees) {
        const interval = degree < genre.scale.length ? genre.scale[degree] : genre.harmony[degree % genre.harmony.length]
        const noteFreq = Math.max(60, Math.min(2100, rootFreq * Math.pow(2, interval / 12)))

        // Sakamoto: gentle harmony, not always present
        const useHarmony = Math.random() < (0.3 + intensity * 0.4)
        const harmonyInterval = genre.harmony[(me.phrasePosition + n) % genre.harmony.length]
        const harmonyFreq = Math.max(60, Math.min(2100, rootFreq * Math.pow(2, harmonyInterval / 12)))

        const filter = ctx.createBiquadFilter()
        filter.type = 'lowpass'
        // Volume spike opens filter wide (brighter, more urgent timbre)
        const filterFreq = 280 + genre.brightness * 1800 + intensity * 2000 + returnBoost * 1200 + spikeLevel * 2500
        filter.frequency.setValueAtTime(filterFreq, startTime)
        filter.Q.setValueAtTime(0.5 + genre.brightness * 3, startTime)
        // Eno: filter slowly closes during note (natural decay)
        filter.frequency.exponentialRampToValueAtTime(Math.max(80, filterFreq * 0.25), startTime + thisNoteLen)

        const osc = ctx.createOscillator()
        const gain1 = ctx.createGain()
        osc.type = genre.waveform
        // Eno: slight random detune for warmth
        osc.detune.setValueAtTime(-genre.detuneCents + (Math.random() - 0.5) * 8, startTime)
        osc.frequency.setValueAtTime(noteFreq, startTime)

        // Sakamoto: soft attack, gentle envelope
        const attack = genre.attack * (0.8 + Math.random() * 0.4)
        const noteGain = baseGain / Math.max(1, arpDegrees.length * 0.6)
        gain1.gain.setValueAtTime(0.0001, startTime)
        gain1.gain.exponentialRampToValueAtTime(noteGain, startTime + attack)
        // Natural decay curve (not linear — more piano-like)
        gain1.gain.setTargetAtTime(noteGain * 0.4, startTime + attack, thisNoteLen * 0.3)
        gain1.gain.exponentialRampToValueAtTime(0.0001, startTime + thisNoteLen)

        // Vibrato — subtle, increases with intensity (Zimmer: tension vibrato)
        const vibrato = ctx.createOscillator()
        const vibratoGain = ctx.createGain()
        vibrato.type = 'sine'
        vibrato.frequency.setValueAtTime(genre.vibratoRate * (0.8 + intensity * 0.5), startTime)
        vibratoGain.gain.setValueAtTime(genre.vibratoDepth * (0.5 + intensity * 1.0), startTime)
        vibrato.connect(vibratoGain)
        vibratoGain.connect(osc.frequency)

        osc.connect(gain1)
        gain1.connect(filter)
        filter.connect(master)
        // Send to reverb and delay for ambient space
        if (reverbSend) filter.connect(reverbSend)
        if (delaySend && n === 0) filter.connect(delaySend) // only first note echoes

        vibrato.start(startTime)
        osc.start(startTime)
        const stopAt = startTime + thisNoteLen + 0.1
        osc.stop(stopAt)
        vibrato.stop(stopAt)

        // Harmony layer (Sakamoto: sparse, conditional)
        if (useHarmony) {
          const osc2 = ctx.createOscillator()
          const gain2 = ctx.createGain()
          osc2.type = genre.waveform
          osc2.detune.setValueAtTime(genre.detuneCents + (Math.random() - 0.5) * 6, startTime)
          osc2.frequency.setValueAtTime(harmonyFreq, startTime)
          const harmGain = noteGain * genre.harmonicBlend * (0.3 + Math.random() * 0.4)
          gain2.gain.setValueAtTime(0.0001, startTime)
          gain2.gain.exponentialRampToValueAtTime(harmGain, startTime + attack * 1.3)
          gain2.gain.setTargetAtTime(harmGain * 0.3, startTime + attack * 1.3, thisNoteLen * 0.35)
          gain2.gain.exponentialRampToValueAtTime(0.0001, startTime + thisNoteLen * 0.88)
          osc2.connect(gain2)
          gain2.connect(filter)
          osc2.start(startTime)
          osc2.stop(stopAt)
        }

        // Zimmer: octave doubling at high intensity moments
        if (intensity > 0.7 && n === 0 && degree === 0 && Math.random() < 0.35) {
          const subOsc = ctx.createOscillator()
          const subGain = ctx.createGain()
          subOsc.type = 'sine'
          subOsc.frequency.setValueAtTime(noteFreq * 0.5, startTime) // octave below
          const subLevel = noteGain * 0.5
          subGain.gain.setValueAtTime(0.0001, startTime)
          subGain.gain.exponentialRampToValueAtTime(subLevel, startTime + attack * 1.8)
          subGain.gain.exponentialRampToValueAtTime(0.0001, startTime + thisNoteLen * 1.2)
          subOsc.connect(subGain)
          subGain.connect(filter)
          if (reverbSend) subGain.connect(reverbSend)
          subOsc.start(startTime)
          subOsc.stop(startTime + thisNoteLen * 1.3)
        }
      }
    }
    me.arpStep = (me.arpStep + noteCount) % arpDef.length

    // ─── Pad drone (Eno: evolving ambient texture) ───
    if (gm.padLevel > 0) {
      const padFreq = Math.max(60, Math.min(800, rootFreq * 0.5))
      if (!me.padOsc || !me.padGain || !me.padFilter) {
        const padOsc = ctx.createOscillator()
        const padGain = ctx.createGain()
        const padFilter = ctx.createBiquadFilter()
        padOsc.type = gm.padWaveform
        padOsc.frequency.setValueAtTime(padFreq, now)
        padFilter.type = 'lowpass'
        padFilter.frequency.setValueAtTime(400, now)
        padFilter.Q.setValueAtTime(0.3, now)
        padGain.gain.setValueAtTime(gm.padLevel * 0.4, now)
        padOsc.connect(padFilter)
        padFilter.connect(padGain)
        padGain.connect(master)
        if (reverbSend) padGain.connect(reverbSend)
        padOsc.start()
        me.padOsc = padOsc
        me.padGain = padGain
        me.padFilter = padFilter
      } else {
        // Eno: slow glide, pad breathes with market
        const padTargetGain = gm.padLevel * (0.2 + intensity * 0.5)
        me.padOsc.frequency.exponentialRampToValueAtTime(padFreq, now + 1.5)
        me.padGain.gain.linearRampToValueAtTime(padTargetGain, now + 0.8)
        me.padFilter.frequency.linearRampToValueAtTime(250 + intensity * 600 + genre.brightness * 400, now + 1.0)
      }
    }
  }

  /** Stop the persistent pad oscillator */
  function stopPad() {
    const me = melodyRef.current
    const ctx = audioCtxRef.current
    if (me.padOsc && ctx) {
      try {
        if (me.padGain) {
          me.padGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.2)
        }
        me.padOsc.stop(ctx.currentTime + 0.25)
      } catch { /* already stopped */ }
    }
    me.padOsc = null
    me.padGain = null
    me.padFilter = null
  }

  function handleTick(tick: QuoteEvent, fromReplay = false) {
    setLatest(tick)
    setMood(getMood(tick))
    if (!fromReplay) {
      pushBuffer(tick)
      updateCandles(tick)
      spawnRipple(tick)
    }

    const alpha = 0.08 + fidelity * 0.52
    const prev = smoothedPriceRef.current ?? tick.price
    const smoothed = prev + alpha * (tick.price - prev)
    smoothedPriceRef.current = smoothed
    const processedPrice = abMode === 'raw' ? tick.price : smoothed

    playTick(tick, processedPrice)
  }

  // Keep refs pointing to the latest closures so stale WS callbacks work
  handleTickRef.current = handleTick

  function clearReplayTimer() {
    if (replayTimerRef.current !== null) {
      window.clearInterval(replayTimerRef.current)
      replayTimerRef.current = null
    }
  }

  function stopWebSocketOnly() {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }

  function stopAll() {
    wantLiveRef.current = false
    clearReplayTimer()
    stopWebSocketOnly()
    stopPad()
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    setIsRunning(false)
    setStatus('Stopped')
    setMode('live')
  }

  function resetStreamStateForSymbol(ticker: string) {
    eventBufferRef.current = []
    basePriceRef.current = null
    smoothedPriceRef.current = null
    stopPad()
    melodyRef.current.lastSemitone = 12
    melodyRef.current.phrasePosition = 0
    melodyRef.current.arpStep = 0
    melodyRef.current.consecutiveSilence = 0
    melodyRef.current.prevDirection = 0
    melodyRef.current.intensityAcc = 0.3
    melodyRef.current.volumeHistory = []
    melodyRef.current.volumeMA = 0
    melodyRef.current.lastPercTime = 0
    melodyRef.current.momentumHistory = []
    setCandles([])
    candlesRef.current = []
    setLatest(null)
    setMood('Calm')
    setRipples([])
    setStatus(`Fresh start: ${ticker}`)
  }

  function connectLive() {
    const ticker = symbol.trim().toUpperCase() || 'AAPL'
    stopWebSocketOnly()
    clearReplayTimer()
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    resetStreamStateForSymbol(ticker)
    connectedSymbolRef.current = ticker
    wantLiveRef.current = true
    setMode('live')
    setStatus(`Connecting ${ticker}...`)

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${protocol}://${API_HOST}/ws/quotes?symbol=${encodeURIComponent(ticker)}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setStatus(`Live stream: ${ticker}`)
      setIsRunning(true)
    }

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as QuoteEvent | { type: string; message: string }
        if ('type' in payload && payload.type === 'error') {
          setStatus(`Stream error: ${payload.message}`)
          return
        }
        handleTickRef.current(payload as QuoteEvent)
      } catch {
        setStatus('Invalid stream payload')
      }
    }

    ws.onclose = () => {
      if (wsRef.current !== ws) return // already replaced by a newer connection
      wsRef.current = null
      setIsRunning(false)
      // Auto-reconnect if user hasn't explicitly stopped
      if (wantLiveRef.current) {
        setStatus('Disconnected — reconnecting...')
        reconnectTimerRef.current = window.setTimeout(() => {
          if (wantLiveRef.current) {
            connectLiveRef.current()
          }
        }, 2000)
      } else {
        setStatus('Disconnected')
      }
    }
    ws.onerror = () => setStatus('WebSocket error')
  }

  // Keep ref up to date so auto-reconnect always calls latest version
  connectLiveRef.current = connectLive

  // Reconnect when symbol changes while running
  useEffect(() => {
    const ticker = symbol.trim().toUpperCase() || 'AAPL'
    if (ticker === connectedSymbolRef.current) return
    if (!isRunning || mode !== 'live') return
    connectLive()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol])

  // ── History mode functions ──────────────────────────────
  async function fetchHistory() {
    const ticker = symbol.trim().toUpperCase() || 'CL'
    setHistoryLoading(true)
    try {
      const apiProtocol = window.location.protocol === 'https:' ? 'https' : 'http'
      const resp = await fetch(`${apiProtocol}://${API_HOST}/api/history/${encodeURIComponent(ticker)}`)
      const data = await resp.json()
      if (data.bars && data.bars.length > 0) {
        setHistoryBars(data.bars)
        setHistoryDay(-1)
        setHistoryTotal(data.bars.length)
        drawHistoryCandles(data.bars, -1)
      } else {
        setHistoryBars([])
        setStatus('No history data available')
      }
    } catch {
      setStatus('Failed to fetch history')
    } finally {
      setHistoryLoading(false)
    }
  }

  function drawHistoryCandles(bars: DayBar[], highlightIdx: number) {
    const canvas = historyCanvasRef.current
    if (!canvas || bars.length === 0) return

    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width < 10 || height < 10) return
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) return

    const isSak = historyStyle === 'sakamoto'
    const bgTop = isSak ? '#0a1520' : '#1a0f08'
    const bgBot = isSak ? '#08131f' : '#12080a'
    const gridColor = isSak ? 'rgba(100,180,220,0.06)' : 'rgba(220,160,80,0.06)'
    const upColor = isSak ? '#4da8c7' : '#e88a3a'
    const downColor = isSak ? '#a0d0e6' : '#c44a2e'
    const wickUp = isSak ? '#6ac0da' : '#f0a050'
    const wickDown = isSak ? '#b8dbe8' : '#d05a38'
    const hlColor = isSak ? 'rgba(100,200,255,0.25)' : 'rgba(255,160,60,0.25)'

    ctx2d.clearRect(0, 0, width, height)
    const grad = ctx2d.createLinearGradient(0, 0, 0, height)
    grad.addColorStop(0, bgTop)
    grad.addColorStop(1, bgBot)
    ctx2d.fillStyle = grad
    ctx2d.fillRect(0, 0, width, height)

    // Grid
    ctx2d.strokeStyle = gridColor
    ctx2d.lineWidth = 1
    for (let x = 0; x < width; x += 32) { ctx2d.beginPath(); ctx2d.moveTo(x, 0); ctx2d.lineTo(x, height); ctx2d.stroke() }
    for (let y = 0; y < height; y += 28) { ctx2d.beginPath(); ctx2d.moveTo(0, y); ctx2d.lineTo(width, y); ctx2d.stroke() }

    const candleBody = Math.max(3, Math.min(9, Math.floor(width / bars.length) - 2))
    const gap = 1
    const step = candleBody + gap
    const totalWidth = bars.length * step
    const offsetX = Math.max(0, width - totalWidth)

    const highs = bars.map(b => b.high)
    const lows = bars.map(b => b.low)
    const maxP = Math.max(...highs)
    const minP = Math.min(...lows)
    const pad = (maxP - minP) * 0.08 + 0.001
    const top = maxP + pad
    const bottom = minP - pad
    const span = top - bottom

    for (let i = 0; i < bars.length; i++) {
      const b = bars[i]
      const cx = offsetX + i * step + candleBody / 2
      const wickTop = ((top - b.high) / span) * height
      const wickBot = ((top - b.low) / span) * height
      const openY = ((top - b.open) / span) * height
      const closeY = ((top - b.close) / span) * height
      const up = b.close >= b.open

      // Highlight played candle
      if (highlightIdx >= 0 && i <= highlightIdx) {
        ctx2d.fillStyle = i === highlightIdx ? hlColor : (isSak ? 'rgba(70,150,200,0.08)' : 'rgba(200,120,40,0.08)')
        ctx2d.fillRect(cx - candleBody / 2 - 1, 0, candleBody + 2, height)
      }

      ctx2d.strokeStyle = up ? wickUp : wickDown
      ctx2d.lineWidth = 1
      ctx2d.beginPath()
      ctx2d.moveTo(cx, wickTop)
      ctx2d.lineTo(cx, wickBot)
      ctx2d.stroke()

      const bodyTop = Math.min(openY, closeY)
      const bodyHeight = Math.max(1, Math.abs(closeY - openY))
      ctx2d.fillStyle = up ? upColor : downColor
      ctx2d.fillRect(cx - candleBody / 2, bodyTop, candleBody, bodyHeight)
    }

    // Progress line
    if (highlightIdx >= 0) {
      const px = offsetX + highlightIdx * step + candleBody / 2
      ctx2d.strokeStyle = isSak ? 'rgba(120,210,255,0.5)' : 'rgba(255,180,80,0.5)'
      ctx2d.lineWidth = 1.5
      ctx2d.setLineDash([4, 3])
      ctx2d.beginPath()
      ctx2d.moveTo(px, 0)
      ctx2d.lineTo(px, height)
      ctx2d.stroke()
      ctx2d.setLineDash([])
    }
  }

  // Redraw history candles when style or day changes
  useEffect(() => {
    if (viewMode === 'history' && historyBars.length > 0) {
      drawHistoryCandles(historyBars, historyDay)
    }
  }, [historyBars, historyDay, historyStyle, viewMode])

  function startHistory() {
    if (historyBars.length === 0) return
    const player = historyPlayerRef.current
    player.setProgressCallback((s) => {
      setHistoryDay(s.currentDay)
      setHistoryPlaying(s.isPlaying)
      setHistoryTotal(s.totalDays)
      if (!s.isPlaying) {
        setStatus('History playback finished')
      }
    })
    player.start(historyBars, historyStyle, historySpeed, volume)
    setHistoryPlaying(true)
    setStatus(`Playing ${historyStyle === 'sakamoto' ? 'Sakamoto Rain' : 'Zimmer F1'}...`)
  }

  function stopHistory() {
    historyPlayerRef.current.stop()
    setHistoryPlaying(false)
    setStatus('History stopped')
  }

  function switchViewMode(m: 'live' | 'history') {
    if (m === viewMode) return
    // Stop current playback
    if (viewMode === 'live' && isRunning) stopAll()
    if (viewMode === 'history' && historyPlaying) stopHistory()
    setViewMode(m)
  }

  // Auto-fetch history data when symbol changes in history mode
  useEffect(() => {
    if (viewMode === 'history') {
      fetchHistory()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, viewMode])

  // Cleanup history player on unmount
  useEffect(() => {
    return () => { historyPlayerRef.current.stop() }
  }, [])

  function start() {
    initAudio()
    connectLive()
  }

  function startReplay(seconds: number) {
    initAudio()
    clearReplayTimer()
    stopWebSocketOnly()

    const now = Date.now()
    const sequence = eventBufferRef.current.filter((x) => x.timestamp >= now - seconds * 1000)
    if (sequence.length < 5) {
      setStatus('Not enough data for replay yet')
      return
    }

    setMode('replay')
    setStatus(`Replaying last ${seconds}s`)
    let idx = 0
    replayTimerRef.current = window.setInterval(() => {
      const current = sequence[idx]
      if (!current) {
        clearReplayTimer()
        setStatus('Replay finished')
        return
      }
      handleTick(current, true)
      idx += 1
    }, 250)
  }

  return (
    <main className={`app-shell ${viewMode === 'history' ? `history-mode history-${historyStyle}` : ''}`} style={sceneStyle}>
      <div className="scene-backdrop" aria-hidden="true">
        <div className="scene-orb scene-orb-primary" />
        <div className="scene-orb scene-orb-secondary" />
        <div className="scene-grid" />
      </div>

      {/* ── View mode toggle pill ── */}
      <div className="view-mode-toggle">
        <div className="view-mode-toggle-inner">
          <button className={`vmt-btn ${viewMode === 'live' ? 'active' : ''}`} onClick={() => switchViewMode('live')}>Live</button>
          <button className={`vmt-btn ${viewMode === 'history' ? 'active' : ''}`} onClick={() => switchViewMode('history')}>History</button>
        </div>
      </div>

      {viewMode === 'live' ? (
        <>
          {/* ── Hero: K-line chart fills first screen ── */}
          <section className="chart-hero panel-card">
            {/* Compact top bar overlaying the chart */}
            <div className="chart-top-bar">
              <select className="compact-select" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                <optgroup label="Futures">
                  <option value="CL">CL — Crude Oil</option>
                  <option value="GC">GC — Gold</option>
                  <option value="SI">SI — Silver</option>
                  <option value="NG">NG — Nat Gas</option>
                  <option value="HG">HG — Copper</option>
                  <option value="ES">ES — S&P 500</option>
                  <option value="NQ">NQ — Nasdaq</option>
                  <option value="YM">YM — Dow Jones</option>
                  <option value="6B">6B — GBP</option>
                  <option value="HSI">HSI — HSI</option>
                </optgroup>
                <optgroup label="US Stocks">
                  <option value="AAPL">AAPL — Apple</option>
                  <option value="TSLA">TSLA — Tesla</option>
                  <option value="NVDA">NVDA — NVIDIA</option>
                  <option value="MSFT">MSFT — Microsoft</option>
                  <option value="AMZN">AMZN — Amazon</option>
                  <option value="GOOGL">GOOGL — Google</option>
                  <option value="META">META — Meta</option>
                  <option value="AMD">AMD — AMD</option>
                  <option value="PLTR">PLTR — Palantir</option>
                  <option value="COIN">COIN — Coinbase</option>
                </optgroup>
              </select>
              <select className="compact-select" value={genreId} onChange={(e) => setGenreId(e.target.value)}>
                {GENRES.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              {!isRunning ? (
                <button className="btn-play" onClick={start}>▶ Click to enjoy~</button>
              ) : (
                <button className="btn-stop" onClick={stopAll} aria-label="Stop">■</button>
              )}
            </div>

            {/* Live price badge */}
            <div className="price-badge">
              {latest && (
                <>
                  <span className="price-symbol">{latest.symbol}</span>
                  <span className="price-value">${latest.price.toFixed(2)}</span>
                  <span className={`price-chg ${latest.chgPct >= 0 ? 'up' : 'down'}`}>
                    {latest.chgPct >= 0 ? '+' : ''}{latest.chgPct.toFixed(2)}%
                  </span>
                  <span className="price-mood">{mood}</span>
                </>
              )}
            </div>

            <canvas ref={chartRef} />
            <div className="chart-overlay" aria-hidden="true">
              {ripples.map((ripple) => (
                <span
                  key={ripple.id}
                  className="tick-ripple"
                  style={{
                    left: `${ripple.x}%`,
                    top: `${ripple.y}%`,
                    width: `${ripple.size}px`,
                    height: `${ripple.size}px`,
                    borderColor: ripple.color,
                    boxShadow: `0 0 18px ${ripple.glow}`,
                  }}
                />
              ))}
            </div>
          </section>

          {/* ── Collapsible settings panel ── */}
          <button className="settings-toggle" onClick={toggleSettings}>
            {showSettings ? '▾ Hide Controls' : '▸ Controls & Settings'}
            <span className="settings-status-hint">{status}</span>
          </button>

          {showSettings && (
            <section className="settings-panel panel-card">
              <div className="settings-section">
                <h3>Sound</h3>
                <div className="settings-row">
                  <label>
                    A/B Mode
                    <select value={abMode} onChange={(e) => setAbMode(e.target.value as ABMode)}>
                      <option value="raw">Raw market</option>
                      <option value="smoothed">Smoothed</option>
                    </select>
                  </label>
                </div>
                <div className="slider-row">
                  <label htmlFor="fidelity">Fidelity</label>
                  <input id="fidelity" type="range" min={0} max={1} step={0.01} value={fidelity} onChange={(e) => setFidelity(Number(e.target.value))} />
                  <span>{Math.round(fidelity * 100)}%</span>
                </div>
                <div className="slider-row">
                  <label htmlFor="volume">Volume</label>
                  <input id="volume" type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
                  <span>{Math.round(volume * 100)}%</span>
                </div>
              </div>

              <div className="settings-section">
                <h3>Replay</h3>
                <div className="action-row">
                  <button onClick={() => startReplay(60)}>60s</button>
                  <button onClick={() => startReplay(120)}>120s</button>
                  <button onClick={() => startReplay(180)}>180s</button>
                  <button onClick={connectLive}>Back To Live</button>
                </div>
              </div>

              <div className="settings-section">
                <h3>Status</h3>
                <div className="status-grid">
                  <div><span className="k">Status</span><span className="v">{status}</span></div>
                  <div><span className="k">Mode</span><span className="v">{mode}</span></div>
                  <div><span className="k">Theory</span><span className="v">{genre.modeName}</span></div>
                  <div><span className="k">Running</span><span className="v">{isRunning ? 'Yes' : 'No'}</span></div>
                  <div><span className="k">Mood</span><span className="v">{mood}</span></div>
                  <div><span className="k">Latest</span><span className="v">{latest ? `$${latest.price.toFixed(2)}` : '--'}</span></div>
                </div>
              </div>
            </section>
          )}
        </>
      ) : (
        <>
          {/* ══════ HISTORY MODE ══════ */}
          <section className="chart-hero panel-card">
            <div className="chart-top-bar">
              <select className="compact-select" value={symbol} onChange={(e) => { if (historyPlaying) stopHistory(); setSymbol(e.target.value); setHistoryBars([]); }}>
                <optgroup label="Futures">
                  <option value="CL">CL — Crude Oil</option>
                  <option value="GC">GC — Gold</option>
                  <option value="SI">SI — Silver</option>
                  <option value="NG">NG — Nat Gas</option>
                  <option value="HG">HG — Copper</option>
                  <option value="ES">ES — S&P 500</option>
                  <option value="NQ">NQ — Nasdaq</option>
                  <option value="YM">YM — Dow Jones</option>
                </optgroup>
                <optgroup label="US Stocks">
                  <option value="TSLA">TSLA — Tesla</option>
                  <option value="NVDA">NVDA — NVIDIA</option>
                  <option value="AMD">AMD — AMD</option>
                  <option value="COIN">COIN — Coinbase</option>
                  <option value="PLTR">PLTR — Palantir</option>
                  <option value="MSTR">MSTR — MicroStrategy</option>
                  <option value="SMCI">SMCI — Super Micro</option>
                  <option value="GME">GME — GameStop</option>
                  <option value="MARA">MARA — Marathon Digital</option>
                  <option value="HOOD">HOOD — Robinhood</option>
                  <option value="RIVN">RIVN — Rivian</option>
                  <option value="UPST">UPST — Upstart</option>
                  <option value="AAPL">AAPL — Apple</option>
                  <option value="MSFT">MSFT — Microsoft</option>
                  <option value="AMZN">AMZN — Amazon</option>
                  <option value="GOOGL">GOOGL — Google</option>
                  <option value="META">META — Meta</option>
                </optgroup>
                <optgroup label="Leveraged ETF">
                  <option value="SOXL">SOXL — 3x Semicond</option>
                  <option value="TQQQ">TQQQ — 3x Nasdaq</option>
                  <option value="SQQQ">SQQQ — -3x Nasdaq</option>
                  <option value="UVXY">UVXY — 1.5x VIX</option>
                </optgroup>
              </select>

              <select className="compact-select" value={historyStyle} onChange={(e) => { if (historyPlaying) stopHistory(); setHistoryStyle(e.target.value as HistoryStyle) }}>
                <option value="sakamoto">Sakamoto</option>
                <option value="zimmer">Zimmer</option>
              </select>

              {!historyPlaying ? (
                <button className="btn-play" onClick={() => { if (historyBars.length === 0) fetchHistory().then(() => setTimeout(startHistory, 200)); else startHistory() }} disabled={historyLoading}>
                  {historyLoading ? '...' : '▶'}
                </button>
              ) : (
                <button className="btn-stop" onClick={stopHistory} aria-label="Stop">■</button>
              )}
            </div>

            {/* History info badge */}
            <div className="price-badge history-badge">
              {historyBars.length > 0 ? (
                <>
                  <span className="price-symbol">{symbol}</span>
                  <span className="price-value">Daily K</span>
                  <span className="price-mood">{historyDay >= 0 ? `Day ${historyDay + 1}/${historyTotal}` : `${historyTotal} days`}</span>
                </>
              ) : (
                <span className="price-idle">{historyLoading ? 'Loading...' : 'Tap ▶ to load'}</span>
              )}
            </div>

            <canvas ref={historyCanvasRef} />

            {/* Progress bar */}
            {historyTotal > 0 && (
              <div className="history-progress">
                <div
                  className="history-progress-fill"
                  style={{ width: `${historyDay >= 0 ? ((historyDay + 1) / historyTotal) * 100 : 0}%` }}
                />
              </div>
            )}
          </section>

          {/* Speed control */}
          <div className="history-controls">
            <span className="hc-label">Speed</span>
            {[0.5, 1, 2].map(s => (
              <button
                key={s}
                className={`hc-speed ${historySpeed === s ? 'active' : ''}`}
                onClick={() => {
                  setHistorySpeed(s)
                  if (historyPlaying) {
                    stopHistory()
                    setTimeout(() => {
                      historyPlayerRef.current.start(historyBars, historyStyle, s, volume)
                      setHistoryPlaying(true)
                    }, 100)
                  }
                }}
              >{s}x</button>
            ))}
            <button className="hc-reload" onClick={fetchHistory} disabled={historyLoading}>↻</button>
            <div className="slider-row" style={{ flex: 1, minWidth: 80 }}>
              <label htmlFor="hvol">Vol</label>
              <input id="hvol" type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => { setVolume(Number(e.target.value)); historyPlayerRef.current.setVolume(Number(e.target.value)) }} />
            </div>
          </div>
        </>
      )}

      <section className="disclaimer-card panel-card" style={{ textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: '1.1rem', color: '#a0dce8' }}>The Sound of Markets</h2>
        <p style={{ margin: '0 0 6px', fontSize: '0.85rem', opacity: 0.8 }}>Every tick has a voice. Stream live prices and let the market sing.</p>
        <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.55 }}>Not an investment advice.</p>
      </section>

      <footer style={{ textAlign: 'center', padding: '10px 12px 20px', color: '#6aa8b8', fontSize: '0.78rem', opacity: 0.75 }}>
        <p style={{ margin: 0 }}>Created by <strong style={{ color: '#a0dce8' }}>Ooopsyi</strong> with massive thanks to <strong style={{ color: '#a0dce8' }}>Claude Opus 4.6</strong>, a real hero to humanity ✨</p>
      </footer>
    </main>
  )
}

export default App
