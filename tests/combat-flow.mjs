// Phase 4 集成验证 —— node tests/combat-flow.mjs [baseUrl]
//
// 通过真实页面里的 GameScene 实例验证：
//   建造（含全部失败分支）· 升级 · 满级 · 协同生效 · 卖塔退款 · 实战击杀
//
// 不替代真机测试，但能确保逻辑与渲染接线正确。

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

const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 })
const errs = []
page.on('pageerror', e => errs.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()) })

let pass = 0
const fail = []
const say = (name, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + name) }
  else { fail.push(name); console.log('  ❌ ' + name + (extra ? '   ' + extra : '')) }
}

await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 30000 })
await page.waitForTimeout(1600)
await enterGame(page)     // 动态定位按钮，不依赖硬编码坐标

// 进入建造模式前的准备工作：把场景暴露给测试用的辅助函数
await page.evaluate(() => {
  const s = window.game.scene.getScene('Game')
  window.__t = {
    s,
    state: () => s.getState(),
    build: (cx, cy, type) => s.buildTower(cx, cy, type),
    upgrade: (cx, cy) => s.upgradeTower(cx, cy),
    sell: (cx, cy) => s.sellTower(cx, cy),
    towerAt: (cx, cy) => {
      const t = s.towerAt(cx, cy)
      return t && {
        type: t.type, level: t.level, invested: t.invested,
        damage: t.damage, range: t.range, fireRate: t.fireRate,
        stacks: t.synergy.stacks, damageMult: t.synergy.damageMult,
        specials: t.synergy.specials.map(x => x.stat),
        splash: t.splash, chain: t.chain, pierce: t.pierce,
      }
    },
    gridType: (cx, cy) => s.grid[cy][cx],
    // 把一只敌人直接放到路径上的指定里程，用于确定性测试
    putEnemy: (pathDist, hp = 100, armor = 0) => {
      s.spawnEnemy({ type: 'normal', hp, wave: 1 })
      const e = s.enemies[s.enemies.length - 1]
      e.armor = armor
      e.pathDist = pathDist
      e.syncPixel(s.path, s.L)
      return { gx: e.gx, gy: e.gy }
    },
    enemies: () => s.enemies.map(e => ({ hp: e.hp, alive: e.alive, gx: +e.gx.toFixed(2), gy: +e.gy.toFixed(2) })),
    clearEnemies: () => {
      for (const e of [...s.enemies]) s.removeEnemy(e)
    },
  }
})

console.log('\n──── 建造 ────')
{
  const r = await page.evaluate(() => {
    const { state, build } = window.__t
    const before = state().gold
    const res = build(1, 1, 'arrow')
    // 只回传可序列化字段 —— buildTower 返回的 tower 是 Phaser 对象，含循环引用
    return { before, ok: res.ok, reason: res.reason, after: state().gold, t: window.__t.towerAt(1, 1) }
  })
  say('建造箭塔成功', r.ok === true, `ok=${r.ok} reason=${r.reason ?? '-'}`)
  say(`金币从 ${r.before} 扣到 ${r.after}（造价 50）`, r.after === r.before - 50,
      `${r.before} → ${r.after}`)
  say('塔属性已初始化（Lv1 伤害 10、射程 2.2）', r.t && r.t.level === 1 && r.t.damage === 10 && r.t.range === 2.2,
      JSON.stringify(r.t))
}

{
  const r = await page.evaluate(() => {
    const { build, gridType, state } = window.__t
    // (0,2) 是路径起点
    const onPath = build(0, 2, 'arrow')
    const onTower = build(1, 1, 'cannon')
    const before = state().gold
    // 疯狂建塔直到金币不足
    let res = { ok: true }
    let guard = 0
    for (let cy = 0; cy < 5 && res.ok && guard++ < 60; cy++) {
      for (let cx = 0; cx < 8 && res.ok; cx++) res = build(cx, cy, 'sniper')
    }
    return {
      onPath: { ok: onPath.ok, reason: onPath.reason },
      onTower: { ok: onTower.ok, reason: onTower.reason },
      reason: res.reason,
      gridPathType: gridType(0, 2),
      spentAll: state().gold,
    }
  })
  say('路径格上建造被拒（invalid-cell）', r.onPath.ok === false && r.onPath.reason === 'invalid-cell',
      JSON.stringify(r.onPath))
  say('已有塔的格子被拒（禁止覆盖，spec §5.2 硬规则）',
      r.onTower.ok === false && r.onTower.reason === 'invalid-cell', JSON.stringify(r.onTower))
  say('金币耗尽后建造被拒（no-gold）', r.reason === 'no-gold', 'reason=' + r.reason)
}

console.log('\n──── 六种塔均可建造 ────')
{
  const r = await page.evaluate(() => {
    const s = window.__t.s
    for (const t of [...s.towers]) s.sellTower(t.cx, t.cy)
    s.economy.gold = 10000

    // 全部选非路径格：路径格为
    //   (0,2)(1,2)(2,2)(2,1)(2,0)(3,0)(4,0)(5,0)(5,1)(5,2)(5,3)(5,4)(6,4)(7,4)
    const plan = [
      ['arrow', 0, 0], ['cannon', 1, 0], ['ice', 3, 1],
      ['tesla', 6, 0], ['poison', 7, 0], ['sniper', 7, 1],
    ]
    return plan.map(([id, cx, cy]) => {
      const res = window.__t.build(cx, cy, id)
      const t = window.__t.towerAt(cx, cy)
      return { id, ok: res.ok, reason: res.reason, level: t && t.level, damage: t && t.damage }
    })
  })

  const bad = r.filter(x => !x.ok)
  say('6 种塔全部建造成功', bad.length === 0, JSON.stringify(bad))
  say('每种塔都初始化为 Lv1 且有伤害',
      r.every(x => x.level === 1 && x.damage > 0),
      JSON.stringify(r.map(x => `${x.id}:L${x.level}/d${x.damage}`)))
}

console.log('\n──── 协同 ────')
{
  const r = await page.evaluate(() => {
    const s = window.__t.s
    for (const t of [...s.towers]) s.sellTower(t.cx, t.cy)
    s.economy.gold = 1000

    // 地图 1 的路径格（不可建）：
    //   (0,2)(1,2)(2,2)(2,1)(2,0)(3,0)(4,0)(5,0)(5,1)(5,2)(5,3)(5,4)(6,4)(7,4)
    // 所以 (4,2) 与它的邻居 (3,2)/(4,1)/(4,3) 都可建。
    // （此前误选 (2,1)，那其实是路径段 (2,2)→(2,0) 上的一格，导致建造被拒）
    const C = [4, 2]
    window.__t.build(C[0], C[1], 'arrow')
    const alone = window.__t.towerAt(...C)

    window.__t.build(3, 2, 'cannon')   // 异类邻居（左）
    const withOne = window.__t.towerAt(...C)

    window.__t.build(4, 1, 'ice')      // 异类邻居（上）—— 同时触发冰邻接特例
    const withTwo = window.__t.towerAt(...C)

    window.__t.build(4, 3, 'arrow')    // **同类**邻居（下）—— 不应加层
    const withSame = window.__t.towerAt(...C)

    return { alone, withOne, withTwo, withSame, allBuilt: !!(alone && withOne && withTwo && withSame) }
  })

  if (!r.allBuilt) {
    say('三座塔均已建成（前置条件）', false, '有塔未建成，后续断言无意义')
  } else {
    say('孤立塔 multiplicative 系数 = 1.0', r.alone.damageMult === 1, 'mult=' + r.alone.damageMult)
    say('1 个异类邻居 → 1 层 / ×1.05',
        r.withOne.stacks === 1 && Math.abs(r.withOne.damageMult - 1.05) < 1e-9,
        `stacks=${r.withOne.stacks} mult=${r.withOne.damageMult}`)
    say('2 个异类邻居 → 2 层 / ×1.10',
        r.withTwo.stacks === 2 && Math.abs(r.withTwo.damageMult - 1.10) < 1e-9,
        `stacks=${r.withTwo.stacks} mult=${r.withTwo.damageMult}`)
    say('叠加同类邻居不加层（防 6 种塔退化成 1 种）',
        r.withSame.stacks === 2 && Math.abs(r.withSame.damageMult - 1.10) < 1e-9,
        `stacks=${r.withSame.stacks}（期望仍为 2）`)
    say('冰邻接使箭塔获得攻速特例',
        r.withTwo.specials.includes('fireRate'), 'specials=' + JSON.stringify(r.withTwo.specials))
    say('特例确实抬高了攻速（> 基础 1.6）',
        r.withTwo.fireRate > 1.6, `fireRate=${r.withTwo.fireRate.toFixed(3)}`)
  }
}

console.log('\n──── 升级与满级 ────')
{
  const r = await page.evaluate(() => {
    const { state, upgrade, towerAt, build } = window.__t
    const s = window.__t.s
    for (const t of [...s.towers]) s.sellTower(t.cx, t.cy)
    s.economy.gold = 1000

    build(4, 4, 'arrow')
    const g0 = state().gold
    const up1 = upgrade(4, 4)
    const lv2 = towerAt(4, 4)
    const up2 = upgrade(4, 4)
    const lv3 = towerAt(4, 4)
    const up3 = upgrade(4, 4)          // 已满级
    return { g0, up1: up1.ok, lv2, up2: up2.ok, lv3, up3: up3.reason, gold: state().gold }
  })

  say('升到 Lv2 成功', r.up1 === true && r.lv2.level === 2, JSON.stringify(r.lv2))
  say('升到 Lv3 成功', r.up2 === true && r.lv3.level === 3, JSON.stringify(r.lv3))
  say('满级后再升级被拒（max-level）', r.up3 === 'max-level', 'reason=' + r.up3)
  say('Lv3 带穿透质变', r.lv3.pierce === 2, 'pierce=' + r.lv3.pierce)
  say('累计投入 = 50+60+120 = 230', r.lv3.invested === 230, 'invested=' + r.lv3.invested)
  say('升级共扣 180', r.g0 - r.gold === 180, `${r.g0} → ${r.gold}`)
}

console.log('\n──── 卖塔退款 ────')
{
  const r = await page.evaluate(() => {
    const { state, sell, towerAt } = window.__t
    const before = state().gold
    const res = sell(4, 4)                       // invested 230 → 退款 floor(230*0.7)=161
    return { before, res, after: state().gold, gone: towerAt(4, 4) }
  })
  say('卖塔返回退款 161（floor(230 × 0.7)）', r.res.ok === true && r.res.refund === 161,
      JSON.stringify(r.res))
  say('金币正确增加 161', r.after === r.before + 161, `${r.before} → ${r.after}`)
  say('塔已从场上移除', r.gone === null)
}

console.log('\n──── 实战击杀 ────')
{
  const r = await page.evaluate(async () => {
    const { s, build, putEnemy, enemies, clearEnemies, state } = window.__t
    for (const t of [...s.towers]) s.sellTower(t.cx, t.cy)
    clearEnemies()
    s.economy.gold = 1000
    s.lives = 20

    // 路径： (0,2)→(2,2)→(2,0)…  把塔放在 (1,1)（距路径 (1,2) 一格）
    build(1, 1, 'arrow')
    const goldBefore = state().gold

    // 敌人属性要与塔的 DPS 匹配：
    //   箭塔 Lv1 = 伤害 10 / 攻速 1.6/s
    //   塔在 (1,1)、射程 2.2 格，敌人在射程内的行程约 pathDist 1.4~4.9（≈2.9 秒）
    //   → 单次经过最多打约 46 点伤害
    // 曾用 100 HP（需 6.25 秒），窗口根本不够，导致误报"未击杀"。
    const pos = putEnemy(1.4, 30)      // 3 发即杀，约 1.9 秒

    return new Promise(resolve => {
      setTimeout(() => {
        const alive = enemies().length
        resolve({
          pos,
          goldBefore,
          goldAfter: state().gold,
          alive,
          remaining: enemies().map(e => e.hp),
        })
      }, 4000)
    })
  })

  say('敌人被放在了塔射程内', r.pos && Math.abs(r.pos.gy - 2) < 1.5, JSON.stringify(r.pos))
  say('4 秒后敌人已被击杀（场上清空）', r.alive === 0, 'alive=' + r.alive + ' hp=' + JSON.stringify(r.remaining))
  say('击杀带来赏金收入', r.goldAfter > r.goldBefore, `${r.goldBefore} → ${r.goldAfter}`)
}

await page.close()
await browser.close()

if (errs.length) {
  console.log('\nJS 错误:')
  for (const e of errs) console.log('  ' + e)
}

console.log(`\n──── 汇总 ────`)
console.log(`通过 ${pass} · 失败 ${fail.length}${errs.length ? ' · JS 错误 ' + errs.length : ' · JS 错误 0'}`)
if (fail.length) console.log('失败项: ' + fail.join(' | '))

process.exit(fail.length || errs.length ? 1 : 0)
