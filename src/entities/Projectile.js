// 弹道 —— **纯视觉**，不参与任何伤害判定
//
// spec §3.3：伤害在塔锁定目标的瞬间就已结算（方案 B）。
// 所以弹道不需要跟踪目标、不需要处理"目标中途死亡或走出射程"，
// 它只是从塔飞向开火时刻的目标位置，然后消失。

export class Projectile extends Phaser.GameObjects.Arc {
  constructor(scene) {
    super(scene, -100, -100, 3, 0, 360, false, 0xffffff)
    scene.add.existing(this)
    this.setVisible(false)
    this.setDepth(3)
    this.active = false
    this.t = 0
    this.dur = 0.12          // 飞行时长（秒）
  }

  /** fromPx / toPx 均为**像素**坐标 */
  fire(fromPx, toPx, color, radius) {
    this.setPosition(fromPx.x, fromPx.y)
    this.setFillStyle(color)
    if (radius) this.setRadius(radius)
    this.setVisible(true)

    this.active = true
    this.t = 0
    this.sx = fromPx.x
    this.sy = fromPx.y
    this.tx = toPx.x
    this.ty = toPx.y
    return this
  }

  /** @returns {boolean} true = 已结束（可回收） */
  advance(dt) {
    if (!this.active) return true

    this.t += dt / this.dur
    if (this.t >= 1) {
      this.active = false
      this.setVisible(false)
      return true
    }

    this.setPosition(
      this.sx + (this.tx - this.sx) * this.t,
      this.sy + (this.ty - this.sy) * this.t,
    )
    return false
  }
}
