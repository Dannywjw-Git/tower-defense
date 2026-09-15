// LevelSelectScene —— 关卡选择
//
// 按钮从关卡注册表动态生成，因此新增地图无需改本文件。
// 通关状态与最佳战绩来自存档（spec §3.7）。

import { LEVELS } from '../data/levels/index.js'
import { px, setPixelScale } from '../systems/Layout.js'
import { load } from '../systems/Save.js'
import { SFX } from '../systems/Audio.js'

export default class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('LevelSelect')
  }

  create() {
    setPixelScale(window.PIXEL_SCALE || 1)
    const S = (n) => px(n)
    const save = load()
    this.save = save

    this.title = this.add.text(0, 0, '选择地图', {
      fontSize: S(30) + 'px', color: '#e8e8ea', fontStyle: 'bold',
    }).setOrigin(0.5)

    this.items = LEVELS.map((level) => {
      const cleared = save.cleared.includes(level.id)
      const label = this.add.text(0, 0, `${level.name}${cleared ? '  ✅' : ''}`, {
        fontSize: S(20) + 'px', color: '#0b0b0f',
        backgroundColor: cleared ? '#86efac' : '#4ade80',
        padding: { x: S(26), y: S(12) },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true })

      label.on('pointerdown', () => {
        SFX.wave()
        this.scene.start('Game', { levelId: level.id })
      })

      const desc = this.add.text(0, 0, `${level.desc || ''}　·　${level.waves.length} 波`, {
        fontSize: S(13) + 'px', color: '#5a7186',
      }).setOrigin(0.5)

      return { label, desc, level }
    })

    const bestText = save.best.score > 0
      ? `最佳：${save.best.score} 分 · 第 ${save.best.wave} 波`
      : ''
    this.best = this.add.text(0, 0, bestText, {
      fontSize: S(12) + 'px', color: '#3f5568',
    }).setOrigin(0.5)

    this.back = this.add.text(0, 0, '← 返回', {
      fontSize: S(15) + 'px', color: '#8fa6bb',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    this.back.on('pointerdown', () => this.scene.start('Menu'))

    this.layout()
    this.scale.on('resize', () => this.layout())
  }

  layout() {
    const W = this.scale.width
    const H = this.scale.height
    // ⚠️ 本场景所有坐标都是**逻辑像素**（= CSS × PIXEL_SCALE，见 Layout.js L73-74）。
    //    任何"按 CSS 像素设计的间距"都必须过 px()，否则在 DPR=2 的屏幕上只有一半，
    //    表现就是「说明文字贴着按钮底、像被切掉」。
    const S = (n) => px(n)

    this.title.setPosition(W / 2, H * 0.16)
    this.best.setPosition(W / 2, H * 0.25)

    const startY = H * 0.40
    const gap = Math.min(S(96), H * 0.16)

    this.items.forEach((item, i) => {
      const y = startY + i * gap
      item.label.setPosition(W / 2, y)
      // 说明文字放在按钮下沿**之外**。
      //
      // ⚠️ 不能用 `item.label.height` —— 文本高度要到第一帧渲染后才确定，
      //    而 layout() 在 create() 里就跑了，那时 height 还是 0
      //    （HudScene 的调试面板让位逻辑踩过同一个坑，见其注释）。
      //    改用**由已知 padding/字号算出的按钮高度**，与渲染时机无关：
      //      按钮高 = padding.y × 2 + 行高(≈fontSize × 1.2)
      const labelH = S(12) * 2 + S(20) * 1.2
      item.desc.setPosition(W / 2, y + labelH / 2 + S(12))
    })

    this.back.setPosition(W / 2, H - S(34))
  }
}
