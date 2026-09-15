// 图标目视验证截图 —— node tests/icon-shot.mjs [baseUrl]
//
// 为什么单独写这个脚本：screenshot.mjs 拍的是**开局空地图**（场上没有塔），
// 而 C1 的改动是"塔内部画图标"—— 空地图上一座塔都看不到，等于没验证。
// 本脚本建满 6 种塔（含 Lv3）后拍照，供人眼确认图标是否清晰可辨。
//
// ponytail: 只做一件事（建塔→截图），不做多视口矩阵，需要时再说。

const PW = process.env.PLAYWRIGHT_CORE
  || 'file:///D:/deepseek-harness/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.mjs'

const BASE = (process.argv[2] || 'http://127.0.0.1:8788').replace(/\/$/, '')
const { chromium } = await import(PW)
const { enterGame } = await import('./_nav.mjs')
const { mkdir } = await import('node:fs/promises')

const CANDIDATES = [
  { channel: 'msedge', headless: true },
  { channel: 'chrome', headless: true },
  { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true },
  { headless: true },
]
let browser = null
for (const o of CANDIDATES) { try { browser = await chromium.launch(o); break } catch {} }
if (!browser) { console.error('找不到浏览器'); process.exit(2) }

await mkdir('docs/screenshots', { recursive: true })

for (const [label, w, h] of [['icon-portrait', 375, 812], ['icon-desktop', 1440, 900]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
  await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 30000 })
  await page.waitForTimeout(1200)
  await enterGame(page)
  await page.waitForTimeout(400)

  const info = await page.evaluate(() => {
    const g = window.game.scene.getScene('Game')
    g.tutorial = []
    g.tutorialText.setVisible(false)
    const ids = ['arrow', 'cannon', 'ice', 'tesla', 'poison', 'sniper']
    const spots = []
    for (let cy = 0; cy < g.grid.length && spots.length < 6; cy++)
      for (let cx = 0; cx < g.grid[0].length && spots.length < 6; cx++)
        if (g.canBuild(cx, cy)) spots.push([cx, cy])

    // 建 6 种塔，并把偶数位升到 Lv3（验证图标在高等级大塔上同样清晰）
    const built = []
    ids.forEach((id, i) => {
      const [cx, cy] = spots[i]
      g.economy.gold = 99999
      const r = g.buildTower(cx, cy, id)
      if (!r.ok) return
      if (i % 2 === 0) { g.upgradeTower(cx, cy); g.upgradeTower(cx, cy) }
      built.push({ id, cx, cy, lv: g.towerAt(cx, cy).level })
    })
    return { built, cell: g.L.cell, landscape: g.L.landscape }
  })

  await page.waitForTimeout(500)
  await page.screenshot({ path: `docs/screenshots/${label}.png` })
  console.log(`${label}  ${w}×${h}  ✅  建塔 ${info.built.length} 座 cell=${info.cell.toFixed(1)}`)
  info.built.forEach(b => console.log(`    ${b.id} @(${b.cx},${b.cy}) Lv${b.lv}`))
  await page.close()
}

await browser.close()
console.log('\n截图已写入 docs/screenshots/')
