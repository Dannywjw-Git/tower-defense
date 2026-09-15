// BootScene —— 加载素材、显示进度，然后进入菜单
//
// 素材清单统一来自 `assets/assets.js`（spec §6.6 的唯一素材来源）。
// 加载失败**不阻塞**游戏（spec §3.8）：装饰缺失只是少点细节，不该白屏。

import { px, setPixelScale } from '../systems/Layout.js'
import { IMAGES } from '../../assets/assets.js'

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  preload() {
    // 装饰素材（8 张 64×64，共约 10.7 KB）
    for (const { key, path } of IMAGES) this.load.image(key, path)
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

    // 素材加载失败不应白屏（spec §3.8）：缺了装饰照常能玩
    this.load.on('loaderror', (file) => {
      console.warn('[BootScene] 素材加载失败，将使用占位符:', file && file.key)
    })

    this.time.delayedCall(150, () => this.scene.start('Menu'))
  }
}
