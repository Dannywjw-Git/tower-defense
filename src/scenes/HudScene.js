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
import { SELL_REFUND_RATE } from '../systems/Economy.js'

const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
const SIDE_RATIO = 0.22
const SIDE_MAX = 200

/** 手机端「出售」需要二次确认，防止误触卖掉塔（spec §6.3） */
const SELL_CONFIRM_MS = 3000

export default class HudScene extends Phaser.Scene {
  constructor() {
    super('Hud')
  }

  create() {
    // 注意：不能用 this.game（Phaser.Scene 的保留属性，指向 Phaser.Game）
    this.gs = this.scene.get('Game')

    this.status = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '14px', color: '#cfe3f2', lineSpacing: 4,
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
      fontFamily: FONT, fontSize: '13px', color: '#e8e8ea', lineSpacing: 3,
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
        fontSize: '11px', color: '#7fe07f', backgroundColor: '#000000cc',
        padding: { x: 6, y: 4 }, align: 'right', lineSpacing: 2,
      }).setOrigin(1, 0).setDepth(30)
    }

    this.layout()
    this.scale.on('resize', () => this.layout())
  }

  // ─────────────────────────── 组件工厂 ───────────────────────────

  makeMiniButton(label, onClick) {
    const t = this.add.text(0, 0, label, {
      fontFamily: FONT, fontSize: '13px', color: '#cfe3f2',
      backgroundColor: '#1d2a37', padding: { x: 9, y: 6 },
    }).setInteractive({ useHandCursor: true })
    t.on('pointerdown', (_p, _x, _y, event) => {
      event.stopPropagation()
      onClick()
    })
    return t
  }

  makeBuildButton(typeId) {
    const def = TOWERS[typeId]
    const t = this.add.text(0, 0, def.short, {
      fontFamily: FONT, fontSize: '17px', color: '#0b0b0f',
      backgroundColor: '#2b3d4f', padding: { x: 10, y: 9 },
      fixedWidth: 34, align: 'center',
    }).setInteractive({ useHandCursor: true })

    t.on('pointerdown', (_p, _x, _y, event) => {
      event.stopPropagation()
      const gs = this.gs
      // 金币不足 → 不入建造模式（spec §6.4）
      if (!gs.economy.canAfford(buildCost(typeId))) {
        gs.flashNotice(`金币不足（需要 ${buildCost(typeId)}）`)
        return
      }
      gs.setBuildMode(gs.buildMode === typeId ? null : typeId)
      this.refresh()
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

    if (landscape) {
      const side = Math.min(SIDE_MAX, W * SIDE_RATIO)
      this.sideW = side
      // 左浮层：状态 + 暂停/加速
      this.status.setPosition(10, 12)
      this.pauseBtn.setPosition(10, H - 78)
      this.speedBtn.setPosition(10, H - 44)

      // 右浮层：建造栏竖排 + 取消
      const btnH = Math.max(30, Math.min(44, (H - 60) / 7))
      const bx = W - side + 14
      this.buildButtons.forEach((b, i) => {
        b.text.setPosition(bx, 10 + i * btnH)
      })
      this.cancelBtn.setPosition(bx, 10 + 6 * btnH + 8)

      this.layoutPanel(W, H, landscape, side)
    } else {
      this.sideW = 0
      // 顶部条
      this.status.setPosition(10, 12)
      this.pauseBtn.setPosition(W - 74, 10)
      this.speedBtn.setPosition(W - 42, 10)

      // 底部建造栏 3×2
      const cols = 3
      const bw = Math.min(64, (W - 32) / cols)
      const bh = 40
      const baseY = H - 128
      this.buildButtons.forEach((b, i) => {
        const cx = i % cols
        const cy = Math.floor(i / cols)
        b.text.setPosition(12 + cx * (bw + 6), baseY + cy * (bh + 6))
      })
      this.cancelBtn.setPosition(12 + 2 * (bw + 6) + bw + 6, baseY + bh + 6)

      this.layoutPanel(W, H, landscape, 0)
    }

    if (this.debugText) this.debugText.setPosition(W - 6, 6)
  }

  layoutPanel(W, H, landscape, side) {
    const pw = landscape ? side - 20 : Math.min(W - 24, 300)
    const px = landscape ? 10 : (W - pw) / 2
    const py = landscape ? 100 : H - 200

    this.panelBg.setPosition(px, py).setSize(pw, 96)
    this.panelText.setPosition(px + 10, py + 8)
    this.upBtn.setPosition(px + 10, py + 60)
    this.sellBtn.setPosition(px + 82, py + 60)
    this.closeBtn.setPosition(px + 154, py + 60)
  }

  // ─────────────────────────── 每帧刷新 ───────────────────────────

  update() {
    this.refresh()
  }

  refresh() {
    const gs = this.gs
    if (!gs || !gs.getState) return

    const s = gs.getState()
    const waveText = s.phase === 'done' ? '波次结束'
      : s.phase === 'prep' ? `下一波 ${s.countdown.toFixed(0)}s`
        : `第 ${s.wave}/${s.totalWaves} 波`

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
