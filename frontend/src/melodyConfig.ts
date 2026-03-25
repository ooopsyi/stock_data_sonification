/**
 * ═══════════════════════════════════════════════════════════
 *  Melody Engine Configuration
 *  修改此文件可实时调整音乐引擎行为 (Vite HMR 自动重载)
 * ═══════════════════════════════════════════════════════════
 *
 *  参数说明:
 *  ─────────────────────────────────────────────────────────
 *  arpPattern      琶音模式 — 可选: 'up' | 'down' | 'upDown' | 'chord' | 'broken' | 'fifths'
 *  noteCount       每次 tick 播放的子音符数量 (1=单音, 2-4=琶音)
 *  legato          连奏系数 (1.0=正常, >1=音符重叠, <1=断奏)
 *  stepBias        旋律级进倾向 (0=随机跳跃, 1=严格级进)
 *  padLevel        Background Pad 音量 (0=关闭, 0.01-0.20 推荐范围)
 *  padWaveform     Pad 波形 — 'sine' | 'triangle' | 'sawtooth' | 'square'
 *  subNoteSpacing  琶音子音符间距 (秒), 越小越紧凑
 */

export interface GenreMelodyConfig {
  arpPattern: string
  noteCount: number
  legato: number
  stepBias: number
  padLevel: number
  padWaveform: OscillatorType
  subNoteSpacing: number
}

// ─── 每个 Genre 的旋律配置 ─────────────────────────────────
// padLevel: 当前值偏大的话可以调小, 推荐 0.02 ~ 0.08
export const GENRE_MELODY: Record<string, GenreMelodyConfig> = {
  ambient: {
    arpPattern: 'upDown',
    noteCount: 3,
    legato: 1.8,
    stepBias: 0.85,
    padLevel: 0.06,        // ← 原 0.12, 减半
    padWaveform: 'sine',
    subNoteSpacing: 0.18,
  },
  classical: {
    arpPattern: 'up',
    noteCount: 3,
    legato: 1.4,
    stepBias: 0.75,
    padLevel: 0.03,        // ← 原 0.06
    padWaveform: 'triangle',
    subNoteSpacing: 0.13,
  },
  jazz: {
    arpPattern: 'broken',
    noteCount: 2,
    legato: 1.2,
    stepBias: 0.55,
    padLevel: 0.02,        // ← 原 0.04
    padWaveform: 'triangle',
    subNoteSpacing: 0.1,
  },
  lofi: {
    arpPattern: 'fifths',
    noteCount: 2,
    legato: 1.6,
    stepBias: 0.8,
    padLevel: 0.05,        // ← 原 0.10
    padWaveform: 'sine',
    subNoteSpacing: 0.16,
  },
  downtempo: {
    arpPattern: 'fifths',
    noteCount: 2,
    legato: 1.5,
    stepBias: 0.8,
    padLevel: 0.04,        // ← 原 0.09
    padWaveform: 'sine',
    subNoteSpacing: 0.17,
  },
  orchestral: {
    arpPattern: 'chord',
    noteCount: 1,
    legato: 1.6,
    stepBias: 0.7,
    padLevel: 0.04,        // ← 原 0.08
    padWaveform: 'triangle',
    subNoteSpacing: 0.12,
  },
  // ─── 以下 genre 没有配置则使用 DEFAULT ───────────────────
  // 如需为 techno / house / dnb 等添加配置, 在这里加即可
}

// 未配置的 genre 使用此默认值 (无琶音, 无 pad)
export const DEFAULT_GENRE_MELODY: GenreMelodyConfig = {
  arpPattern: 'chord',
  noteCount: 1,
  legato: 1.0,
  stepBias: 0.5,
  padLevel: 0.0,           // 默认关闭 pad
  padWaveform: 'sine',
  subNoteSpacing: 0.12,
}
