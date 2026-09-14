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
const SIDE_RATIO = 0.22
const SIDE_MAX_PX = 200

/**
 * 计算当前窗口下的完整布局。
 * @returns {{landscape:boolean, sideW:number, cell:number, gridW:number, gridH:number,
 *            originX:number, originY:number, av:boolean}}
 */
export function computeLayout(W, H) {
  const landscape = W > H

  const sideW = landscape ? Math.min(SIDE_MAX_PX, W * SIDE_RATIO) : 0
  const availW = landscape ? W - sideW * 2 - 16 : W - 8
  const availH = landscape ? H - LANDSCAPE_TOP_PX : H - HUD_TOP_PX - HUD_BOTTOM_PX

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
      ? Math.max(LANDSCAPE_TOP_PX, (H - gridH) / 2)
      : HUD_TOP_PX + Math.max(0, (availH - gridH) / 2),
    /** 格子是否达到可点标准（false 只表示"偏小"，不代表不能用） */
    av: cell >= MIN_TOUCH_PX,
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
