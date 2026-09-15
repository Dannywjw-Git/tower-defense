// 装饰布局自检 —— node tests/decor-check.mjs
//
// 纯 node、零浏览器、零依赖。验证 src/systems/Decor.js 的布局规则：
//   · 确定性（同一格永远同一结果，否则重布局会闪）
//   · 只落在可建格（不放路径、不放障碍）
//   · 密度在约定范围内
//   · 不越界
//   · density=0 时完全关闭（回退开关）

import { layoutDecor, decorPixelRect, DECOR_DENSITY, DECOR_KINDS } from '../src/systems/Decor.js'
import { buildGrid, PATH, BLOCKED, BUILDABLE } from '../src/systems/MapGrid.js'
import { LEVELS } from '../src/data/levels/index.js'

let pass = 0
const failed = []
const say = (label, ok, extra = '') => {
  if (ok) { pass++; console.log(`  ✅ ${label}${extra ? '  ' + extra : ''}`) }
  else { failed.push(label); console.log(`  ❌ ${label}${extra ? '  ' + extra : ''}`) }
}

console.log('\n──── 装饰布局自检（纯 node）────')

// 用真实关卡数据，而不是编造的假网格
const level = LEVELS[0]
const grid = buildGrid(level)
const rows = grid.length, cols = grid[0].length
const buildableCount = grid.flat().filter(c => c === BUILDABLE).length

const deco = layoutDecor(grid)

say('产出了装饰项', deco.length > 0, `${deco.length} 个`)
say('装饰数量 ≤ 可建格数', deco.length <= buildableCount,
    `${deco.length} ≤ ${buildableCount}`)

// 规则 1：只落在可建格
const wrongCell = deco.filter(d => grid[d.cy][d.cx] !== BUILDABLE)
say('只落在可建格（不在路径/障碍上）', wrongCell.length === 0,
    wrongCell.length ? JSON.stringify(wrongCell.slice(0, 3)) : '')

// 规则 3：确定性 —— 同样输入必须给出完全一样的输出
const again = layoutDecor(grid)
const same = JSON.stringify(deco) === JSON.stringify(again)
say('确定性：两次调用结果完全一致', same)

// 也验证"换个等价但新建的 grid"仍一致（防止依赖对象身份）
const grid2 = buildGrid(level)
say('确定性：新建等价 grid 结果仍一致',
    JSON.stringify(layoutDecor(grid2)) === JSON.stringify(deco))

// 规则 2：密度在合理范围（约 DECOR_DENSITY，容差 ±0.15）
const ratio = deco.length / buildableCount
say(`密度接近约定值 ${DECOR_DENSITY}（±0.15）`,
    Math.abs(ratio - DECOR_DENSITY) < 0.15,
    `实际 ${ratio.toFixed(3)}`)

// 不越界
const oob = deco.filter(d => d.cx < 0 || d.cx >= cols || d.cy < 0 || d.cy >= rows)
say('没有越界项', oob.length === 0)

// 偏移在格内（0.2–0.8），避免装饰跑到相邻格
const badOffset = deco.filter(d => d.ax < 0.2 || d.ax > 0.8 || d.ay < 0.3 || d.ay > 0.8)
say('偏移量在格内合理区间', badOffset.length === 0,
    badOffset.length ? JSON.stringify(badOffset.slice(0, 2)) : '')

// 每个 key 都在种类表里（防止拼错 key 导致贴图缺失）
const validKeys = new Set(DECOR_KINDS.map(k => k.key))
const badKey = deco.filter(d => !validKeys.has(d.key))
say('所有 key 都在 DECOR_KINDS 表内', badKey.length === 0,
    badKey.length ? badKey[0].key : '')

// 种类多样性：不该整张图只有一种装饰
const usedKinds = new Set(deco.map(d => d.key))
say('装饰种类有多样性（≥4 种）', usedKinds.size >= 4, `用了 ${usedKinds.size} 种`)

// 回退开关：density=0 时必须完全关闭
say('density=0 时完全关闭（回退开关有效）', layoutDecor(grid, { density: 0 }).length === 0)

// 尺寸合理：不超过格宽的 60%（否则会明显挡塔）
const tooBig = DECOR_KINDS.filter(k => k.scale > 0.60)
say('所有装饰尺寸 ≤ 格宽 60%', tooBig.length === 0,
    tooBig.length ? tooBig.map(k => k.key).join(',') : '')

// 像素换算（渲染层用）
if (deco.length) {
  const r = decorPixelRect(deco[0], 0, 0, 100)
  say('decorPixelRect 换算正确',
      r.w === 100 * deco[0].scale && r.x === deco[0].cx * 100 + deco[0].ax * 100,
      `x=${r.x.toFixed(1)} y=${r.y.toFixed(1)} w=${r.w}`)
}

// 两张地图都要能正常算（不能只对 level-01 有效）
if (LEVELS[1]) {
  const g2 = buildGrid(LEVELS[1])
  const d2 = layoutDecor(g2)
  const ok2 = d2.length > 0 && d2.every(d => g2[d.cy][d.cx] === BUILDABLE)
  say('第二张地图也满足全部规则', ok2, `${d2.length} 个装饰`)
}

console.log(`\n──── 汇总 ────`)
console.log(`通过 ${pass} · 失败 ${failed.length}`)
if (failed.length) console.log('失败项: ' + failed.join(' | '))
process.exit(failed.length ? 1 : 0)
