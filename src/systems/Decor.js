// 地图装饰 —— 纯函数，不依赖 Phaser（可在 node 里测）
//
// 为什么要有这个模块（而不是写在 GameScene 里）：
//   布局规则需要**可测**。项目的 `logic-check.mjs` 全是纯逻辑模块的断言，
//   把规则塞进 GameScene 就没法用纯 node 验证，只能靠截图目视。
//
// 背景（见 docs/TERRAIN-PROBE.md）：
//   Kenney Top-Down 的草/泥地砖是**纯色块**（实测颜色数=1），贴上去与代码绘制
//   肉眼不可区分。真正有质感的是它的**物件**（灌木/树叶/苔藓/星形植物/石头），
//   带透明底、可直接叠在地面上。所以这里只做"撒装饰"，不换地面。

/**
 * 装饰密度：约多少比例的可建格会被装饰。
 * 0 = 完全关闭装饰（回退到"无装饰"外观，见 docs/DECOR-DESIGN.md §6）
 *
 * 0.38 是**理论**值，但实测每关只有 24–26 个可建格，
 * 0.38 只落 7 个（格子太少，统计波动大）—— 太稀，看不出"有质感"。
 * 提到 0.62 后约 15 个，才有"野外"的感觉。真机若觉得花，调小即可。
 */
export const DECOR_DENSITY = 0.62

/** 装饰透明度（避免喧宾夺主） */
export const DECOR_ALPHA = 0.90

/**
 * 装饰着色（tint）。
 *
 * ⚠️ 为什么必须着色：Kenney 的灌木/苔藓是 `#2ECC71`，
 *    而**箭塔是 `#4ADE80`** —— 色距只有 **37**（人眼 <40 基本分不开）。
 *    我第一版直接铺原色，截图里"灌木"和"箭塔"看起来是一类东西。
 *
 * 压暗 + 降饱和（`0x7d9c7d` 偏灰绿）后：
 *   · 装饰退到背景层，塔（明亮饱和）依然跳出来
 *   · 与地面的蓝灰也不冲突
 * 这是*看图*发现的，纯逻辑断言抓不到。
 */
export const DECOR_TINT = 0x7d9c7d

/**
 * 装饰着色强度。1 = 完全用 tint 色，0 = 原色。
 * 留成旋钮：嫌素就调小，嫌花就调大。
 */
export const DECOR_TINT_STRENGTH = 0.85

/**
 * 装饰类型表。key 对应 assets/assets.js 里注册的贴图 key。
 * scale 是相对**格宽**的比例：石头小、灌木大。
 */
export const DECOR_KINDS = [
  { key: 'decor-bush-lg',    scale: 0.56, weight: 3 },
  { key: 'decor-bush-sm',    scale: 0.44, weight: 3 },
  { key: 'decor-leaves',     scale: 0.52, weight: 2 },
  { key: 'decor-moss',       scale: 0.50, weight: 2 },
  { key: 'decor-plant-star', scale: 0.54, weight: 2 },
  { key: 'decor-rock-sm',    scale: 0.38, weight: 2 },
  { key: 'decor-rock-md',    scale: 0.42, weight: 2 },
  { key: 'decor-rock-lg',    scale: 0.46, weight: 1 },
]

/**
 * 确定性伪随机：同一格永远得到同一个值，均匀分布在 [0,1)。
 *
 * ⚠️ 不能用 Math.random —— 场景重布局（转屏、切建造模式）时装饰会"跳"，
 *    玩家会看到闪烁。必须与坐标绑定。
 *
 * ⚠️ 初版用 `x*374761393 + y*668265263` 再异或，实测**只能输出 0–0.5**：
 *    小输入下高位永远进不到符号位，分布严重偏斜（大样本 10 个桶只有前 5 个有值），
 *    导致 `h > density` 几乎不过滤 → 密度 0.77 而非 0.38。
 *    改用成熟的整数哈希（xorshift 混合），实测分布均匀。
 *    这是 decor-check.mjs 的密度断言抓出来的 —— 纯靠看图绝对发现不了。
 */
function hash(x, y) {
  // 把两个坐标混成一个 32 位整数种子
  let h = (x | 0) * 0x27d4eb2d ^ (y | 0) * 0x165667b1
  // xorshift 混合，保证低位也能影响高位
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

/** 按 weight 加权选一个装饰种类（用同一个 hash 流，保持确定性） */
function pickKind(v) {
  const total = DECOR_KINDS.reduce((s, k) => s + k.weight, 0)
  let acc = v * total
  for (const k of DECOR_KINDS) {
    acc -= k.weight
    if (acc <= 0) return k
  }
  return DECOR_KINDS[DECOR_KINDS.length - 1]
}

/**
 * 计算一张地图上的装饰布局。
 *
 * @param {string[][]} grid  格类型表（'path' | 'blocked' | 'buildable'）
 * @param {object} [opts]
 * @param {number} [opts.density]  覆盖默认密度（0 = 全部关闭）
 * @returns {Array<{cx:number, cy:number, key:string, scale:number, ax:number, ay:number}>}
 *          ax/ay 是相对格子左上角的**偏移比例**（0-1），用于让装饰"贴格底"
 */
export function layoutDecor(grid, opts = {}) {
  const density = opts.density ?? DECOR_DENSITY
  if (!(density > 0)) return []

  const rows = grid.length
  const cols = rows ? grid[0].length : 0
  const out = []

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      // 规则 1：只放在可建格（路径上放装饰会挡住敌人与路；blocked 语义混乱）
      if (grid[cy][cx] !== 'buildable') continue

      // 规则 2+3：确定性稀疏
      const h = hash(cx * 13 + 5, cy * 7 + 3)
      if (h > density) continue

      const kind = pickKind(hash(cx + 31, cy + 17))
      // 水平抖动 ±0.12 格，避免装饰排成整齐网格
      const jx = (hash(cx + 101, cy + 7) - 0.5) * 0.24
      out.push({
        cx, cy,
        key: kind.key,
        scale: kind.scale,
        // 规则 5：贴格底（纵向 0.60），让装饰有"长在地上"的感觉
        ax: 0.5 + jx,
        ay: 0.60,
      })
    }
  }
  return out
}

/** 装饰在像素坐标下的位置（供渲染层用；纯计算，可测） */
export function decorPixelRect(layout, originX, originY, cell) {
  const size = cell * layout.scale
  return {
    x: originX + layout.cx * cell + layout.ax * cell,
    y: originY + layout.cy * cell + layout.ay * cell,
    w: size,
    h: size,
  }
}
