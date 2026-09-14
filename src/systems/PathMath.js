// 路径插值 —— 纯函数，不依赖 Phaser
//
// 敌人位置用「已走过的格数」(pathDist) 表示，而不是 (x, y)：
//   · 索敌的 'first' 策略 = 谁的 pathDist 最大（离终点最近）—— 无需坐标计算
//   · 速度、射程都以格为单位，不必换算像素
// 需要像素坐标时，调用方用 Layout.cellToPixel 换算。

/**
 * 把路径拐点序列展开为可插值的行程表。
 * @param {number[][]} cells 拐点（格坐标），相邻点须轴对齐
 * @returns {{cells:number[][], segments:object[], total:number}}
 */
export function buildPath(cells) {
  if (!Array.isArray(cells) || cells.length < 2) {
    throw new Error('buildPath 需要至少 2 个路径点')
  }

  const segments = []
  let total = 0

  for (let i = 0; i < cells.length - 1; i++) {
    const [x0, y0] = cells[i]
    const [x1, y1] = cells[i + 1]

    if (x0 !== x1 && y0 !== y1) {
      throw new Error(`路径段 (${x0},${y0})→(${x1},${y1}) 不是轴对齐的`)
    }

    const len = Math.abs(x1 - x0) + Math.abs(y1 - y0)
    if (len === 0) continue        // 重复点，跳过

    segments.push({ x0, y0, x1, y1, len, start: total })
    total += len
  }

  if (!segments.length) throw new Error('路径总长度为 0')

  return { cells, segments, total }
}

/**
 * 走过 dist 格之后的位置。
 * @returns {{x:number, y:number, done:boolean}} 格坐标（浮点，非像素）
 */
export function positionAt(path, dist) {
  const first = path.segments[0]
  const last = path.segments[path.segments.length - 1]

  if (!(dist > 0)) return { x: first.x0, y: first.y0, done: false }
  if (dist >= path.total) return { x: last.x1, y: last.y1, done: true }

  for (const s of path.segments) {
    if (dist <= s.start + s.len) {
      const t = (dist - s.start) / s.len
      return {
        x: s.x0 + (s.x1 - s.x0) * t,
        y: s.y0 + (s.y1 - s.y0) * t,
        done: false,
      }
    }
  }

  // 理论不可达，保险起见返回终点
  return { x: last.x1, y: last.y1, done: true }
}

/**
 * 路径长度（格数）—— 敌人以 speed（格/秒）行进，走完需要 total/speed 秒。
 */
export function pathLength(path) {
  return path.total
}
