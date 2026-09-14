// 关卡注册表
//
// spec §4.3 扩展契约：新增一张地图 = 新建一个数据文件 + 在下面数组里加一行。
// 不改动任何逻辑代码；关卡总数不硬编码，LevelSelectScene 从这里动态生成按钮。

import level01 from './level-01.js'
import level02 from './level-02.js'

export const LEVELS = [
  level01,
  level02,
]

export function levelById(id) {
  return LEVELS.find(l => l.id === id) || LEVELS[0] || null
}

export default LEVELS
