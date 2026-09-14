// 性能测量 —— node tests/perf-check.mjs [baseUrl]
//
// **能测**：部署产物体积 · 首屏加载时间 · CPU 节流下的帧率
// **不能测**：真机 iOS 微信 / 安卓 X5 的真实行为 —— 那必须人工，见 docs/ACCEPTANCE.md
//
// CPU 节流用 CDP 的 `Emulation.setCPUThrottlingRate` 近似低端机。
// 这是无头环境下最接近真机的做法，但**仍不能替代真机**。

import { readFile, readdir, stat } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { join, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PW = process.env.PLAYWRIGHT_CORE
  || 'file:///D:/deepseek-harness/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.mjs'

const BASE = (process.argv[2] || 'http://192.168.1.8:8788').replace(/\/$/, '')
const ROOT = fileURLToPath(new URL('..', import.meta.url))

const { chromium } = await import(PW)

// ─────────────────────── 1. 部署产物体积 ───────────────────────

async function walk(dir, out = []) {
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) await walk(p, out)
    else out.push(p)
  }
  return out
}

/** 递归收集路径（文件或目录都接受）—— 早先的版本把目录本身当文件 push，导致 EISDIR */
async function collect(path, out) {
  let st
  try { st = await stat(path) } catch { return }
  if (st.isDirectory()) {
    for (const e of await readdir(path, { withFileTypes: true })) {
      await collect(join(path, e.name), out)
    }
  } else {
    out.push(path)
  }
}

const TEXT_EXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg'])

console.log('\n──── 部署产物体积（index.html + vendor + src + assets）────')

const deployFiles = []
for (const sub of ['index.html', 'vendor', 'src', 'assets', '.nojekyll']) {
  await collect(join(ROOT, sub), deployFiles)
}

let rawTotal = 0
let gzTotal = 0
const rows = []
for (const f of deployFiles) {
  const buf = await readFile(f)
  const isText = TEXT_EXT.has(extname(f).toLowerCase())
  const gz = isText ? gzipSync(buf).length : buf.length
  rawTotal += buf.length
  gzTotal += gz
  rows.push({ name: relative(ROOT, f).replace(/\\/g, '/'), raw: buf.length, gz })
}
rows.sort((a, b) => b.gz - a.gz)
for (const r of rows) {
  console.log(`  ${r.name.padEnd(34)} 原始 ${String(Math.round(r.raw / 1024)).padStart(5)} KB   传输 ${String(Math.round(r.gz / 1024)).padStart(4)} KB`)
}
console.log(`  ${'合计'.padEnd(34)} 原始 ${String(Math.round(rawTotal / 1024)).padStart(5)} KB   传输 ${String(Math.round(gzTotal / 1024)).padStart(4)} KB`)

// ─────────────────────── 浏览器测量 ───────────────────────

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

const CONTEXTS = [
  { label: '桌面 · 无节流',        cpu: 1, net: null },
  { label: '近似中端机 4× 节流',    cpu: 4, net: null },
  { label: '4G + 4× 节流',         cpu: 4, net: { download: 4 * 1024 * 1024 / 8, upload: 1024 * 1024 / 8, latency: 100 } },
  { label: '3G + 4× 节流',         cpu: 4, net: { download: 1.6 * 1024 * 1024 / 8, upload: 750 * 1024 / 8, latency: 300 } },
]

const measureFps = (page, dur) => page.evaluate((d) => new Promise(resolve => {
  let frames = 0
  const t0 = performance.now()
  function tick() {
    frames++
    const el = performance.now() - t0
    if (el < d) requestAnimationFrame(tick)
    else resolve(frames / (el / 1000))
  }
  requestAnimationFrame(tick)
}), dur)

console.log('\n──── 首屏与帧率 ────')
console.log('  （CPU 节流由 CDP 模拟；真机结果可能不同，务必人工复核）\n')

for (const ctx of CONTEXTS) {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
  const errs = []
  page.on('pageerror', e => errs.push(e.message))

  const client = await page.context().newCDPSession(page)
  if (ctx.cpu > 1) await client.send('Emulation.setCPUThrottlingRate', { rate: ctx.cpu })
  if (ctx.net) await client.send('Network.emulateNetworkConditions', {
    offline: false, latency: ctx.net.latency,
    downloadThroughput: ctx.net.download, uploadThroughput: ctx.net.upload,
  })

  const t0 = Date.now()
  await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 60000 })

  // 等到「开始游戏」可交互（读 Phaser 场景里的按钮）
  await page.waitForFunction(() => {
    const s = window.game && window.game.scene.getScene('Menu')
    if (!s || !s.children) return false
    return s.children.list.some(o => o && o.input && o.input.enabled)
  }, { timeout: 30000 })
  const firstPaint = Date.now() - t0

  console.log(`  【${ctx.label}】`)
  console.log(`    首屏（到可交互）: ${firstPaint} ms  ${firstPaint <= 5000 ? '✅ ≤5s' : '❌ >5s'}`)

  // 进游戏造满波场景
  const { clickButton } = await import('./_nav.mjs')
  await clickButton(page, 'Menu', '开始游戏')
  await page.waitForTimeout(400)
  await clickButton(page, 'LevelSelect', '转弯')
  await page.waitForTimeout(1500)

  const filled = await page.evaluate(() => {
    const s = window.game.scene.getScene('Game')
    s.economy.gold = 100000
    let towers = 0
    for (let cy = 0; cy < 5 && towers < 15; cy++) {
      for (let cx = 0; cx < 8 && towers < 15; cx++) {
        if (s.buildTower(cx, cy, 'arrow').ok) towers++
      }
    }
    // 30 只高血怪铺满整条路径，制造满波负载
    for (let i = 0; i < 30; i++) {
      s.spawnEnemy({ type: 'normal', hp: 99999, wave: 1 })
      const e = s.enemies[s.enemies.length - 1]
      e.pathDist = (i / 30) * s.path.total
      e.syncPixel(s.path, s.L)
    }
    return { towers, enemies: s.enemies.length }
  })

  const fpsIdle = await measureFps(page, 2000)
  const fpsLoad = await measureFps(page, 3000)

  // headless Chromium 的 requestAnimationFrame 在没有显示器时会被节流，
  // 因此这里的帧率**恒定在 30 出头，不代表真实渲染能力** —— 它只能说明
  // "逻辑没有把主线程堵死"，不能用来判定 spec §7.2 的 ≥30fps。
  const realFps = await page.evaluate(() =>
    window.game && window.game.loop ? Math.round(window.game.loop.actualFps * 10) / 10 : null)

  console.log(`    满波场景: ${filled.towers} 塔 + ${filled.enemies} 怪`)
  console.log(`    Phaser actualFps: ${realFps}（headless 下被节流，不可作为验收依据）`)
  console.log(`    rAF 实测: 空转 ${fpsIdle.toFixed(1)} / 满波 ${fpsLoad.toFixed(1)} fps`)
  if (errs.length) console.log(`    JS 错误: ${errs[0]}`)
  console.log('')

  await page.close()
}

await browser.close()

console.log('──── 说明与局限（务必读）────')
console.log('1. 帧率不可作为验收依据：headless Chromium 无显示器时 rAF 被节流，')
console.log('   所有场景都会稳定在 30 出头，无法反映真实渲染能力。≥30fps 只能在真机测。')
console.log('2. 网络：本地预览是 node http/1.1，每个 ES module 一个请求、无多路复用。')
console.log('   真实部署在 GitHub Pages（HTTP/2）下，30+ 个请求会被复用，慢网表现明显更好。')
console.log('3. 首屏时间仍受本机 CPU 影响，真机可能更慢。')
console.log('')
console.log('结论：本脚本可靠的部分是「产物体积」与「相对趋势」。')
console.log('spec §7.2 的五条验收必须按 docs/ACCEPTANCE.md 在真实设备上取证。')
