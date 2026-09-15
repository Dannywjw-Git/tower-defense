// GameScene —— 核心玩法
//
// 已完成：Phase 2 地图与布局 · Phase 3 核心循环 · Phase 4 塔与战斗
// 待完成：Phase 5 UI 交互（建造栏、信息面板、补刀）
//
// 布局 / 格型 / 路径 / 波次 / 经济 / 协同 / 伤害分配全部来自纯逻辑模块
// （systems/*），本文件只负责：把逻辑结果画出来、把渲染对象管起来。

import LEVELS from '../data/levels/index.js'
import { computeLayout, cellToPixel, pixelToCell, COLS, ROWS } from '../systems/Layout.js'
import { buildGrid, PATH, BLOCKED, BUILDABLE } from '../systems/MapGrid.js'
import { buildPath } from '../systems/PathMath.js'
import { WaveManager } from '../systems/WaveManager.js'
import { Economy, waveClearBonus } from '../systems/Economy.js'
import { computeSynergy, neighborCells } from '../systems/Adjacency.js'
import { allocateDamage, applyDamage } from '../systems/Combat.js'
import { buildCost, upgradeCost } from '../data/towers.js'
import { enemyDef } from '../data/enemies.js'
import { SFX } from '../systems/Audio.js'
import { markCleared, markFailed, saveProgress } from '../systems/Save.js'
import { Enemy } from '../entities/Enemy.js'
import { Tower } from '../entities/Tower.js'
import { Projectile } from '../entities/Projectile.js'

const COLOR = {
  [PATH]: 0x33475c,
  [BLOCKED]: 0x26262b,
  [BUILDABLE]: 0x17222d,
  grid: 0x35506b,
  pathLine: 0x5a9bd5,
}

/** 单帧最大推进时间；卡顿帧或切后台恢复时防止敌人瞬移穿越路径 */
const MAX_STEP = 0.1

/** 点击参与（spec §5.2）：伤害 = maxHp 的 2%，单次上限 20；冷却 0.25s；不额外给赏金 */
const TAP_COOLDOWN_MS = 250
const TAP_DAMAGE_RATIO = 0.02
const TAP_MAX_DAMAGE = 20
const TAP_HIT_RADIUS = 0.7      // 格：点击命中的宽容半径

/**
 * 赏金随波次增长的系数。
 *
 * 为什么需要：敌人 HP 每波 +18%（spec §4.2），但赏金原本是**死数**（普通怪永远 8 金）。
 * 两者一脱钩就出现「打得越多、越买不起塔」——实测玩家在第二关中期卡死，
 * 报的就是"钱不够"。
 *
 * 0.15 略低于 HP 增长率 0.18：让难度仍随波次上升，只是不至于断崖。
 */
const BOUNTY_GROWTH_PER_WAVE = 0.12

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('Game')
  }

  init(data) {
    this.levelId = (data && data.levelId) || (LEVELS[0] && LEVELS[0].id) || 'level-01'
    this.level = LEVELS.find(l => l.id === this.levelId) || LEVELS[0] || null
  }

  create() {
    this.scene.launch('Hud', { levelId: this.levelId })

    if (!this.level) {
      this.add.text(0, 0, '无地图数据', { fontSize: '18px', color: '#ff5c5c' })
        .setOrigin(0.5).setPosition(this.scale.width / 2, this.scale.height / 2)
      return
    }

    // ── 纯逻辑 ──
    this.grid = buildGrid(this.level)
    this.path = buildPath(this.level.path)
    this.economy = new Economy(this.level.startGold ?? 120)
    this.lives = this.level.startLives ?? 20
    this.wm = new WaveManager(this.level.waves, {
      prepTime: this.level.prepTime ?? 15,
      waveInterval: this.level.waveInterval ?? 6,
    })

    // ── 统计（用于结算与存档，spec §3.7）──
    this.stats = { kills: 0, leaked: 0, built: 0, sold: 0, taps: 0, startedAt: Date.now() }
    this.finished = false

    // URL 加 ?debug=1 才显示调试信息（底部提示条 + HUD 右上角面板）
    this.debugOn = (() => {
      try { return new URLSearchParams(location.search).has('debug') } catch { return false }
    })()

    // ── 渲染层 ──
    this.g = this.add.graphics().setDepth(0)
    this.hint = this.add.text(0, 0, '', { fontSize: '12px', color: '#4a5f73', align: 'center' })
      .setOrigin(0.5).setDepth(9)

    // ── 对象池（一律复用，不 new/destroy —— spec §3.2）──
    this.enemies = []; this.enemyPool = []
    this.towers = []; this.towerPool = []
    this.projectiles = []; this.projPool = []

    // ── UI 状态（HudScene 读写这些）──
    this.buildMode = null        // 待建造的塔类型；null = 非建造模式
    this.selectedTower = null
    this.paused = false
    this.speed = 1
    this.lastTapAt = 0
    this.noticeTimer = 0

    this.notice = this.add.text(0, 0, '', {
      fontSize: '15px', color: '#ffd166', backgroundColor: '#000000cc',
      padding: { x: 10, y: 7 },
    }).setOrigin(0.5).setDepth(20).setVisible(false)

    // ── 新手引导：仅首关，**事件驱动**（完成动作即消失；不用定时器，
    //    否则快玩家会看到"我都建完三座塔了还在教我怎么建塔"，spec §6.5）──
    this.tutorial = this.level.id === 'level-01'
      ? [
        { text: '① 点下方图标选塔', done: () => this.buildMode !== null },
        { text: '② 点绿色格子放塔', done: () => this.stats.built > 0 },
        { text: '③ 点敌人可以补刀', done: () => this.stats.taps > 0 },
      ]
      : []

    this.tutorialText = this.add.text(0, 0, '', {
      fontSize: '15px', color: '#ffd166', backgroundColor: '#000000aa',
      padding: { x: 10, y: 7 },
    }).setOrigin(0.5).setDepth(18).setVisible(false)

    this.setupInput()
    this.setupVisibilityPause()
    this.layout()
    this.scale.on('resize', () => this.layout())
  }

  // ═══════════════════════ 布局 ═══════════════════════

  layout() {
    this.L = computeLayout(this.scale.width, this.scale.height, window.PIXEL_SCALE || 1)
    this.draw()
    for (const e of this.enemies) e.syncPixel(this.path, this.L)
    for (const t of this.towers) t.syncPixel(this.L)
    this.updateHint()
  }

  draw() {
    const L = this.L
    if (!L || !this.grid) return
    this.g.clear()

    for (let cy = 0; cy < ROWS; cy++) {
      for (let cx = 0; cx < COLS; cx++) {
        const px = L.originX + cx * L.cell
        const py = L.originY + cy * L.cell
        this.g.fillStyle(COLOR[this.grid[cy][cx]] ?? COLOR[BUILDABLE], 1)
          .fillRect(px, py, L.cell, L.cell)
        this.g.lineStyle(1, COLOR.grid, 0.7).strokeRect(px, py, L.cell, L.cell)
      }
    }

    // 建造模式：可建格绿色高亮、不可建格变暗（spec §6.4）
    if (this.buildMode) {
      for (let cy = 0; cy < ROWS; cy++) {
        for (let cx = 0; cx < COLS; cx++) {
          const px = L.originX + cx * L.cell
          const py = L.originY + cy * L.cell
          if (this.canBuild(cx, cy)) {
            this.g.fillStyle(0x4ade80, 0.22).fillRect(px + 1, py + 1, L.cell - 2, L.cell - 2)
          } else {
            this.g.fillStyle(0x000000, 0.35).fillRect(px + 1, py + 1, L.cell - 2, L.cell - 2)
          }
        }
      }
    }

    const pts = this.level.path
    if (pts && pts.length > 1) {
      this.g.lineStyle(Math.max(2, L.cell * 0.1), COLOR.pathLine, 0.85)
      this.g.beginPath()
      const first = cellToPixel(L, pts[0][0], pts[0][1])
      this.g.moveTo(first.x, first.y)
      for (let i = 1; i < pts.length; i++) {
        const p = cellToPixel(L, pts[i][0], pts[i][1])
        this.g.lineTo(p.x, p.y)
      }
      this.g.strokePath()

      const last = cellToPixel(L, pts[pts.length - 1][0], pts[pts.length - 1][1])
      this.g.fillStyle(0x4ade80, 1).fillCircle(first.x, first.y, Math.max(3, L.cell * 0.12))
      this.g.fillStyle(0xff5c5c, 1).fillCircle(last.x, last.y, Math.max(3, L.cell * 0.12))
    }
  }

  updateHint() {
    if (!this.hint) return

    // ⚠️ 这条提示**只在 ?debug=1 时显示**。
    //    它原本一直挂着，而显示的金币/生命/波次与顶部 HUD **完全重复**，
    //    只在末尾多了个 cell 尺寸 —— 结果屏幕底部多了一条冗余信息条。
    //    这是**看图**才发现的：所有测试全绿，因为没人断言"屏幕上不该有这条"。
    if (!this.debugOn) {
      this.hint.setVisible(false)
      return
    }
    if (!this.L) return

    const s = this.getState()
    const next = this.wm.isDone ? '波次结束'
      : this.wm.phase === 'prep' ? `下一波 ${this.wm.countdown.toFixed(0)}s`
        : `第 ${s.wave}/${s.totalWaves} 波`
    this.hint.setVisible(true).setText(
      `cell ${this.L.cell.toFixed(1)}px · ${this.L.landscape ? '横屏' : '竖屏'} · ${next} · ` +
      `塔${s.towers} 怪${s.enemies} · 池 ${s.pools.enemy}/${s.pools.tower}/${s.pools.proj}`)
    this.hint.setPosition(this.scale.width / 2, this.scale.height - 10)
  }

  /** 供 HUD 与无头测试读取 */
  getState() {
    return {
      gold: this.economy.gold,
      lives: this.lives,
      wave: this.wm.wave,
      totalWaves: this.wm.total,
      phase: this.wm.phase,
      countdown: this.wm.countdown,
      // 波次预告（spec §6.5「常驻可查」要求显示下一波敌人类型）
      currentWave: this.wm.current,
      nextWave: this.wm.phase === 'prep' ? (this.wm.waves[this.wm.wave] || null) : null,
      enemies: this.enemies.length,
      towers: this.towers.length,
      landscape: this.L ? this.L.landscape : null,
      cell: this.L ? this.L.cell : 0,
      buildMode: this.buildMode,
      hasSelection: !!this.selectedTower,
      paused: this.paused,
      speed: this.speed,
      // 真机验收用（spec §7.2 第①条要在真机上读帧率，游戏内显示最省事）
      fps: Math.round(this.game.loop.actualFps * 10) / 10,
      projectiles: this.projectiles.length,
      pools: {
        enemy: this.enemyPool.length,
        tower: this.towerPool.length,
        proj: this.projPool.length,
      },
    }
  }

  // ═══════════════════════ 主循环 ═══════════════════════

  update(_time, delta) {
    if (!this.level || !this.path) return
    if (this.paused) return          // 暂停：波次计时、冷却、移动全部冻结

    // speed = 1×/2× 加速。先 clamp 单帧再乘，避免 2× 时一步走得过远
    const dt = Math.min(delta / 1000, MAX_STEP) * this.speed

    if (this.noticeTimer > 0) {
      this.noticeTimer -= delta
      if (this.noticeTimer <= 0 && this.notice) this.notice.setVisible(false)
    }

    const { spawns, startedWave } = this.wm.update(dt)
    if (startedWave > 1) {
      // 上一波已刷完，给清空奖励（spec §4.4：20 + 波数×5，递增防后期经济崩）
      this.economy.earn(waveClearBonus(startedWave - 1))
    }
    if (startedWave) {
      SFX.wave()
      // 每波开始存一次进度，供「继续」使用（spec §3.7）
      saveProgress({
        levelId: this.levelId,
        wave: startedWave,
        gold: this.economy.gold,
        lives: this.lives,
        towers: this.towers.map(t => ({ cx: t.cx, cy: t.cy, type: t.type, level: t.level })),
      })
    }
    for (const s of spawns) this.spawnEnemy(s)

    this.stepEnemies(dt)
    this.stepCombat(dt)
    this.stepProjectiles(dt)
    this.updateHint()
    this.updateTutorial()

    if (this.lives <= 0) { this.onDefeat(); return }
    // 胜利：全部波次刷完 + 场上清空（spec 未显式定义，取最直观判据）
    if (this.wm.isDone && this.enemies.length === 0) this.onVictory()
  }

  // ═══════════════════════ 敌人 ═══════════════════════

  spawnEnemy(desc) {
    const def = enemyDef(desc.type)
    const e = this.enemyPool.pop() || new Enemy(this)
    e.spawn({
      type: desc.type,
      hp: desc.hp,
      speed: def.speed,
      armor: def.armor,
      bounty: def.bounty,
      leakDamage: def.leakDamage,
      // 赏金随波次增长 —— 敌人 HP 每波 +18%，而赏金原本**固定不变**，
      // 两者脱钩会导致「越往后越买不起塔」（实测：玩家反馈"钱不够"）。
      // 系数默认 0.15；`TEST_BOUNTY_GROWTH` 仅由自动平衡脚本注入，正常游玩为 undefined。
      bountyWave: this.wm ? this.wm.wave : 1,
      bountyGrowth: this.TEST_BOUNTY_GROWTH ?? BOUNTY_GROWTH_PER_WAVE,
    })
    e.syncPixel(this.path, this.L)
    this.enemies.push(e)
  }

  stepEnemies(dt) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i]

      // 中毒致死（定身期间也受毒伤，所以与移动分开结算）
      if (e.tickEffects(dt)) {
        this.onKill(e)
        continue
      }

      const leaked = e.advance(dt, this.path)
      e.syncPixel(this.path, this.L)

      if (leaked) {
        this.lives -= (e.leakDamage || 1)   // 精英漏掉扣 3 点（spec §4.2）
        this.stats.leaked += 1
        SFX.leak()
        this.removeEnemy(e)
      }
    }
  }

  removeEnemy(enemy) {
    const i = this.enemies.indexOf(enemy)
    if (i >= 0) this.enemies.splice(i, 1)
    enemy.despawn()
    this.enemyPool.push(enemy)
  }

  onKill(enemy) {
    this.economy.earn(enemy.bounty || 0)
    this.stats.kills += 1
    SFX.kill()
    this.removeEnemy(enemy)
  }

  // ═══════════════════════ 塔 ═══════════════════════

  towerAt(cx, cy) {
    return this.towers.find(t => t.cx === cx && t.cy === cy) || null
  }

  canBuild(cx, cy) {
    if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) return false
    if (this.grid[cy][cx] !== BUILDABLE) return false
    if (this.towerAt(cx, cy)) return false     // 硬规则：禁止覆盖已有塔（spec §5.2）
    return true
  }

  buildTower(cx, cy, typeId) {
    if (!this.canBuild(cx, cy)) return { ok: false, reason: 'invalid-cell' }

    let cost
    try { cost = buildCost(typeId) } catch { return { ok: false, reason: 'unknown-type' } }

    if (!this.economy.canAfford(cost)) return { ok: false, reason: 'no-gold' }
    this.economy.spend(cost)

    const t = this.towerPool.pop() || new Tower(this)
    t.place(cx, cy, typeId)
    t.syncPixel(this.L)
    this.towers.push(t)

    this.recomputeSynergy()
    this.stats.built += 1
    SFX.build()
    return { ok: true, tower: t, cost }
  }

  upgradeTower(cx, cy) {
    const t = this.towerAt(cx, cy)
    if (!t) return { ok: false, reason: 'no-tower' }

    const cost = upgradeCost(t.type, t.level)
    if (cost === null) return { ok: false, reason: 'max-level' }
    if (!this.economy.canAfford(cost)) return { ok: false, reason: 'no-gold' }
    this.economy.spend(cost)

    t.invested += cost
    t.level += 1
    t.applyLevel()
    t.syncPixel(this.L)

    this.recomputeSynergy()
    SFX.upgrade()
    return { ok: true, tower: t, cost }
  }

  sellTower(cx, cy) {
    const t = this.towerAt(cx, cy)
    if (!t) return { ok: false, reason: 'no-tower' }

    const refund = this.economy.sellRefund(t.invested)

    const i = this.towers.indexOf(t)
    if (i >= 0) this.towers.splice(i, 1)
    if (this.selectedTower === t) this.selectedTower = null
    t.setVisible(false)
    this.towerPool.push(t)

    this.recomputeSynergy()
    this.stats.sold += 1
    SFX.sell()
    return { ok: true, refund }
  }

  /**
   * 重算全部塔的协同。
   * 只在建造 / 升级 / 卖出后调用 —— **不在每帧**（每帧遍历邻域是纯浪费，spec §5.1）。
   */
  recomputeSynergy() {
    for (const t of this.towers) {
      const types = []
      for (const [nx, ny] of neighborCells(t.cx, t.cy)) {
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue
        const n = this.towerAt(nx, ny)
        if (n) types.push(n.type)
      }
      t.setSynergy(computeSynergy(t.type, types))
    }
  }

  // ═══════════════════════ 战斗 ═══════════════════════

  stepCombat(dt) {
    for (const t of this.towers) {
      const shot = t.update(dt, this.enemies)
      if (shot) this.fireShot(shot)
    }
  }

  fireShot(shot) {
    // 伤害在**锁定瞬间**结算（spec §3.3）；弹道只是视觉
    const table = allocateDamage(shot, this.enemies)

    for (const { enemy, damage } of table) {
      if (applyDamage(enemy, damage, shot.ignoreArmor)) this.onKill(enemy)
    }

    // 状态效果只作用于主目标
    const target = shot.target
    if (target && target.alive) {
      if (shot.slow > 0) target.applySlow(shot.slow, shot.slowTime)
      if (shot.freeze > 0) target.applyFreeze(shot.freeze)
      if (shot.poison > 0) target.applyPoison(shot.poison, shot.poisonTime)
    }

    SFX.shoot()
    this.spawnProjectile(shot)
  }

  spawnProjectile(shot) {
    if (shot.chain > 1) return          // 电塔是连锁闪电，无弹道（spec §4.1）
    if (!shot.target) return

    const p = this.projPool.pop() || new Projectile(this)
    p.fire(
      { x: shot.tower.x, y: shot.tower.y },
      { x: shot.target.x, y: shot.target.y },
      shot.tower.def.color,
      Math.max(2, this.L.cell * 0.06),
    )
    this.projectiles.push(p)
  }

  stepProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]
      if (p.advance(dt)) {
        this.projectiles.splice(i, 1)
        this.projPool.push(p)
      }
    }
  }

  // ═══════════════════════ 输入与交互 ═══════════════════════

  setupInput() {
    // 场景级 pointerdown：只处理落在**网格内**的点击。
    // HUD 占上下（竖屏）或左右（横屏），与网格不重叠，所以这一个判断即可
    // 过滤掉全部 HUD 按钮点击，无需跨场景事件拦截。
    this.input.on('pointerdown', (pointer) => {
      if (!this.L) return
      const cell = pixelToCell(this.L, pointer.x, pointer.y)
      if (!cell.inside) return

      if (this.buildMode) this.tryBuild(cell.cx, cell.cy)
      else this.handleCellTap(cell, pointer)
    })
  }

  setBuildMode(typeId) {
    this.buildMode = typeId || null
    this.draw()
  }

  /**
   * 切后台 / 来电后返回 → 立即自动暂停（spec §3.8 硬要求）。
   *
   * 为什么必须：手机来电、切去回微信消息再回来，delta 会暴涨到数秒，
   * 即使有 MAX_STEP clamp，回来时那一波怪也已经推进了一段 —— 玩家会觉得
   * "被暗算"。自动暂停后由玩家自己决定何时继续。
   *
   * 不自动恢复：回来时保持暂停，玩家按 ⏸ 才继续。
   */
  setupVisibilityPause() {
    this._onVisibility = () => {
      if (document.hidden) this.paused = true
    }
    document.addEventListener('visibilitychange', this._onVisibility)
    // 场景重启时移除，避免监听器累积
    this.events.once('shutdown', () => {
      document.removeEventListener('visibilitychange', this._onVisibility)
    })
  }

  selectTower(tower) {
    this.selectedTower = tower || null
  }

  /** 建造模式的点击处理（spec §6.4 状态机） */
  tryBuild(cx, cy) {
    const res = this.buildTower(cx, cy, this.buildMode)

    if (res.ok) {
      this.setBuildMode(null)              // 建成即退出模式
      return res
    }

    // 已有塔 → 禁止覆盖：退出模式并打开该塔面板（硬规则）
    const existing = this.towerAt(cx, cy)
    if (res.reason === 'invalid-cell' && existing) {
      this.setBuildMode(null)
      this.selectTower(existing)
      return res
    }

    if (res.reason === 'invalid-cell') {
      this.flashNotice('这里不能建塔')      // 留在模式内，不打断
      return res
    }

    if (res.reason === 'no-gold') {
      this.flashNotice('金币不足')
      this.setBuildMode(null)
    }
    return res
  }

  handleCellTap(cell, pointer) {
    const tower = this.towerAt(cell.cx, cell.cy)
    if (tower) {
      this.selectTower(tower)
      return
    }
    // 点空地：先尝试补刀（点中敌人优先），否则取消选中
    if (!this.tryTapEnemy(pointer)) this.selectTower(null)
  }

  /**
   * 点击参与（spec §5.2）。
   * 价值定位是**补刀防漏怪**，不是赚钱手段 —— 所以不额外给赏金，
   * 只有击杀照常发放怪物本身的赏金。
   */
  tryTapEnemy(pointer) {
    const now = this.time.now
    if (now - this.lastTapAt < TAP_COOLDOWN_MS) return false

    const L = this.L
    const gx = (pointer.x - L.originX) / L.cell
    const gy = (pointer.y - L.originY) / L.cell

    let best = null
    let bestD = Infinity
    for (const e of this.enemies) {
      if (!e.alive) continue
      const d = Math.hypot(e.gx - gx, e.gy - gy)
      if (d < bestD) { bestD = d; best = e }
    }

    if (!best || bestD > TAP_HIT_RADIUS) return false

    this.lastTapAt = now
    this.stats.taps += 1
    SFX.tap()

    const dmg = Math.min(TAP_MAX_DAMAGE, Math.max(1, Math.round(best.maxHp * TAP_DAMAGE_RATIO)))
    // 补刀无视护甲：它是"精准射击"，被护甲吃掉就失去意义
    const killed = applyDamage(best, dmg, true)
    this.spawnTapEffect(best)
    if (killed) this.onKill(best)
    return true
  }

  spawnTapEffect(enemy) {
    const ring = this.add
      .circle(enemy.x, enemy.y, Math.max(4, this.L.cell * 0.2), 0xffffff, 0.5)
      .setDepth(15)
    this.tweens.add({
      targets: ring, scale: 2.2, alpha: 0, duration: 220,
      onComplete: () => ring.destroy(),
    })
  }

  flashNotice(msg) {
    if (!this.notice) return
    this.notice.setText(msg).setVisible(true)
    this.notice.setPosition(this.scale.width / 2, this.scale.height * 0.22)
    this.noticeTimer = 1400
  }

  // ═══════════════════════ 引导与结算 ═══════════════════════

  /** 事件驱动引导：已完成的步骤自动消失（快玩家不会被卡住，spec §6.5） */
  updateTutorial() {
    if (!this.tutorialText || !this.tutorial) return

    while (this.tutorial.length && this.tutorial[0].done()) this.tutorial.shift()

    const cur = this.tutorial[0]
    if (cur) {
      // 贴着地图**上沿**显示 —— 曾经写死 `height * 0.12`，
      // 结果提示飘在地图上方几百像素的空白里，与它要教的地图完全脱节（看图才发现）
      const y = this.L ? Math.max(56, this.L.originY - 28) : this.scale.height * 0.1
      this.tutorialText.setText(cur.text).setVisible(true)
        .setPosition(this.scale.width / 2, y)
    } else {
      this.tutorialText.setVisible(false)
    }
  }

  /** 结算数据 —— 同时用于存档与 ResultScene 展示 */
  resultStats() {
    const elapsed = Math.max(0, Math.round((Date.now() - this.stats.startedAt) / 1000))
    const score = Math.round(this.wm.wave * 100 + this.lives * 50 + this.stats.kills * 5)
    return {
      levelId: this.levelId,
      wave: this.wm.wave,
      totalWaves: this.wm.total,
      lives: this.lives,
      gold: this.economy.gold,
      kills: this.stats.kills,
      leaked: this.stats.leaked,
      built: this.stats.built,
      elapsed,
      score,
    }
  }

  onVictory() {
    if (this.finished) return
    this.finished = true

    const stats = this.resultStats()
    markCleared(this.levelId, stats)
    SFX.win()

    this.scene.stop('Hud')
    this.scene.start('Result', { win: true, levelId: this.levelId, stats })
  }

  onDefeat() {
    if (this.finished) return
    this.finished = true

    const stats = this.resultStats()
    markFailed(stats)
    SFX.lose()

    this.scene.stop('Hud')
    this.scene.start('Result', { win: false, levelId: this.levelId, stats })
  }
}
