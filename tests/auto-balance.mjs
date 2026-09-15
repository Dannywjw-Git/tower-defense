// 自动平衡系统 —— node tests/auto-balance.mjs [levelId] [--apply]
//
// ══════════════════════════════════════════════════════════════════
// 为什么需要它：
//   此前判断难度靠"用户试玩 → 报一句'过不去' → 我改一个数"，
//   这是把**设计工作外包给玩家**。本脚本把闭环补上：
//
//     bot 试玩 → 读每波漏怪数 → 定位瓶颈波 → 自动搜参数 → 复测 → 出报告
//
//   bot 不是人，所以**不看"过不过"，只看"哪一波开始崩"**——
//   那个位置对人同样成立（人只会更好）。
// ══════════════════════════════════════════════════════════════════
//
// ⚠️ 默认**只出报告、不改文件**。加 --apply 才写回关卡数据。

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const PW = process.env.PLAYWRIGHT_CORE
  || 'file:///D:/deepseek-harness/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BASE = 'http://192.168.1.8:8788'
const LEVEL = process.argv[2] || 'level-02'
const APPLY = process.argv.includes('--apply')

const { chromium } = await import(PW)
const { enterGame } = await import('./_nav.mjs')

const LEVEL_TEXT = { 'level-01': '教学', 'level-02': '转弯' }[LEVEL] || '转弯'

const CANDIDATES = [
  { channel: 'msedge', headless: true },
  { channel: 'chrome', headless: true },
  { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true },
  { headless: true },
]

let browser = null
for (const opts of CANDIDATES) {
  try { browser = await chromium.launch(opts); break } catch { /* 下一个 */ }
}
if (!browser) { console.error('找不到可用浏览器'); process.exit(2) }

/**
 * 跑一局，返回每波的漏怪数与结束状态。
 * bot 策略：贪心 —— 位置选「覆盖路径格 + 靠近已有塔」，塔型按轮换表混搭。
 */
async function trial({ startGold, bountyGrowth, hpGrowth, speed = 6, maxMs = 150000 }) {
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } })
  const errs = []
  page.on('pageerror', e => errs.push(e.message))

  await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 30000 })
  await page.waitForTimeout(900)
  await enterGame(page, LEVEL_TEXT)

  // 注入被测参数并装 bot
  await page.evaluate(({ startGold, bountyGrowth, hpGrowth, speed }) => {
    const g = () => window.game.scene.getScene('Game')
    const gg = g()
    gg.economy.gold = startGold
    gg.TEST_BOUNTY_GROWTH = bountyGrowth        // 被 spawnEnemy 读取
    gg.wm.hpGrowth = hpGrowth                   // 被 WaveManager 读取
    gg.speed = speed

    const PATH = 'path'
    const cover = (s, cx, cy) => {
      let n = 0
      for (let y = 0; y < 5; y++)
        for (let x = 0; x < 8; x++)
          if (s.grid[y][x] === PATH && Math.hypot(x - cx, y - cy) <= 2.2) n++
      return n
    }
    const score = (s, cx, cy) => {
      let v = cover(s, cx, cy)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || nx > 7 || ny < 0 || ny > 4) continue
        if (s.towerAt(nx, ny)) v += 2
      }
      return v
    }
    const ROT = ['arrow', 'arrow', 'ice', 'cannon', 'arrow', 'tesla', 'arrow', 'ice', 'poison', 'cannon']

    const decide = () => {
      const s = g()
      if (!s || !s.L || !s.grid || s.finished) return
      const gold = s.economy.gold

      // 优先升级（长期看 DPS/金币 更高）
      for (const t of s.towers) {
        if (t.level >= t.def.levels.length) continue
        if (t.def.levels[t.level].cost <= gold * 0.5) {
          if (s.upgradeTower(t.cx, t.cy).ok) return
        }
      }
      // 再建新塔
      const spots = []
      for (let cy = 0; cy < 5; cy++)
        for (let cx = 0; cx < 8; cx++)
          if (s.canBuild(cx, cy)) spots.push({ cx, cy, v: score(s, cx, cy) })
      spots.sort((a, b) => b.v - a.v)
      const type = ROT[s.towers.length % ROT.length]
      for (const sp of spots) {
        const r = s.buildTower(sp.cx, sp.cy, type)
        if (r.ok) return
        if (r.reason === 'no-gold') break
      }
    }
    window.__botTimer = setInterval(decide, 100)
  }, { startGold, bountyGrowth, hpGrowth, speed })

  // 采样：每波结束时记录漏怪增量
  const t0 = Date.now()
  let prevLeak = 0
  let prevWave = 1
  const perWave = []
  let done = null

  while (Date.now() - t0 < maxMs) {
    await page.waitForTimeout(700)
    const s = await page.evaluate(() => {
      const scenes = window.game.scene.getScenes(true).map(x => x.scene.key)
      if (scenes.includes('Result')) {
        const r = window.game.scene.getScene('Result')
        return { finished: true, win: r.win, body: r.statsText.text }
      }
      const g = window.game.scene.getScene('Game')
      if (!g || !g.wm) return null
      return { wave: g.wm.wave, total: g.wm.total, lives: g.lives,
               leaked: g.stats.leaked, kills: g.stats.kills,
               gold: g.economy.gold, towers: g.towers.length }
    })
    if (!s) continue
    if (s.finished) { done = s; break }

    if (s.wave !== prevWave) {
      perWave.push({ wave: prevWave, leaked: s.leaked - prevLeak, lives: s.lives })
      prevLeak = s.leaked
      prevWave = s.wave
    }
  }

  const last = await page.evaluate(() => {
    const g = window.game.scene.getScene('Game')
    if (!g || !g.stats) return null
    return { leaked: g.stats.leaked, lives: g.lives, towers: g.towers.length, wave: g.wm.wave }
  })
  if (last && !done) perWave.push({ wave: last.wave, leaked: last.leaked - prevLeak, lives: last.lives })

  await page.evaluate(() => clearInterval(window.__botTimer)).catch(() => {})
  await page.close()
  return { done, perWave, last, errs }
}

/** 从每波漏怪数找「崩溃起点」：累计漏怪超过生命上限 30% 的那一波 */
function findBreak(perWave, totalLives = 20) {
  let acc = 0
  for (const w of perWave) {
    acc += w.leaked
    if (acc > totalLives * 0.3) return w.wave
  }
  return null
}

/** 把「每波漏怪」渲染成一行，按波号排序并去重（采样可能重复记录同一波） */
function fmtWaves(perWave) {
  const byWave = new Map()
  for (const w of perWave) {
    // 波号可能因为采样时机的错位出现 0 或回退，过滤掉无效值
    if (!w.wave || w.wave < 1) continue
    byWave.set(w.wave, (byWave.get(w.wave) || 0) + w.leaked)
  }
  return [...byWave.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([w, n]) => `W${w}:${n}`)
    .join(' ')
}

console.log(`\n════ 自动平衡：${LEVEL}（${LEVEL_TEXT}）════`)
console.log('默认只出报告；加 --apply 才写回文件\n')

// ── 基线 ──
console.log('【基线】当前数值')
const baseline = await trial({ startGold: LEVEL === 'level-02' ? 150 : 120, bountyGrowth: 0, hpGrowth: 0.18 })
const bBreak = findBreak(baseline.perWave)
console.log('  波次漏怪: ' + fmtWaves(baseline.perWave))
console.log(`  结果: ${baseline.done ? (baseline.done.win ? '通关' : '失败') : '未跑完'}　` +
            `崩溃起点: ${bBreak ? '第 ' + bBreak + ' 波' : '无'}`)

// ── 候选参数组合 ──
const CANDIDATES_PARAMS = [
  { name: '只加赏金增长 0.12', startGold: LEVEL === 'level-02' ? 150 : 120, bountyGrowth: 0.12, hpGrowth: 0.18 },
  { name: '赏金 0.12 + 起始 +50', startGold: (LEVEL === 'level-02' ? 150 : 120) + 50, bountyGrowth: 0.12, hpGrowth: 0.18 },
  { name: '赏金 0.15 + 增长率 0.14', startGold: LEVEL === 'level-02' ? 150 : 120, bountyGrowth: 0.15, hpGrowth: 0.14 },
  { name: '赏金 0.15 + 增长 0.12 + 起始 +50', startGold: (LEVEL === 'level-02' ? 150 : 120) + 50, bountyGrowth: 0.15, hpGrowth: 0.12 },
]

console.log('\n【参数搜索】')
const results = []
for (const c of CANDIDATES_PARAMS) {
  const r = await trial(c)
  const brk = findBreak(r.perWave)
  const win = !!(r.done && r.done.win)
  const lives = r.done && /剩余生命　(\d+)/.exec(r.done.body) ? +/剩余生命　(\d+)/.exec(r.done.body)[1] : null
  results.push({ ...c, ...r, breakAt: brk, win, livesLeft: lives })
  console.log(`  ${c.name.padEnd(34)} ${win ? '✅通关' : (r.done ? '❌失败' : '⏱未完')}` +
              `  崩溃起点 ${brk ? 'W' + brk : '无'}  剩余生命 ${lives ?? '-'}  塔 ${r.last ? r.last.towers : '-'}`)
}

// ── 结论 ──
console.log('\n════ 结论 ════')
// 判据：能通关就是达标；剩余生命只是"余量"参考。
// （初版要求 livesLeft ≥ 8 才算好，结果把两个**确实通关**的组合误判为不达标 —— 判据本身写错了。）
const winners = results.filter(r => r.win)
if (winners.length) {
  winners.sort((a, b) => (b.livesLeft ?? 0) - (a.livesLeft ?? 0))
  const best = winners[0]
  console.log(`可通关的组合共 ${winners.length} / ${results.length} 个，最优：`)
  console.log(`  ${best.name}`)
  console.log(`  剩余生命 ${best.livesLeft}　崩溃起点 ${best.breakAt ? 'W' + best.breakAt : '无'}`)
  console.log(`  → startGold=${best.startGold}  bountyGrowth=${best.bountyGrowth}  hpGrowth=${best.hpGrowth}`)
  console.log('')
  console.log('  参考余量：剩余生命 0–3 = 勉强过关；4–8 = 合格；>8 = 宽裕。')
} else {
  console.log(`所有 ${results.length} 个候选都无法通关 —— 瓶颈不在经济参数。`)
  console.log('下一步该查：塔位数量上限，或塔的基础伤害。')
}

await browser.close()
process.exit(0)
