// 素材清单 —— **唯一**的素材来源（spec §6.6）
//
// 当前三个数组全为空：所有视觉与音效都是**代码绘制的占位**
//   · 塔 / 敌人 = 纯色圆（Phaser `Arc`）
//   · 按钮        = 文字 + 背景色
//   · 音效        = Web Audio 合成（`src/systems/Audio.js`）
//
// 这样做的理由（spec §6.6）：素材需要人工挑选下载，不应阻塞前六个 Phase。
//
// ─────────────────────────────────────────────────────────────
// 接入 Kenney（CC0）素材时：
//   1. 把文件放进 assets/ 对应子目录
//   2. **只改本文件** + BootScene 的加载循环
//   3. 逻辑代码零改动（渲染层读 key，不读路径）
// ─────────────────────────────────────────────────────────────
//
// 注意：路径必须**相对**（GitHub Pages 部署在子路径 /<repo>/ 下，
// 绝对路径 /assets/... 会 404）。

/** 单图素材：{ key, path, [width], [height] } */
export const IMAGES = [
  // { key: 'tower-arrow',  path: './assets/towers/arrow.png' },
  // { key: 'enemy-normal', path: './assets/enemies/normal.png' },
  // { key: 'tile-path',    path: './assets/tiles/path.png' },
]

/** 图集：{ key, path, json } */
export const ATLASES = [
  // { key: 'towers', path: './assets/towers/atlas.png', json: './assets/towers/atlas.json' },
]

/** 音频：{ key, path }（.ogg + .mp3 双格式最稳） */
export const SFX_FILES = [
  // { key: 'sfx-build', path: './assets/sfx/build.ogg' },
]
