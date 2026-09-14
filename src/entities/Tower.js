// 塔实体
//
// 关键设计（spec §3.3）：伤害在**锁定瞬间**结算，弹道只是视觉动画。
//   好处：避开"目标中途死亡 / 走出射程"一整类边界情况，也省掉一层判定。
//
// 协同（spec §5.1）由 GameScene 在建造 / 升级 / 卖出后重算，并**缓存**在
// `synergy` 上 —— 不在每帧遍历邻域。
//
// 视觉：塔是**正方形**，敌人是**圆形**（见 Enemy.js）。
//   ⚠️ 起初两者都是纯色圆，结果**玩家分不清哪个是塔哪个是怪**，
//   而且毒塔的紫色与坦克敌人的紫色直接撞车。
//   形状差异不需要图例就能分辨，是最省成本的修法（看图才发现的问题）。

import { towerDef, levelStats } from '../data/towers.js'
import { pickTarget, STRATEGY } from '../systems/Targeting.js'
import { cellToPixel } from '../systems/Layout.js'

export class Tower extends Phaser.GameObjects.Rectangle {
  constructor(scene) {
    super(scene, -100, -100, 12, 12, 0x4ade80)
    scene.add.existing(this)
    this.setVisible(false)
    this.setStrokeStyle(2, 0x0b0b0f, 0.9)
    this.synergy = { stacks: 0, damageMult: 1, specials: [] }
  }

  /** 在格 (cx, cy) 放置某种塔 */
  place(cx, cy, typeId) {
    this.cx = cx
    this.cy = cy
    // 逻辑坐标（格）—— 与 Targeting 的约定一致
    this.gx = cx
    this.gy = cy

    this.type = typeId
    this.def = towerDef(typeId)
    this.level = 1
    this.invested = this.def.levels[0].cost
    this.cooldown = 0

    this.setFillStyle(this.def.color)
    this.setVisible(true)

    this.applyLevel()
    return this
  }

  /** 等级变化后重算属性（先取基础值，再应用协同） */
  applyLevel() {
    this.base = levelStats(this.type, this.level)
    this.recompute()
  }

  /** 把基础值 + 协同修正合成最终属性 */
  recompute() {
    const s = this.base
    const syn = this.synergy || { damageMult: 1, specials: [] }

    this.damage = Math.round(s.damage * syn.damageMult)
    this.range = s.range
    this.fireRate = s.fireRate

    this.splash = s.splash ?? 0
    this.chain = s.chain ?? 0
    this.chainFalloff = s.chainFalloff ?? 1
    this.pierce = s.pierce ?? 0
    this.slow = s.slow ?? 0
    this.slowTime = s.slowTime ?? 0
    this.freeze = s.freeze ?? 0
    this.poison = s.poison ?? 0
    this.poisonTime = s.poisonTime ?? 0
    this.ignoreArmor = !!s.ignoreArmor

    // 特例只作用在非伤害维度，因此与上面的伤害乘法不冲突
    for (const spec of syn.specials) {
      if (spec.stat === 'fireRate') this.fireRate *= spec.mult
      else if (spec.stat === 'splash') this.splash *= spec.mult
      else if (spec.stat === 'chain') this.chain += spec.add
    }
  }

  /** 由 GameScene 在建造/升级/卖出后调用 */
  setSynergy(synergy) {
    this.synergy = synergy
    this.recompute()
    return this
  }

  get isMaxLevel() {
    return this.level >= this.def.levels.length
  }

  /** 把格坐标换算为像素坐标；转屏后也需调用 */
  syncPixel(layout) {
    const px = cellToPixel(layout, this.cx, this.cy)
    this.setPosition(px.x, px.y)
    // Rectangle 用边长（不是半径）。等级越高方块越大 —— 与原先的圆直径相当。
    const side = Math.max(8, layout.cell * (0.42 + this.level * 0.065))
    this.setSize(side, side)
    this.setDepth(2)
  }

  /**
   * 推进冷却并尝试开火。
   * @returns {null | object} 开火事件（含全部伤害参数），由 GameScene 结算与表现
   */
  update(dt, enemies) {
    this.cooldown -= dt
    if (this.cooldown > 0) return null

    const target = pickTarget(this, enemies, this.def.targeting || STRATEGY.FIRST)
    if (!target) return null

    this.cooldown = 1 / Math.max(0.01, this.fireRate)

    return {
      tower: this,
      target,
      damage: this.damage,
      splash: this.splash,
      chain: this.chain,
      chainFalloff: this.chainFalloff,
      pierce: this.pierce,
      slow: this.slow,
      slowTime: this.slowTime,
      freeze: this.freeze,
      poison: this.poison,
      poisonTime: this.poisonTime,
      ignoreArmor: this.ignoreArmor,
    }
  }
}
