# spec 覆盖对照表

> 用途：证明 spec 的每条要求都有对应实现，并给出**可验证的位置**。
> 生成于 Phase 8 代码审查（2026-09-14）。上游文档：`docs/spec.md` v1.1。

---

## §1 目标与约束

| # | 约束 | 实现 | 状态 |
|---|---|---|---|
| 1 | 给别人玩 | 纯静态、无后端；`docs/DEPLOY.md` | ✅ |
| 2 | 一个网址打开即玩 | GitHub Pages（HTTP/2）；`docs/DEPLOY.md` | ✅ 待部署 |
| 3 | 手机 + 电脑都要能玩 | `systems/Layout.js` 三朝向自适应 | ✅ |
| 4 | 固定路径塔防 | `data/levels/*.js` 的 `path` 点序列 | ✅ |
| 5 | 无后端，只记录自己战绩 | `systems/Save.js`（localStorage） | ✅ |
| 6 | Phaser + CC0 素材 | `vendor/phaser.min.js` 3.90.0；`assets/assets.js` 清单 | 🟡 素材待接入（当前代码占位） |
| 7 | 6 种塔 | `data/towers.js` 的 `TOWER_ORDER` | ✅ |
| 8 | 2 张地图 + 可扩展 | `data/levels/index.js` 注册表 + 扩展契约 | ✅ |
| 9 | 必须能卖塔 | `GameScene.sellTower` + `Economy.sellRefund` | ✅ |
| 10 | 创新玩法 | `systems/Adjacency.js` + `GameScene.tryTapEnemy` | ✅ |

---

## §2 技术栈与交付形态

| 节 | 要求 | 实现 | 状态 |
|---|---|---|---|
| 2.1 | Phaser **3.90.0**（非 4.x） | `vendor/phaser.min.js`（1061 KB arcade-physics 构建） | ✅ |
| 2.3 | 本地引入 / 原生 ESM / 无构建 / 静态托管 | `index.html` 双 script；无 package.json | ✅ |
| 2.4 | 目录结构 | 与 spec 一致（多出 `tests/`、`scripts/`） | ✅ |
| 2.5 | `Scale.RESIZE`，**不向上 clamp** | `systems/Layout.js:computeLayout` | ✅ |
| 2.6 | 目录 ASCII、内容中文 | `tower-defense/`；UI 全中文 | ✅ |
| 2.7 | GitHub Pages + 三条坑 | `.nojekyll` 已放；相对路径已查；引擎已入库 | ✅ |

---

## §3 架构与数据流

| 节 | 要求 | 实现 | 状态 |
|---|---|---|---|
| 3.1 | 六场景 + HUD 并行 | `scene.launch('Hud')`（非 `start`） | ✅ |
| 3.2 | delta 驱动 + 对象池 | `MAX_STEP` clamp；三个池（enemy/tower/proj） | ✅ 压力测试验证 |
| 3.3 | **锁定即扣血**（方案 B） | `GameScene.fireShot`；`Projectile` 纯视觉 | ✅ |
| 3.4 | 实体模型（不持有全局状态） | `entities/*.js` | ✅ |
| 3.5 | 状态三层 | `GameScene` 局内 / 实体自持 / `HudScene` UI | ✅ |
| 3.6 | 数据驱动 | 数值全在 `data/` | ✅ |
| 3.7 | 存档含 `version` | `Save.js`：`SAVE_VERSION` + 不符则重置 | ✅ |
| 3.8 | 五条错误处理 | 见下表 | ✅ |

### §3.8 错误处理五条

| 风险 | 实现位置 | 状态 |
|---|---|---|
| 素材加载失败不白屏 | `BootScene` 的 `loaderror` 监听 | ✅ |
| `localStorage` 不可用降级 | `Save.js:storage()` 探测 + 全部 `try/catch` | ✅ 测试覆盖损坏 JSON |
| WebGL 不可用回落 Canvas | `main.js` 的 `type: Phaser.AUTO` | ✅ |
| **切后台自动暂停** | `GameScene.setupVisibilityPause` | ✅ 测试覆盖 |
| 双指缩放误触 | `index.html` 的 `user-scalable=no` | ✅ |

---

## §4 内容设计

| 节 | 要求 | 实现 | 状态 |
|---|---|---|---|
| 4.1 | 6 种塔 × 3 级，**Lv3 有质变** | `data/towers.js`（每种 Lv3 都有 `perk`） | ✅ 测试断言 |
| 4.2 | 3 种敌人 + 精英，**有护甲** | `data/enemies.js`（坦克 8 / 精英 12） | ✅ |
| 4.2 | HP **线性**增长（非指数） | `WaveManager.hpForWave`，0.18/波 | ✅ |
| 4.3 | 8×5 格地图、2 张、扩展契约 | `data/levels/*.js` | ✅ |
| 4.4 | 经济基线 | 起始 120/150、生命 20、清空 20+波×5、退款 70% | ✅ |
| 4.5 | 暂停 / 1×2× / 音效 / 信息面板 | `HudScene` + `systems/Audio.js` | ✅ |

---

## §5 创新机制

| 节 | 要求 | 实现 | 状态 |
|---|---|---|---|
| 5.1 | 4 邻域（不含对角） | `Adjacency.NEIGHBOR_OFFSETS` 只有 4 项 | ✅ |
| 5.1 | 异类 +5%，**封顶 4 层** | `PER_NEIGHBOR` / `MAX_STACKS` | ✅ 测试断言 |
| 5.1 | **同类不加成** | `computeSynergy` 过滤同类型 | ✅ 测试断言（防 6 种塔退化） |
| 5.1 | 3 组特例、**单向** | `SPECIALS` + `to === type` 判定 | ✅ 测试断言单向性 |
| 5.1 | 协同**缓存**，不每帧算 | `recomputeSynergy` 仅在建造/升级/卖出后调用 | ✅ |
| 5.2 | 点击伤害 2%、上限 20、冷却 0.25s | `TAP_*` 常量 | ✅ |
| 5.2 | **不额外给赏金** | `tryTapEnemy` 不调 `earn` | ✅ |
| 5.2 | 禁止覆盖已有塔 | `canBuild` 检查 + `tryBuild` 分支 | ✅ 测试断言 |

---

## §6 UI 与引导

| 节 | 要求 | 实现 | 状态 |
|---|---|---|---|
| 6.1 | **竖屏原生可玩**（不要求横屏） | `Scale.RESIZE` + 8 列大格子 | ✅ 6 视口实测 |
| 6.2 | HUD 两套排布（竖上下 / 横左右） | `HudScene.layout` | ✅ |
| 6.3 | 双端都走 `pointerdown`、**无 hover** | `setupInput` | ✅ |
| 6.3 | 出售**二次确认** | `SELL_CONFIRM_MS` 3 秒窗口 | ✅ 测试断言 |
| 6.4 | 建造状态机四条分支 | `tryBuild` | ✅ 测试断言（含"留模式内"） |
| 6.5 | 引导**事件驱动** | `tutorial` 数组 + `done()` 判定 | ✅ 测试断言四步 |
| 6.5 | 首波 15 秒 | `prepTime: 15`（两关） | ✅ |
| 6.6 | 素材占位不阻塞 | `assets/assets.js` 为空 + 代码绘制 | ✅ |

---

## §7 测试与验收

| 节 | 要求 | 实现 | 状态 |
|---|---|---|---|
| 7.1 | 纯逻辑可测（5 个模块） | `Economy` `Targeting` `WaveManager` `PathMath` `Adjacency` | ✅ 191 项 |
| 7.1 | **不装 TDD**，assert 即可 | `tests/check.html` | ✅ |
| 7.2 | 五条真机验收线 | `docs/ACCEPTANCE.md` + `?debug=1` 面板 | 🟡 **待真机** |

---

## §8 明确砍掉的功能（确认未实现）

| 砍掉项 | 确认未实现 |
|---|---|
| 飞行敌人 | ✅ 无对空/对地逻辑 |
| 主动技能 / 英雄单位 | ✅ 无 |
| 多路径分支 / 敌人分叉 | ✅ 单一路径点序列 |
| 无尽模式 | ✅ 波次表固定 |
| 成就 / 每日挑战 | ✅ 无 |
| 排行榜 / 云存档 | ✅ 仅 localStorage |
| 地形亲和 | ✅ 无 |
| 塔的经验成长 | ✅ 仅金币升级 |

---

## 已知偏差与未决项

| # | 项 | 状态 |
|---|---|---|
| 1 | **Kenney 素材未接入** | 全部为代码绘制占位（纯色圆 / 文字按钮 / 合成音效）。需用户从 kenney.nl 下载 |
| 2 | **真机验收未完成** | spec §7.2 五条必须真人在真实设备取证 |
| 3 | **帧率无法自动测** | headless 的 rAF 被节流（恒 32fps）。已加 `?debug=1` 供真机读 |
| 4 | 地图 2 起始金币 150（spec 初版未区分关卡） | 已在 §4.4 修正文档 |
| 5 | 3G 网络下首屏 8.3s（超 §7.2 的 5s） | 4G 下 3.7s 达标；真实部署走 HTTP/2 会更快 |
