// 数值自洽性分析 —— node tests/balance-check.mjs
//
// **纯 node，不需要浏览器**：被分析的模块（WaveManager / Economy / data / PathMath）
// 全部不 import Phaser，所以可以直接在 node 里跑。
//
// 目的：在**玩家试玩之前**发现数值的数量级错误
//   （例如"第 3 波必死"或"后期经济崩盘"）。
//
// ⚠️ 这是**解析式近似**，不是模拟：
//   它能发现 10 倍级的问题，发现不了 20% 的偏差。真正的平衡只能靠试玩。

import { hpForWave } from '../src/systems/WaveManager.js'
import { buildCost, levelStats } from '../src/data/towers.js'
import { enemyDef } from '../src/data/enemies.js'
import { buildPath } from '../src/systems/PathMath.js'
import { LEVELS } from '../src/data/levels/index.js'

const clearBonus = (wave) => 20 + wave * 5     // 与 Economy.waveClearBonus 一致

/** 塔的**单体**等效 DPS
 *
 *  ⚠️ 这里刻意**不折算**溅射/连锁的多目标收益 —— 真实通关测试（playthrough.mjs）暴露出：
 *     初版给炮塔乘了 1.8 的溅射倍率，得出 25.9 DPS，于是把它选为"性价比最优"；
 *     但**只有 1 只敌人时溅射毫无用处**，炮塔真实单体 DPS 只有 14.4（18×0.8），
 *     比箭塔的 16 还低，造价却是 1.6 倍。
 *     用单体值做下界估计，才能避免"推荐一个打不过第一波的塔"。 */
function towerDps(typeId) {
  const s = levelStats(typeId, 1)
  const base = s.damage * s.fireRate
  const dot = s.poison || 0                    // 毒是额外的持续伤害，单体也生效
  return base + dot
}

/** 性价比最优的塔（DPS per gold） */
function bestValueTower() {
  let best = null
  for (const id of ['arrow', 'cannon', 'ice', 'tesla', 'poison', 'sniper']) {
    const v = towerDps(id) / buildCost(id)
    if (!best || v > best.value) best = { id, value: v, dps: towerDps(id), cost: buildCost(id) }
  }
  return best
}

const best = bestValueTower()
console.log('\n════════ 数值自洽性分析（解析式近似）════════\n')
console.log(`性价比最高的塔：${best.id}　单塔 DPS≈${best.dps.toFixed(1)}　造价 ${best.cost}　` +
            `性价比 ${best.value.toFixed(3)} DPS/金币\n`)

let problems = 0

for (const level of LEVELS) {
  const path = buildPath(level.path)
  console.log(`\n──── ${level.name}（${level.id}）　路径 ${path.total} 格　${level.waves.length} 波 ────\n`)
  console.log('  波  类型    数量  HP/只   总HP   需求DPS  可负担DPS  余量    判定')
  console.log('  ' + '─'.repeat(74))

  // 累计收入（起始金币 + 前面各波的击杀赏金 + 清空奖励）
  let income = level.startGold

  level.waves.forEach((w, i) => {
    const wave = i + 1
    const def = enemyDef(w.type)
    const hp = hpForWave(w.baseHp ?? def.hp, wave)
    const totalHp = hp * w.count

    // 单只敌人在场时间（秒）
    const travelSec = path.total / def.speed
    const interval = w.interval ?? 0.8

    // 判据：塔必须在线性集火模型下，赶在最后一只走完前把全部敌人杀完
    //   需要时间 = 总HP / D
    //   可用时间 = (count−1) × interval + 单只在场时间
    const availTime = (w.count - 1) * interval + travelSec
    const needDps = totalHp / availTime

    // 经济：本波开始时玩家累计已获得的金币
    if (i > 0) {
      const prev = level.waves[i - 1]
      income += prev.count * enemyDef(prev.type).bounty
      income += clearBonus(i)
    }

    // ⚠️ 关键修正：DPS 取决于**累计投入**，不是当前余额 ——
    //    塔是一次投入、永久输出。初版把「剩余金币」当成「总投入」，
    //    算出「后期只有需求的 20%、必死」的**错误结论**。
    const INVEST_RATE = 0.8          // 玩家会把大部分收入变成塔
    const dpsOptimistic = (income / best.cost) * best.dps
    const dpsRealistic = (income * INVEST_RATE / best.cost) * best.dps

    const margin = dpsRealistic / needDps
    let verdict
    if (margin >= 1.5) verdict = '✅ 宽裕'
    else if (margin >= 1.0) verdict = '✅ 够用'
    else if (margin >= 0.75) verdict = '⚠️ 偏紧'
    else { verdict = '❌ 不足'; problems++ }

    console.log(`  ${String(wave).padStart(2)}  ${w.type.padEnd(7)} ${String(w.count).padStart(3)}  ` +
                `${String(hp).padStart(5)}  ${String(totalHp).padStart(6)}  ` +
                `${needDps.toFixed(1).padStart(7)}  ${dpsRealistic.toFixed(1).padStart(9)}  ` +
                `${(margin * 100).toFixed(0).padStart(4)}%  ${verdict}`)
  })
}

console.log('\n════════ 结论 ════════\n')
if (problems === 0) {
  console.log('✅ 没有发现数量级不匹配的波次。')
} else {
  console.log(`⚠️ 有 ${problems} 个波次的「可负担 DPS」低于「需求 DPS」——`)
  console.log('   这**不一定**是错误：玩家可以升级已有塔（DPS/金币 比建新塔更高），')
  console.log('   而且协同加成、溅射、减速都会实际提高输出。但它值得试玩时重点观察。')
}
console.log('')
console.log('再次强调：这是解析式近似。真正的平衡只能靠试玩 —— 见 docs/ACCEPTANCE.md。')
