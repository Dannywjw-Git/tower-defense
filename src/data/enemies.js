// 敌人数值表 —— 纯数据（spec §4.2：3 种 + 1 精英变体）
//
// 速度以「格/秒」为单位，基准 = normal 的 1.2 格/秒。
//   fast = 1.8× 基准、tank = 0.6× 基准（spec §4.2）
//
// **护甲不是装饰**：它是毒塔（无视护甲）与狙击塔 Lv3（破甲）的定位依据。
// 若敌人没有护甲，这两张牌就失去了存在理由（spec §4.2 的备注）。

export const ENEMIES = {
  normal: {
    id: 'normal', name: '普通', color: 0xff6b6b,
    hp: 60, speed: 1.2, armor: 0, bounty: 8, leakDamage: 1,
    desc: '基线单位',
  },

  fast: {
    id: 'fast', name: '快速', color: 0xffd166,
    hp: 35, speed: 2.16, armor: 0, bounty: 6, leakDamage: 1,
    desc: '跑得快 —— 逼你上减速',
  },

  tank: {
    id: 'tank', name: '坦克', color: 0x9b7bff,
    hp: 220, speed: 0.72, armor: 8, bounty: 15, leakDamage: 1,
    desc: '厚血高护甲 —— 逼你上高伤/无视护甲',
  },

  /** 每关末的精英：复用普通怪机制 + 放大数值 + 换外观，**不引入新机制** */
  elite: {
    id: 'elite', name: '精英', color: 0xff3b9a,
    hp: 900, speed: 1.2, armor: 12, bounty: 40, leakDamage: 3,
    desc: '关底精英 —— 漏掉一只等于漏三只',
  },
}

/** 稳定的顺序（用于图鉴/调试展示） */
export const ENEMY_ORDER = ['normal', 'fast', 'tank', 'elite']

export function enemyDef(id) {
  const def = ENEMIES[id]
  if (!def) throw new Error(`未知敌人类型: ${id}`)
  return def
}
