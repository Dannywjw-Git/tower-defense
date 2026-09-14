// 纯逻辑自检 —— node tests/logic-check.mjs [baseUrl]
//
// 在无头浏览器里打开 tests/check.html，读回 assert 结果。
// 被验证的是不依赖 Phaser 的纯模块（spec §7.1）：
//   systems/Layout.js    布局计算、坐标往返、不许溢出
//   systems/MapGrid.js   关卡展开、非法数据必须报错

const PW = process.env.PLAYWRIGHT_CORE
  || 'file:///D:/deepseek-harness/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.mjs'

const BASE = (process.argv[2] || 'http://192.168.1.8:8788').replace(/\/$/, '')
const { chromium } = await import(PW)

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

const page = await browser.newPage()
const errs = []
page.on('pageerror', e => errs.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()) })

await page.goto(BASE + '/tests/check.html', { waitUntil: 'load', timeout: 30000 })
await page.waitForTimeout(1200)

console.log(await page.locator('#out').innerText())

const result = await page.evaluate(() => window.__result || null)

await page.close()
await browser.close()

if (errs.length) {
  console.log('\nJS 错误:')
  for (const e of errs) console.log('  ' + e)
}
if (!result) {
  console.log('\n❌ 未取到测试结果（页面可能未执行完）')
  process.exit(1)
}

console.log(`\n──── 结论 ────`)
console.log(result.fails === 0 && errs.length === 0
  ? `✅ 纯逻辑全部通过（${result.pass} 项）`
  : `❌ 失败 ${result.fails} 项 · JS 错误 ${errs.length} 条`)

process.exit(result.fails === 0 && errs.length === 0 ? 0 : 1)
