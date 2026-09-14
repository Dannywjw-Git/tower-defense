// 地图格子分类 —— 纯函数，不依赖 Phaser
//
// 把关卡的路径点序列展开成逐格的类型表，供渲染与建塔校验使用。
//
// 格类型：
//   'path'      敌人在此行走（不可建塔）
//   'blocked'   障碍（不可建塔）
//   'buildable' 可建塔

export const PATH = 'path'
export const BLOCKED = 'blocked'
export const BUILDABLE = 'buildable'

/**
 * 构造格类型表 [row][col]
 * @param {{cols:number, rows:number, path:number[][], blocked?:number[][]}} level
 * @returns {string[][]}
 */
export function buildGrid(level) {
  const { cols, rows, path = [], blocked = [] } = level

  const grid = Array.from({ length: rows }, () => Array(cols).fill(BUILDABLE))

  // 路径点之间为轴对齐直线段（水平或垂直），逐格标记
  for (let i = 0; i < path.length - 1; i++) {
    const [x0, y0] = path[i]
    const [x1, y1] = path[i + 1]

    // 只支持轴对齐段；斜线段会让"哪些格是路径"变得歧义
    if (x0 !== x1 && y0 !== y1) {
      throw new Error(
        `地图 ${level.id || '?'} 的路径段 (${x0},${y0})→(${x1},${y1}) 不是轴对齐的；` +
        `请用水平/垂直线段拼接路径`)
    }

    const stepX = Math.sign(x1 - x0)
    const stepY = Math.sign(y1 - y0)
    let x = x0
    let y = y0

    for (;;) {
      if (y < 0 || y >= rows || x < 0 || x >= cols) {
        throw new Error(`地图 ${level.id || '?'} 的路径越界于格 (${x},${y})`)
      }
      grid[y][x] = PATH
      if (x === x1 && y === y1) break
      x += stepX
      y += stepY
    }
  }

  for (const [x, y] of blocked) {
    if (y >= 0 && y < rows && x >= 0 && x < cols) grid[y][x] = BLOCKED
  }

  return grid
}

/** 统计各类格子的数量（用于校验关卡数据是否合理） */
export function countCells(grid) {
  const out = { [PATH]: 0, [BLOCKED]: 0, [BUILDABLE]: 0 }
  for (const row of grid) for (const c of row) out[c] = (out[c] || 0) + 1
  return out
}

/** 关卡路径的总格数（用于估算可建塔位：总数 − 路径 − 障碍） */
export function buildableCount(grid) {
  return countCells(grid)[BUILDABLE]
}
