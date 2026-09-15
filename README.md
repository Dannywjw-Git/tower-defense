# 塔防游戏（tower-defense）

一个浏览器塔防游戏。目标很明确：**朋友点开链接就能玩** —— 手机竖屏、在微信里直接打开、不用装任何东西。

| | |
|---|---|
| 引擎 | Phaser 3.90.0（**本地引入**，零构建工具，原生 ES modules） |
| 部署 | 静态托管（GitHub Pages），**无后端** |
| 体积 | 原始 1147 KB · **传输 319 KB**（gzip 后） |
| 状态 | **代码完成**（Phase 2–6）· 自动化测试 294 项全绿 · **待真机验收与部署** |

---

## 快速开始

### 本地跑起来

```powershell
cd D:\Users\Danny\Documents\tower-defense
node scripts\serve.js 8788
```

| 入口 | 地址 |
|---|---|
| 电脑 | `http://localhost:8788/` |
| 手机（连同一 WiFi） | `http://192.168.1.8:8788/` |
| **带调试面板**（FPS / 实体数 / 对象池 / 格子尺寸） | 任意地址后加 **`?debug=1`** |

> ES modules 无法从 `file://` 加载，**必须走 HTTP 服务器**。`scripts/serve.js` 零依赖，会打印手机可用的局域网地址。

### 怎么玩

`开始游戏` → 选地图 → **点底部塔图标** → **点绿色格子建塔** → 点已建的塔可升级/出售 → 点敌人可以补刀。

**长按**塔图标会弹出该塔的说明。

---

## 测试

```powershell
# 需要本地预览服务在跑（除 balance-check 外）
node tests\logic-check.mjs       # 190 项纯逻辑断言（浏览器内跑 assert）
node tests\combat-flow.mjs       #  26 项建造/升级/协同/卖塔/实战击杀
node tests\ui-flow.mjs           #  38 项真实鼠标点击的 UI 交互
node tests\phase6-flow.mjs       #  29 项地图2/胜负结算/引导/存档/音效
node tests\stress-flow.mjs       #  11 项对象池复用与场景泄漏
node tests\mechanics-flow.mjs    #  17 项机制组合（协同降级/溅射/连锁/减速/毒/集火）
node tests\smoke-flow.mjs        #     场景链路 + 敌人行走
node tests\headless-check.mjs http://192.168.1.8:8788/index.html   # 6 视口 JS 错误
node tests\screenshot.mjs        #     三视口 × 五阶段截图 → docs/screenshots/

# 纯 node，不需要浏览器与服务
node tests\balance-check.mjs     # 数值自洽性分析
```

| 工具 | 用途 |
|---|---|
| `tests/perf-check.mjs` | 产物体积 / 首屏 / 帧率（**帧率不可作验收依据**，headless 的 rAF 被节流） |
| `tests/verify-deploy.mjs` | 部署后线上验证（页面可达 / 无 404 / 能进游戏） |
| `tests/_nav.mjs` | 场景导航辅助（**测试禁止硬编码点击坐标**，见下） |

---

## 部署

三步，见 **`docs/DEPLOY.md`**：建空仓库 → `git push` → 开 Pages。

部署后验证：

```powershell
node tests\verify-deploy.mjs
```

预期上线地址：`https://Dannywjw-Git.github.io/tower-defense/`

---

## 文档导航

| 文档 | 用途 | 什么时候看 |
|---|---|---|
| **`docs/HANDOFF.md`** | **交接文档** —— 环境怎么起、状态到哪、坑在哪、下一步做什么 | **新开会话接手时先读这个** |
| **`docs/spec.md`** | 设计规格 —— **所有决策的权威依据** | 想知道"为什么这样设计" |
| **`docs/progress.md`** | 进度台账 + **完整恢复锚点** | 会话中断/压缩后查细节 |
| `docs/SPEC-COVERAGE.md` | spec 逐条 → 实现位置 → 状态 | 想确认某条要求实现了没有 |
| `docs/BALANCE.md` | 数值分析 + **试玩检查清单** | 觉得难度不对时 |
| `docs/DEPLOY.md` | GitHub Pages 部署步骤 | 要上线时 |
| `docs/ACCEPTANCE.md` | 真机验收清单（spec §7.2 五条） | 拿手机测试时 |

---

## 项目结构（速览）

```
tower-defense/
├── index.html            入口（普通 script 引 Phaser + module 引 main.js）
├── probe.html            Phase 0 真机探针（验收用，非游戏本体）
├── vendor/phaser.min.js  1061 KB（arcade-physics 构建）
├── assets/assets.js      素材清单 —— **当前为空** = 全部代码绘制占位
├── src/
│   ├── main.js           Scale.RESIZE 配置 + 场景注册
│   ├── scenes/           Boot / Menu / LevelSelect / Game / Hud / Result
│   ├── entities/         Tower / Enemy / Projectile
│   ├── systems/          **10 个纯逻辑或系统模块**（多数不 import Phaser，可在 node 里测）
│   └── data/             towers / enemies / levels —— **改数值只动这里**
├── scripts/serve.js      本地预览（端口 8788）
├── tests/                自动化测试（不参与部署）
└── docs/                 全部文档
```

详细结构见 `docs/spec.md` §2.4。

---

## 当前状态

| 项 | 状态 |
|---|---|
| 代码（Phase 2–6：布局 / 循环 / 塔 / UI / 内容） | ✅ 完成 |
| 自动化测试 | ✅ **294 项断言全绿** |
| 部署准备（remote / 文档 / 验证脚本） | ✅ 完成 |
| **真机验收**（spec §7.2 五条） | 🟡 **必须人工** —— iOS 微信与安卓 X5 无法在桌面复现 |
| **部署上线** | 🟡 **必须人工** —— 需要 GitHub 账号操作 |
| Kenney 素材接入 | 🟡 可选（当前全部代码绘制占位，不影响游玩） |

### 需要人做的两件事

1. **真机测**：微信里打开 `http://192.168.1.8:8788/?debug=1`，读右上角 FPS、试点击手感
2. **部署**：建空仓库 `tower-defense` → `git push -u origin main` → 开 Pages

操作步骤分别在 `docs/ACCEPTANCE.md` 与 `docs/DEPLOY.md`。

---

## ⚠️ 改动前请注意（都是实际踩过的坑）

| # | 规则 | 踩坑后果 |
|---|---|---|
| 1 | **测试里禁止硬编码点击坐标** | 曾因按钮从 `H*0.64` 挪到 `H*0.60`，4 个测试脚本静默点空、卡在菜单，却只报无关的 `economy undefined`。用 `tests/_nav.mjs` 从 Phaser 交互对象动态取 |
| 2 | **协同不要改成每帧计算** | 协同只取决于塔的位置，每帧遍历邻域是纯浪费。只在建造/升级/卖出后重算（`GameScene.recomputeSynergy`） |
| 3 | **`cell` 不要向上 clamp 到 44px** | 会让网格**溢出窄屏**（360px 屏上 8×44=352 > 344 可用宽）。44px 只是报警线，不是下限（`systems/Layout.js`） |
| 4 | **`WaveManager` 进入刷怪阶段不要重置 `timer`** | 会丢掉 dt 溢出的刷怪额度：dt=100s、间隔 0.1s 时只刷 1 只而不是 10 只（卡顿帧会丢怪） |
| 5 | **`pointerout` 不能当作一次点击** | 手指从建造按钮移向地图会触发它，把刚进入的建造模式取消 —— 表现是"点塔图标→点地图格"永远建不出塔 |
| 6 | **禁用 `FIT`，坚持 `Scale.RESIZE`** | 竖屏下 `FIT` 会把整个画面缩到 0.39 倍，HUD 文字变成 4.7px，根本看不清 |
| 7 | **改数值只动 `src/data/`** | 数值与逻辑分离是刻意的（spec §3.6），改平衡不该碰逻辑代码 |

前 4 条在 `docs/progress.md` 的「已修正的架构缺陷」里有详细记录。

---

## 许可与致谢

- 引擎：[Phaser 3](https://phaser.io)（MIT）
- 素材：计划使用 [Kenney.nl](https://kenney.nl) 的 CC0 素材 —— **尚未接入**
- 音效：当前为 **Web Audio 合成**（`src/systems/Audio.js`），零素材依赖
