// 音效 —— 用 Web Audio API **合成**，零素材依赖
//
// 为什么合成而不是加载音频文件：
//   1. spec §6.6 要求「素材未到位时不阻塞」—— 合成音效完全不需要素材文件
//   2. 将来接入 Kenney 音频时，只替换本文件实现，**调用点不变**
//
// ⚠️ 浏览器音频策略（spec §4.5）：
//    必须**用户首次交互后**才能播放。iOS / 微信尤其严格，
//    所以 `unlock()` 必须在「开始游戏」按钮的点击处理里调用。
//
// 本模块**永不抛错**：没有音频支持时静默降级，绝不影响游玩。

let ctx = null
let muted = false
let lastShootAt = 0

/** 在用户手势里调用一次即可；重复调用是安全的 */
export function unlock() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return true
  }
  try {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext
    if (!AC) return false
    ctx = new AC()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return true
  } catch {
    return false
  }
}

export function isAvailable() { return ctx !== null }
export function isMuted() { return muted }
export function setMuted(v) { muted = !!v }

function tone({ freq = 440, dur = 0.08, type = 'square', gain = 0.05, slideTo = null }) {
  if (!ctx || muted) return
  try {
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur)
    g.gain.setValueAtTime(gain, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g)
    g.connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  } catch {
    // 音频失败绝不影响游戏
  }
}

export const SFX = {
  build:   () => tone({ freq: 520, dur: 0.09, type: 'square',   gain: 0.05 }),
  sell:    () => tone({ freq: 300, dur: 0.10, type: 'triangle', gain: 0.05, slideTo: 180 }),
  upgrade: () => tone({ freq: 660, dur: 0.10, type: 'square',   gain: 0.05, slideTo: 880 }),

  /** 节流：多座塔同时开火时避免变成噪音墙 */
  shoot: () => {
    const now = Date.now()
    if (now - lastShootAt < 80) return
    lastShootAt = now
    tone({ freq: 880, dur: 0.03, type: 'square', gain: 0.016 })
  },

  kill:  () => tone({ freq: 220, dur: 0.07, type: 'sawtooth', gain: 0.035, slideTo: 120 }),
  tap:   () => tone({ freq: 1200, dur: 0.03, type: 'sine',    gain: 0.04 }),
  leak:  () => tone({ freq: 160, dur: 0.28, type: 'sawtooth', gain: 0.07, slideTo: 70 }),
  wave:  () => tone({ freq: 440, dur: 0.14, type: 'triangle', gain: 0.05, slideTo: 660 }),

  win: () => {
    tone({ freq: 523, dur: 0.14, type: 'triangle', gain: 0.06 })
    setTimeout(() => tone({ freq: 784, dur: 0.24, type: 'triangle', gain: 0.06 }), 130)
  },
  lose: () => {
    tone({ freq: 330, dur: 0.18, type: 'sawtooth', gain: 0.06 })
    setTimeout(() => tone({ freq: 196, dur: 0.38, type: 'sawtooth', gain: 0.06 }), 170)
  },
}
