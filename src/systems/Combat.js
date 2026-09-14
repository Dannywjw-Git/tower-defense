// 伤害分配 —— 纯函数，不依赖 Phaser
//
// 输入：一次开火事件 + 场上敌人
// 输出：伤害分配表 [{ enemy, damage }]
//
// 只负责"谁该挨多少伤害"，**不执行扣血**（扣血由调用方做，便于单测）。
//
// 三种多目标机制（spec §4.1）彼此独立，可同时生效：
//   splash  溅射 —— 主目标周围
//   chain   连锁 —— 从主目标逐跳找最近目标（须在塔的射程内）
//   pierce  穿透 —— 沿路径更靠前的目标

/** 溅射对主目标以外的伤害折扣 */
export const SPLASH_RATIO = 0.6

function dist(a, b) {
  return Math.hypot(a.gx - b.gx, a.gy - b.gy)
}

export function allocateDamage(shot, enemies) {
  const alive = enemies.filter(e => e && e.alive !== false && e.hp > 0)
  const table = new Map()

  const add = (enemy, damage) => {
    if (!enemy || !(damage > 0)) return
    table.set(enemy, (table.get(enemy) || 0) + damage)
  }

  const target = shot.target
  const tower = shot.tower
  add(target, shot.damage)

  // ── 溅射 ──
  if (shot.splash > 0 && target) {
    for (const e of alive) {
      if (e === target) continue
      if (dist(e, target) <= shot.splash) add(e, shot.damage * SPLASH_RATIO)
    }
  }

  // ── 连锁 ──
  if (shot.chain > 1 && target) {
    const hit = new Set([target])
    let from = target
    let dmg = shot.damage

    for (let hop = 0; hop < shot.chain - 1; hop++) {
      dmg *= shot.chainFalloff
      let best = null
      let bestD = Infinity

      for (const e of alive) {
        if (hit.has(e)) continue
        // 每一跳都必须仍在塔的射程内，否则闪电会"飞出屏幕"
        if (tower && dist(e, tower) > tower.range) continue
        const d = dist(e, from)
        if (d < bestD) { bestD = d; best = e }
      }

      if (!best) break
      add(best, dmg)
      hit.add(best)
      from = best
    }
  }

  // ── 穿透 ──
  if (shot.pierce > 1 && target && tower) {
    const others = alive
      .filter(e => e !== target && dist(e, tower) <= tower.range)
      .sort((a, b) => b.pathDist - a.pathDist)   // 优先打走得最远的
    for (const e of others.slice(0, shot.pierce - 1)) add(e, shot.damage)
  }

  return [...table].map(([enemy, damage]) => ({ enemy, damage }))
}

/** 应用一次伤害（含护甲减免与保底 1 点）；返回是否击杀 */
export function applyDamage(enemy, damage, ignoreArmor = false) {
  if (!enemy || enemy.alive === false || enemy.hp <= 0) return false

  const armor = ignoreArmor ? 0 : (enemy.armor || 0)
  const real = Math.max(1, Math.round(damage) - armor)   // 保底 1：避免完全免疫

  enemy.hp -= real
  if (enemy.hp <= 0) {
    enemy.hp = 0
    enemy.alive = false
    return true
  }
  return false
}
