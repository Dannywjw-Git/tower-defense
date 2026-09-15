// 截图取证 —— node tests/screenshot.mjs [baseUrl] [outDir]
//
// 走一遍 菜单 → 关卡选择 → 游戏，逐个视口截图。
// "无 JS 错误"不等于"画对了"，截图是给人看的证据。

import { mkdir } from 'node:fs/promises'

const PW = process.env.PLAYWRIGHT_CORE
  || 'file:///D:/deepseek-harness/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.mjs'

const BASE = (process.argv[2] || 'http://192.168.1.8:8788').replace(/\/$/, '')
const OUT = process.argv[3] || 'docs/screenshots'

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

await mkdir(OUT, { recursive: true })

const SHOTS = [
  ['portrait', 375, 812],
  ['landscape', 812, 375],
  ['desktop', 1440, 900],
]

for (const [name, width, height] of SHOTS) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 })
  const errs = []
  page.on('pageerror', e => errs.push(e.message))

  await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 30000 })
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${OUT}/${name}-1-menu.png` })

  await clickButton(page, 'Menu', '开始游戏')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/${name}-2-levels.png` })

  await clickButton(page, 'LevelSelect', '教学')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/${name}-3-game.png` })

  // ── 建造模式 → 建两座相邻塔（触发协同）→ 选中展示信息面板 ──
  const evalPt = (expr) => page.evaluate(expr)
  const PS = () => page.evaluate('window.PIXEL_SCALE || 1')
  const btnCenter = async (idx) => {
    const pt = await evalPt(`(() => {
      const t = window.game.scene.getScene('Hud').buildButtons[${idx}].text
      const ps = window.PIXEL_SCALE || 1
      return { x: (t.x + t.width / 2) / ps, y: (t.y + t.height / 2) / ps } })()`)
    return pt
  }
  const cellCenter = (cx, cy) => evalPt(`(() => {
    const L = window.game.scene.getScene('Game').L
    const ps = window.PIXEL_SCALE || 1
    return { x: (L.originX + ${cx} * L.cell + L.cell / 2) / ps,
             y: (L.originY + ${cy} * L.cell + L.cell / 2) / ps } })()`)

  const a = await btnCenter(0)                      // 箭塔
  await page.mouse.click(a.x, a.y)
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${OUT}/${name}-4-buildmode.png` })

  const c1 = await cellCenter(4, 2)
  await page.mouse.click(c1.x, c1.y)                // 建箭塔
  await page.waitForTimeout(200)

  const i = await btnCenter(2)                      // 冰塔
  await page.mouse.click(i.x, i.y)
  await page.waitForTimeout(200)
  const c2 = await cellCenter(3, 2)
  await page.mouse.click(c2.x, c2.y)                // 相邻建冰塔 → 触发协同
  await page.waitForTimeout(200)

  await page.mouse.click(c1.x, c1.y)                // 选中箭塔 → 面板显示协同
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${OUT}/${name}-5-panel.png` })

  console.log(`${name.padEnd(10)} ${width}×${height}  ${errs.length ? '❌ ' + errs[0] : '✅'}`)
  await page.close()
}

await browser.close()
console.log(`\n截图已写入 ${OUT}/`)
