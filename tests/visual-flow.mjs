// 视觉与布局结构检查 —— node tests/visual-flow.mjs [baseUrl]
//
// 这个脚本的每一条断言，都对应一个**看图才发现、而当时测试全绿**的真实缺陷：
//
//   · 信息面板压住建造栏 → 玩家点不到「箭/炮/冰」三个按钮
//   · 底部挂着一条与 HUD 完全重复的调试提示条
//   · 引导提示飘在地图上方几百像素的空白处
//   · 塔和敌人都是纯色圆点 → 分不清哪个是塔（且毒塔与坦克同紫色）
//   · 敌人没有血条 → spec §5.2 的「点击补刀」失去判断依据
//
// 教训：**"程序坐标能点中"不等于"玩家能点中"**。
// 几何重叠、形状混淆、信息缺失这三类问题，功能断言一个都抓不到。

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

let pass = 0
const failed = []
const say = (name, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + name) }
  else { failed.push(name); console.log('  ❌ ' + name + (extra ? '   ' + extra : '')) }
}

const VIEWPORTS = [
  { n: '320×568', w: 320, h: 568 },
  { n: '375×812', w: 375, h: 812 },
  { n: '430×932', w: 430, h: 932 },
  { n: '812×375', w: 812, h: 375 },
  { n: '932×430', w: 932, h: 430 },
  { n: '1440×900', w: 1440, h: 900 },
]

console.log('\n──── 1. UI 元素不重叠（6 视口 · 选中塔后）────')
for (const v of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: v.w, height: v.h } })
  const errs = []
  page.on('pageerror', e => errs.push(e.message))
  await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 30000 })
  await page.waitForTimeout(1000)
  await enterGame(page)

  const r = await page.evaluate(() => {
    const h = window.game.scene.getScene('Hud')
    const g = window.game.scene.getScene('Game')
    g.economy.gold = 100000
    g.tutorial = []
    g.buildTower(4, 2, 'arrow')
    g.selectTower(g.towerAt(4, 2))

    const rect = (o, w, hh) => ({ x: o.x, y: o.y, w: w ?? o.width, h: hh ?? o.height })
    const panel = rect(h.panelBg, h.panelBg.width, h.panelBg.height)
    // 建造栏整体包围盒
    const btns = h.buildButtons.map(b => b.text)
    const bx0 = Math.min(...btns.map(t => t.x))
    const by0 = Math.min(...btns.map(t => t.y))
    const bx1 = Math.max(...btns.map(t => t.x + t.width))
    const by1 = Math.max(...btns.map(t => t.y + t.height))
    const bar = { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 }
    const cancel = rect(h.cancelBtn, h.cancelBtn.width, h.cancelBtn.height)

    const overlaps = (a, b) =>
      a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

    // 暂停/加速按钮是否落在建造栏上
    const miniOverlap = [h.pauseBtn, h.speedBtn]
      .some(m => overlaps(rect(m, m.width, m.height), bar))

    return {
      panelVisible: h.panelBg.visible,
      panelBarOverlap: overlaps(panel, bar),
      panelCancelOverlap: overlaps(panel, cancel),
      miniOverlap,
      W: h.scale.width, H: h.scale.height,
      bar, panel, cancel,
    }
  })

  say(`${v.n} 面板不压建造栏`, !r.panelBarOverlap,
      r.panelBarOverlap ? `面板 y${r.panel.y.toFixed(0)}–${(r.panel.y + r.panel.h).toFixed(0)} vs 栏 y${r.bar.y.toFixed(0)}–${(r.bar.y + r.bar.h).toFixed(0)}` : '')
  say(`${v.n} 面板不压「取消」按钮`, !r.panelCancelOverlap)
  say(`${v.n} 暂停/加速不压建造栏`, !r.miniOverlap)

  // 建造栏必须在屏幕内
  const inScreen = r.bar.x >= 0 && r.bar.y >= 0 &&
                   r.bar.x + r.bar.w <= r.W + 1 && r.bar.y + r.bar.h <= r.H + 1
  say(`${v.n} 建造栏完整在屏内`, inScreen,
      `栏 (${r.bar.x.toFixed(0)},${r.bar.y.toFixed(0)}) ${r.bar.w.toFixed(0)}×${r.bar.h.toFixed(0)} / 屏 ${r.W}×${r.H}`)

  if (errs.length) say(`${v.n} 无 JS 错误`, false, errs[0])
  if (v.n === '320×568') {
    // 320 屏最容易出问题，顺便确认建造栏没被挤出屏幕
    say('320 窄屏建造栏仍可用（未溢出）', inScreen && r.bar.w > 100,
        `栏宽 ${r.bar.w.toFixed(0)}px`)
  }
  await page.close()
}

console.log('\n──── 2. 塔与敌人的形状必须不同（否则玩家分不清）────')
{
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 30000 })
  await page.waitForTimeout(1000)
  await enterGame(page)
  const r = await page.evaluate(() => {
    const g = window.game.scene.getScene('Game')
    g.economy.gold = 100000
    g.tutorial = []
    g.buildTower(4, 2, 'arrow')
    g.spawnEnemy({ type: 'normal', hp: 100, wave: 1 })
    const e = g.enemies[g.enemies.length - 1]
    e.pathDist = 2; e.syncPixel(g.path, g.L)
    const t = g.towerAt(4, 2)

    // ⚠️ 不能用 `radius` in o 判断形状：Phaser 的 Shape 基类**总是**带 radius 属性，
    //    Rectangle 也有（它默认是 0）。得看**几何对象的类型**才有意义。
    //    Phaser 的对象会被压缩/包装，所以直接嗅探 geom 的形状属性：
    //    Circle/Ellipse 有 _radius，Rectangle 有 width/height 且无 _radius。
    const shapeOf = (o) => {
      const gm = o.geom
      if (!gm) return 'none'
      if (gm._radius !== undefined || gm.radius !== undefined) return 'circle'
      if (gm.width !== undefined && gm.height !== undefined) return 'rect'
      return 'other'
    }
    // ⚠️ 塔自 C1 起是 **Container**（方块底 rect + 图标 graphics），
    //    所以形状要看它的子对象 `t.rect`，不是容器本身（容器无 geom）。
    return {
      towerShape: shapeOf(t.rect), enemyShape: shapeOf(e),
      towerR: t.rect.radius, enemyR: e.radius,
      towerW: Math.round(t.rect.width), towerH: Math.round(t.rect.height),
      hasIconG: !!t.iconG,
    }
  })
  say('塔用矩形几何绘制', r.towerShape === 'rect', 'geom=' + r.towerShape)
  say('敌人用圆形几何绘制', r.enemyShape === 'circle', 'geom=' + r.enemyShape)
  say('塔与敌人形状不同（玩家可分辨）', r.towerShape !== r.enemyShape,
      `${r.towerShape} vs ${r.enemyShape}`)
  say('塔带图标层（C1：形状+颜色双重编码）', r.hasIconG, 'iconG=' + r.hasIconG)
  await page.close()
}

console.log('\n──── 3. 敌人血条（spec §5.2 补刀的前提）────')
{
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 30000 })
  await page.waitForTimeout(1000)
  await enterGame(page)
  const r = await page.evaluate(() => {
    const g = window.game.scene.getScene('Game')
    g.tutorial = []
    g.spawnEnemy({ type: 'normal', hp: 100, wave: 1 })
    const e = g.enemies[g.enemies.length - 1]
    e.pathDist = 2; e.syncPixel(g.path, g.L)
    const full = { visible: e.hpFill.visible, w: e.hpFill.width, bgW: e.hpBg.width }
    // 掉到 30%
    e.hp = 30; e.syncPixel(g.path, g.L)
    const low = { w: e.hpFill.width, color: '0x' + (e.hpFill.fillColor >>> 0).toString(16) }
    // 掉到 10%
    e.hp = 10; e.syncPixel(g.path, g.L)
    const crit = { w: e.hpFill.width, color: '0x' + (e.hpFill.fillColor >>> 0).toString(16) }
    // 上方位置（血条应在头顶之上）
    const aboveHead = e.hpBg.y < e.y
    // despawn 后必须隐藏
    g.removeEnemy(e)
    const afterDespawn = { bg: e.hpBg.visible, fill: e.hpFill.visible }
    return { full, low, crit, aboveHead, afterDespawn }
  })
  say('血条存在且可见', r.full.visible === true && r.full.bgW > 0)
  say('血条在敌人头顶上方', r.aboveHead === true)
  say('血条随 HP 缩短', r.low.w < r.full.w && r.crit.w < r.low.w,
      `${r.full.w.toFixed(1)} → ${r.low.w.toFixed(1)} → ${r.crit.w.toFixed(1)}`)
  say('血条按血量分级变色', r.low.color !== r.crit.color,
      `30%:${r.low.color} / 10%:${r.crit.color}`)
  say('敌人移除后血条隐藏（不残留）',
      r.afterDespawn.bg === false && r.afterDespawn.fill === false)
  await page.close()
}

console.log('\n──── 4. 调试信息只在 ?debug=1 时出现 ────')
{
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 30000 })
  await page.waitForTimeout(1000)
  await enterGame(page)
  await page.waitForTimeout(400)
  const normal = await page.evaluate(() => {
    const g = window.game.scene.getScene('Game')
    const h = window.game.scene.getScene('Hud')
    return { hint: g.hint.visible, debugText: !!h.debugText }
  })
  say('不带参数时底部提示条隐藏', normal.hint === false)
  say('不带参数时无调试面板', normal.debugText === false)
  await page.close()

  const page2 = await browser.newPage({ viewport: { width: 375, height: 812 } })
  await page2.goto(BASE + '/index.html?debug=1', { waitUntil: 'load', timeout: 30000 })
  await page2.waitForTimeout(1000)
  await enterGame(page2)
  await page2.waitForTimeout(400)
  const dbg = await page2.evaluate(() => {
    const g = window.game.scene.getScene('Game')
    const h = window.game.scene.getScene('Hud')
    const rect = (o) => ({ x: o.x, y: o.y, w: o.width, h: o.height })
    const overlaps = (a, b) =>
      a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    const dbgRect = { x: h.debugText.x - h.debugText.width, y: h.debugText.y,
                      w: h.debugText.width, h: h.debugText.height }
    return {
      hint: g.hint.visible, hintText: g.hint.text,
      debugBody: h.debugText.text,
      pauseOverlap: overlaps(rect(h.pauseBtn), dbgRect),
      speedOverlap: overlaps(rect(h.speedBtn), dbgRect),
      dbgRect, pause: rect(h.pauseBtn), speed: rect(h.speedBtn),
    }
  })
  say('?debug=1 时底部提示条显示', dbg.hint === true)
  say('?debug=1 时含 cell 尺寸（验收项②要读）', /cell \d/.test(dbg.hintText), dbg.hintText)
  say('调试面板含 FPS（验收项①要读）', /FPS/.test(dbg.debugBody), JSON.stringify(dbg.debugBody.slice(0, 30)))
  say('调试面板不遮暂停按钮', !dbg.pauseOverlap,
      `面板 x${dbg.dbgRect.x.toFixed(0)}–${(dbg.dbgRect.x + dbg.dbgRect.w).toFixed(0)} y${dbg.dbgRect.y.toFixed(0)}–${(dbg.dbgRect.y + dbg.dbgRect.h).toFixed(0)}` +
      ` vs 暂停 x${dbg.pause.x.toFixed(0)}–${(dbg.pause.x + dbg.pause.w).toFixed(0)} y${dbg.pause.y.toFixed(0)}–${(dbg.pause.y + dbg.pause.h).toFixed(0)}`)
  say('调试面板不遮加速按钮', !dbg.speedOverlap,
      `面板 y${dbg.dbgRect.y.toFixed(0)}–${(dbg.dbgRect.y + dbg.dbgRect.h).toFixed(0)} vs 加速 y${dbg.speed.y.toFixed(0)}–${(dbg.speed.y + dbg.speed.h).toFixed(0)}`)
  await page2.close()
}

console.log('\n──── 5. 引导提示贴近地图（不飘在空白里）────')
{
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 30000 })
  await page.waitForTimeout(1000)
  await enterGame(page)
  await page.waitForTimeout(300)
  const r = await page.evaluate(() => {
    const g = window.game.scene.getScene('Game')
    return { tutorialY: g.tutorialText.y, gridTop: g.L.originY, visible: g.tutorialText.visible }
  })
  say('引导提示可见（首关）', r.visible === true)
  say('引导提示在地图上方 60px 以内', r.visible && (r.gridTop - r.tutorialY) <= 60,
      `提示 y=${r.tutorialY.toFixed(0)} 地图顶 y=${r.gridTop.toFixed(0)} 间距 ${(r.gridTop - r.tutorialY).toFixed(0)}px`)
  await page.close()
}

console.log('\n──── 6. 塔图标（C1：玩家能分辨 6 种塔）────')
{
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 30000 })
  await page.waitForTimeout(1000)
  await enterGame(page)
  await page.waitForTimeout(300)

  const r = await page.evaluate(() => {
    const g = window.game.scene.getScene('Game')
    g.tutorial = []
    const ids = ['arrow', 'cannon', 'ice', 'tesla', 'poison', 'sniper']
    // ⚠️ 不要硬编码格坐标 —— 路径格不可建塔，猜错会得到 invalid-cell。
    //    从网格里动态挑出**全部可建格**（与 GameScene.canBuild 同口径）。
    const spots = []
    for (let cy = 0; cy < g.grid.length && spots.length < 6; cy++) {
      for (let cx = 0; cx < g.grid[0].length && spots.length < 6; cx++) {
        if (g.canBuild(cx, cy)) spots.push([cx, cy])
      }
    }
    const out = []
    ids.forEach((id, i) => {
      const [cx, cy] = spots[i]
      // 金币可能不足，直接给够（这是视觉检查，不是经济检查）
      g.economy.gold = 9999
      const res = g.buildTower(cx, cy, id)
      if (!res.ok) { out.push({ id, built: false, reason: res.reason }); return }
      const t = res.tower
      const cmds = t.iconG.commandBuffer || []
      out.push({
        id, built: true,
        // 指纹 = 绘制指令的类型与坐标序列，同款图标必然同指纹、异款必然异指纹
        fingerprint: cmds.map(c => `${c[0]}:${(c[1] || 0).toFixed(1)},${(c[2] || 0).toFixed(1)}`).join(';'),
        hasRect: !!t.rect,
        // 图标必须真的画了东西
        cmdCount: cmds.length,
        color: t.def.color,
      })
    })
    return { towers: out, iconIds: ids }
  })

  const built = r.towers.filter(t => t.built)
  say('6 种塔全部建成（可建格足够）', built.length === 6,
      built.length === 6 ? '' : JSON.stringify(r.towers.filter(t => !t.built)))

  const drawn = built.filter(t => t.cmdCount > 0)
  say('每座塔的图标都真的画了指令', drawn.length === 6,
      `有指令的塔 ${drawn.length}/6`)

  const uniq = new Set(drawn.map(t => t.fingerprint))
  say('6 种塔的图标**互不相同**（形状可区分）', uniq.size === 6,
      `不同图标 ${uniq.size}/6`)

  const colors = new Set(built.map(t => t.color))
  say('6 种塔的颜色也互不相同（颜色可区分）', colors.size === 6,
      `不同颜色 ${colors.size}/6`)

  // 建造按钮上的图标 —— 曾经因为用 `text.geom` 做守卫（Text 没有 geom）
  // 导致按钮图标**一个都没画**，而当时所有测试全绿。这里补上守卫。
  const btn = await page.evaluate(() => {
    const hud = window.game.scene.getScene('Hud')
    return hud.buildButtons.map(b => {
      const cmds = b.iconG.commandBuffer || []
      return { typeId: b.typeId, cmdCount: cmds.length, x: b.iconG.x, visible: b.iconG.visible }
    })
  })
  const drawnBtns = btn.filter(b => b.cmdCount > 0)
  say('6 个建造按钮都画了图标', drawnBtns.length === 6,
      `有图标的按钮 ${drawnBtns.length}/6`)

  await page.close()
}

await browser.close()

console.log(`\n──── 汇总 ────`)
console.log(`通过 ${pass} · 失败 ${failed.length}`)
if (failed.length) console.log('失败项: ' + failed.join(' | '))
process.exit(failed.length ? 1 : 0)
