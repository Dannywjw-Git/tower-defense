// 敌人实体
//
// 位置由 `pathDist`（已走格数）推导，而不是自持速度向量 ——
// 这样索敌的 'first' 策略直接比较 pathDist 即可（spec §3.4），无需坐标排序。
//
// 复用策略：由 GameScene 的对象池统一管理，**不 new / destroy**
// （spec §3.2：一波 30 只怪若频繁创建会触发 GC 卡顿）。
//
// 坐标体系：同时维护 gx/gy（格，供纯逻辑）与 x/y（像素，Phaser 自带，供渲染）。

import { positionAt } from '../systems/PathMath.js'
import { cellToPixel } from '../systems/Layout.js'

/** 敌人外观（素材接入前的占位；Phase 6 换成 Kenney 素材） */
const COLORS = {
  normal: 0xff6b6b,
  fast: 0xffd166,
  tank: 0x9b7bff,
  elite: 0xff3b9a,
}

export class Enemy extends Phaser.GameObjects.Arc {
  constructor(scene) {
    super(scene, -100, -100, 8, 0, 360, false, COLORS.normal)
    scene.add.existing(this)
    this.setVisible(false)
    this.setDepth(1)
    this.alive = false
    this.gx = 0
    this.gy = 0
    this.type = 'normal'
    this.hp = 0
    this.maxHp = 0
    this.speed = 1
    this.pathDist = 0
    this.armor = 0
    this.bounty = 0
    this.slowFactor = 1
    this.slowTimer = 0
    this.freezeTimer = 0
    this.poisonDps = 0
    this.poisonTimer = 0
  }

  /** 从对象池取出并初始化。cfg: { type, hp, speed, armor, bounty } */
  spawn(cfg) {
    this.type = cfg.type || 'normal'
    this.maxHp = cfg.hp
    this.hp = cfg.hp
    this.speed = cfg.speed ?? 1.2      // 格 / 秒
    this.armor = cfg.armor ?? 0
    this.bounty = cfg.bounty ?? 0
    this.leakDamage = cfg.leakDamage ?? 1     // 漏掉一只扣几点生命（精英是 3）
    this.pathDist = 0
    this.alive = true

    this.slowFactor = 1
    this.slowTimer = 0
    this.freezeTimer = 0
    this.poisonDps = 0
    this.poisonTimer = 0

    this.setFillStyle(COLORS[this.type] ?? COLORS.normal)
    this.setVisible(true)
    return this
  }

  /**
   * 前进 dt 秒。
   * @returns {boolean} true = 已走完全程（漏怪）
   */
  advance(dt, path) {
    // 定身：完全不动
    if (this.freezeTimer > 0) {
      this.freezeTimer -= dt
      return false
    }

    if (this.slowTimer > 0) {
      this.slowTimer -= dt
      if (this.slowTimer <= 0) this.slowFactor = 1
    }

    this.pathDist += this.speed * this.slowFactor * dt
    if (this.pathDist >= path.total) {
      this.pathDist = path.total
      return true
    }
    return false
  }

  /**
   * 结算持续效果（中毒）。与移动分开，便于"定身期间仍受毒伤"。
   * @returns {boolean} true = 被毒死
   */
  tickEffects(dt) {
    if (this.poisonTimer > 0) {
      this.poisonTimer -= dt
      // 毒伤**无视护甲**（spec §4.1：毒塔克制坦克）
      this.hp -= this.poisonDps * dt
      if (this.hp <= 0) {
        this.hp = 0
        this.alive = false
        return true
      }
    }
    return false
  }

  applySlow(factor, time) {
    this.slowFactor = Math.min(this.slowFactor, Math.max(0.1, 1 - factor))
    this.slowTimer = Math.max(this.slowTimer, time)
  }

  applyFreeze(time) {
    this.freezeTimer = Math.max(this.freezeTimer, time)
  }

  applyPoison(dps, time) {
    this.poisonDps = Math.max(this.poisonDps, dps)
    this.poisonTimer = Math.max(this.poisonTimer, time)
  }

  /** 把格坐标同步为像素坐标；格子尺寸变化（转屏）时也需调用 */
  syncPixel(path, layout) {
    const p = positionAt(path, this.pathDist)

    // 两套坐标职责分明：
    //   gx / gy = 格坐标 —— 纯逻辑模块使用（Targeting 射程、Combat 溅射距离）
    //   x  / y  = 像素坐标 —— Phaser GameObject 自带，渲染用
    this.gx = p.x
    this.gy = p.y

    const px = cellToPixel(layout, p.x, p.y)
    this.setPosition(px.x, px.y)
    this.setRadius(Math.max(3, layout.cell * 0.16))
  }

  /** 受伤；返回是否本次击杀 */
  takeDamage(amount, ignoreArmor = false) {
    if (!this.alive) return false
    const armor = ignoreArmor ? 0 : this.armor
    const real = Math.max(1, Math.round(amount) - armor)   // 保底 1，避免完全免疫
    this.hp -= real
    if (this.hp <= 0) {
      this.hp = 0
      this.alive = false
      return true
    }
    return false
  }

  /** 归还对象池 */
  despawn() {
    this.alive = false
    this.pathDist = 0
    this.slowFactor = 1
    this.slowTimer = 0
    this.freezeTimer = 0
    this.poisonDps = 0
    this.poisonTimer = 0
    this.setVisible(false)
    this.setPosition(-100, -100)
  }
}
