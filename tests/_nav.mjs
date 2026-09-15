// 测试共享辅助：场景导航
//
// ⚠️ 为什么不硬编码点击坐标：
//    曾经 4 个测试脚本都写死 `H * 0.64` 点击「开始游戏」。Phase 6 把该按钮
//    挪到 `H * 0.60` 后，全部测试静默点空、卡在菜单，却只报出无关的
//    "economy undefined"。**布局一变，硬编码坐标就是定时炸弹。**
//    这里改为从 Phaser 的交互对象动态取中心，布局怎么挪都不受影响。
//
// ⚠️⚠️ HiDPI（2026-09-15）：**游戏内坐标是逻辑像素，而 mouse.click 收 CSS 像素。**
//    启用物理像素渲染后（PIXEL_SCALE=2），游戏逻辑宽 860 而屏幕 CSS 宽只有 430，
//    直接把逻辑坐标喂给 mouse.click 会**点偏一倍**，表现为"找得到按钮却点不动"。
//    所以这里必须除以 PIXEL_SCALE 换算回 CSS 像素。

/** 读取当前像素倍率（游戏未启动时按 1 处理） */
export async function pixelScaleOf(page) {
  return page.evaluate(() => {
    try { return window.PIXEL_SCALE || 1 } catch { return 1 }
  })
}

/**
 * 在指定场景里找可交互的文字按钮，返回其**中心坐标（CSS 像素）**。
 * 返回的 `logical` 字段保留逻辑坐标，便于调试。
 */
export async function findButton(page, sceneKey, textMatch) {
  return page.evaluate(({ sceneKey, textMatch }) => {
    const s = window.game.scene.getScene(sceneKey)
    if (!s || !s.children) return null
    const re = textMatch ? new RegExp(textMatch) : null
    const objs = s.children.list.filter(o =>
      o && o.input && o.input.enabled && typeof o.text === 'string')
    const t = (re ? objs.find(o => re.test(o.text)) : objs[0]) || null
    if (!t) return null

    const ps = window.PIXEL_SCALE || 1
    // 逻辑像素 → CSS 像素（canvas 的 CSS 尺寸 = 逻辑尺寸 / ps）
    const lx = t.x + t.width / 2
    const ly = t.y + t.height / 2
    return {
      x: lx / ps,
      y: ly / ps,
      logical: { x: lx, y: ly },
      ps,
      text: t.text,
    }
  }, { sceneKey, textMatch })
}

/** 点击指定场景里的按钮；找不到就抛错（而不是静默点空） */
export async function clickButton(page, sceneKey, textMatch) {
  const pt = await findButton(page, sceneKey, textMatch)
  if (!pt) throw new Error(`在场景 ${sceneKey} 中找不到匹配 /${textMatch}/ 的按钮`)
  await page.mouse.click(pt.x, pt.y)
  return pt
}

export async function activeScenes(page) {
  return page.evaluate(() =>
    window.game ? window.game.scene.getScenes(true).map(s => s.scene.key).sort() : ['<no game>'])
}

/**
 * 把**游戏逻辑坐标**换算成可供 mouse.click 使用的 CSS 坐标。
 * 所有测试涉及"点地图格子/点敌人"的地方都应走它。
 */
export async function toCssPoint(page, logicalX, logicalY) {
  const ps = await pixelScaleOf(page)
  return { x: logicalX / ps, y: logicalY / ps }
}

/**
 * 从入口一路点到 GameScene。
 * @returns {string[]} 进入后的活跃场景
 */
export async function enterGame(page, levelText = '教学') {
  await clickButton(page, 'Menu', '开始游戏')
  await page.waitForTimeout(600)
  await clickButton(page, 'LevelSelect', levelText)
  await page.waitForTimeout(1500)

  const scenes = await activeScenes(page)
  if (!scenes.includes('Game')) {
    throw new Error(`未能进入 GameScene（活跃场景：${scenes.join(', ')}）`)
  }
  return scenes
}
