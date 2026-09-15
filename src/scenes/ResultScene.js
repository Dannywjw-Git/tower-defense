// ResultScene —— 胜/败结算
//
// 展示本局统计（来自 GameScene.resultStats），并提供重玩 / 下一关 / 返回。

import { LEVELS } from '../data/levels/index.js'
import { px, setPixelScale } from '../systems/Layout.js'
import { SFX } from '../systems/Audio.js'

function fmtTime(sec) {
  const s = Math.max(0, Math.round(sec || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result')
  }

  init(data) {
    this.win = !!(data && data.win)
    this.levelId = (data && data.levelId) || 'level-01'
    this.stats = (data && data.stats) || null
  }

  create() {
    setPixelScale(window.PIXEL_SCALE || 1)
    const S = (n) => px(n)
    const s = this.stats

    this.title = this.add.text(0, 0, this.win ? '通关！' : '失败', {
      fontSize: S(40) + 'px', color: this.win ? '#4ade80' : '#ff5c5c', fontStyle: 'bold',
    }).setOrigin(0.5)

    const body = s
      ? [
        `波次　${s.wave} / ${s.totalWaves}`,
        `剩余生命　${s.lives}`,
        `击杀　${s.kills}　　漏怪　${s.leaked}`,
        `建塔　${s.built}　　用时　${fmtTime(s.elapsed)}`,
        '',
        `得分　${s.score}`,
      ].join('\n')
      : ''

    this.statsText = this.add.text(0, 0, body, {
      fontSize: S(15) + 'px', color: '#cfe3f2', align: 'center', lineSpacing: S(6),
    }).setOrigin(0.5)

    // ── 按钮 ──
    this.retry = this.add.text(0, 0, '重玩', {
      fontSize: S(20) + 'px', color: '#0b0b0f', backgroundColor: '#4ade80',
      padding: { x: S(24), y: S(12) },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    this.retry.on('pointerdown', () => {
      SFX.wave()
      this.scene.start('Game', { levelId: this.levelId })
    })

    // 通关且有下一关时，提供「下一关」
    const idx = LEVELS.findIndex(l => l.id === this.levelId)
    const nextLevel = this.win && idx >= 0 ? LEVELS[idx + 1] : null

    this.next = nextLevel
      ? this.add.text(0, 0, `下一关：${nextLevel.name}`, {
        fontSize: S(17) + 'px', color: '#0b0b0f', backgroundColor: '#86efac',
        padding: { x: S(20), y: S(10) },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      : null

    if (this.next) {
      this.next.on('pointerdown', () => {
        SFX.wave()
        this.scene.start('Game', { levelId: nextLevel.id })
      })
    }

    this.menu = this.add.text(0, 0, '返回菜单', {
      fontSize: S(15) + 'px', color: '#8fa6bb',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    this.menu.on('pointerdown', () => this.scene.start('Menu'))

    this.layout()
    this.scale.on('resize', () => this.layout())
  }

  layout() {
    const W = this.scale.width
    const H = this.scale.height

    this.title.setPosition(W / 2, H * 0.20)
    this.statsText.setPosition(W / 2, H * 0.42)
    this.retry.setPosition(W / 2, H * 0.66)

    const hasNext = !!this.next
    if (this.next) this.next.setPosition(W / 2, H * 0.76)
    this.menu.setPosition(W / 2, hasNext ? H * 0.86 : H * 0.78)
  }
}
