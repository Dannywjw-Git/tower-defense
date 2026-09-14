// 索敌策略 —— 纯函数
//
// 约定：敌人需带 `gx`/`gy`（**格坐标**）与 `pathDist`（已走格数）；
//       塔需带 `gx`/`gy` 与 `range`（**格**，与路径单位统一）。
//
// ⚠️ 一律用 gx/gy，**不要**用 Phaser GameObject 自带的 x/y ——
//    后者是像素坐标，与格坐标相差一个 cell 的倍数，混用是典型的隐蔽 bug。
// 本模块不依赖 Phaser，也不依赖 PathMath。

export const STRATEGY = {
  /** 离终点最近 —— 塔防默认，直接减少漏怪 */
  FIRST: 'first',
  /** 离本塔最近 */
  CLOSEST: 'closest',
  /** 当前 HP 最高 */
  STRONGEST: 'strongest',
}

function dist2(ax, ay, bx, by) {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

export function inRange(tower, enemy) {
  return dist2(tower.gx, tower.gy, enemy.gx, enemy.gy) <= tower.range * tower.range
}

/**
 * 选出一个目标；射程内无有效目标时返回 null。
 * 无效目标 = alive === false 或 hp <= 0。
 */
export function pickTarget(tower, enemies, strategy = STRATEGY.FIRST) {
  let best = null
  let bestScore = -Infinity

  for (const e of enemies) {
    if (!e || e.alive === false || !(e.hp > 0)) continue
    if (!inRange(tower, e)) continue

    let score
    switch (strategy) {
      case STRATEGY.FIRST:     score = e.pathDist; break
      case STRATEGY.CLOSEST:   score = -dist2(tower.gx, tower.gy, e.gx, e.gy); break
      case STRATEGY.STRONGEST: score = e.hp; break
      default: throw new Error(`未知索敌策略: ${strategy}`)
    }

    // 严格大于：并列时取先遇到的，保证结果稳定可测
    if (score > bestScore) {
      bestScore = score
      best = e
    }
  }

  return best
}
