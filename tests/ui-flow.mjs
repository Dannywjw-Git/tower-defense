// Phase 5 UI 交互测试 —— node tests/ui-flow.mjs [baseUrl]
//
// 全部用**真实鼠标点击**（按钮中心坐标从 Phaser 对象读取，不硬编码），
// 覆盖 spec §6.2 / §6.3 / §6.4 / §5.2 定义的全部交互路径。

const PW = process.env.PLAYWRIGHT_CORE
  || 'file:///D:/deepseek-harness/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.mjs'

const BASE = (process.argv[2] || 'http://192.168.1.8:8788').replace(/\/$/, '')
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

const W = 375, H = 812
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })
const errs = []
page.on('pageerror', e => errs.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()) })

let pass = 0
const failed = []
const say = (name, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + name) }
  else { failed.push(name); console.log('  ❌ ' + name + (extra ? '   ' + extra : '')) }
}

await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 30000 })
await page.waitForTimeout(1600)
await enterGame(page)     // 动态定位按钮，不依赖硬编码坐标

// 页面内辅助：把 Phaser 对象的中心换算成可点击坐标
await page.evaluate(() => {
  const center = o => ({ x: o.x + o.width / 2, y: o.y + o.height / 2 })
  window.__ui = {
    build: i => center(window.game.scene.getScene('Hud').buildButtons[i].text),
    cancel: () => center(window.game.scene.getScene('Hud').cancelBtn),
    up: () => center(window.game.scene.getScene('Hud').upBtn),
    sell: () => center(window.game.scene.getScene('Hud').sellBtn),
    pause: () => center(window.game.scene.getScene('Hud').pauseBtn),
    speed: () => center(window.game.scene.getScene('Hud').speedBtn),
    cell: (cx, cy) => {
      const L = window.game.scene.getScene('Game').L
      return {
        x: L.originX + cx * L.cell + L.cell / 2,
        y: L.originY + cy * L.cell + L.cell / 2,
      }
    },
    gs: () => window.game.scene.getScene('Game'),
    state: () => window.game.scene.getScene('Game').getState(),
    putEnemy: (pathDist, hp) => {
      const s = window.game.scene.getScene('Game')
      s.spawnEnemy({ type: 'normal', hp, wave: 1 })
      const e = s.enemies[s.enemies.length - 1]
      e.pathDist = pathDist
      e.syncPixel(s.path, s.L)
      return { x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp }
    },
    enemyHp: () => window.game.scene.getScene('Game').enemies.map(e => e.hp),
    panelVisible: () => window.game.scene.getScene('Hud').panelBg.visible,
    panelText: () => window.game.scene.getScene('Hud').panelText.text,
    reset: () => {
      const s = window.game.scene.getScene('Game')
      for (const t of [...s.towers]) s.sellTower(t.cx, t.cy)
      for (const e of [...s.enemies]) s.removeEnemy(e)
      s.economy.gold = 1000
      s.selectTower(null)
      s.setBuildMode(null)
    },
  }
})

const click = async (pt) => { await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(160) }
const read = (expr) => page.evaluate(expr)

console.log('\n──── 建造模式（spec §6.4）────')
{
  const before = await read('window.__ui.state()')
  await click(await read('window.__ui.build(0)'))          // 点第一个塔（箭塔）
  const inMode = await read('window.__ui.state()')
  say('点建造栏进入建造模式', inMode.buildMode === 'arrow', 'buildMode=' + inMode.buildMode)

  // 点路径格 → 应留在模式内
  await click(await read('window.__ui.cell(0, 2)'))
  const onPath = await read('window.__ui.state()')
  say('点路径格被拒且**留在模式内**（不打断）', onPath.buildMode === 'arrow',
      'buildMode=' + onPath.buildMode)
  say('路径格上确实没有塔', (await read('window.__ui.gs().towerAt(0,2)')) === null)

  // 点可建格 → 建成并退出模式
  await click(await read('window.__ui.cell(0, 0)'))
  const built = await read('window.__ui.state()')
  say('点可建格建成塔', built.towers === 1, 'towers=' + built.towers)
  say('建成后自动退出建造模式', built.buildMode === null, 'buildMode=' + built.buildMode)
  say('金币已扣 50', built.gold === before.gold - 50, `${before.gold} → ${built.gold}`)
}

console.log('\n──── 金币不足防护（spec §6.4）────')
{
  await read('window.__ui.reset()')
  // 把金币压到 60：够冰塔(60)、不够炮塔(80)
  await page.evaluate(() => { window.__ui.gs().economy.gold = 60 })

  await click(await read('window.__ui.build(1)'))          // 炮塔 80 > 60
  const denied = await read('window.__ui.state()')
  say('金币不足时**不进入**建造模式', denied.buildMode === null, 'buildMode=' + denied.buildMode)

  await click(await read('window.__ui.build(2)'))          // 冰塔 60 ≤ 60
  const allowed = await read('window.__ui.state()')
  say('金币刚好够时正常进入', allowed.buildMode === 'ice', 'buildMode=' + allowed.buildMode)
}

console.log('\n──── 取消与禁止覆盖 ────')
{
  // 补足金币：上一段建过箭塔（50），初始 120 只剩 70，不足以建炮塔（80）
  await page.evaluate(() => { window.__ui.gs().economy.gold = 500 })
  await read('window.__ui.gs().setBuildMode(null)')

  // 先确保场上有且只有一座箭塔
  await read('window.__ui.reset()')
  await page.evaluate(() => { window.__ui.gs().economy.gold = 500 })
  await read('window.__ui.gs().buildTower(0, 0, "arrow")')

  await click(await read('window.__ui.build(1)'))          // 炮塔
  const m1 = await read('window.__ui.state()')
  say('进入建造模式（炮塔）', m1.buildMode === 'cannon', 'buildMode=' + m1.buildMode)

  await click(await read('window.__ui.cancel()'))
  const m2 = await read('window.__ui.state()')
  say('取消按钮退出建造模式', m2.buildMode === null)

  // 点已有塔的格子：禁止覆盖 → 退出模式 + 选中该塔
  await click(await read('window.__ui.build(1)'))
  await click(await read('window.__ui.cell(0, 0)'))
  const m3 = await read('window.__ui.state()')
  const sel = await read('window.__ui.gs().selectedTower && window.__ui.gs().selectedTower.type')
  say('点已有塔：退出建造模式', m3.buildMode === null, 'buildMode=' + m3.buildMode)
  say('点已有塔：改为选中该塔（不覆盖）', sel === 'arrow', 'selected=' + sel)
  say('场上仍只有 1 座塔（未被覆盖）', m3.towers === 1, 'towers=' + m3.towers)
}

console.log('\n──── 信息面板（spec §6.3）────')
{
  const vis = await read('window.__ui.panelVisible()')
  say('选中塔后面板可见', vis === true)
  const txt = await read('window.__ui.panelText()')
  say('面板显示塔名与等级', /箭塔/.test(txt) && /Lv1/.test(txt), JSON.stringify(txt.slice(0, 60)))
  say('面板显示协同行', /协同/.test(txt), JSON.stringify(txt))
  say('面板显示伤害/射程/攻速', /伤害/.test(txt) && /射程/.test(txt) && /攻速/.test(txt))
}

console.log('\n──── 升级 ────')
{
  const before = await read('window.__ui.state()')
  await click(await read('window.__ui.up()'))
  const after = await read('window.__ui.state()')
  const lv = await read('window.__ui.gs().selectedTower.level')
  say('点升级按钮 → 等级 +1', lv === 2, 'level=' + lv)
  say('升级扣款 60', before.gold - after.gold === 60, `${before.gold} → ${after.gold}`)
  say('面板已刷新为新等级', /Lv2/.test(await read('window.__ui.panelText()')))
}

console.log('\n──── 出售需二次确认（spec §6.3）────')
{
  const before = await read('window.__ui.state()')
  await click(await read('window.__ui.sell()'))
  const mid = await read('window.__ui.state()')
  say('第一次点出售**不会**卖掉（二次确认）', mid.towers === 1, 'towers=' + mid.towers)
  say('第一次点后按钮变为确认态', /确认/.test(await read('window.__ui.gs().scene.get("Hud").sellBtn.text')))

  await click(await read('window.__ui.sell()'))
  const after = await read('window.__ui.state()')
  say('第二次点出售 → 塔被移除', after.towers === 0, 'towers=' + after.towers)
  // invested = 50 + 60 = 110 → floor(110 × 0.7) = 77
  say('退款 77（floor(110 × 0.7)）', after.gold - before.gold === 77,
      `${before.gold} → ${after.gold}`)
  say('卖后面板隐藏', (await read('window.__ui.panelVisible()')) === false)
}

console.log('\n──── 点击参与 / 补刀（spec §5.2）────')
{
  await read('window.__ui.reset()')
  const e = await page.evaluate(() => window.__ui.putEnemy(1.5, 200))
  const expectedDmg = Math.min(20, Math.round(e.maxHp * 0.02))   // 200×2% = 4
  await page.mouse.click(e.x, e.y)
  await page.waitForTimeout(120)
  const hps = await read('window.__ui.enemyHp()')
  const dealt = e.hp - hps[0]
  say(`点敌人造成 ${expectedDmg} 点伤害（maxHp 的 2%）`, dealt === expectedDmg,
      `hp ${e.hp} → ${hps[0]}（打了 ${dealt}）`)
}

console.log('\n──── 暂停 / 加速 ────')
{
  const before = await read('window.__ui.state()')
  await click(await read('window.__ui.pause()'))
  const paused = await read('window.__ui.state()')
  say('点暂停 → 已暂停', paused.paused === true)

  const d1 = await page.evaluate(() => {
    const s = window.__ui.gs()
    return { wave: s.wm.wave, timer: s.wm.timer, enemies: s.enemies.length }
  })
  await page.waitForTimeout(1200)
  const d2 = await page.evaluate(() => {
    const s = window.__ui.gs()
    return { wave: s.wm.wave, timer: s.wm.timer, enemies: s.enemies.length }
  })
  say('暂停期间波次计时冻结', d1.timer === d2.timer, `${d1.timer} → ${d2.timer}`)

  await click(await read('window.__ui.pause()'))
  const resumed = await read('window.__ui.state()')
  say('再点暂停 → 恢复', resumed.paused === false)

  await click(await read('window.__ui.speed()'))
  const fast = await read('window.__ui.state()')
  say('点加速 → speed = 2', fast.speed === 2, 'speed=' + fast.speed)
  await click(await read('window.__ui.speed()'))
  say('再点加速 → 回到 1×', (await read('window.__ui.state()')).speed === 1)
}

console.log('\n──── 长按弹文字说明（spec §6.2：手机无 hover）────')
{
  await read('window.__ui.reset()')
  const pt = await read('window.__ui.build(4)')      // 毒塔

  // 长按：按下 → 等过 400ms 阈值 → 抬起
  await page.mouse.move(pt.x, pt.y)
  await page.mouse.down()
  await page.waitForTimeout(650)
  const during = await page.evaluate(() => {
    const s = window.__ui.gs()
    return { noticeVisible: s.notice.visible, noticeText: s.notice.text, buildMode: s.buildMode }
  })
  await page.mouse.up()
  await page.waitForTimeout(250)
  const after = await read('window.__ui.state()')

  say('长按弹出该塔的说明', during.noticeVisible && /毒塔/.test(during.noticeText),
      JSON.stringify(during.noticeText))
  say('长按**不**进入建造模式',
      during.buildMode === null && after.buildMode === null,
      `按下中=${during.buildMode} 抬起后=${after.buildMode}`)

  // 回归：短按仍要能进建造模式（改动风险点）
  await click(await read('window.__ui.build(4)'))
  const shortPress = await read('window.__ui.state()')
  say('短按仍正常进入建造模式（回归）', shortPress.buildMode === 'poison',
      'buildMode=' + shortPress.buildMode)
  await read('window.__ui.gs().setBuildMode(null)')
}

console.log('\n──── 波次预告显示敌人类型（spec §6.5「常驻可查」）────')
{
  const r = await page.evaluate(async () => {
    const s = window.__ui.gs()
    await new Promise(r => setTimeout(r, 100))

    // 造出「准备阶段」的状态：wave 归零、下一波是第一波（normal ×5）
    s.wm.wave = 0
    s.wm.phase = 'prep'
    s.wm.timer = 12
    await new Promise(r => setTimeout(r, 150))
    const prep = window.game.scene.getScene('Hud').status.text

    // 再造成「刷怪阶段」：当前波为 waves[0]
    s.wm.wave = 1
    s.wm.phase = 'spawning'
    await new Promise(r => setTimeout(r, 150))
    const spawning = window.game.scene.getScene('Hud').status.text

    return { prep, spawning }
  })

  say('准备阶段显示「下一波 + 敌人类型 + 数量」',
      /下一波/.test(r.prep) && /普通/.test(r.prep) && /×\d+/.test(r.prep),
      JSON.stringify(r.prep.split('\n')[1] || ''))
  say('刷怪阶段显示「第 N/M 波 + 敌人类型」',
      /第 1\/\d+ 波/.test(r.spawning) && /普通/.test(r.spawning),
      JSON.stringify(r.spawning.split('\n')[1] || ''))
}

console.log('\n──── 切后台自动暂停（spec §3.8）────')
{
  await page.evaluate(() => window.__ui.reset())
  const before = await read('window.__ui.state()')
  say('切后台前未暂停', before.paused === false)

  // 模拟页面进入隐藏
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(200)
  const after = await read('window.__ui.state()')
  say('切后台 → 自动暂停', after.paused === true, 'paused=' + after.paused)

  // 还原，避免影响后续
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    document.dispatchEvent(new Event('visibilitychange'))
  })
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
