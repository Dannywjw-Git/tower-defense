// 地图 2「转弯」—— 蛇形路径，塔位价值分层（spec §4.3）
//
// 与地图 1 的区别：路径呈阶梯状往返，某些塔位能同时覆盖两段路径 ——
// 这制造了「为协同/为覆盖而放弃更好射程位」的真实取舍。
//
// 坐标一律是**格坐标**。地图规格固定 8×5（spec §4.3）。

export default {
  id: 'level-02',
  name: '转弯',
  desc: '蛇形路径，塔位价值分层，需要取舍',

  cols: 8,
  rows: 5,

  // 阶梯形往返：竖向 3 段 + 横向 4 段
  //   (0,0)→(1,0)→(1,3)→(3,3)→(3,1)→(5,1)→(5,4)→(7,4)
  // 共 15 个路径格 → 约 25 个可建塔位
  path: [
    [0, 0],
    [1, 0],
    [1, 3],
    [3, 3],
    [3, 1],
    [5, 1],
    [5, 4],
    [7, 4],
  ],

  blocked: [],

  startGold: 150,
  startLives: 20,
  prepTime: 15,          // spec §6.5：首波 15 秒准备
  waveInterval: 6,       // 波与波之间的间隔

  // 12 波（spec §4.3）—— 单一类型逐波递进，末波为精英
  waves: [
    { type: 'normal', count: 6,  baseHp: 60,  interval: 0.90 },
    { type: 'normal', count: 8,  baseHp: 60,  interval: 0.80 },
    { type: 'fast',   count: 6,  baseHp: 35,  interval: 0.60 },
    { type: 'normal', count: 10, baseHp: 60,  interval: 0.70 },
    { type: 'tank',   count: 2,  baseHp: 220, interval: 1.60 },
    { type: 'fast',   count: 10, baseHp: 35,  interval: 0.50 },
    { type: 'tank',   count: 3,  baseHp: 220, interval: 1.50 },
    { type: 'normal', count: 14, baseHp: 60,  interval: 0.60 },
    { type: 'fast',   count: 12, baseHp: 35,  interval: 0.45 },
    { type: 'tank',   count: 4,  baseHp: 220, interval: 1.40 },
    { type: 'tank',   count: 3,  baseHp: 220, interval: 1.20 },
    { type: 'elite',  count: 1,  baseHp: 900, interval: 2.00 },
  ],
}
