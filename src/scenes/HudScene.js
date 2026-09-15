// HudScene —— HUD（与本场景并行运行，因此不随地图缩放）
//
// 两套排布（spec §6.2）：
//   竖屏 → HUD 占上下固定区，不与地图争空间
//   横屏 → HUD 改左右浮层，把纵向空间全部让给地图
//          （Phase 0 实测：横屏病根是纵向不足；812×375 下上下 HUD 会把格子压到
//            36 px，改左右浮层后升到 54.8 px）
//
// 输入分工：HUD 只处理自己的按钮；地图区域的点击由 GameScene 处理。
// 两者区域不重叠（竖屏上下 / 横屏左右），所以无需额外的事件拦截。

import { TOWER_ORDER, TOWERS, buildCost, upgradeCost } from '../data/towers.js'
import { enemyDef } from '../data/enemies.js'
import { SELL_REFUND_RATE } from '../systems/Economy.js'
// 注意：SIDE_MAX / SIDE_RATIO 统一从 Layout.js 取，**不要在本文件重复定义**
// —— 曾经这里还有一个 `const SIDE_MAX = 200`，与 import 撞名导致
//    "Identifier 'SIDE_MAX' has already been declared"，整个游戏起不来。
import { px, setPixelScale, SIDE_MAX_PX as SIDE_MAX, SIDE_RATIO } from '../systems/Layout.js'

const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'

/** 手机端「出售」需要二次确认，防止误触卖掉塔（spec §6.3） */
const SELL_CONFIRM_MS = 3000

/** 长按多久算「长按」（spec §6.2：长按弹文字说明，因为手机无 hover） */
const HOLD_MS = 400

/** 调试面板的行数与单行高度 —— 用于给它预留位置（见 layout 里的说明） */
const DEBUG_LINES = 4
const DEBUG_LINE_PX = 15

export default class HudScene extends Phaser.Scene {
  constructor() {
    super('Hud')
  }

  create() {
    // 注意：不能用 this.game（Phaser.Scene 的保留属性，指向 Phaser.Game）
    this.gs = this.scene.get('Game')

    // ⚠️ HiDPI：本场景所有字号/间距都按 CSS 像素设计，必须先换算到逻辑像素。
    //    漏掉任何一处，DPR≥2 的手机上那部分 UI 就会缩小一半。
    //    统一走 systems/Layout.js 的 px()，禁止各处自己乘。
    setPixelScale(window.PIXEL_SCALE || 1)
    const S = (n) => px(n)

    this.status = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: S(14) + 'px', color: '#cfe3f2', lineSpacing: S(4),
    })

    this.pauseBtn = this.makeMiniButton('⏸', () => {
      this.gs.paused = !this.gs.paused
      this.refresh()
    })
    this.speedBtn = this.makeMiniButton('1×', () => {
      this.gs.speed = this.gs.speed === 1 ? 2 : 1
      this.refresh()
    })

    // ── 建造栏 ──
    this.buildButtons = TOWER_ORDER.map((id) => this.makeBuildButton(id))
    this.cancelBtn = this.makeMiniButton('取消', () => this.gs.setBuildMode(null))

    // ── 信息面板（选中塔时出现）──
    this.panelBg = this.add.rectangle(0, 0, 10, 10, 0x000000, 0.82).setOrigin(0)
    this.panelText = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: S(13) + 'px', color: '#e8e8ea', lineSpacing: S(3),
    })
    this.upBtn = this.makeMiniButton('升级', () => this.onUpgrade())
    this.sellBtn = this.makeMiniButton('出售', () => this.onSell())
    this.closeBtn = this.makeMiniButton('关闭', () => this.gs.selectTower(null))
    this.setPanelVisible(false)

    this.sellArmedUntil = 0

    // ── 调试面板：URL 加 ?debug=1 才显示 ──
    // 真机验收帧率时用它（spec §7.2 第①条），省得装任何工具。
    // 默认关闭，不污染正常游玩界面。
    this.debugOn = (() => {
      try { return new URLSearchParams(location.search).has('debug') } catch { return false }
    })()
    if (this.debugOn) {
      this.debugText = this.add.text(0, 0, '', {
        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
        fontSize: S(11) + 'px', color: '#7fe07f', backgroundColor: '#000000cc',
        padding: { x: S(6), y: S(4) }, align: 'right', lineSpacing: S(2),
      }).setOrigin(1, 0).setDepth(30)
    }

    this.layout()
    this.scale.on('resize', () => this.layout())
  }

  // ─────────────────────────── 组件工厂 ───────────────────────────

  makeMiniButton(label, onClick) {
    const S = (n) => px(n)
    const t = this.add.text(0, 0, label, {
      fontFamily: FONT, fontSize: S(13) + 'px', color: '#cfe3f2',
      backgroundColor: '#1d2a37', padding: { x: S(9), y: S(6) },
    }).setInteractive({ useHandCursor: true })
    t.on('pointerdown', (_p, _x, _y, event) => {
      event.stopPropagation()
      onClick()
    })
    return t
  }

  makeBuildButton(typeId) {
    const def = TOWERS[typeId]
    const S = (n) => px(n)
    const t = this.add.text(0, 0, def.short, {
      fontFamily: FONT, fontSize: S(17) + 'px', color: '#0b0b0f',
      backgroundColor: '#2b3d4f', padding: { x: S(10), y: S(9) },
      fixedWidth: S(34), align: 'center',
    }).setInteractive({ useHandCursor: true })

    // 短按 = 进入建造模式；长按 = 弹文字说明
    // （spec §6.2：手机无 hover，所以说明只能在长按时出现）
    let holdTimer = null
    let longPressed = false

    t.on('pointerdown', (_p, _x, _y, event) => {
      event.stopPropagation()
      longPressed = false
      holdTimer = this.time.delayedCall(HOLD_MS, () => {
        longPressed = true
        this.gs.flashNotice(`${def.name}｜${def.desc}`)
      })
    })

    t.on('pointerup', (_p, _x, _y, event) => {
      event.stopPropagation()
      if (holdTimer) { holdTimer.remove(); holdTimer = null }
      if (longPressed) return            // 长按只弹说明，不进建造模式

      const gs = this.gs
      // 金币不足 → 不入建造模式（spec §6.4）
      if (!gs.economy.canAfford(buildCost(typeId))) {
        gs.flashNotice(`金币不足（需要 ${buildCost(typeId)}）`)
        return
      }
      gs.setBuildMode(gs.buildMode === typeId ? null : typeId)
      this.refresh()
    })

    // ⚠️ 滑出按钮**只取消长按计时**，绝不能当作一次短按 ——
    // 曾经的实现把 onRelease 也挂在 pointerout 上，结果手指/鼠标从按钮移向
    // 地图时会触发 pointerout，把刚进入的建造模式又切换掉了。
    // 表现：「点塔图标 → 点地图格」永远建不出塔。
    t.on('pointerout', () => {
      if (holdTimer) { holdTimer.remove(); holdTimer = null }
      longPressed = false
    })

    return { typeId, text: t, def }
  }

  setPanelVisible(v) {
    this.panelBg.setVisible(v)
    this.panelText.setVisible(v)
    this.upBtn.setVisible(v)
    this.sellBtn.setVisible(v)
    this.closeBtn.setVisible(v)
  }

  // ─────────────────────────── 布局 ───────────────────────────

  layout() {
    const W = this.scale.width
    const H = this.scale.height
    const landscape = W > H
    this.landscape = landscape

    // HiDPI：所有按 CSS 像素设计的尺寸都要换算（W/H 本身已是逻辑像素）
    const S = (n) => px(n)
    const sideMax = px(SIDE_MAX)

    if (landscape) {
      const side = Math.min(sideMax, W * SIDE_RATIO)
      this.sideW = side
      // 左浮层：状态 + 暂停/加速
      this.status.setPosition(S(10), S(12))
      this.pauseBtn.setPosition(S(10), H - S(78))
      this.speedBtn.setPosition(S(10), H - S(44))

      // 右浮层：建造栏竖排 + 取消
      // ⚠️ 整个栏**垂直居中**，不要从固定的 y=10 开始往下排 ——
      //    那样在大屏上（1440×900）建造栏会挤在顶部 268px 内、下方 70% 全空。
      const btnH = Math.max(S(30), Math.min(S(44), (H - S(60)) / 7))
      const bx = W - side + S(14)
      const blockH = 6 * btnH + S(8) + this.cancelBtn.height
      const startY = Math.max(S(8), (H - blockH) / 2)

      this.buildButtons.forEach((b, i) => {
        b.text.setPosition(bx, startY + i * btnH)
      })
      this.cancelBtn.setPosition(bx, startY + 6 * btnH + S(8))

      this.layoutPanel(W, H, landscape, side)
    } else {
      this.sideW = 0
      // 顶部条
      this.status.setPosition(S(10), S(12))
      this.pauseBtn.setPosition(W - S(74), S(10))
      this.speedBtn.setPosition(W - S(42), S(10))

      // 底部建造栏 3×2 —— 从屏幕底边往上排（不是从固定 baseY 往下摆），
      // 这样无论在 320×568 的小屏还是 430×932 的大屏，栏都稳稳贴住底边。
      const cols = 3
      const bw = Math.min(S(64), (W - S(32)) / cols)
      const bh = S(40)
      const gap = S(6)
      const baseY = H - S(12) - (2 * bh + gap)       // 两行 + 行间距 + 底边距
      this.buildButtons.forEach((b, i) => {
        const cx = i % cols
        const cy = Math.floor(i / cols)
        b.text.setPosition(S(12) + cx * (bw + gap), baseY + cy * (bh + gap))
      })
      this.cancelBtn.setPosition(S(12) + 2 * (bw + gap) + bw + gap, baseY + bh + gap)

      this.layoutPanel(W, H, landscape, 0)
    }

    if (this.debugText) this.debugText.setPosition(W - S(6), S(6))

    // ⚠️ 调试面板占右上角，必须让「暂停 / 1×」避开它 —— 否则整块盖住，玩家点不到加速。
    //
    // 关键坑：**不能用 `this.debugText.height`** —— 文本高度要到第一帧渲染后才确定，
    //   而 layout() 在 create() 里就跑了，那时 height 还是 0。
    //   初版据此算出 below=12，等于没让位（实测暂停仍在 y32、面板占 y6–68）。
    //   这里改用**固定行高常量**，与渲染时机无关。
    if (this.debugText && this.debugText.visible) {
      const below = S(6) + DEBUG_LINES * S(DEBUG_LINE_PX) + S(8)
      this.pauseBtn.setPosition(W - S(74), below)
      this.speedBtn.setPosition(W - S(42), below)
    }
  }

  layoutPanel(W, H, landscape, side) {
    const gs = this.gs
    const L = gs && gs.L

    // HiDPI：本方法内所有数字都按 CSS 像素设计，统一过 px()
    const S = (n) => px(n)
    let pw, pxx, py

    if (landscape) {
      // 横屏：左侧浮层（地图水平居中，两侧本就是留白）
      pw = Math.max(S(150), side - S(20))
      pxx = S(10)
      py = S(96)
    } else {
      // 竖屏：面板放在**地图正下方**。
      //
      // ⚠️ 曾经写死 `py = H - 200`，结果面板底部压住了底部建造栏的**上排三个塔按钮**
      //    （箭/炮/冰），玩家根本点不到它们。
      //    所有自动化测试依然全绿 —— 因为它们用程序坐标点按钮，
      //    程序算的是按钮的理论位置，根本不知道有东西盖在上面。**看图才发现。**
      //
      // ⚠️ 但在 320×568 这类小屏上，地图下方只剩约 100px，放不下 96px 的面板 + 间距，
      //    仍会压到建造栏（visual-flow 抓到过：面板 y347–443 vs 栏 y440–524）。
      //    所以这里取「地图下方」与「建造栏上方」两者的较小值，保证永不重叠。
      pw = Math.min(W - S(24), S(320))
      pxx = (W - pw) / 2

      const belowGrid = L ? (L.originY + L.gridH + S(12)) : (H * 0.5)
      const barTop = H - S(12) - (2 * S(40) + S(6)) - S(10)   // 建造栏上沿再留 10px
      py = Math.min(belowGrid, barTop - S(96))
      py = Math.max(S(56), py)                                 // 至少不撞顶部状态条
    }

    this.panelBg.setPosition(pxx, py).setSize(pw, S(96))
    this.panelText.setPosition(pxx + S(10), py + S(8))
    this.upBtn.setPosition(pxx + S(10), py + S(60))
    this.sellBtn.setPosition(pxx + S(82), py + S(60))
    this.closeBtn.setPosition(pxx + S(154), py + S(60))
  }

  // ─────────────────────────── 每帧刷新 ───────────────────────────

  update() {
    this.refresh()
  }

  refresh() {
    const gs = this.gs
    if (!gs || !gs.getState) return

    const s = gs.getState()
    // 波次预告要显示敌人类型（spec §6.5「常驻可查」）——
    // 否则玩家无法提前决定该补哪种塔
    const waveDesc = (w) => (w ? `${enemyDef(w.type).name} ×${w.count}` : '')
    const waveText = s.phase === 'done' ? '波次结束'
      : s.phase === 'prep'
        ? `下一波 ${s.countdown.toFixed(0)}s · ${waveDesc(s.nextWave)}`
        : `第 ${s.wave}/${s.totalWaves} 波 · ${waveDesc(s.currentWave)}`

    this.status.setText(
      `💰 ${s.gold}    ❤️ ${s.lives}\n${waveText}    👾 ${s.enemies}` +
      (gs.paused ? '\n⏸ 已暂停' : ''))

    this.speedBtn.setText(gs.speed === 1 ? '1×' : '2×')

    // 建造按钮状态：选中 / 可负担
    for (const b of this.buildButtons) {
      const selected = gs.buildMode === b.typeId
      const affordable = gs.economy.canAfford(buildCost(b.typeId))
      const bg = selected ? '#4ade80' : affordable ? '#2b3d4f' : '#1a222b'
      const fg = selected ? '#0b0b0f' : affordable ? '#cfe3f2' : '#4a5f73'
      b.text.setBackgroundColor(bg).setColor(fg)
    }

    this.cancelBtn.setVisible(!!gs.buildMode)
    this.refreshPanel(gs)

    if (this.debugText) {
      this.debugText.setText(
        `FPS ${s.fps.toFixed(1)}\n` +
        `怪 ${s.enemies}  塔 ${s.towers}  弹 ${s.projectiles}\n` +
        `池 ${s.pools.enemy}/${s.pools.tower}/${s.pools.proj}\n` +
        `cell ${s.cell.toFixed(1)}px ${s.landscape ? '横屏' : '竖屏'}`)
    }
  }

  refreshPanel(gs) {
    const t = gs.selectedTower
    if (!t) { this.setPanelVisible(false); return }

    this.setPanelVisible(true)

    const syn = t.synergy
    const synText = syn.stacks > 0
      ? `协同 ${syn.stacks} 层 ×${syn.damageMult.toFixed(2)}` +
        (syn.specials.length ? ` +${syn.specials.map(x => x.stat).join('/')}` : '')
      : '协同 无'

    const maxed = t.isMaxLevel
    const upCost = upgradeCost(t.type, t.level)
    const refund = Math.floor(t.invested * SELL_REFUND_RATE)

    this.panelText.setText(
      `${t.def.name}  Lv${t.level}/${t.def.levels.length}\n` +
      `伤害 ${t.damage}   射程 ${t.range.toFixed(1)}   攻速 ${t.fireRate.toFixed(2)}\n` +
      synText)

    const affordable = !maxed && gs.economy.canAfford(upCost)
    this.upBtn.setText(maxed ? '已满级' : `升级 ${upCost}`)
      .setBackgroundColor(maxed ? '#1a222b' : affordable ? '#1d2a37' : '#1a222b')
      .setColor(maxed || !affordable ? '#4a5f73' : '#cfe3f2')

    const armed = this.time.now < this.sellArmedUntil
    this.sellBtn.setText(armed ? '确认?' : `售 ${refund}`)
      .setBackgroundColor(armed ? '#7f1d1d' : '#1d2a37')
  }

  // ─────────────────────────── 面板动作 ───────────────────────────

  onUpgrade() {
    const gs = this.gs
    const t = gs.selectedTower
    if (!t) return

    const res = gs.upgradeTower(t.cx, t.cy)
    if (!res.ok) {
      const msg = { 'max-level': '已满级', 'no-gold': '金币不足' }[res.reason] || res.reason
      gs.flashNotice(msg)
    }
    // 升级后 res.tower 仍是同一实例；面板读的是 gs.selectedTower，会自动刷新
  }

  onSell() {
    const gs = this.gs
    const t = gs.selectedTower
    if (!t) return

    // 手机端二次确认（spec §6.3）
    if (this.time.now >= this.sellArmedUntil) {
      this.sellArmedUntil = this.time.now + SELL_CONFIRM_MS
      gs.flashNotice('再点一次确认出售')
      this.refresh()
      return
    }

    this.sellArmedUntil = 0
    gs.sellTower(t.cx, t.cy)
    gs.selectTower(null)
  }
}
