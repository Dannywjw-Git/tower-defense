// 部署后验证 —— node tests/verify-deploy.mjs [url]
//
// 部署到 GitHub Pages 后运行，确认线上真的正常：
//   · 页面可访问、无 404 资源
//   · 相对路径在子路径部署下没有失效（这是最常见的白屏原因）
//   · 场景链路可走通、无 JS 错误
//
// 默认验证本项目的预期上线地址。

const PW = process.env.PLAYWRIGHT_CORE
  || 'file:///D:/deepseek-harness/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.mjs'

const URL_ = process.argv[2] || 'https://Dannywjw-Git.github.io/tower-defense/'
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

const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 })

const failed404 = []
const jsErrors = []
const loaded = []

page.on('response', r => {
  const u = r.url()
  if (r.status() === 404) failed404.push(u)
  else if (r.status() === 200 && /\.(js|html|css)$/.test(u)) loaded.push(u)
})
page.on('pageerror', e => jsErrors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') jsErrors.push('console: ' + m.text()) })

let pass = 0
const failed = []
const say = (name, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + name) }
  else { failed.push(name); console.log('  ❌ ' + name + (extra ? '   ' + extra : '')) }
}

console.log(`\n验证地址: ${URL_}\n`)

const t0 = Date.now()
let reachable = true
try {
  await page.goto(URL_, { waitUntil: 'load', timeout: 45000 })
} catch (e) {
  reachable = false
  say('页面可访问', false, e.message.split('\n')[0])
}
const loadMs = Date.now() - t0

if (reachable) {
  await page.waitForTimeout(2500)

  say('页面可访问', true, `${loadMs} ms`)
  say('无 404 资源（相对路径在子路径下正确）', failed404.length === 0,
      failed404.slice(0, 3).join(' | '))
  say('Phaser 已就绪', await page.evaluate(() => !!window.Phaser))
  say('游戏实例已创建', await page.evaluate(() => !!(window.game && window.game.scene)))

  const title = await page.evaluate(() => document.title)
  say('标题正确', /塔防/.test(title), title)

  const menuOk = await page.evaluate(() => {
    const s = window.game && window.game.scene.getScene('Menu')
    return !!(s && s.children && s.children.list.some(o => o && o.input && o.input.enabled))
  })
  say('菜单可交互（首屏渲染完成）', menuOk)

  // 走一遍链路：Menu → LevelSelect → Game
  const { clickButton, activeScenes } = await import('./_nav.mjs')
  try {
    await clickButton(page, 'Menu', '开始游戏')
    await page.waitForTimeout(600)
    await clickButton(page, 'LevelSelect', '教学')
    await page.waitForTimeout(1500)
    const scenes = await activeScenes(page)
    say('能进入游戏场景', scenes.includes('Game') && scenes.includes('Hud'), scenes.join(','))

    const st = await page.evaluate(() => {
      const s = window.game.scene.getScene('Game')
      return s && s.getState ? s.getState() : null
    })
    say('游戏状态正常（8×5 网格、金币/生命已初始化）',
        !!st && st.cell > 0 && st.lives > 0 && st.gold > 0,
        st ? `cell=${st.cell.toFixed(1)} gold=${st.gold} lives=${st.lives}` : 'null')
  } catch (e) {
    say('场景链路可走通', false, e.message.split('\n')[0])
  }

  say('无 JS 错误', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '))
  console.log(`\n  成功加载 ${loaded.length} 个资源`)
  if (failed404.length) {
    console.log('\n  404 清单（前 8 条）:')
    for (const u of failed404.slice(0, 8)) console.log('    ' + u)
  }
}

await page.close()
await browser.close()

console.log(`\n──── 汇总 ────`)
console.log(`通过 ${pass} · 失败 ${failed.length}`)
if (failed.length) console.log('失败项: ' + failed.join(' | '))
console.log('')
if (!reachable) {
  console.log('提示：若页面 404，说明仓库还没建好 / 还没推送 / Pages 还没构建完成。')
  console.log('      按 docs/DEPLOY.md 完成后重跑本脚本。')
}
process.exit(failed.length ? 1 : 0)
