// 6 种塔 × 3 级的数值表 —— 纯数据，不含逻辑
//
// spec §4.1：Lv3 必须有**质变**（穿透 / 范围 / 定身 / 连锁 / 毒伤 / 破甲），
// 而不是纯数值放大 —— 否则升级只是无聊的乘法，不会产生真决策。
//
// 单位约定：range 与 splash 用**格**（与路径、索敌统一），不是像素。
// 数值为初稿，实测期必然反复调整（spec §4.1 数值粒度说明）。

export const MAX_LEVEL = 3

export const TOWERS = {
  arrow: {
    id: 'arrow', name: '箭塔', short: '箭', color: 0x4ade80,
    targeting: 'first',
    desc: '单体 · 快速 · 中射程 —— 性价比基线',
    levels: [
      { cost: 50,  damage: 10, range: 2.2, fireRate: 1.6 },
      { cost: 60,  damage: 16, range: 2.4, fireRate: 1.8 },
      { cost: 120, damage: 26, range: 2.6, fireRate: 2.0, pierce: 2, perk: '穿透 2 个目标' },
    ],
  },

  cannon: {
    id: 'cannon', name: '炮塔', short: '炮', color: 0xffa94d,
    targeting: 'first',
    desc: '溅射 · 慢 · 近射程 —— 克制成群小怪',
    levels: [
      { cost: 80,  damage: 18, range: 1.8, fireRate: 0.80, splash: 0.55 },
      { cost: 90,  damage: 28, range: 1.9, fireRate: 0.85, splash: 0.65 },
      { cost: 180, damage: 44, range: 2.0, fireRate: 0.90, splash: 0.96, perk: '溅射半径 +50%' },
    ],
  },

  ice: {
    id: 'ice', name: '冰塔', short: '冰', color: 0x63c7ff,
    targeting: 'first',
    desc: '减速 · 低伤 —— 克制快速怪',
    levels: [
      { cost: 60,  damage: 4, range: 2.0, fireRate: 1.2, slow: 0.40, slowTime: 2.0 },
      { cost: 70,  damage: 6, range: 2.2, fireRate: 1.3, slow: 0.50, slowTime: 2.2 },
      { cost: 140, damage: 9, range: 2.4, fireRate: 1.4, slow: 0.60, slowTime: 2.4, freeze: 1.0, perk: '触发定身 1s' },
    ],
  },

  tesla: {
    id: 'tesla', name: '电塔', short: '电', color: 0xc792ff,
    targeting: 'first',
    desc: '连锁闪电（无弹道）—— 克制中密度群',
    levels: [
      { cost: 100, damage: 12, range: 2.2, fireRate: 1.0, chain: 3, chainFalloff: 0.70 },
      { cost: 110, damage: 18, range: 2.4, fireRate: 1.1, chain: 3, chainFalloff: 0.75 },
      { cost: 220, damage: 27, range: 2.6, fireRate: 1.2, chain: 4, chainFalloff: 0.80, perk: '连锁 +1 目标' },
    ],
  },

  poison: {
    id: 'poison', name: '毒塔', short: '毒', color: 0x8bc34a,
    targeting: 'first',
    desc: '持续伤害 · 无视护甲 —— 克制坦克',
    levels: [
      { cost: 70,  damage: 3, range: 1.9, fireRate: 1.00, poison: 4,  poisonTime: 3.0, ignoreArmor: true },
      { cost: 80,  damage: 5, range: 2.0, fireRate: 1.05, poison: 7,  poisonTime: 3.5, ignoreArmor: true },
      { cost: 160, damage: 8, range: 2.1, fireRate: 1.10, poison: 14, poisonTime: 4.0, ignoreArmor: true, perk: '毒伤翻倍' },
    ],
  },

  sniper: {
    id: 'sniper', name: '狙击塔', short: '狙', color: 0xff6b6b,
    targeting: 'strongest',
    desc: '超远射程 · 极慢 · 超高单伤 —— 克制精英',
    levels: [
      { cost: 120, damage: 45,  range: 4.5, fireRate: 0.40 },
      { cost: 130, damage: 70,  range: 4.8, fireRate: 0.45 },
      { cost: 260, damage: 110, range: 5.2, fireRate: 0.50, ignoreArmor: true, perk: '破甲（无视护甲）' },
    ],
  },
}

/** 建造栏的固定顺序（不要依赖对象键顺序） */
export const TOWER_ORDER = ['arrow', 'cannon', 'ice', 'tesla', 'poison', 'sniper']

export function towerDef(id) {
  const def = TOWERS[id]
  if (!def) throw new Error(`未知塔类型: ${id}`)
  return def
}

/** 指定等级的属性；level 为 1-based，超范围会夹紧 */
export function levelStats(id, level) {
  const def = towerDef(id)
  const idx = Math.max(0, Math.min(level - 1, def.levels.length - 1))
  return def.levels[idx]
}

/** 累计投入（造价 + 已付升级费）—— 卖塔退款的基数 */
export function totalInvested(id, level) {
  const def = towerDef(id)
  let sum = 0
  for (let i = 0; i < Math.min(level, def.levels.length); i++) sum += def.levels[i].cost
  return sum
}

/** 建造价（即 Lv1 的费用）。
 *  ⚠️ 造价存在 `levels[0].cost`，**不是** `def.cost` ——
 *  曾经在 GameScene 里误读 `def.cost`，得到 undefined，
 *  导致 `canAfford(undefined)` 恒为 false、建造永远失败。 */
export function buildCost(id) {
  return towerDef(id).levels[0].cost
}

/** 升级到下一级的费用；已满级返回 null */
export function upgradeCost(id, level) {
  const def = towerDef(id)
  if (level >= def.levels.length) return null
  return def.levels[level].cost
}
