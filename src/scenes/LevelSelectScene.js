// LevelSelectScene —— 关卡选择
//
// 按钮从关卡注册表动态生成，因此新增地图无需改本文件。
// 通关状态与最佳战绩来自存档（spec §3.7）。

import { LEVELS } from '../data/levels/index.js'
import { load } from '../systems/Save.js'
import { SFX } from '../systems/Audio.js'

export default class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('LevelSelect')
  }

  create() {
    const save = load()
    this.save = save

    this.title = this.add.text(0, 0, '选择地图', {
      fontSize: '30px', color: '#e8e8ea', fontStyle: 'bold',
    }).setOrigin(0.5)

    this.items = LEVELS.map((level) => {
      const cleared = save.cleared.includes(level.id)
      const label = this.add.text(0, 0, `${level.name}${cleared ? '  ✅' : ''}`, {
        fontSize: '20px', color: '#0b0b0f',
        backgroundColor: cleared ? '#86efac' : '#4ade80',
        padding: { x: 26, y: 12 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true })

      label.on('pointerdown', () => {
        SFX.wave()
        this.scene.start('Game', { levelId: level.id })
      })

      const desc = this.add.text(0, 0, `${level.desc || ''}　·　${level.waves.length} 波`, {
        fontSize: '13px', color: '#5a7186',
      }).setOrigin(0.5)

      return { label, desc, level }
    })

    const bestText = save.best.score > 0
      ? `最佳：${save.best.score} 分 · 第 ${save.best.wave} 波`
      : ''
    this.best = this.add.text(0, 0, bestText, {
      fontSize: '12px', color: '#3f5568',
    }).setOrigin(0.5)

    this.back = this.add.text(0, 0, '← 返回', {
      fontSize: '15px', color: '#8fa6bb',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    this.back.on('pointerdown', () => this.scene.start('Menu'))

    this.layout()
    this.scale.on('resize', () => this.layout())
  }

  layout() {
    const W = this.scale.width
    const H = this.scale.height

    this.title.setPosition(W / 2, H * 0.16)
    this.best.setPosition(W / 2, H * 0.25)

    const startY = H * 0.40
    const gap = Math.min(96, H * 0.16)

    this.items.forEach((item, i) => {
      const y = startY + i * gap
      item.label.setPosition(W / 2, y)
      item.desc.setPosition(W / 2, y + 34)
    })

    this.back.setPosition(W / 2, H - 34)
  }
}
