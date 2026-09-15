// BootScene —— 加载素材、显示进度，然后进入菜单
//
// Phase 1 阶段无素材，仅验证场景链路。素材加载在 Phase 6 接入 assets.js。

import { px, setPixelScale } from '../systems/Layout.js'

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  create() {
    setPixelScale(window.PIXEL_SCALE || 1)
    const S = (n) => px(n)
    const W = this.scale.width
    const H = this.scale.height

    this.add.text(W / 2, H / 2 - 16, '加载中…', {
      fontSize: S(20) + 'px',
      color: '#8fa6bb',
    }).setOrigin(0.5)

    // 素材加载失败不应白屏（spec §3.8）：此处仅监听事件的接线位置
    this.load.on('loaderror', (file) => {
      console.warn('[BootScene] 素材加载失败，将使用占位符:', file && file.key)
    })

    // Phase 1：无素材，直接进菜单
    this.time.delayedCall(150, () => this.scene.start('Menu'))
  }
}
