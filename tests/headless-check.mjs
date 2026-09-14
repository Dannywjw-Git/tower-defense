// 无头浏览器自检 —— node tests/headless-check.mjs [url]
//
// 用途：快速确认页面**无 JS 错误**、布局尺寸达标、点击命中正确。
// ⚠️ 它**不能替代真机测试**：iOS 微信 / 安卓 X5 内核的真实行为必须真机确认。
//
// 依赖：DSH 自带的 playwright-core（pnpm 嵌套依赖，需绝对路径）。
//       可用环境变量 PLAYWRIGHT_CORE 覆盖。

const PW = process.env.PLAYWRIGHT_CORE
  || 'file:///D:/deepseek-harness/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.mjs'

const TARGET = process.argv[2] || 'http://192.168.1.8:8788/probe.html'

const VIEWPORTS = [
  ['iPhone 竖屏', 375, 812],
  ['安卓通用竖屏', 360, 640],
  ['窄屏老设备', 320, 568],
  ['大屏安卓竖屏', 430, 932],
  ['手机横屏', 812, 375],
  ['电脑', 1440, 900],
]

const { chromium } = await import(PW)

const CANDIDATES = [
  { channel: 'msedge', headless: true },
  { channel: 'chrome', headless: true },
  { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true },
  { executablePath: 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', headless: true },
  { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true },
  { headless: true },
]

let browser = null
for (const opts of CANDIDATES) {
  try { browser = await chromium.launch(opts); break } catch { /* 试下一个 */ }
}
if (!browser) {
  console.error('找不到可用的浏览器（试过 Edge / Chrome / playwright 自带 chromium）')
  process.exit(2)
}

let totalErrors = 0
let failed = 0

for (const [label, width, height] of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 })
  const errs = []
  page.on('pageerror', e => errs.push('pageerror: ' + e.message))
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()) })

  try {
    await page.goto(TARGET, { waitUntil: 'load', timeout: 30000 })
  } catch (e) {
    console.log(`\n${label} (${width}×${height})`)
    console.log('  加载失败: ' + e.message.split('\n')[0])
    failed++
    await page.close()
    continue
  }

  await page.waitForTimeout(1200)

  // 有 #hud 就抓关键测量值（probe 页有此元素）
  let cellLine = ''
  const hud = page.locator('#hud')
  if (await hud.count()) {
    const text = await hud.innerText()
    cellLine = text.split('\n').filter(l => /^(cell|mode|renderer)\s/.test(l)).join('  |  ')
  }

  // 点画布中心，验证命中
  let tapLine = ''
  const canvas = page.locator('canvas')
  if (await canvas.count()) {
    const box = await canvas.boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(200)
    if (await hud.count()) {
      const after = await hud.innerText()
      tapLine = (after.split('\n').find(l => l.startsWith('lastTap')) || '').replace(/\s+/g, ' ')
    }
  }

  const bad = errs.length > 0
  if (bad) { totalErrors += errs.length; failed++ }

  console.log(`\n${label} (${width}×${height})  ${bad ? '❌' : '✅'}`)
  if (cellLine) console.log('  ' + cellLine)
  if (tapLine) console.log('  ' + tapLine)
  if (bad) console.log('  ' + errs.join('\n  '))

  await page.close()
}

await browser.close()

console.log(`\n──── 汇总 ────`)
console.log(`视口 ${VIEWPORTS.length} 个 · 失败 ${failed} 个 · JS 错误 ${totalErrors} 条`)
console.log(`目标: ${TARGET}`)
process.exit(failed ? 1 : 0)
