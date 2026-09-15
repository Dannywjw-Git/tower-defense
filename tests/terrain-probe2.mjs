// 地形质感探测 · 第 2 轮（throwaway）
//
// 第 1 轮的结论（见 docs/TERRAIN-PROBE.md）：
//   Kenney 的草/泥地砖是**纯色块**，贴上去与纯代码版本肉眼不可区分 → 素材给不了"质感"。
//   但**装饰物件是真的有质感**（frame 130-137：灌木/树叶/苔藓/星形植物/石头，带透明底）。
//
// 所以这一轮验证「方向 2」：纯代码地面 + Kenney 装饰物件。
//
// 用法：node tests/terrain-probe2.mjs [baseUrl]

const PW = process.env.PLAYWRIGHT_CORE
  || 'file:///D:/deepseek-harness/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.mjs'
const BASE = (process.argv[2] || 'http://127.0.0.1:8788').replace(/\/$/, '')
const { chromium } = await import(PW)
const { enterGame } = await import('./_nav.mjs')
const { mkdir } = await import('node:fs/promises')

const CANDIDATES = [
  { channel: 'msedge', headless: true },
  { channel: 'chrome', headless: true },
  { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true },
  { headless: true },
]
let browser = null
for (const o of CANDIDATES) { try { browser = await chromium.launch(o); break } catch { } }
if (!browser) { console.error('找不到浏览器'); process.exit(2) }

await mkdir('docs/screenshots', { recursive: true })

// variant: 'decor'（纯代码地面 + 装饰） | 'decor-only'（装饰但地面保持原样）
const inject = (variant) => `
(() => {
  const variant = ${JSON.stringify(variant)}
  const g = window.game.scene.getScene('Game')
  if (!g || !g.L || !g.grid) return { ok: false, why: 'no scene' }
  const L = g.L, cell = L.cell
  const rows = g.grid.length, cols = g.grid[0].length
  const PATH = 'path', BLOCKED = 'blocked'

  const hash = (x, y) => {
    let h = x * 374761393 + y * 668265263
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) >>> 0) / 4294967296
  }
  const shade = (c, amt) => {
    const r = Math.max(0, Math.min(255, ((c >> 16) & 255) + amt))
    const gg = Math.max(0, Math.min(255, ((c >> 8) & 255) + amt))
    const b = Math.max(0, Math.min(255, (c & 255) + amt))
    return (r << 16) | (gg << 8) | b
  }
  const mute = (c, sat = 0.45, dark = 0.72) => {
    const r = (c >> 16) & 255, gg = (c >> 8) & 255, b = c & 255
    const lum = 0.299 * r + 0.587 * gg + 0.114 * b
    const mix = (v) => Math.round((lum + (v - lum) * sat) * dark)
    return (mix(r) << 16) | (mix(gg) << 8) | mix(b)
  }

  if (g.__terrain) g.__terrain.destroy()
  if (g.__tiles) { g.__tiles.forEach(t => t.destroy()); g.__tiles = [] }
  const tg = g.add.graphics().setDepth(0.5)

  // ── 地面：纯代码（Kenney 配色的压暗版）──
  const GRASS = mute(0x2ecc71)
  const DIRT = mute(0xbb8044)

  if (variant === 'decor') {
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const t = g.grid[cy][cx]
        const x = L.originX + cx * cell, y = L.originY + cy * cell
        const n = hash(cx, cy)
        let base
        if (t === PATH) base = DIRT
        else if (t === BLOCKED) base = shade(GRASS, -45)
        else base = GRASS
        tg.fillStyle(shade(base, Math.round((n - 0.5) * 10)), 1)
        tg.fillRect(x, y, cell + 0.5, cell + 0.5)
      }
    }
  }
  g.__terrain = tg

  // ── 装饰物件：只放在**可建格**上，且避开塔位 ──
  // 关键约束：装饰物不能挡住塔、敌人与"可建"提示。
  // 做法：① 只放在可建格 ② 只放约 35% 的格子 ③ 缩到格子的 55% 且贴格底 ④ depth 低于塔
  const DECOR = {
    bush: 130, bushSm: 131, leaves: 132, moss: 133, star: 134,
    rock1: 135, rock2: 136, rock3: 137,
  }
  const GREEN = [DECOR.bush, DECOR.bushSm, DECOR.leaves, DECOR.moss, DECOR.star]
  const ROCK = [DECOR.rock1, DECOR.rock2, DECOR.rock3]

  const SS = 'kentd_ss'
  if (!g.textures.exists(SS)) return { ok: false, why: 'sheet not preloaded' }
  if (!g.__tiles) g.__tiles = []

  let placed = 0
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const t = g.grid[cy][cx]
      if (t !== 'buildable') continue
      const h = hash(cx * 13 + 5, cy * 7 + 3)
      if (h > 0.38) continue                    // 只装饰约 38% 的可建格
      const rocks = h < 0.10
      const list = rocks ? ROCK : GREEN
      const fr = list[Math.floor(hash(cx + 31, cy + 17) * list.length) % list.length]
      const x = L.originX + cx * cell + cell / 2
      // 贴格底（有"长在地上"的感觉）
      const y = L.originY + cy * cell + cell * 0.60
      const img = g.add.image(x, y, SS, fr)
        .setDepth(0.8)                          // 在地面之上、塔(depth 2)之下
        .setAlpha(0.9)
      const s = cell * (rocks ? 0.42 : 0.56)
      img.setDisplaySize(s, s)
      g.__tiles.push(img)
      placed++
    }
  }

  return { ok: true, mode: variant, decor: placed }
})()
`

const VARIANTS = [
  ['decor', 'decor'],
  ['decor-only', 'decor-only'],
].filter(([label]) => !process.env.PROBE_ONLY || label.includes(process.env.PROBE_ONLY))

for (const [label, variant] of VARIANTS) {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 30000 })
  await page.waitForTimeout(1200)

  // 素材必须在进入游戏前加载（见 TERRAIN-PROBE.md 的 4 个坑）
  await page.evaluate(async () => {
    const menu = window.game.scene.getScene('Menu')
    const IMG = 'kentd_img', SS = 'kentd_ss'
    if (menu.textures.exists(SS)) return
    if (menu.textures.exists(IMG)) menu.textures.remove(IMG)
    await new Promise((res) => {
      const t = setTimeout(res, 8000)
      menu.load.once('complete', () => { clearTimeout(t); res() })
      menu.load.image(IMG, 'src/kenney_tower-defense-top-down/Tilesheet/towerDefense_tilesheet.png')
      menu.load.start()
    })
    const src = menu.textures.get(IMG).getSourceImage()
    menu.textures.addSpriteSheet(SS, src, { frameWidth: 64, frameHeight: 64 })
  })

  await enterGame(page)
  await page.waitForTimeout(400)

  const r = await page.evaluate(inject(variant))
  await page.evaluate(() => {
    const g = window.game.scene.getScene('Game')
    g.tutorial = []; g.tutorialText.setVisible(false)
    const spots = []
    for (let cy = 0; cy < g.grid.length && spots.length < 4; cy++)
      for (let cx = 0; cx < g.grid[0].length && spots.length < 4; cx++)
        if (g.canBuild(cx, cy)) spots.push([cx, cy])
    g.economy.gold = 9999
    ;['arrow', 'cannon', 'ice', 'sniper'].forEach((id, i) => {
      if (spots[i]) g.buildTower(spots[i][0], spots[i][1], id)
    })
  })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `docs/screenshots/probe-${label}.png` })
  console.log(`  ${label.padEnd(12)} ${r.ok ? '✅ 装饰 ' + r.decor + ' 个' : '❌ ' + r.why}`)
  await page.close()
}

await browser.close()
