// 相邻协同 —— 纯函数，不依赖 Phaser
//
// spec §5.1：
//   · **4 邻域**（不含对角）—— 手机小屏上对角线会交叠成一团，看不清谁和谁协同
//   · 每有一个**异类**相邻塔 → 本塔 +5% 伤害，最多 4 层（4 邻域的自然上限）
//   · **同类相邻不给加成** —— 否则"堆同一种塔"成为最优解，6 种塔退化成 1 种
//   · 3 组特例覆盖通用规则，**单向**加成（只加成特例表里指名的那一方）
//
// 计数口径（消除 spec 歧义）：按"异类邻居的**个数**"计，不是按种类数。
// 例：箭塔相邻两座炮塔 → 2 层 → +10%。这与"最多 4 层"自洽。

export const PER_NEIGHBOR = 0.05
export const MAX_STACKS = 4

/** 4 邻域偏移，不含对角 */
export const NEIGHBOR_OFFSETS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

/**
 * 3 组特例。**单向**：只加成 `to` 指名的塔，另一方不得益于该特例
 * （但它仍吃到通用的"异类相邻 +5% 伤害"）。
 * 效果都作用在非伤害维度，故与通用伤害加成不冲突，可叠加。
 */
export const SPECIALS = [
  { from: 'ice',    to: 'arrow',  stat: 'fireRate', mult: 1.20, note: '被冻住的目标就是靶子' },
  { from: 'poison', to: 'cannon', stat: 'splash',   mult: 1.25, note: '毒雾随冲击波扩散' },
  { from: 'ice',    to: 'tesla',  stat: 'chain',    add: 1,     note: '减速场让电流更易传导' },
]

/**
 * 计算一座塔的协同加成。
 * @param {string} type 本塔类型
 * @param {string[]} neighborTypes 4 邻域内的塔类型（空格不必传入）
 * @returns {{stacks:number, damageMult:number, specials:object[]}}
 */
export function computeSynergy(type, neighborTypes = []) {
  const others = neighborTypes.filter(t => t && t !== type)
  const stacks = Math.min(others.length, MAX_STACKS)

  const specials = SPECIALS.filter(s => s.to === type && neighborTypes.includes(s.from))

  return {
    stacks,
    damageMult: 1 + stacks * PER_NEIGHBOR,
    specials,
  }
}

/** 4 邻域坐标（可能越界，调用方需按地图尺寸过滤） */
export function neighborCells(cx, cy) {
  return NEIGHBOR_OFFSETS.map(([dx, dy]) => [cx + dx, cy + dy])
}
