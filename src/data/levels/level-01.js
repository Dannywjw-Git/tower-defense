// 地图 1「教学」—— 直线为主的简单路径，8 波（spec §4.3）
//
// 坐标一律是**格坐标**（不是像素），因此同一份数据在竖屏 / 横屏 / 电脑上渲染一致。
// 地图规格固定 8×5（spec §4.3）。

export default {
  id: 'level-01',
  name: '教学',
  desc: '直线路径，学会放塔、升级、看波次',

  cols: 8,
  rows: 5,

  // 路径点序列（格坐标，相邻点须轴对齐）
  //   (0,2)→(2,2)→(2,0)→(5,0)→(5,4)→(7,4)
  // 共 14 个路径格 → 约 26 个可建塔位
  path: [
    [0, 2],
    [2, 2],
    [2, 0],
    [5, 0],
    [5, 4],
    [7, 4],
  ],

  blocked: [],

  startGold: 120,
  startLives: 20,
  prepTime: 15,          // spec §6.5：首波 15 秒准备，让玩家放得下第一座塔
  waveInterval: 6,       // 波与波之间的间隔

  // 8 波（spec §4.3）—— 由易到难，末波为精英
  waves: [
    { type: 'normal', count: 5,  baseHp: 60,  interval: 0.90 },
    { type: 'normal', count: 8,  baseHp: 60,  interval: 0.80 },
    { type: 'fast',   count: 5,  baseHp: 35,  interval: 0.60 },
    { type: 'normal', count: 10, baseHp: 60,  interval: 0.70 },
    { type: 'tank',   count: 2,  baseHp: 220, interval: 1.60 },
    { type: 'fast',   count: 8,  baseHp: 35,  interval: 0.50 },
    { type: 'normal', count: 12, baseHp: 60,  interval: 0.60 },
    { type: 'elite',  count: 1,  baseHp: 900, interval: 2.00 },
  ],
}
