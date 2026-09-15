// 场景链路冒烟测试 —— node tests/smoke-flow.mjs [baseUrl]
//
// 验证 Phase 1 验收标准：能打开 → 看到菜单 → 场景切换正常。
// 用真实点击（而非直接调用 scene.start），以覆盖交互接线。

const PW = process.env.PLAYWRIGHT_CORE
  || 'file:///D:/deepseek-harness/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.mjs'

const BASE = (process.argv[2] || 'http://192.168.1.8:8788').replace(/\/$/, '')
const { chromium } = await import(PW)
const { clickButton } = await import('./_nav.mjs')

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

const VIEWPORTS = [
  ['手机竖屏', 375, 812],
  ['手机横屏', 812, 375],
]

let failures = 0

for (const [label, width, height] of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 })
  const errs = []
  page.on('pageerror', e => errs.push('pageerror: ' + e.message))
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()) })

  const activeScenes = () => page.evaluate(() =>
    window.game ? window.game.scene.getScenes(true).map(s => s.scene.key).sort() : ['<no game>'])

  const steps = []
  let gameScenes = []
  try {
    await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 30000 })
    await page.waitForTimeout(2000)
    steps.push(['启动 (Boot→Menu)', await activeScenes()])

    // 用 Phaser 交互对象动态定位按钮（曾经硬编码 H*0.64，布局一变就静默点空）
    await clickButton(page, 'Menu', '开始游戏')
    await page.waitForTimeout(600)
    steps.push(['点击「开始游戏」', await activeScenes()])

    await clickButton(page, 'LevelSelect', '教学')
    await page.waitForTimeout(1000)
    gameScenes = await activeScenes()
    steps.push(['点击地图「教学」', gameScenes])

    // 读取运行中的 GameScene 状态 —— 验证地图**真的按布局算出来了**，
    // 而不只是"没报错"。直接从 window.game 取，无需在生产代码里留调试接口。
    const gs = await page.evaluate(() => {
      const s = window.game && window.game.scene.getScene('Game')
      if (!s || !s.L || !s.grid) return null
      const ps = window.PIXEL_SCALE || 1
      return {
        cell: s.L.cell,
        landscape: s.L.landscape,
        originX: s.L.originX,
        originY: s.L.originY,
        rows: s.grid.length,
        cols: s.grid[0] ? s.grid[0].length : 0,
        // ⚠️ 单位换算：L 里的一切都是**逻辑像素**（= CSS × PIXEL_SCALE，见
        // src/systems/Layout.js L73-74 与 HANDOFF §4.1 HiDPI 一节）。
        // 必须除以 ps 换算回 CSS 像素，才能与下面的 width/height 比较。
        // 漏这一步会让 DPR≥2 的视口全部**假失败**（曾报"网格宽 734 溢出 375"）。
        ps,
        cellW: (s.L.cell * 8) / ps,
        cellH: (s.L.cell * 5) / ps,
      }
    })
    steps.push(['GameScene 布局', [gs
      ? `cell=${gs.cell.toFixed(1)}逻辑px (${(gs.cell / gs.ps).toFixed(1)}CSSpx) ${gs.landscape ? '横屏' : '竖屏'} grid=${gs.cols}×${gs.rows} 网格=${gs.cellW.toFixed(0)}×${gs.cellH.toFixed(0)}CSSpx`
      : '<取不到>']])

    // 硬断言：网格必须存在、必须是 8×5、必须不溢出屏幕
    if (!gs) errs.push('断言失败: GameScene 未暴露 L/grid')
    else {
      if (gs.cols !== 8 || gs.rows !== 5) errs.push(`断言失败: 网格应为 8×5，实为 ${gs.cols}×${gs.rows}`)
      if (gs.cellW > width + 0.01) errs.push(`断言失败: 网格宽 ${gs.cellW.toFixed(1)} 溢出 ${width}`)
      if (gs.cellH > height + 0.01) errs.push(`断言失败: 网格高 ${gs.cellH.toFixed(1)} 溢出 ${height}`)
      if (gs.cell <= 0) errs.push('断言失败: cell <= 0')

    }

    // ── Phase 3 验收：敌人真的生成并沿路径行走 ──
    const snap = () => page.evaluate(() => {
      const s = window.game.scene.getScene('Game')
      if (!s || !s.wm) return null
      return {
        wave: s.wm.wave,
        phase: s.wm.phase,
        count: s.enemies.length,
        maxDist: s.enemies.reduce((m, e) => Math.max(m, e.pathDist), 0),
        minDist: s.enemies.length ? Math.min(...s.enemies.map(e => e.pathDist)) : 0,
        pathTotal: s.path.total,
        pool: s.enemyPool.length,      // Phase 4 起敌人池改名为 enemyPool（另有 towerPool / projPool）
      }
    })

    // 跳过准备期：关卡 prepTime 已在 Phase 6 正式化为 15s，
    // 直接把它置零以免每个视口白等 15 秒（这是测试加速，不是绕过逻辑）
    await page.evaluate(() => {
      const s = window.game.scene.getScene('Game')
      if (s && s.wm) s.wm.timer = 0.05
    })
    await page.waitForTimeout(2600)
    const e1 = await snap()
    await page.waitForTimeout(1600)
    const e2 = await snap()

    if (!e1 || !e2) {
      errs.push('断言失败: 取不到 WaveManager / enemies')
    } else {
      steps.push(['T+7s', [`wave=${e1.wave} phase=${e1.phase} 场上=${e1.count} maxDist=${e1.maxDist.toFixed(2)}`]])
      steps.push(['T+8.6s', [`wave=${e2.wave} phase=${e2.phase} 场上=${e2.count} maxDist=${e2.maxDist.toFixed(2)}`]])

      if (e1.count === 0) errs.push('断言失败: 过了准备期仍无敌人生成')
      if (e1.maxDist <= 0) errs.push('断言失败: 敌人存在但 pathDist 为 0（未前进）')
      if (e2.maxDist <= e1.maxDist) {
        errs.push(`断言失败: 敌人未继续前进（maxDist ${e1.maxDist.toFixed(2)} → ${e2.maxDist.toFixed(2)}）`)
      }
      if (e2.maxDist > e2.pathTotal + 0.001) {
        errs.push(`断言失败: pathDist ${e2.maxDist} 超出路径总长 ${e2.pathTotal}`)
      }
      if (e2.pool > 50) errs.push(`断言失败: 对象池异常膨胀（${e2.pool}），可能没在复用`)
    }
  } catch (e) {
    errs.push('流程异常: ' + e.message.split('\n')[0])
  }

  // 判定必须基于「进入游戏后的活跃场景」，而不是最后一步的显示文本 ——
  // 后者会随后续新增的检查步骤而失效（此前的版本就是这样误判的）。
  const ok = errs.length === 0
    && gameScenes.includes('Game')
    && gameScenes.includes('Hud')
  if (!ok) failures++

  console.log(`\n${label} (${width}×${height})  ${ok ? '✅' : '❌'}`)
  for (const [name, scenes] of steps) console.log(`  ${name.padEnd(20)} → ${scenes.join(', ')}`)
  if (errs.length) console.log('  错误:\n    ' + errs.join('\n    '))

  await page.close()
}

await browser.close()
console.log(`\n──── 汇总 ────`)
console.log(`视口 ${VIEWPORTS.length} 个 · 失败 ${failures} 个`)
process.exit(failures ? 1 : 0)
