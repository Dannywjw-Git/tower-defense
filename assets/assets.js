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
  // ── 地图装饰（Kenney Top-Down, CC0）──
  // 8 张 64×64，共 10.7 KB。来源与选取理由见 docs/TERRAIN-PROBE.md：
  //   Kenney 的**地面瓦片是纯色块**（实测颜色数=1），贴上去与代码绘制肉眼不可区分，
  //   所以不用地面瓦片；只用这些**带透明底、真有细节**的物件。
  // 不提交 3.86 MB 整包，也不提交 229 KB 图集 —— 只留用到的 8 张。
  { key: 'decor-bush-lg',    path: './assets/decor/bush_lg.png' },
  { key: 'decor-bush-sm',    path: './assets/decor/bush_sm.png' },
  { key: 'decor-leaves',     path: './assets/decor/leaves.png' },
  { key: 'decor-moss',       path: './assets/decor/moss.png' },
  { key: 'decor-plant-star', path: './assets/decor/plant_star.png' },
  { key: 'decor-rock-sm',    path: './assets/decor/rock_sm.png' },
  { key: 'decor-rock-md',    path: './assets/decor/rock_md.png' },
  { key: 'decor-rock-lg',    path: './assets/decor/rock_lg.png' },
]

/** 图集：{ key, path, json } */
export const ATLASES = [
  // { key: 'towers', path: './assets/towers/atlas.png', json: './assets/towers/atlas.json' },
]

/** 音频：{ key, path }（.ogg + .mp3 双格式最稳） */
export const SFX_FILES = [
  // { key: 'sfx-build', path: './assets/sfx/build.ogg' },
]
