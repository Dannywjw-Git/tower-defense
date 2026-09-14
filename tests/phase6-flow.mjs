// Phase 6 集成测试 —— node tests/phase6-flow.mjs [baseUrl]
//
// 覆盖：第二张地图可玩 · 胜利/失败结算 · 事件驱动引导 · 存档落盘 · 音效解锁

const PW = process.env.PLAYWRIGHT_CORE
  || 'file:///D:/deepseek-harness/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.mjs'

const BASE = (process.argv[2] || 'http://192.168.1.8:8788').replace(/\/$/, '')
const { chromium } = await import(PW)
const { enterGame, clickButton, activeScenes } = await import('./_nav.mjs')

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
const errs = []
page.on('pageerror', e => errs.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()) })

let pass = 0
const failed = []
const say = (name, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + name) }
  else { failed.push(name); console.log('  ❌ ' + name + (extra ? '   ' + extra : '')) }
}

// 每个测试从干净存档开始
await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 30000 })
await page.waitForTimeout(1500)
await page.evaluate(() => localStorage.removeItem('tower-defense-save'))
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(1500)

console.log('\n──── 音效解锁（spec §4.5：必须在用户手势里）────')
{
  const before = await page.evaluate(() =>
    !!(window.game && window.game.scene.getScene('Menu')))
  say('菜单场景已就绪', before === true)

  await clickButton(page, 'Menu', '开始游戏')     // 真实点击 = 用户手势
  await page.waitForTimeout(600)
  const audio = await page.evaluate(async () => {
    // 用相对路径：GitHub Pages 部署在子路径 /<repo>/ 下，绝对路径 /src/... 会 404
    const m = await import('./src/systems/Audio.js')
    return { available: m.isAvailable() }
  })
  say('点击开始后 AudioContext 已解锁', audio.available === true,
      'available=' + audio.available)
}

console.log('\n──── 第二张地图（spec §4.3）────')
{
  await clickButton(page, 'LevelSelect', '转弯')
  await page.waitForTimeout(1600)

  const scenes = await activeScenes(page)
  say('进入地图 2 成功', scenes.includes('Game'), scenes.join(','))

  const info = await page.evaluate(() => {
    const s = window.game.scene.getScene('Game')
    return {
      id: s.levelId,
      waves: s.wm.total,
      prep: s.level.prepTime,
      pathLen: s.path.total,
      cells: s.grid.length + 'x' + s.grid[0].length,
      tutorial: s.tutorial.length,
    }
  })
  say('关卡 id = level-02', info.id === 'level-02', info.id)
  say('12 波', info.waves === 12, 'waves=' + info.waves)
  say('准备时间 15s', info.prep === 15, 'prep=' + info.prep)
  say('格表 5x8', info.cells === '5x8', info.cells)
  say('地图 2 不显示新手引导（仅首关）', info.tutorial === 0, 'tutorial=' + info.tutorial)
}

console.log('\n──── 胜利结算 ────')
{
  // 强制推进到「全部波次刷完 + 场上清空」这一胜利条件
  await page.evaluate(() => {
    const s = window.game.scene.getScene('Game')
    for (const e of [...s.enemies]) s.removeEnemy(e)
    s.wm.wave = s.wm.total
    s.wm.phase = 'done'
    s.lives = 17
    s.stats.kills = 42
  })
  await page.waitForTimeout(900)

  const scenes = await activeScenes(page)
  say('触发胜利 → 切到 ResultScene', scenes.includes('Result'), scenes.join(','))
  say('HudScene 已停止', !scenes.includes('Hud'), scenes.join(','))

  const result = await page.evaluate(() => {
    const r = window.game.scene.getScene('Result')
    return {
      win: r.win,
      title: r.title.text,
      body: r.statsText.text,
      hasNext: !!r.next,
    }
  })
  say('结算标记为胜利', result.win === true)
  say('标题显示「通关！」', /通关/.test(result.title), result.title)
  say('结算含波次', /波次/.test(result.body))
  say('结算含得分', /得分/.test(result.body), JSON.stringify(result.body.slice(0, 80)))
  say('通关后提供「下一关」（level-02 无下一关应不显示）', result.hasNext === false,
      'hasNext=' + result.hasNext)

  // 存档落盘
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('tower-defense-save') || 'null'))
  say('存档已落盘', !!saved)
  say('存档记录 level-02 通关', saved && saved.cleared.includes('level-02'),
      JSON.stringify(saved && saved.cleared))
  say('存档记录 best 分数', saved && saved.best.score > 0, 'score=' + (saved && saved.best.score))
  say('存档含版本号', saved && saved.version === 1, 'version=' + (saved && saved.version))
  say('通关后进度已清空', saved && saved.progress === null)
}

console.log('\n──── 新手引导（spec §6.5：事件驱动）────')
{
  await clickButton(page, 'Result', '返回菜单')
  await page.waitForTimeout(600)
  await enterGame(page, '教学')      // 回到首关

  const t0 = await page.evaluate(() => {
    const s = window.game.scene.getScene('Game')
    return { shown: s.tutorialText.visible, text: s.tutorialText.text, steps: s.tutorial.length }
  })
  say('首关显示引导第 1 条', t0.shown === true && /选塔/.test(t0.text), JSON.stringify(t0))
  say('共 3 个引导步骤', t0.steps === 3, 'steps=' + t0.steps)

  // 进入建造模式 → 第 1 条应自动消失
  await page.evaluate(() => {
    const s = window.game.scene.getScene('Game')
    s.economy.gold = 1000
    s.setBuildMode('arrow')
  })
  await page.waitForTimeout(250)
  const t1 = await page.evaluate(() => {
    const s = window.game.scene.getScene('Game')
    return { text: s.tutorialText.text, steps: s.tutorial.length, shown: s.tutorialText.visible }
  })
  say('完成动作后第 1 条自动消失（事件驱动，非定时器）',
      t1.steps === 2 && /放塔/.test(t1.text), JSON.stringify(t1))

  // 建塔 → 第 2 条消失
  await page.evaluate(() => window.game.scene.getScene('Game').buildTower(4, 2, 'arrow'))
  await page.waitForTimeout(250)
  const t2 = await page.evaluate(() => {
    const s = window.game.scene.getScene('Game')
    return { text: s.tutorialText.text, steps: s.tutorial.length }
  })
  say('建塔后第 2 条消失', t2.steps === 1 && /补刀/.test(t2.text), JSON.stringify(t2))

  // 补刀一次 → 全部引导结束
  await page.evaluate(() => {
    const s = window.game.scene.getScene('Game')
    s.stats.taps = 1
  })
  await page.waitForTimeout(250)
  const t3 = await page.evaluate(() => {
    const s = window.game.scene.getScene('Game')
    return { steps: s.tutorial.length, shown: s.tutorialText.visible }
  })
  say('全部完成后引导隐藏', t3.steps === 0 && t3.shown === false, JSON.stringify(t3))
}

console.log('\n──── 失败结算 ────')
{
  await page.evaluate(() => {
    const s = window.game.scene.getScene('Game')
    s.lives = 1
    // 放一只怪到终点附近并直接推进到漏怪
    s.spawnEnemy({ type: 'normal', hp: 60, wave: 1 })
    const e = s.enemies[s.enemies.length - 1]
    e.pathDist = s.path.total - 0.01
    e.syncPixel(s.path, s.L)
  })
  await page.waitForTimeout(900)

  const scenes = await activeScenes(page)
  say('生命归零 → 切到 ResultScene', scenes.includes('Result'), scenes.join(','))

  const r = await page.evaluate(() => {
    const res = window.game.scene.getScene('Result')
    return { win: res.win, title: res.title.text }
  })
  say('结算标记为失败', r.win === false)
  say('标题显示「失败」', /失败/.test(r.title), r.title)

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('tower-defense-save') || 'null'))
  say('失败不记 cleared（level-01 仍未通关）',
      saved && !saved.cleared.includes('level-01'), JSON.stringify(saved && saved.cleared))
}

await page.close()
await browser.close()

if (errs.length) {
  console.log('\nJS 错误:')
  for (const e of errs) console.log('  ' + e)
}
console.log(`\n──── 汇总 ────`)
console.log(`通过 ${pass} · 失败 ${failed.length}${errs.length ? ' · JS 错误 ' + errs.length : ' · JS 错误 0'}`)
if (failed.length) console.log('失败项: ' + failed.join(' | '))
process.exit(failed.length || errs.length ? 1 : 0)
