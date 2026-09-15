// MenuScene —— 标题与入口

import { unlock, SFX } from '../systems/Audio.js'
import { px, setPixelScale } from '../systems/Layout.js'
import { load } from '../systems/Save.js'

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu')
  }

  create() {
    setPixelScale(window.PIXEL_SCALE || 1)
    const S = (n) => px(n)
    this.title = this.add.text(0, 0, '塔防游戏', {
      fontSize: S(44) + 'px', color: '#e8e8ea', fontStyle: 'bold',
    }).setOrigin(0.5)

    this.sub = this.add.text(0, 0, 'tower-defense', {
      fontSize: S(15) + 'px', color: '#4a5f73',
    }).setOrigin(0.5)

    this.btn = this.add.text(0, 0, '开始游戏', {
      fontSize: S(22) + 'px', color: '#0b0b0f', backgroundColor: '#4ade80',
      padding: { x: S(30), y: S(14) },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })

    // 音频必须在**用户手势**里解锁（iOS / 微信策略，spec §4.5）
    this.btn.on('pointerdown', () => {
      unlock()
      SFX.wave()
      this.scene.start('LevelSelect')
    })

    const save = load()
    const bestText = save.best.score > 0
      ? `最佳战绩：${save.best.score} 分 · 第 ${save.best.wave} 波`
      : '还没有战绩'
    this.best = this.add.text(0, 0, bestText, {
      fontSize: S(13) + 'px', color: '#5a7186',
    }).setOrigin(0.5)

    this.credit = this.add.text(0, 0, 'Art & SFX: Kenney.nl', {
      fontSize: S(12) + 'px', color: '#37485a',
    }).setOrigin(0.5)

    this.layout()
    this.scale.on('resize', () => this.layout())
  }

  layout() {
    const W = this.scale.width
    const H = this.scale.height

    this.title.setPosition(W / 2, H * 0.30)
    this.sub.setPosition(W / 2, H * 0.40)
    this.btn.setPosition(W / 2, H * 0.60)
    this.best.setPosition(W / 2, H * 0.72)
    this.credit.setPosition(W / 2, H - 24)
  }
}
