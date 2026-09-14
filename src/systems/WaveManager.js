// 波次推进 —— 纯逻辑，不依赖 Phaser
//
// 用法：每帧 `update(dt)`，返回本帧要生成的敌人描述；由调用方创建实体。
// 本模块不持有实体引用，因此可在无浏览器环境下测试。

/**
 * HP 随波次线性增长。
 * spec §4.2 **明确不用指数**——指数曲线会让第 10 波突然无解，那是数值设计偷懒。
 */
export const HP_GROWTH_PER_WAVE = 0.18

export function hpForWave(baseHp, wave) {
  const w = Math.max(1, wave)
  return Math.round(baseHp * (1 + HP_GROWTH_PER_WAVE * (w - 1)))
}

export const PHASE = {
  /** 波间准备倒计时 */
  PREP: 'prep',
  /** 正在刷怪 */
  SPAWNING: 'spawning',
  /** 全部波次已刷完 */
  DONE: 'done',
}

export class WaveManager {
  /**
   * @param {object[]} waves 波次表：[{ type, count, baseHp, interval }]
   * @param {{prepTime?:number, waveInterval?:number}} [opts]
   */
  constructor(waves = [], opts = {}) {
    this.waves = waves
    /** 首波准备时间 —— 教学友好，让玩家放得下第一座塔 */
    this.prepTime = opts.prepTime ?? 15
    /** 波与波之间的间隔 */
    this.waveInterval = opts.waveInterval ?? 8

    this.wave = 0                 // 当前波号，0 = 尚未开始
    this.spawnedInWave = 0
    this.timer = this.prepTime
    this.phase = waves.length ? PHASE.PREP : PHASE.DONE
  }

  get total() { return this.waves.length }
  get current() { return this.waves[this.wave - 1] || null }

  /** 距下一波开始的秒数（仅 PREP 阶段有意义） */
  get countdown() {
    return this.phase === PHASE.PREP ? Math.max(0, this.timer) : 0
  }

  get isDone() { return this.phase === PHASE.DONE }

  /**
   * 推进 dt 秒。
   * @returns {{spawns:object[], startedWave:number|null, allSpawned:boolean}}
   */
  update(dt) {
    const spawns = []
    let startedWave = null

    if (this.phase === PHASE.DONE) {
      return { spawns, startedWave, allSpawned: true }
    }

    this.timer -= dt

    if (this.phase === PHASE.PREP) {
      if (this.timer > 0) {
        return { spawns, startedWave, allSpawned: false }
      }
      // 开始新一波。
      // ⚠️ **不重置 timer** —— 它此刻是负数，代表准备期内"多出来的"时间，
      //    必须留给下面的刷怪循环。曾经在这里写 `this.timer = 0`，
      //    结果大 dt（卡顿帧）会丢掉全部溢出的刷怪额度：
      //    dt=100s、间隔 0.1s 时只刷 1 只而不是 10 只。
      this.wave += 1
      this.spawnedInWave = 0
      this.phase = PHASE.SPAWNING
      startedWave = this.wave
    }

    if (this.phase === PHASE.SPAWNING) {
      const w = this.current
      const interval = w.interval ?? 0.8

      // while + 累加，保证 dt 很大时也能一次补足（不丢怪）
      while (this.spawnedInWave < w.count && this.timer <= 0) {
        spawns.push({
          type: w.type,
          wave: this.wave,
          hp: hpForWave(w.baseHp ?? 60, this.wave),
        })
        this.spawnedInWave += 1
        this.timer += interval
      }

      if (this.spawnedInWave >= w.count) {
        // dt 极大时 timer 可能仍是深负数；clamp 到 0，
        // 否则"下一波已迟到很久"会让下一波瞬间全部涌出。
        if (this.timer < 0) this.timer = 0

        if (this.wave >= this.waves.length) {
          this.phase = PHASE.DONE
          return { spawns, startedWave, allSpawned: true }
        }
        this.phase = PHASE.PREP
        this.timer = this.waveInterval
      }
    }

    return { spawns, startedWave, allSpawned: this.phase === PHASE.DONE }
  }
}

/** 只推进计时器、不生成任何敌人的测试辅助：拿到下一波还需多少秒 */
export function secondsUntilWave(wm) {
  if (wm.phase === PHASE.DONE) return Infinity
  if (wm.phase === PHASE.SPAWNING) return 0
  return Math.max(0, wm.timer)
}
