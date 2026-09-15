// 图标模块自检 —— node tests/icon-check.mjs
//
// 目的（ponytail：非平凡逻辑要留一个最小可运行检查）：
//   1. 6 种图标各自**真的画了指令**（不是空函数）
//   2. 6 种图标的绘制指令**互不相同**（否则玩家仍分不清）
//   3. 未知图标不静默什么都不画（要有退化行为）
//
// 不依赖 Phaser：用一个**假的 Graphics** 记录调用即可。
// 这样这个检查是纯 node、零浏览器、零依赖，任何时候都能跑。

import { drawTowerIcon, ICON_IDS } from '../src/systems/TowerIcon.js'

/** 记录所有调用的假 Graphics —— 只实现 drawTowerIcon 用到的那几个方法 */
function fakeGraphics() {
  const calls = []
  const rec = (name) => (...args) => { calls.push({ name, args }); return api }
  const api = {
    calls,
    clear: rec('clear'),
    lineStyle: rec('lineStyle'),
    fillStyle: rec('fillStyle'),
    fillTriangle: rec('fillTriangle'),
    fillCircle: rec('fillCircle'),
    strokeCircle: rec('strokeCircle'),
    lineBetween: rec('lineBetween'),
    fillRect: rec('fillRect'),
    beginPath: rec('beginPath'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    strokePath: rec('strokePath'),
  }
  return api
}

/** 指纹：忽略 clear/lineStyle/fillStyle 这类样式调用，只看**几何**调用 */
function fingerprint(calls) {
  const STYLE = new Set(['clear', 'lineStyle', 'fillStyle'])
  return calls
    .filter(c => !STYLE.has(c.name))
    .map(c => `${c.name}(${c.args.map(n => (typeof n === 'number' ? n.toFixed(2) : n)).join(',')})`)
    .join('|')
}

let pass = 0
const failed = []
const say = (label, ok, extra = '') => {
  if (ok) { pass++; console.log(`  ✅ ${label}${extra ? '  ' + extra : ''}`) }
  else { failed.push(label); console.log(`  ❌ ${label}${extra ? '  ' + extra : ''}`) }
}

console.log('\n──── 塔图标自检（纯 node）────')

const prints = new Map()
for (const id of ICON_IDS) {
  const g = fakeGraphics()
  drawTowerIcon(g, id, 0, 0, 10, 0x0b0b0f)
  const geom = g.calls.filter(c => !['clear', 'lineStyle', 'fillStyle'].includes(c.name))
  prints.set(id, fingerprint(g.calls))
  say(`${id} 画出了几何指令`, geom.length > 0, `指令数=${geom.length}`)
}

const uniq = new Set(prints.values())
say('6 种图标互不相同（形状可区分）', uniq.size === ICON_IDS.length,
    `不同图标 ${uniq.size}/${ICON_IDS.length}`)

// 退化行为：未知图标不能静默无输出
{
  const g = fakeGraphics()
  drawTowerIcon(g, 'no-such-icon', 0, 0, 10, 0xffffff)
  const geom = g.calls.filter(c => !['clear', 'lineStyle', 'fillStyle'].includes(c.name))
  say('未知图标有退化输出（不静默）', geom.length > 0, `指令数=${geom.length}`)
}

// 尺寸随半径缩放：半径翻倍，几何坐标也应翻倍（否则塔升级后图标不跟着变）
{
  const small = fakeGraphics(); drawTowerIcon(small, 'arrow', 0, 0, 5, 0xffffff)
  const big = fakeGraphics();   drawTowerIcon(big, 'arrow', 0, 0, 10, 0xffffff)
  const maxAbs = (g) => Math.max(...g.calls
    .filter(c => !['clear', 'lineStyle', 'fillStyle'].includes(c.name))
    .flatMap(c => c.args.filter(a => typeof a === 'number').map(Math.abs)))
  const ratio = maxAbs(big) / maxAbs(small)
  say('图标随半径缩放（塔升级后跟着变大）', Math.abs(ratio - 2) < 0.01, `缩放比=${ratio.toFixed(3)}`)
}

console.log(`\n──── 汇总 ────`)
console.log(`通过 ${pass} · 失败 ${failed.length}`)
if (failed.length) console.log('失败项: ' + failed.join(' | '))
process.exit(failed.length ? 1 : 0)
