// 塔防游戏入口
//
// Phaser 由 index.html 用普通 <script> 先行加载，因此这里使用全局 `Phaser`。
// 游戏代码本身是原生 ES modules —— 无构建步骤。

import BootScene from './scenes/BootScene.js'
import MenuScene from './scenes/MenuScene.js'
import LevelSelectScene from './scenes/LevelSelectScene.js'
import GameScene from './scenes/GameScene.js'
import HudScene from './scenes/HudScene.js'
import ResultScene from './scenes/ResultScene.js'

const config = {
  type: Phaser.AUTO,            // WebGL 优先，不可用则自动回落 Canvas
  parent: document.body,

  // RESIZE：画布匹配实际窗口，逻辑坐标 = CSS 像素。
  // 不用 FIT —— 竖屏下 FIT 会把整个画面缩到 0.39 倍，HUD 文字变成 4.7 px。
  // 详见 docs/spec.md §6.1。
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: '100%',
    height: '100%',
  },

  backgroundColor: '#0b0b0f',
  render: { antialias: true, roundPixels: false },

  scene: [
    BootScene,
    MenuScene,
    LevelSelectScene,
    GameScene,
    HudScene,
    ResultScene,
  ],
}

window.game = new Phaser.Game(config)
