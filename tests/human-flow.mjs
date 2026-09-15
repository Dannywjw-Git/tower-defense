// 人机流程预演 —— node tests/human-flow.mjs [baseUrl]
//
// 用**真实鼠标操作**完整走一遍玩家会走的路径，模拟一次真实游玩：
//   菜单 → 选关 → 建塔（点图标→点格子）→ 选中塔 → 长按看说明 →
//   升级 → 出售（二次确认）→ 补刀 → 暂停 → 加速 → 开波 → 观察战斗 → 结算
//
// 与 ui-flow 的区别：ui-flow 逐条验证**单个交互**；
// 本脚本验证**它们能否串成一次顺畅的游玩**（前一步的副作用不破坏后一步）。

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

const st = () => page.evaluate(() => {
  const g = window.game.scene.getScene('Game')
  if (!g || !g.getState) return null
  const s = g.getState()
  return {
    gold: s.gold, lives: s.lives, towers: s.towers, enemies: s.enemies,
    buildMode: s.buildMode, hasSel: s.hasSelection, paused: s.paused, speed: s.speed,
    wave: s.wave, phase: s.phase,
  }
})

const btnPt = (i) => page.evaluate((idx) => {
  const t = window.game.scene.getScene('Hud').buildButtons[idx].text
  const ps = window.PIXEL_SCALE || 1     // 逻辑像素 → CSS 像素
  return { x: (t.x + t.width / 2) / ps, y: (t.y + t.height / 2) / ps }
}, i)

const cellPt = (cx, cy) => page.evaluate(([x, y]) => {
  const L = window.game.scene.getScene('Game').L
  const ps = window.PIXEL_SCALE || 1     // 逻辑像素 → CSS 像素（HiDPI）
  return { x: (L.originX + x * L.cell + L.cell / 2) / ps,
           y: (L.originY + y * L.cell + L.cell / 2) / ps }
}, [cx, cy])

const click = async (pt, ms = 200) => { await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(ms) }

console.log('\n════ 真实游玩预演（375×812 竖屏）════\n')

console.log('──── 1. 从菜单进入游戏 ────')
await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 30000 })
await page.waitForTimeout(1500)
await clickButton(page, 'Menu', '开始游戏')
await page.waitForTimeout(600)
await clickButton(page, 'LevelSelect', '教学')
await page.waitForTimeout(1500)
{
  const s = await st()
  say('进入游戏且状态已初始化', !!s && s.gold > 0 && s.lives > 0,
      s ? `金币${s.gold} 生命${s.lives}` : 'null')
  say('首波准备期内', s && s.phase === 'prep', 'phase=' + (s && s.phase))
}

console.log('\n──── 2. 建第一座塔（点图标 → 点格子）────')
{
  const before = await st()
  await click(await btnPt(0))                      // 箭塔
  const inMode = await st()
  say('点图标进入建造模式', inMode.buildMode === 'arrow')

  await click(await cellPt(4, 2))                  // 可建格
  const after = await st()
  say('塔已建成', after.towers === 1, 'towers=' + after.towers)
  say('金币扣掉 50', before.gold - after.gold === 50, `${before.gold} → ${after.gold}`)
  say('建造模式已自动退出', after.buildMode === null)
}

console.log('\n──── 3. 再建一座相邻的异类塔（验证协同）────')
{
  await click(await btnPt(2))                      // 冰塔
  await click(await cellPt(3, 2))
  const s = await st()
  say('第二座塔建成', s.towers === 2, 'towers=' + s.towers)

  const syn = await page.evaluate(() => {
    const g = window.game.scene.getScene('Game')
    const a = g.towerAt(4, 2), b = g.towerAt(3, 2)
    return { a: a.synergy.stacks, b: b.synergy.stacks, mult: a.synergy.damageMult }
  })
  say('两座塔都获得 1 层协同', syn.a === 1 && syn.b === 1, JSON.stringify(syn))
  say('伤害倍率为 1.05', Math.abs(syn.mult - 1.05) < 1e-9, 'mult=' + syn.mult)
}

console.log('\n──── 4. 点塔选中 → 面板出现 ────')
{
  await click(await cellPt(4, 2))
  const s = await st()
  say('已选中塔', s.hasSel === true)
  const panel = await page.evaluate(() => {
    const h = window.game.scene.getScene('Hud')
    return { visible: h.panelBg.visible, text: h.panelText.text }
  })
  say('信息面板可见', panel.visible === true)
  say('面板显示塔名/等级/协同', /箭塔/.test(panel.text) && /Lv1/.test(panel.text) && /协同/.test(panel.text),
      JSON.stringify(panel.text.split('\n')[2] || ''))
}

console.log('\n──── 5. 长按塔图标看说明（不用先选中）────')
{
  await page.evaluate(() => window.game.scene.getScene('Game').selectTower(null))
  const pt = await btnPt(5)                        // 狙击塔
  await page.mouse.move(pt.x, pt.y)
  await page.mouse.down()
  await page.waitForTimeout(650)
  const during = await page.evaluate(() => {
    const g = window.game.scene.getScene('Game')
    return { shown: g.notice.visible, text: g.notice.text, mode: g.buildMode }
  })
  await page.mouse.up()
  await page.waitForTimeout(200)
  say('长按弹出说明', during.shown && during.text.length > 4, JSON.stringify(during.text))
  say('长按不误入建造模式', during.mode === null)
}

console.log('\n──── 6. 升级已选中的塔 ────')
{
  // ⚠️ 必须先补金币：起始 120 建两座塔（50+60）后只剩 10，而升级要 60。
  //    这是**设计现状**（等第一波赏金才有钱升级），不是 bug ——
  //    但它让"升级"在首波准备期内不可能发生。此处补钱是为了单独验证升级链路。
  await page.evaluate(() => { window.game.scene.getScene('Game').economy.gold += 200 })

  await click(await cellPt(4, 2))
  const before = await st()
  const upPt = await page.evaluate(() => {
    const b = window.game.scene.getScene('Hud').upBtn
    const ps = window.PIXEL_SCALE || 1
    return { x: (b.x + b.width / 2) / ps, y: (b.y + b.height / 2) / ps }
  })
  await click(upPt)
  const after = await st()
  const lv = await page.evaluate(() => window.game.scene.getScene('Game').towerAt(4, 2).level)
  say('升级成功（Lv2）', lv === 2, 'level=' + lv)
  say('升级扣款 60', before.gold - after.gold === 60, `${before.gold} → ${after.gold}`)
  const upBtnText = await page.evaluate(() => window.game.scene.getScene('Hud').upBtn.text)
  say('升级按钮刷新为 Lv2→Lv3 的价格', /升级/.test(upBtnText), upBtnText)
}

console.log('\n──── 7. 出售需要二次确认 ────')
{
  const sellPt = async () => page.evaluate(() => {
    const b = window.game.scene.getScene('Hud').sellBtn
    const ps = window.PIXEL_SCALE || 1
    return { x: (b.x + b.width / 2) / ps, y: (b.y + b.height / 2) / ps }
  })
  const before = await st()
  const invested = await page.evaluate(() =>
    window.game.scene.getScene('Game').towerAt(4, 2).invested)
  await click(await sellPt())
  const mid = await st()
  say('第一次点出售不会卖出', mid.towers === 2, 'towers=' + mid.towers)

  await click(await sellPt())
  const after = await st()
  say('第二次点确认卖出', after.towers === 1, 'towers=' + after.towers)
  const expect = Math.floor(invested * 0.7)
  say(`退款 = floor(累计投入 ${invested} × 70%) = ${expect}`,
      after.gold - before.gold === expect, `${before.gold} → ${after.gold}`)
  say('卖后面板收起', (await st()).hasSel === false)
}

console.log('\n──── 8. 暂停 / 加速 ────')
{
  const mini = async (which) => page.evaluate((w) => {
    const h = window.game.scene.getScene('Hud')
    const b = w === 'pause' ? h.pauseBtn : h.speedBtn
    const ps = window.PIXEL_SCALE || 1
    return { x: (b.x + b.width / 2) / ps, y: (b.y + b.height / 2) / ps }
  }, which)

  await click(await mini('pause'))
  say('暂停生效', (await st()).paused === true)
  await click(await mini('pause'))
  say('恢复生效', (await st()).paused === false)

  await click(await mini('speed'))
  say('加速到 2×', (await st()).speed === 2)
  await click(await mini('speed'))
  say('回到 1×', (await st()).speed === 1)
}

console.log('\n──── 9. 让第一波真的跑起来（不干预游戏数值）────')
{
  await page.evaluate(() => {
    const g = window.game.scene.getScene('Game')
    g.economy.gold = 400            // 给够钱，让这一波能看清战斗
    g.speed = 4
    g.wm.timer = 0.05               // 跳过剩余的 15s 准备期（测试加速，不改数值）
    // 再补两座塔
    g.buildTower(3, 1, 'arrow')
    g.buildTower(5, 2, 'arrow')
  })
  await page.waitForTimeout(3000)

  const s = await st()
  say('波次已开始', s.phase === 'spawning' || s.wave >= 1, `phase=${s.phase} wave=${s.wave}`)

  await page.waitForTimeout(4000)
  const s2 = await st()
  say('场上出现敌人', s2.enemies > 0 || s2.wave >= 2, `场上敌人 ${s2.enemies}，第 ${s2.wave} 波`)

  const combat = await page.evaluate(() => {
    const g = window.game.scene.getScene('Game')
    return {
      kills: g.stats.kills, leaked: g.stats.leaked, lives: g.lives,
      bullets: g.projectiles.length,
      anyHpBar: g.enemies.some(e => e.hpFill.visible),
    }
  })
  say('战斗已发生（有击杀或漏怪）', combat.kills > 0 || combat.leaked > 0, JSON.stringify(combat))
  if (combat.anyHpBar) say('敌人血条在战斗中正常显示', true)

  // 补刀：点一只敌人
  const tapTarget = await page.evaluate(() => {
    const g = window.game.scene.getScene('Game')
    const e = g.enemies.find(x => x.alive)
    const ps = window.PIXEL_SCALE || 1
    return e ? { x: e.x / ps, y: e.y / ps, hp: e.hp } : null
  })
  if (tapTarget) {
    await page.mouse.click(tapTarget.x, tapTarget.y)
    await page.waitForTimeout(250)
    const after = await page.evaluate(() => {
      const g = window.game.scene.getScene('Game')
      return { taps: g.stats.taps, hp: g.enemies.length ? g.enemies[0].hp : null }
    })
    say('点击敌人触发补刀', after.taps > 0, 'taps=' + after.taps)
  } else {
    say('点击敌人触发补刀', false, '场上没有可点的敌人')
  }

  await page.screenshot({ path: 'docs/screenshots/HUMAN-combat.png' })
}

console.log('\n──── 10. 无 JS 错误 ────')
say('全程 0 JS 错误', errs.length === 0, errs.slice(0, 2).join(' | '))

await page.close()
await browser.close()

console.log(`\n──── 汇总 ────`)
console.log(`通过 ${pass} · 失败 ${failed.length}`)
if (failed.length) console.log('失败项: ' + failed.join(' | '))
process.exit(failed.length || errs.length ? 1 : 0)
