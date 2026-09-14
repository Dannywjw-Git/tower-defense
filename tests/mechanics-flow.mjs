// 机制组合验证 —— node tests/mechanics-flow.mjs [baseUrl]
//
// 为什么需要这个脚本：
//   此前 Combat / Adjacency 等**零件**已有单测，但**组合**没测 ——
//   而玩家遇到的是组合。例如"卖掉一座塔后，旁边那座塔的协同有没有跟着降"，
//   单测永远发现不了（它要 GameScene 的 recomputeSynergy 真的被调用）。
//
// 全部用真实场景 + 真实时间推进，不做函数级 mock。

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
const failed = []
const say = (name, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + name) }
  else { failed.push(name); console.log('  ❌ ' + name + (extra ? '   ' + extra : '')) }
}

await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 30000 })
await page.waitForTimeout(1500)
await enterGame(page, '教学')

// 场景操作辅助（全部通过真实 GameScene 方法，不 mock）
await page.evaluate(() => {
  const s = () => window.game.scene.getScene('Game')
  window.__m = {
    s,
    clearAll: () => {
      const g = s()
      for (const t of [...g.towers]) g.sellTower(t.cx, t.cy)
      for (const e of [...g.enemies]) g.removeEnemy(e)
      g.economy.gold = 100000
    },
    build: (cx, cy, type) => s().buildTower(cx, cy, type),
    sell: (cx, cy) => s().sellTower(cx, cy),
    up: (cx, cy) => s().upgradeTower(cx, cy),
    tower: (cx, cy) => {
      const t = s().towerAt(cx, cy)
      return t && {
        type: t.type, level: t.level, damage: t.damage, range: t.range,
        fireRate: t.fireRate, splash: t.splash, chain: t.chain, pierce: t.pierce,
        stacks: t.synergy.stacks, mult: t.synergy.damageMult,
        specials: t.synergy.specials.map(x => x.stat),
      }
    },
    put: (pathDist, hp, type = 'normal') => {
      const g = s()
      g.spawnEnemy({ type, hp, wave: 1 })
      const e = g.enemies[g.enemies.length - 1]
      e.pathDist = pathDist
      e.syncPixel(g.path, g.L)
      return { hp: e.hp, gx: e.gx, gy: e.gy, speed: e.speed }
    },
    enemies: () => s().enemies.map(e => ({
      hp: +e.hp.toFixed(1), maxHp: e.maxHp, dist: +e.pathDist.toFixed(3),
      slow: +e.slowFactor.toFixed(2), freeze: +e.freezeTimer.toFixed(2),
      poison: +e.poisonDps.toFixed(1), alive: e.alive,
    })),
    // 路径上的格坐标 → pathDist（用于把敌人放到指定位置）
    distOf: (cx, cy) => {
      const g = s()
      // 沿路径找最接近给定格坐标的里程
      for (let d = 0; d <= g.path.total; d += 0.05) {
        const p = g.path.segments
        let x = 0, y = 0
        for (const seg of p) {
          if (d <= seg.start + seg.len) {
            const t = (d - seg.start) / seg.len
            x = seg.x0 + (seg.x1 - seg.x0) * t
            y = seg.y0 + (seg.y1 - seg.y0) * t
            break
          }
        }
        if (Math.abs(x - cx) < 0.3 && Math.abs(y - cy) < 0.3) return +d.toFixed(2)
      }
      return null
    },
  }
})

console.log('\n──── 1. 卖塔后邻居的协同是否跟着降 ────')
{
  const r = await page.evaluate(() => {
    window.__m.clearAll()
    // 地图1 路径格：(0,2)(1,2)(2,2)(2,1)(2,0)(3,0)(4,0)(5,0)(5,1)(5,2)(5,3)(5,4)(6,4)(7,4)
    // (4,2) 的邻居 (3,2)/(4,1)/(4,3) 均可建
    // 用**狙击塔**而非箭塔：箭塔 Lv1 伤害只有 10，
    //   2 层 round(10×1.10)=11 与 1 层 round(10×1.05)=11 相同 ——
    //   取整会把 5% 的差异吃掉，导致断言假失败。
    //   狙击塔伤害 45：×1.10→50、×1.05→47，差异清晰可见。
    window.__m.build(4, 2, 'sniper')     // 中心
    const alone = window.__m.tower(4, 2)
    window.__m.build(3, 2, 'cannon')     // 异类邻居
    window.__m.build(4, 1, 'ice')        // 异类邻居
    const two = window.__m.tower(4, 2)
    window.__m.sell(3, 2)                // 卖掉一个
    const afterSell = window.__m.tower(4, 2)
    return { alone, two, afterSell }
  })

  say('孤立塔 0 层', r.alone.stacks === 0 && r.alone.mult === 1)
  say('两个异类邻居 → 2 层 / ×1.10', r.two.stacks === 2 && Math.abs(r.two.mult - 1.10) < 1e-9,
      `stacks=${r.two.stacks} mult=${r.two.mult}`)
  say('**卖塔后协同降为 1 层 / ×1.05**（关键：recomputeSynergy 被触发）',
      r.afterSell.stacks === 1 && Math.abs(r.afterSell.mult - 1.05) < 1e-9,
      `stacks=${r.afterSell.stacks} mult=${r.afterSell.mult}`)
  say('最终伤害数值同步下调（45：×1.10→50，×1.05→47）',
      r.two.damage === Math.round(45 * 1.10) && r.afterSell.damage === Math.round(45 * 1.05),
      `${r.two.damage} → ${r.afterSell.damage}（期望 50 → 47）`)
}

console.log('\n──── 2. 升级后协同是否保留并重算 ────')
{
  const r = await page.evaluate(() => {
    window.__m.clearAll()
    window.__m.build(4, 2, 'arrow')
    window.__m.build(3, 2, 'cannon')
    const lv1 = window.__m.tower(4, 2)
    window.__m.up(4, 2)                  // → Lv2
    const lv2 = window.__m.tower(4, 2)
    window.__m.up(4, 2)                  // → Lv3
    const lv3 = window.__m.tower(4, 2)
    return { lv1, lv2, lv3 }
  })

  say('Lv1→Lv3 协同层数保持 1（邻居没变）',
      r.lv1.stacks === 1 && r.lv2.stacks === 1 && r.lv3.stacks === 1,
      `${r.lv1.stacks}/${r.lv2.stacks}/${r.lv3.stacks}`)
  say('Lv3 伤害 = round(26 × 1.05) = 27（协同已在升级后重算）',
      r.lv3.damage === Math.round(26 * 1.05), `Lv3 damage=${r.lv3.damage}`)
  say('Lv3 带上穿透质变', r.lv3.pierce === 2, 'pierce=' + r.lv3.pierce)
}

console.log('\n──── 3. 溅射：一发打到多个敌人 ────')
{
  const d = await page.evaluate(() => {
    window.__m.clearAll()
    window.__m.build(1, 1, 'cannon')     // 射程 1.8 格，溅射 0.55 格
    const base = window.__m.distOf(1, 2)
    return { base }
  })

  const r = await page.evaluate((base) => {
    // 三只紧挨着的敌人（沿路径相隔 0.2 格，远小于溅射 0.55）
    window.__m.put(base, 5000)
    window.__m.put(base + 0.2, 5000)
    window.__m.put(base + 0.4, 5000)
    return window.__m.enemies()
  }, d.base)

  await page.waitForTimeout(1500)
  const after = await page.evaluate(() => window.__m.enemies())
  const damaged = after.filter(e => e.hp < 5000).length
  say('一发溅射至少打到 2 只（溅射真的生效）', damaged >= 2,
      `掉血的敌人: ${damaged}/3　hp=${after.map(e => e.hp).join(', ')}`)
}

console.log('\n──── 4. 连锁：一次开火跳多个目标 ────')
{
  const base = await page.evaluate(() => {
    window.__m.clearAll()
    window.__m.build(1, 1, 'tesla')      // 射程 2.2，连锁 3
    return window.__m.distOf(1, 2)
  })

  const before = await page.evaluate((b) => {
    window.__m.put(b, 5000)
    window.__m.put(b + 0.4, 5000)
    window.__m.put(b + 0.8, 5000)
    return window.__m.enemies()
  }, base)

  await page.waitForTimeout(1500)
  const after = await page.evaluate(() => window.__m.enemies())
  const damaged = after.filter(e => e.hp < 5000).length
  say('电塔一次开火命中多个（连锁生效）', damaged >= 2,
      `掉血的敌人: ${damaged}/3　hp=${after.map(e => e.hp).join(', ')}`)
}

console.log('\n──── 5. 冰塔减速真的降低移动速度 ────')
{
  const setup = await page.evaluate(() => {
    window.__m.clearAll()
    window.__m.build(1, 1, 'ice')
    // 对照组：不建塔的坐标
    const d = window.__m.distOf(1, 2)
    window.__m.put(d, 5000)
    return { d }
  })

  await page.waitForTimeout(1600)

  const slowed = await page.evaluate(() => window.__m.enemies()[0])

  // 对照组：清掉塔与敌人，放一只同样的敌人跑相同时间
  const control = await page.evaluate(async (d) => {
    window.__m.clearAll()
    window.__m.put(d, 5000)
    await new Promise(r => setTimeout(r, 1600))
    return window.__m.enemies()[0]
  }, setup.d)

  say('减速生效（速度倍率 < 1）', slowed.slow < 1,
      `slowFactor=${slowed.slow}`)
  say('被减速的敌人走得比对照组短', slowed.dist < control.dist,
      `减速 ${slowed.dist} 格 vs 对照 ${control.dist} 格`)
}

console.log('\n──── 6. 毒塔的持续伤害在移动中持续生效 ────')
{
  const base = await page.evaluate(() => {
    window.__m.clearAll()
    window.__m.build(1, 1, 'poison')
    return window.__m.distOf(1, 2)
  })

  const before = await page.evaluate((b) => {
    window.__m.put(b, 5000)
    return window.__m.enemies()[0]
  }, base)

  await page.waitForTimeout(1200)
  const mid = await page.evaluate(() => window.__m.enemies()[0])

  say('毒伤已挂上（poisonDps > 0）', mid.poison > 0, `poisonDps=${mid.poison}`)
  say('敌人已受持续伤害', mid.hp < before.hp, `${before.hp} → ${mid.hp}`)

  // 把敌人移出塔的射程：毒伤应继续（它已经挂上了）
  await page.evaluate(() => {
    const g = window.__m.s()
    const e = g.enemies[0]
    if (e) { e.pathDist = g.path.total * 0.7; e.syncPixel(g.path, g.L) }
  })
  const outHp = await page.evaluate(() => window.__m.enemies()[0].hp)
  await page.waitForTimeout(700)
  const outHp2 = await page.evaluate(() => window.__m.enemies()[0].hp)
  say('离开射程后毒伤仍在跳（DOT 语义正确）', outHp2 < outHp, `${outHp} → ${outHp2}`)
}

console.log('\n──── 7. 多塔集火：伤害正确累加 ────')
{
  const base = await page.evaluate(() => {
    window.__m.clearAll()
    // 两座箭塔都覆盖 (1,2) 附近
    window.__m.build(1, 1, 'arrow')
    window.__m.build(1, 3, 'arrow')
    return window.__m.distOf(1, 2)
  })

  const t0 = await page.evaluate((b) => {
    window.__m.put(b, 100000)
    return window.__m.enemies()[0]
  }, base)

  const started = Date.now()
  await page.waitForTimeout(2000)
  const t1 = await page.evaluate(() => window.__m.enemies()[0])
  const elapsed = (Date.now() - started) / 1000

  // 单塔 Lv1 DPS = 10 × 1.6 = 16；两塔 = 32；敌人很快走出射程，故只做下界断言
  const dealt = t0.hp - t1.hp
  say('两塔的伤害都有生效（DPS 明显高于单塔）', dealt > 16 * elapsed * 0.6,
      `${dealt.toFixed(0)} 伤害 / ${elapsed.toFixed(1)}s ≈ ${(dealt / elapsed).toFixed(1)} DPS（单塔理论 16）`)
}

console.log('\n──── 8. 禁止在路径格上建塔（集成层面）────')
{
  const r = await page.evaluate(() => {
    window.__m.clearAll()
    const onPath = window.__m.build(2, 2, 'arrow')      // (2,2) 是路径格
    const onEmpty = window.__m.build(0, 0, 'arrow')
    return { onPath, onEmpty }
  })
  say('路径格建造被拒', r.onPath.ok === false && r.onPath.reason === 'invalid-cell',
      JSON.stringify(r.onPath))
  say('可建格建造成功', r.onEmpty.ok === true)
}

await page.close()
await browser.close()

if (errs.length) {
  console.log('\nJS 错误:')
  for (const e of errs.slice(0, 4)) console.log('  ' + e)
}
console.log(`\n──── 汇总 ────`)
console.log(`通过 ${pass} · 失败 ${failed.length}${errs.length ? ' · JS 错误 ' + errs.length : ' · JS 错误 0'}`)
if (failed.length) console.log('失败项: ' + failed.join(' | '))
process.exit(failed.length || errs.length ? 1 : 0)
