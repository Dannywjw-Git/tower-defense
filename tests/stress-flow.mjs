// 压力与泄漏测试 —— node tests/stress-flow.mjs [baseUrl]
//
// 一局要玩 15 分钟，所以「对象池是否正确复用」「反复进出场景会不会泄漏」
// 只会在长时间游玩后暴露。这个脚本用高频循环把它们提前逼出来。

const PW = process.env.PLAYWRIGHT_CORE
  || 'file:///D:/deepseek-harness/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.mjs'

const BASE = (process.argv[2] || 'http://192.168.1.8:8788').replace(/\/$/, '')
const { chromium } = await import(PW)
const { enterGame, clickButton } = await import('./_nav.mjs')

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

await page.goto(BASE + '/index.html?debug=1', { waitUntil: 'load', timeout: 30000 })
await page.waitForTimeout(1500)
await enterGame(page, '教学')

const gc = () => page.evaluate(() =>
  (window.gc ? (window.gc(), true) : false))

const heap = () => page.evaluate(() =>
  performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null)

console.log('\n──── 塔对象池复用（建/卖 60 次）────')
{
  const r = await page.evaluate(() => {
    const s = window.game.scene.getScene('Game')
    s.economy.gold = 1e9
    for (const t of [...s.towers]) s.sellTower(t.cx, t.cy)
    const poolBefore = s.towerPool.length

    for (let i = 0; i < 60; i++) {
      s.buildTower(1, 1, 'arrow')
      s.sellTower(1, 1)
    }
    return { poolBefore, poolAfter: s.towerPool.length, towers: s.towers.length, listLen: s.children.list.length }
  })
  say('60 次建/卖后场上无残留塔', r.towers === 0, 'towers=' + r.towers)
  say('塔池不随循环次数增长（正确复用）', r.poolAfter <= r.poolBefore + 1,
      `池 ${r.poolBefore} → ${r.poolAfter}（若接近 60 则说明每次都在 new）`)
  say('场景显示对象数稳定', r.listLen < 400, 'children=' + r.listLen)
}

console.log('\n──── 敌人对象池复用（生成/移除 120 次）────')
{
  const r = await page.evaluate(() => {
    const s = window.game.scene.getScene('Game')
    for (const e of [...s.enemies]) s.removeEnemy(e)
    const poolBefore = s.enemyPool.length

    for (let i = 0; i < 120; i++) {
      s.spawnEnemy({ type: 'normal', hp: 10, wave: 1 })
      s.removeEnemy(s.enemies[s.enemies.length - 1])
    }
    return { poolBefore, poolAfter: s.enemyPool.length, enemies: s.enemies.length }
  })
  say('120 次生成/移除后场上无残留敌人', r.enemies === 0, 'enemies=' + r.enemies)
  say('敌人池不随循环次数增长', r.poolAfter <= r.poolBefore + 1,
      `池 ${r.poolBefore} → ${r.poolAfter}`)
}

console.log('\n──── 弹道对象池（高密度开火 8 秒）────')
{
  const before = await page.evaluate(() => {
    const s = window.game.scene.getScene('Game')
    s.economy.gold = 1e9
    s.speed = 2
    // 满场塔 + 一批高血怪，逼出大量弹道
    let n = 0
    for (let cy = 0; cy < 5; cy++) {
      for (let cx = 0; cx < 8; cx++) {
        if (s.canBuild(cx, cy) && s.buildTower(cx, cy, 'arrow').ok) n++
      }
    }
    for (let i = 0; i < 25; i++) {
      s.spawnEnemy({ type: 'normal', hp: 99999, wave: 1 })
      const e = s.enemies[s.enemies.length - 1]
      e.pathDist = (i / 25) * s.path.total * 0.9
      e.syncPixel(s.path, s.L)
    }
    return { towers: n, enemies: s.enemies.length, pool: s.projPool.length }
  })
  say('满场塔已建立', before.towers >= 15, 'towers=' + before.towers)

  await page.waitForTimeout(8000)

  const after = await page.evaluate(() => {
    const s = window.game.scene.getScene('Game')
    return {
      live: s.projectiles.length,
      pool: s.projPool.length,
      enemies: s.enemies.length,
      children: s.children.list.length,
      fps: s.game.loop.actualFps,
    }
  })
  say('弹道池规模可控（未无限增长）', after.pool < 200, 'pool=' + after.pool + ' live=' + after.live)
  say('场景显示对象数未失控', after.children < 600, 'children=' + after.children)
  console.log(`    （参考：场上 ${after.enemies} 怪 / 弹道 ${after.live} 活 + ${after.pool} 空闲 / FPS ${after.fps.toFixed(0)}）`)
}

console.log('\n──── 反复进出场景 8 次（场景泄漏）────')
{
  const childrenCounts = []
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.game.scene.getScene('Game').scene.start('Menu'))
    await page.waitForTimeout(350)
    await clickButton(page, 'Menu', '开始游戏')
    await page.waitForTimeout(350)
    await clickButton(page, 'LevelSelect', '教学')
    await page.waitForTimeout(900)

    const c = await page.evaluate(() => {
      const s = window.game.scene.getScene('Game')
      return s && s.children ? s.children.list.length : -1
    })
    childrenCounts.push(c)
  }

  const first = childrenCounts[0]
  const last = childrenCounts[childrenCounts.length - 1]
  say('反复进出后场景对象数不增长', last <= first + 3,
      `第1次 ${first} → 第8次 ${last}（持续增长 = 泄漏）`)
  console.log('    ' + childrenCounts.join(' → '))
}

console.log('\n──── 完整跑一关（加速）────')
{
  await page.evaluate(() => {
    const s = window.game.scene.getScene('Game')
    s.economy.gold = 1e9
    s.speed = 4
    s.lives = 9999        // 只测稳定性，不测平衡
    for (let cy = 0; cy < 5; cy++) {
      for (let cx = 0; cx < 8; cx++) if (s.canBuild(cx, cy)) s.buildTower(cx, cy, 'arrow')
    }
  })

  const t0 = Date.now()
  let peakChildren = 0
  let done = false
  while (Date.now() - t0 < 45000 && !done) {
    await page.waitForTimeout(2000)
    const st = await page.evaluate(() => {
      const s = window.game.scene.getScene('Game')
      if (!s || !s.wm) return null
      return { wave: s.wm.wave, phase: s.wm.phase, children: s.children.list.length }
    })
    if (st) peakChildren = Math.max(peakChildren, st.children)
    done = await page.evaluate(() =>
      window.game.scene.getScenes(true).some(s => s.scene.key === 'Result'))
  }

  say('加速下能推进到结算（未卡死）', done === true,
      done ? '已到 ResultScene' : '45 秒内未跑完（可能只是不够快，非错误）')
  say('全程场景对象数峰值可控', peakChildren < 800, 'peak=' + peakChildren)
}

const mb = await heap()
console.log(`\n  堆内存（若可用）：${mb === null ? '不可读（非 Chrome 或未开启精确内存）' : mb + ' MB'}`)

await page.close()
await browser.close()

if (errs.length) {
  console.log('\nJS 错误:')
  for (const e of errs.slice(0, 5)) console.log('  ' + e)
}
console.log(`\n──── 汇总 ────`)
console.log(`通过 ${pass} · 失败 ${failed.length}${errs.length ? ' · JS 错误 ' + errs.length : ' · JS 错误 0'}`)
if (failed.length) console.log('失败项: ' + failed.join(' | '))
process.exit(failed.length || errs.length ? 1 : 0)
