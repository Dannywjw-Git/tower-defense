// 统一布局计算 —— 三种朝向一套代码
//
// 纯函数，不依赖 Phaser，可脱离浏览器测试（spec §7.1）。
//
// 关键决策（Phase 0 实测校准，详见 docs/spec.md §6.1）：
//   1. cell = min(可用宽/8, 可用高/5)，**不向上 clamp**。
//      强制放大到 44 px 会让总宽溢出窄屏（360 px 屏上 8×44 = 352 > 344），
//      而可点性不会因此改善。44 px 只作报警线。
//   2. 横屏时 HUD 改左右浮层 —— 横屏的病根是**纵向不足**。
//      812×375 下上下 HUD 会把格子压到 36 px；改左右浮层后升到 54.8 px。

export const COLS = 8
export const ROWS = 5

/** 手指可靠点击的参考线；低于它只报警，不强制放大 */
export const MIN_TOUCH_PX = 44

/** 竖屏：顶部状态条 + 底部建造栏占用的高度 */
const HUD_TOP_PX = 46
const HUD_BOTTOM_PX = 148

/** 横屏：仅顶部留一条窄边距，纵向全给地图 */
const LANDSCAPE_TOP_PX = 32

/** 横屏左右浮层宽度占比 */
export const SIDE_RATIO = 0.22
export const SIDE_MAX_PX = 200

// ══════════════════════════════════════════════════════════════════
// 统一缩放层（HiDPI 改造引入）
// ══════════════════════════════════════════════════════════════════
//
// 背景：为了让高分屏清晰，渲染缓冲区改用**物理像素**（见 src/main.js），
//   于是「1 逻辑像素 = 1 物理像素」，而布局尺寸与字号原本都按 **CSS 像素**写死。
//   若不换算，DPR=2 的手机上所有 UI 都会缩小一半。
//
// 规则（全项目唯一入口，禁止各处自己乘）：
//   · 所有**英寸/触控相关**的尺寸（字号、padding、间距、按钮高）→ 用 `px()`
//   · 所有**比例相关**的量（0.22、百分比、cell 与格数的关系）→ 不换算
//   · 从 Phaser 拿到的 `scale.width/height` 已经是逻辑像素 → 直接用
//
// 为什么集中在一个函数：分散着写 `* ps` 必然漏，漏一处就是一处 UI 缩小。
let _ps = 1

/** 由场景在 create/layout 时注入当前像素倍率（window.PIXEL_SCALE） */
export function setPixelScale(v) {
  _ps = Number.isFinite(v) && v > 0 ? v : 1
}

/** 当前像素倍率 */
export function pixelScale() {
  return _ps
}

/**
 * 把「按 CSS 像素设计的尺寸」换算到逻辑像素。
 * @param {number} n CSS 像素值
 */
export function px(n, ps = _ps) {
  return n * (Number.isFinite(ps) && ps > 0 ? ps : 1)
}

/** 把逻辑像素换算回 CSS 像素（用于对外报告 / 断言） */
export function toCss(n, ps = _ps) {
  const s = Number.isFinite(ps) && ps > 0 ? ps : 1
  return n / s
}

/**
 * 计算当前窗口下的完整布局。
 *
 * ⚠️ **单位说明（HiDPI 改造后）**：这里所有输入输出都是**逻辑像素**。
 *   逻辑像素 = CSS 像素 × PIXEL_SCALE（见 src/main.js）。
 *   在 DPR≥2 的手机上 PIXEL_SCALE=2，所以 W=860 而屏幕 CSS 宽只有 430。
 *
 *   原先写死的常数（HUD_TOP_PX 等）是**按 CSS 像素定的**，直接拿来跟逻辑尺寸
 *   运算会在高分屏上偏小一半 —— 所以这里统一乘 PIXEL_SCALE 换算。
 *
 * @param {number} W 逻辑宽
 * @param {number} H 逻辑高
 * @param {number} [ps] 像素倍率，默认由调用方传入 window.PIXEL_SCALE
 * @returns {{landscape:boolean, sideW:number, cell:number, gridW:number, gridH:number,
 *            originX:number, originY:number, av:boolean}}
 */
export function computeLayout(W, H, ps = 1) {
  const s = Number.isFinite(ps) && ps > 0 ? ps : 1
  setPixelScale(s)

  const landscape = W > H

  // 把「按 CSS 像素定义的 UI 尺寸」换算到逻辑像素
  const hudTop = px(HUD_TOP_PX, s)
  const hudBottom = px(HUD_BOTTOM_PX, s)
  const topPad = px(LANDSCAPE_TOP_PX, s)
  const edge = px(8, s)
  const sideMax = px(SIDE_MAX_PX, s)

  const sideW = landscape ? Math.min(sideMax, W * SIDE_RATIO) : 0
  const availW = landscape ? W - sideW * 2 - px(16, s) : W - edge
  const availH = landscape ? H - topPad : H - hudTop - hudBottom

  const cell = Math.min(availW / COLS, availH / ROWS)
  const gridW = cell * COLS
  const gridH = cell * ROWS

  return {
    landscape,
    sideW,
    cell,
    gridW,
    gridH,
    originX: (W - gridW) / 2,
    originY: landscape
      ? Math.max(topPad, (H - gridH) / 2)
      : hudTop + Math.max(0, (availH - gridH) / 2),
    /** 格子是否达到可点标准 —— 换算回 CSS 像素再比较（44 是按手指定的 CSS 尺寸） */
    av: toCss(cell, s) >= MIN_TOUCH_PX,
    /** 本布局使用的像素倍率 */
    ps: s,
    /** 顶部 HUD 占位（逻辑像素），供 HudScene 对齐 */
    hudTop,
    /** 底部建造栏占位（逻辑像素） */
    hudBottom,
  }
}

/** 格坐标 → 该格中心的像素坐标 */
export function cellToPixel(layout, cx, cy) {
  return {
    x: layout.originX + cx * layout.cell + layout.cell / 2,
    y: layout.originY + cy * layout.cell + layout.cell / 2,
  }
}

/** 像素坐标 → 格坐标（inside=false 表示点在网格之外） */
export function pixelToCell(layout, px, py) {
  const cx = Math.floor((px - layout.originX) / layout.cell)
  const cy = Math.floor((py - layout.originY) / layout.cell)
  return {
    cx,
    cy,
    inside: cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS,
  }
}
