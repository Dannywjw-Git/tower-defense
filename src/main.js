// 塔防游戏入口
//
// Phaser 由 index.html 用普通 <script> 先行加载，因此这里使用全局 `Phaser`。
// 游戏代码本身是原生 ES modules —— 无构建步骤。

import BootScene from './scenes/BootScene.js'
import MenuScene from './scenes/MenuScene.js'
import LevelSelectScene from './scenes/LevelSelectScene.js'
import GameScene from './scenes/GameScene.js'
import HudScene from './scenes/HudScene.js'
import ResultScene from './scenes/ResultScene.js'

// ══════════════════════════════════════════════════════════════════
// 高分屏（HiDPI）渲染
// ══════════════════════════════════════════════════════════════════
//
// 问题：Phaser 3 **没有** `resolution` 配置（那是 Phaser 2 的 API）。
//   官方 issue #3198 与 3.50 发布说明原话：
//     "For legacy reasons, Phaser 3 has never properly supported HighDPI devices."
//   后果：画布缓冲区 = CSS 像素。在 DPR=3 的手机上（CSS 430px → 物理 1290px），
//   浏览器把画布拉伸 3 倍，**文字与图形发虚、有锯齿**（真机实测确认）。
//
// 试过且**无效**的路：
//   · `scale.zoom = DPR` —— RESIZE 模式下 ScaleManager 每次重算都会覆盖 zoom，
//     实测缓冲区仍是 430×932（zoom 值被写入但不生效）。
//
// 采用的办法：**让逻辑坐标系就等于物理像素**，再用 CSS 把画布缩回 CSS 尺寸。
//   代价：整个项目「逻辑坐标 = CSS 像素」的前提不再成立 —— 所以下面导出的
//   `PIXEL_SCALE` 必须被布局层与输入层使用，否则点击会整体错位。
//
// 取值：`?dpr=1|2|3` 可覆盖，默认取 min(devicePixelRatio, 2)。
//   上限 2 而非全量：填充率随倍率² 增长（3× → 9 倍），而 2× 与 3× 在
//   430px 宽的屏上肉眼差别很小。
export const PIXEL_SCALE = (() => {
  try {
    const q = new URLSearchParams(location.search).get('dpr')
    if (q) {
      const n = Number(q)
      if (Number.isFinite(n) && n >= 1 && n <= 4) return n
    }
    const dpr = window.devicePixelRatio || 1
    // 桌面 DPR=1 时保持 1；手机 DPR≥2 时按 2 渲染
    return Math.min(Math.max(1, dpr), 2)
  } catch {
    return 1
  }
})()

const config = {
  type: Phaser.AUTO,            // WebGL 优先，不可用则自动回落 Canvas
  parent: document.body,

  // ── 缩放模式：NONE（自己管尺寸）──
  //
  // 为什么不用 RESIZE：**RESIZE 拒绝一切外部尺寸干预**。
  //   实测三种尝试全部失败：
  //     · config.resolution    → Phaser 3 没有这个 API
  //     · scale.zoom = DPR     → 值被写入，但每次重算都被覆盖，缓冲区不变
  //     · scale.resize(w×DPR)  → 立刻被父容器 CSS 尺寸覆盖回去
  //   结果永远是「缓冲区 = CSS 像素」，在 DPR=3 的手机上被拉伸 3 倍 → 发虚。
  //
  // 改用 NONE：完全不自动缩放，尺寸由 setupHiDpi() 全权设置。
  //   · 逻辑坐标系 = 物理像素（渲染 1:1，清晰）
  //   · canvas 的 CSS 尺寸手动设回 CSS 像素（占满屏幕）
  //
  // ⚠️ 代价：逻辑坐标不再等于 CSS 像素，`PIXEL_SCALE` 必须被布局层与输入层使用。
  scale: {
    mode: Phaser.Scale.NONE,
    width: 1,                     // 占位，启动时由 setupHiDpi() 立即改写
    height: 1,
  },

  backgroundColor: '#0b0b0f',

  // roundPixels=true：把绘制对齐到像素栅格，减少文字被二次采样而发糊。
  // antialias 保持 true（矢量图形风格，不是像素画，需要平滑）。
  render: { antialias: true, roundPixels: true },

  scene: [
    BootScene,
    MenuScene,
    LevelSelectScene,
    GameScene,
    HudScene,
    ResultScene,
  ],
}

window.game = new Phaser.Game(config)
window.PIXEL_SCALE = PIXEL_SCALE

// ── 尺寸管理（NONE 模式下手动接管）──
//
// 每次窗口变化：逻辑尺寸 = CSS 像素 × PIXEL_SCALE，canvas 的 CSS 尺寸 = CSS 像素。
//   结果：1 逻辑像素 = 1 物理像素 → 清晰；CSS 上仍占满屏幕 → 布局不变观感。
function setupHiDpi() {
  const g = window.game
  const sm = g.scale
  const apply = () => {
    const cssW = Math.max(1, Math.round(window.innerWidth))
    const cssH = Math.max(1, Math.round(window.innerHeight))
    const logicalW = Math.round(cssW * PIXEL_SCALE)
    const logicalH = Math.round(cssH * PIXEL_SCALE)

    sm.resize(logicalW, logicalH)

    const c = g.canvas
    if (c) {
      c.style.width = cssW + 'px'
      c.style.height = cssH + 'px'
      c.style.display = 'block'
    }
  }

  apply()
  window.addEventListener('resize', apply)
  window.addEventListener('orientationchange', () => setTimeout(apply, 120))
  // 暴露给测试与调试：手动重新套用
  window.__applyHiDpi = apply
}

if (PIXEL_SCALE > 0) {
  window.game.events.once('ready', setupHiDpi)
  setTimeout(() => { try { setupHiDpi() } catch { /* 忽略 */ } }, 0)
}
