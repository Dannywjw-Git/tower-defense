// 塔的矢量图标 —— 纯几何绘制，零素材依赖
//
// 为什么要有图标（HANDOFF §3 ③）：场上 6 种塔原本只有**颜色**差异，
// 玩家记不住哪个色块是什么塔；而色盲玩家更是完全无法分辨。
// 图标提供**形状**这一层独立编码 —— 形状差异不需要图例就能读懂。
//
// ⚠️ 不用单字（用户已明确否决）：中文在 45 CSS px 的塔上会糊成一团，
// 且在部分安卓 X5 内核上字形回退不可控。
//
// ⚠️ 不用 Kenney 素材：那批是等距（isometric）视图，与本项目正交俯视的
// 方格网格不兼容（详见 docs/HANDOFF.md §3 ④）。
//
// 本模块**只负责画**，不持有状态、不 import Phaser 之外的任何东西，
// 也不缓存 Graphics 对象 —— 调用方决定何时重建（塔只在建造/升级时重画，
// 不在每帧重画，遵守 spec §3.2 的对象池与"不在每帧做重活"原则）。

/** 图标尺寸相对容器半边的比例（留出边距，避免贴边） */
const INSET = 0.80

/**
 * 在 Graphics 上画出指定塔的图标。
 *
 * @param {Phaser.GameObjects.Graphics} g  目标 Graphics（会先被 clear）
 * @param {string} icon                    图标 id（见 data/towers.js 的 icon 字段）
 * @param {number} cx,cy                   图标中心（像素）
 * @param {number} r                       图标外接半径（像素）
 * @param {number} color                   描边/填充色
 */
export function drawTowerIcon(g, icon, cx, cy, r, color) {
  g.clear()
  // 线宽随半径走：手机上场上的塔只有 ~45 CSS px（图标半径约 18 px），
  // 线太细在真机上会糊掉。0.22 是看图调出来的，别再调细。
  g.lineStyle(Math.max(1.6, r * 0.22), color, 1)
  g.fillStyle(color, 1)

  const R = r * INSET

  switch (icon) {
    // 箭塔：朝上的实心三角（箭头＝快、直）
    case 'arrow': {
      g.fillTriangle(cx, cy - R, cx + R * 0.86, cy + R * 0.70, cx - R * 0.86, cy + R * 0.70)
      break
    }

    // 炮塔：实心圆 + 外圈（炮口）
    case 'cannon': {
      g.fillCircle(cx, cy, R * 0.54)
      g.strokeCircle(cx, cy, R)
      break
    }

    // 冰塔：六角雪花（三根交叉线）
    case 'ice': {
      for (let i = 0; i < 3; i++) {
        const a = (Math.PI / 3) * i
        g.lineBetween(cx - Math.cos(a) * R, cy - Math.sin(a) * R,
                      cx + Math.cos(a) * R, cy + Math.sin(a) * R)
      }
      break
    }

    // 电塔：闪电折线（描边，非填充 —— 与炮塔的实心圆区分）
    case 'tesla': {
      g.beginPath()
      g.moveTo(cx + R * 0.34, cy - R)
      g.lineTo(cx - R * 0.26, cy + R * 0.06)
      g.lineTo(cx + R * 0.16, cy + R * 0.06)
      g.lineTo(cx - R * 0.34, cy + R)
      g.strokePath()
      break
    }

    // 毒塔：三个毒泡（上二下一，与任何塔都不重形）
    case 'poison': {
      g.fillCircle(cx - R * 0.46, cy - R * 0.30, R * 0.34)
      g.fillCircle(cx + R * 0.46, cy - R * 0.30, R * 0.34)
      g.fillCircle(cx, cy + R * 0.52, R * 0.34)
      break
    }

    // 狙击塔：十字准星（外圈 + 十字，唯一带"靶"语义的）
    case 'sniper': {
      g.strokeCircle(cx, cy, R)
      g.lineBetween(cx - R, cy, cx + R, cy)
      g.lineBetween(cx, cy - R, cx, cy + R)
      break
    }

    default:
      // 未知图标退化为实心方块，至少不静默什么都不画
      g.fillRect(cx - R * 0.7, cy - R * 0.7, R * 1.4, R * 1.4)
  }
}

/** 全部图标 id —— 测试用它验证"6 种塔图标互不相同" */
export const ICON_IDS = ['arrow', 'cannon', 'ice', 'tesla', 'poison', 'sniper']
