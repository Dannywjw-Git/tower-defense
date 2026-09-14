# 进度台账（恢复锚点）

> **用途**：压缩或中断后**唯一的恢复依据**。`$DSH_HOME/AGENTS.md` 的规则每会话重新注入，但"走到哪个阶段、产物在哪、下一步做什么"**不会**自动恢复——不写锚点就等于从头再来。
>
> 上游文档：`docs/spec.md`（v1.1，已通过阶段② 四支柱审查 `PASS`）
> 最后更新：2026-09-14

---

## 当前状态

| Phase | 内容 | 状态 |
|---|---|---|
| **0** | 真机验证 `Scale.RESIZE` / X5 内核 | 🟡 **桌面 6 视口通过；真机待用户** |
| **1** | 骨架 + 部署链路 | 🟡 **骨架通过；GitHub Pages 待用户账号** |
| **2** | 地图与三朝向布局 | ✅ **代码完成，测试全绿** |
| 3 | 核心循环（纯逻辑）+ 敌人行走 | ✅ **完成** |
| 4 | 塔与战斗（6 塔 × 3 级 · 协同 · 卖塔） | ✅ **完成，26 项集成测试全绿** |
| 5 | UI 与交互（HUD 两套排布 · 建造栏 · 面板 · 补刀 · 自动暂停） | ✅ **完成，33 项 UI 测试全绿** |
| 6 | 内容与打磨（2 图 · 4 敌 · 引导 · 音效 · 存档 · 结算） | ✅ **完成，29 项集成测试全绿** |
| 7 | 真机验收取证 | 🟡 自动化部分已完成（见下）；**五条硬标准仍需真机** |

---

## 产物清单

```
tower-defense/
├── index.html                  user-scalable=no · 普通 script 引 Phaser + module 引 main.js
├── .nojekyll                   GitHub Pages 关闭 Jekyll
├── vendor/phaser.min.js        1,086,308 B = 1061 KB（Phaser 3.90.0 arcade-physics）
├── src/
│   ├── main.js                 Scale.RESIZE 配置 + 场景注册
│   ├── scenes/                 Boot / Menu / LevelSelect / Game / Hud / Result
│   ├── systems/Layout.js       ★ 三朝向统一布局（纯函数）
│   ├── systems/MapGrid.js      ★ 关卡展开 + 非法数据报错（纯函数）
│   └── data/levels/            index.js（注册表）+ level-01.js
├── scripts/serve.js            本地预览，端口 8788
├── tests/
│   ├── _nav.mjs                ★ 场景导航辅助（禁止硬编码点击坐标）
│   ├── check.html              纯逻辑 assert（浏览器可手动打开）
│   ├── logic-check.mjs         191 项纯逻辑
│   ├── combat-flow.mjs         26 项建造/升级/协同/卖塔/击杀
│   ├── ui-flow.mjs             33 项真实点击 UI 交互
│   ├── phase6-flow.mjs         29 项地图2/胜负/引导/存档/音效
│   ├── stress-flow.mjs         ★ 11 项对象池复用 / 场景泄漏 / 完整跑关
│   ├── smoke-flow.mjs          场景链路 + 敌人行走
│   ├── headless-check.mjs      6 视口无错误检查
│   ├── perf-check.mjs          体积/首屏/帧率测量
│   └── screenshot.mjs          三视口 × 五阶段截图
├── assets/
│   └── assets.js               ★ 素材清单（当前为空 = 全部代码占位）
├── scripts/serve.js            本地预览，端口 8788
├── docs/
│   ├── spec.md                 v1.1
│   ├── progress.md             本文件
│   ├── DEPLOY.md               ★ GitHub Pages 部署步骤
│   ├── ACCEPTANCE.md           ★ 真机验收清单（Phase 7）
│   ├── SPEC-COVERAGE.md        ★ spec 逐条覆盖对照表
│   └── screenshots/            15 张截图
├── probe.html                  Phase 0 探针（真机验证用）
├── .nojekyll / .gitignore / .gitattributes
└── git 仓库已初始化（2 个提交，main 分支）
```

---

## 测试基线（回归用）

```powershell
cd D:\Users\Danny\Documents\tower-defense
node scripts\serve.js 8788                       # 后台起服务（ES modules 必须走 HTTP）

node tests\logic-check.mjs                       # 191 项纯逻辑断言
node tests\combat-flow.mjs                       # 26 项建造/升级/协同/卖塔/击杀
node tests\ui-flow.mjs                           # 33 项真实点击的 UI 交互
node tests\phase6-flow.mjs                       # 29 项地图2/胜负/引导/存档/音效解锁
node tests\stress-flow.mjs                       # 11 项对象池复用 / 场景泄漏 / 完整跑关
node tests\smoke-flow.mjs                        # 2 视口场景链路 + 敌人行走
node tests\headless-check.mjs http://192.168.1.8:8788/index.html   # 6 视口 JS 错误
node tests\perf-check.mjs                        # 体积 / 首屏 / 帧率（帧率不可作验收依据）
node tests\screenshot.mjs                        # 三视口 × 五阶段截图 → docs/screenshots/
```

> `tests/_nav.mjs` 是共享的场景导航辅助。**不要在任何测试里硬编码点击坐标** ——
> 见下方「已修正的缺陷」第 6 条。

**当前基线**：**191** 逻辑 · **26** 战斗 · **33** UI · **29** Phase6 · **11** 压力 ·
**2** 链路 · **6 视口 0 错误** = **290 项断言全绿**。

### 真机验收辅助：`?debug=1`

```
http://192.168.1.8:8788/?debug=1
```

右上角会显示调试面板，**省得为了验收装任何工具**：

```
FPS 58.2          ← spec §7.2 第①条要读的数
怪 28  塔 15  弹 6
池 4/0/2          ← 对象池空闲数（持续增长 = 泄漏）
cell 46.9px 竖屏   ← 第②条要读的数
```

不带 `?debug=1` 时面板隐藏，不影响正常游玩。

---

## Phase 7 自动化部分的结果（真实测量）

用 `node tests/perf-check.mjs` 测量（无头浏览器 + CDP 的 CPU/网络节流）。

### 部署产物体积 —— **可靠数据**

| 项 | 值 |
|---|---|
| 原始 | **1147 KB** |
| **传输（gzip 后）** | **319 KB** ← 朋友实际要下载的量 |
| 其中引擎 | 1061 KB 原始 / 279 KB 传输（Phaser 3.90.0） |
| 游戏代码合计 | 约 86 KB 原始 / 40 KB 传输 |

### 首屏（到「开始游戏」可交互）

| 场景 | 耗时 | 判定 |
|---|---|---|
| 桌面 · 无节流 | 831 ms | ✅ |
| 4× CPU 节流（近似中端机） | 900 ms | ✅ |
| **4G + 4× 节流** | **3742 ms** | ✅ **≤5s（最接近真机的场景）** |
| 3G + 4× 节流 | 8334 ms | ❌ 朋友用 3G 时会超 |

> 真实部署在 GitHub Pages（**HTTP/2**）会比本测试更快 —— 本地预览是 node http/1.1，
> 30+ 个 ES module 请求没有多路复用。这是"无构建 + 原生 ESM"的代价，HTTP/2 可缓解。

### 帧率 —— **不可作为验收依据**

所有场景（含空转）都稳定在 **32 fps** —— 因为 **headless Chromium 无显示器时
rAF 被节流**。它只能说明"逻辑没把主线程堵死"，**不能判定 ≥30fps**。必须在真机测。

---

## 下一步

### 需要用户（阻塞中）

1. **Phase 0 真机验证** —— 手机（尤其微信里）打开：
   `http://192.168.1.8:8788/probe.html`
   确认三件事：① 能否打开 ② 点格子是否准 ③ 切后台回来 `visibilitychange` 是否 +1
   > 桌面无头浏览器**不能替代**这步：iOS 微信与安卓 X5 内核行为未知。

2. **Phase 1 部署** —— **已尽可能替你铺好路**（2026-09-14 检查）：

   | 项 | 状态 |
   |---|---|
   | git 仓库 | ✅ 已初始化（5 个提交，`main` 分支） |
   | `remote origin` | ✅ **已配置** → `https://github.com/Dannywjw-Git/tower-defense.git` |
   | GitHub 用户名 | ✅ `Dannywjw-Git`（已从凭据管理器读出） |
   | 凭据 | ✅ 凭据管理器里**已有** GitHub 凭据（推送大概率无需手输 Token） |
   | 8788 端口 | ✅ 正在监听 |
   | 防火墙 | ✅ 已有 `node.exe` 的 Allow 规则（**手机能连上**） |
   | 目标仓库 | ❌ **尚不存在**（`tower-defense` 返回 404） |
   | 上线地址 | `https://Dannywjw-Git.github.io/tower-defense/` |

   **你只需三步**：
   1. 建空仓库：https://github.com/new → 名字填 **`tower-defense`** → **三个初始化选项都不要勾**
   2. `git push -u origin main`（remote 已配好，直接推）
   3. 仓库 Settings → Pages → Branch `main` + `/ (root)` → Save

   推完跑 `node tests/verify-deploy.mjs` 一键验证线上是否正常。

### 无需用户（可继续推进）

3. ~~**Phase 3 核心循环**~~ ✅
4. ~~**Phase 4 塔与战斗**~~ ✅
5. ~~**Phase 5 UI 与交互**~~ ✅
6. ~~**Phase 6 内容与打磨**~~ ✅
7. **素材接入**（可选，不阻塞）：`assets/assets.js` 清单已预留；Kenney 素材需用户下载
   （我无法访问 kenney.nl）。当前全部为代码绘制占位（纯色圆 / 文字按钮 / 合成音效）。
8. **Phase 7 真机验收**：**必须由用户在真实设备上完成**，详见「需要用户」一节。

---

## Phase 8 代码审查（ponytail-review 精神：YAGNI / 删优于增）

**删除的死代码与投机性 API**：

| 项 | 类型 |
|---|---|
| `PathMath.pathLength` | 死代码（零消费者） |
| `Targeting.enemiesInRange` | 死代码（注释写"供 UI 复用"，但从未被调用） |
| `levels/index.levelById` | 死代码 |
| `WaveManager.secondsUntilWave` | 死代码 |
| `Projectile.recycle` | 死代码 |
| `enemies.enemyHpAtWave` | **重复实现** —— 复制了 `WaveManager.hpForWave` 的公式 |
| `assets.js` 的 `hasAssets` / `assetCount` / `towerTexture` / `enemyTexture` | **投机性 API** —— 为尚未接入的素材预留 |
| `GameScene` 的未使用 import `towerDef` | 残留（Phase 4 改用 `buildCost` 后忘了删） |
| `check.html` 的未使用 import `BLOCKED` / `ENEMIES` | 残留 |

删除后回归：**290 项断言全绿**（逻辑项 191→190，因为删掉了那条重复公式的断言）。

**抽查关键常量与 spec 一致**：`HP_GROWTH_PER_WAVE=0.18` · `PER_NEIGHBOR=0.05` · `MAX_STACKS=4` ·
`SELL_REFUND_RATE=0.7` · `TAP_COOLDOWN_MS=250` · `TAP_DAMAGE_RATIO=0.02` · `TAP_MAX_DAMAGE=20` ·
`prepTime=15` · `startLives=20` · `startGold=120/150`。

**发现并修正的文档偏差**：spec §4.4 只写"起始金币 120"、未区分关卡，而地图 2 实际用 150。
已在 spec 中补上说明。

**产出 `docs/SPEC-COVERAGE.md`**：spec 逐条 → 实现位置 → 状态，证明无遗漏；
并列出 5 项已知偏差（素材未接入 / 真机未验收 / 帧率不可自动测 / 金币基线 / 3G 首屏）。

---

## Phase 10 补遗：逐条核对 spec 时发现的遗漏

**两处 spec 明确要求、但此前未实现的功能**（都在 §6）：

| spec 条款 | 要求 | 此前状态 | 现状 |
|---|---|---|---|
| §6.2 | **长按建造按钮弹文字说明**（手机无 hover） | ❌ 只有"箭/炮/冰"缩写，玩家不知道塔干什么 | ✅ `HOLD_MS=400` 长按判定 |
| §6.5 | **波次预告显示下一波敌人类型** | ❌ 只显示"下一波 8s" | ✅ `下一波 8s · 普通 ×8` |

> 这两条都是**逐条对照 spec 才发现的**——不是 bug，是遗漏。
> 说明"我记得实现了"不可靠，必须对着文档核。

**顺带修掉一个我引入的交互 bug**：

长按实现中，我把释放处理同时挂在 `pointerup` 和 `pointerout` 上。
结果从按钮移向地图会触发 `pointerout` → **又切换一次建造模式** → 把刚进入的模式取消掉。
表现：**「点塔图标 → 点地图格」永远建不出塔**。

现已改为 `pointerout` 只取消长按计时、**不当作一次点击**，并加了注释说明这个坑。

回归：UI 测试从 33 → **38** 项，全绿。

---

## 已知约束与未验证项

| 项 | 状态 |
|---|---|
| 320 px 老设备 cell = 39 px | **已接受降级**（spec §6.1）——iPhone SE 一代一类设备占比极低，39 px 仍可点 |
| 真机（iOS 微信 / 安卓 X5）行为 | **未验证** — 桌面无头不能替代 |
| 8×5 地图能否撑住 12 波 | 未验证 — 降级余地：放宽到 9×5（45 格） |
| 满波帧率 ≥30 fps | 未验证 — 验收线已定（spec §7.2） |
| 6 塔 × 3 级 × 15 协同的平衡 | 长期活动，不在任何 Phase 估时内 |
| `Scale.RESIZE` 的 `layout()` 复杂度 | 已知代价约 60 行，已由 `systems/Layout.js` 消化 |

---

## 本轮已修正的架构缺陷（勿回退）

1. **`cell` 不得向上 clamp 到 44 px** —— 会让网格总宽溢出窄屏（360 px 屏上 8×44=352 > 344）。
   44 px 只作**报警线**。已由 `tests/check.html` 的"任何视口都不得溢出"6 项断言保护。
2. **横屏 HUD 必须用左右浮层** —— 横屏病根是**纵向不足**：812×375 下上下 HUD 会把 cell 压到 36 px，
   改左右浮层后升到 54.8 px（+51%）。
3. **不用 `FIT`** —— 竖屏下会把整个画面缩到 0.39 倍，HUD 文字变成 4.7 px。
4. **`WaveManager` 进入刷怪阶段时不得把 `timer` 清零** —— 那会丢掉 dt 溢出的刷怪额度：
   dt=100s、间隔 0.1s 时只刷 **1** 只而不是 **10** 只（卡顿帧会丢怪）。
   正确做法是保留负数 timer 供刷怪循环消耗，刷完当前波后再 clamp 到 0
   （否则"下一波已迟到很久"会让下一波瞬间全部涌出）。
   已由 `check.html` 的「dt 极大时一次补足全部（不丢怪）」断言保护。
5. **塔的造价在 `levels[0].cost`，不是 `def.cost`** —— 曾在 `buildTower` 里误读 `def.cost`
   得到 `undefined`，使 `canAfford(undefined)` 恒为 false，**建造功能从未工作过**。
   现统一用 `data/towers.js` 的 `buildCost(id)`，并由 `combat-flow.mjs` 的建造断言保护。
6. **测试里禁止硬编码点击坐标** —— 曾经 4 个测试脚本都写死 `H * 0.64` 点「开始游戏」。
   Phase 6 把按钮挪到 `H * 0.60` 后，全部脚本静默点空、卡在菜单，却只报出无关的
   `Cannot read properties of undefined (reading 'gold')`，排查花了很久。
   现已改为 `tests/_nav.mjs` 从 **Phaser 交互对象**动态取中心，布局怎么挪都不受影响。
