// 真实完整通关测试 —— node tests/playthrough.mjs [levelId] [speed]
//
// **端到端验证**：从第 1 波跑到最后一波，用自动玩家（贪心建塔策略），
// **不修改任何游戏数值**（lives / 波次 / 敌人 HP 全部按设计走）。
//
// 为什么需要它：
//   此前所有测试要么是纯逻辑单测、要么依赖**强制状态**
//   （stress-flow 直接把 wm.phase 设成 'done' 来触发结算）。
//   **从来没有人验证过"按设计数值，这游戏到底能不能通关"。**
//
// ⚠️ 结论要谨慎：打不过**可能是自动玩家策略差**，不代表游戏不能通关。
//    但打得过 → 至少证明"存在一条可通关路径"。

const PW = process.env.PLAYWRIGHT_CORE
  || 'file:///D:/deepseek-harness/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.mjs'

const BASE = (process.argv[2] || 'http://192.168.1.8:8788').replace(/\/$/, '')
const LEVEL_TEXT = process.argv[3] || '教学'
const SPEED = Number(process.argv[4] || 4)

const { chromium } = await import(PW)
const { enterGame } = await import('./_nav.mjs')

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

const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 })
const errs = []
page.on('pageerror', e => errs.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()) })

await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 30000 })
await page.waitForTimeout(1200)
await enterGame(page, LEVEL_TEXT)

console.log(`\n════ 真实通关测试：${LEVEL_TEXT}　加速 ${SPEED}×　（不修改任何数值）════\n`)

// 装自动玩家：贪心策略 —— 建在覆盖路径格最多的位置；有闲钱就升级
await page.evaluate((speed) => {
  const g = () => window.game.scene.getScene('Game')

  const PATH = 'path'
  const coverage = (gg, cx, cy) => {
    let n = 0
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 8; x++) {
        if (gg.grid[y][x] === PATH && Math.hypot(x - cx, y - cy) <= 2.2) n++
      }
    }
    return n
  }

  /** 位置评分 = 覆盖路径格数 + 相邻塔数×2（鼓励聚拢，自然形成协同阵型） */
  const scoreSpot = (gg, cx, cy) => {
    let s = coverage(gg, cx, cy)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy
      if (nx < 0 || nx > 7 || ny < 0 || ny > 4) continue
      if (gg.towerAt(nx, ny)) s += 2
    }
    return s
  }

  // 塔型轮换 —— 只用箭塔会浪费协同（异类相邻 +5%/个，最多 +20%）
  const ROTATION = ['arrow', 'arrow', 'ice', 'cannon', 'arrow', 'tesla', 'arrow', 'ice', 'poison', 'cannon']

  const log = []
  window.__bot = {
    log,
    running: true,
    decisions: 0,
    stop() { this.running = false },
  }

  const decide = () => {
    const bot = window.__bot
    if (!bot.running) return
    const gg = g()
    if (!gg || !gg.L || !gg.grid || gg.finished) return

    const gold = gg.economy.gold

    // 1) 优先升级（升级的 DPS/金币 通常优于新建）
    for (const t of gg.towers) {
      const def = t.def
      if (t.level >= def.levels.length) continue
      const cost = def.levels[t.level].cost
      if (cost <= gold * 0.55) {
        const r = gg.upgradeTower(t.cx, t.cy)
        if (r.ok) { bot.decisions++; return }
      }
    }

    // 2) 建新塔 —— 选评分最高的空位（覆盖路径格多 + 靠近已有塔以形成协同）
    const spots = []
    for (let cy = 0; cy < 5; cy++) {
      for (let cx = 0; cx < 8; cx++) {
        if (gg.canBuild(cx, cy)) spots.push({ cx, cy, s: scoreSpot(gg, cx, cy) })
      }
    }
    spots.sort((a, b) => b.s - a.s)

    const type = ROTATION[gg.towers.length % ROTATION.length]
    for (const s of spots) {
      const r = gg.buildTower(s.cx, s.cy, type)
      if (r.ok) { bot.decisions++; return }
      if (r.reason === 'no-gold') break
    }
  }

  window.__botTimer = setInterval(decide, 120)
  g().speed = speed
}, SPEED)

// 每秒采样一次状态，形成难度曲线
const samples = []
const t0 = Date.now()
let done = false
let lastWave = 0

while (Date.now() - t0 < 240000) {
  await page.waitForTimeout(1000)
  const st = await page.evaluate(() => {
    const scenes = window.game.scene.getScenes(true).map(s => s.scene.key)
    if (scenes.includes('Result')) {
      const r = window.game.scene.getScene('Result')
      return { finished: true, win: r.win, body: r.statsText.text, title: r.title.text }
    }
    const g = window.game.scene.getScene('Game')
    if (!g || !g.wm) return null
    return {
      wave: g.wm.wave, total: g.wm.total, phase: g.wm.phase,
      lives: g.lives, gold: g.economy.gold, towers: g.towers.length, enemies: g.enemies.length,
      kills: g.stats.kills, leaked: g.stats.leaked,
    }
  })

  if (!st) continue
  if (st.finished) { done = true; samples.push({ t: samples.length, ...st }); break }

  if (st.wave !== lastWave || samples.length % 5 === 0) {
    samples.push({ t: samples.length, ...st })
    if (st.wave !== lastWave) {
      console.log(`  第 ${String(st.wave).padStart(2)}/${st.total} 波　❤️${String(st.lives).padStart(2)}　` +
                  `💰${String(Math.round(st.gold)).padStart(5)}　塔 ${String(st.towers).padStart(2)}　` +
                  `击杀 ${st.kills}　漏 ${st.leaked}`)
      lastWave = st.wave
    }
  }
}

await page.evaluate(() => { clearInterval(window.__botTimer); window.__bot.stop() })

const final = samples[samples.length - 1]
console.log('\n════════ 结论 ════════\n')

if (done && final.win) {
  console.log('✅ **可以通关** —— 自动玩家（贪心策略）在未修改任何数值的情况下打通了本关。')
  console.log(`   剩余生命 ${final.lives}　击杀 ${final.kills}　漏怪 ${final.leaked}`)
} else if (done) {
  console.log('❌ **失败** —— 自动玩家未能通关。')
  console.log(`   生命归零，波次停在 ${final.wave}/${final.total}`)
  console.log('   ⚠️ 这**不一定**说明游戏无法通关（策略可能差），但值得警惕。')
} else {
  console.log('⏱ 超时未结束 —— 240 秒内没跑完。')
  console.log(`   当前 第 ${final.wave}/${final.total} 波，生命 ${final.lives}，塔 ${final.towers}`)
  console.log('   可能是加速不足或自动玩家建塔太慢。')
}

if (final.body) console.log('\n结算面板:\n' + final.body.split('\n').map(l => '  ' + l).join('\n'))

if (errs.length) {
  console.log('\nJS 错误:')
  for (const e of errs.slice(0, 4)) console.log('  ' + e)
}

process.exit(final && final.win ? 0 : 1)
