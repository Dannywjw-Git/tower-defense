# 交接文档（HANDOFF）

> **用途**：新开一个会话继续开发时，先读本文件。
> 它只写「接手必须知道的事」——环境怎么起、状态到哪、坑在哪、下一步做什么。
>
> 上游文档：`docs/spec.md`（设计权威）· `docs/progress.md`（完整台账）
> 本文件生成于 2026-09-15，对应提交 `0f73b98`。

---

## 0. 三十秒版本

浏览器塔防游戏，**静态托管、零构建、无后端**。手机竖屏 / 横屏 / 桌面自适应。

| | |
|---|---|
| 根目录 | `D:\Users\Danny\Documents\tower-defense` |
| 引擎 | Phaser 3.90.0（本地 `vendor/phaser.min.js`，1,086,308 B） |
| 技术栈 | **原生 ES modules，无打包器、无 npm 依赖、无构建步骤** |
| 规模 | `src/` 25 文件 · 2389 行 · `tests/` 17 个脚本 |
| 测试 | **384 项断言全绿 + 6 视口 0 JS 错误** |
| git | 17 个提交，`main` 分支，工作区干净 |
| 目标 | 部署到 GitHub Pages 给朋友玩（**尚未上线**） |

---

## 1. 五分钟跑起来

```powershell
cd D:\Users\Danny\Documents\tower-defense

# 起本地预览（零依赖，端口 8788）
node scripts\serve.js 8788
```

| 入口 | 地址 |
|---|---|
| 电脑 | `http://localhost:8788/` |
| 手机（同 WiFi） | `http://192.168.1.8:8788/` |
| **调试面板**（FPS / 实体数 / 对象池 / cell 尺寸） | 任意地址后加 **`?debug=1`** |
| **真机探针**（Phase 0 验收用） | `http://192.168.1.8:8788/probe.html` |

> ⚠️ **ES modules 无法从 `file://` 加载，必须走 HTTP。**
> ⚠️ 跑任何浏览器类测试前，**先确认 8788 在监听** —— 后台 job 会被系统回收，
> 服务器一挂，全部测试会静默失败（曾经误判为代码 bug）。
> 更持久的起法：
> ```powershell
> Start-Process node -ArgumentList "scripts\serve.js","8788" `
>   -WorkingDirectory "D:\Users\Danny\Documents\tower-defense" -WindowStyle Hidden
> ```

**怎么玩**：开始游戏 → 选地图 → 点底部塔图标 → 点绿色格子建塔 → 点塔升级/出售 → 点敌人补刀（**长按**塔图标看说明）。

---

## 2. 当前完成度

| Phase | 内容 | 状态 |
|---|---|---|
| 0 | 真机验证（微信 X5 / 点格子 / 切后台） | ✅ **真机通过** |
| 1 | 骨架 + 部署链路 | ✅ 代码就绪，**未上线** |
| 2 | 地图与三朝向布局 | ✅ |
| 3 | 核心循环（5 纯逻辑模块 + Enemy） | ✅ |
| 4 | 塔与战斗（6 塔 × 3 级、协同、卖塔） | ✅ |
| 5 | UI 与交互（HUD 两套排布、建造栏、面板、补刀） | ✅ |
| 6 | 内容与打磨（2 图 / 4 敌 / 引导 / 音效 / 存档 / 结算） | ✅ |
| 7 | 真机验收取证 | 🟡 五条硬标准 **全部通过**，仅 FPS 数值待复测 |

### 真机已验证的六条（用户实测反馈）

| 项 | 标准 | 实测 |
|---|---|---|
| ① 微信能打开、点格子准 | — | ✅ |
| ② 竖屏 cell | ≥44px | ✅ **62px** |
| ③ 首屏 | ≤5s | ✅ **约 3s** |
| ④ iOS 微信可玩、不需横屏 | — | ✅ |
| ⑤ 切后台自动暂停 | — | ✅ |
| ⑥ FPS（中端安卓微信满波） | ≥30 | 🟡 **待复测** |

---

## 3. 还没做的事（按优先级）

### ① 部署上线（唯一阻塞"给朋友玩"的事）

**已铺好**：git 仓库就绪 · `remote origin` 已配 · 凭据管理器已有 GitHub 凭据 · 防火墙已放行。

**只需三步**：
1. 建空仓库 https://github.com/new → 名字 **`tower-defense`** → **三个初始化选项都不勾**
2. `git push -u origin main`
3. 仓库 Settings → Pages → Branch `main` + `/ (root)` → Save

**推完验证**：`node tests\verify-deploy.mjs`
预期上线地址：`https://Dannywjw-Git.github.io/tower-defense/`

### ② 补测 FPS 数值

手机上开 `?debug=1`，读右上角 `FPS xx.x`，**满波时**（地图 2 后期）应 ≥30。
若掉帧：地址加 `?dpr=1` 退回旧渲染（清晰度下降但省填充率）。

### ③ 塔的颜色辨识（用户提过，尚未决定方案）

截图显示场上出现橙/蓝/绿/紫方块，**玩家记不住哪个方块是什么塔**。三个方向未选：
- **A** 方块内加单字（箭/炮/冰/电/毒/狙），与底部按钮一致
- **B** 保持现状靠颜色记
- **C** 不同塔用不同形状（方/菱/圆/三角）

### ④ Kenney 素材接入（可选，不阻塞）

当前**全部是代码绘制的占位**（纯色方块 + 文字按钮 + Web Audio 合成音效）。
接入点：`assets/assets.js`（清单，当前三个数组全空）。
⚠️ 素材需人工从 kenney.nl 下载，**AI 无法访问该站**。

---

## 4. 必须知道的坑（都是实际踩过的）

### 4.1 HiDPI / 渲染分辨率（最容易再踩）

**Phaser 3 没有 `resolution` 配置**（那是 Phaser 2 的）。官方原话：
> "For legacy reasons, Phaser 3 has never properly supported HighDPI devices."

**已试过且无效的三条路**（别再试）：
| 尝试 | 结果 |
|---|---|
| `config.resolution = DPR` | Phaser 3 无此 API，静默忽略 |
| `scale.zoom = DPR` | 值写入了但每次重算被覆盖，缓冲区不变 |
| `scale.resize(w × DPR)` | 立刻被父容器 CSS 尺寸覆盖回去 |

**根因**：`Scale.RESIZE` 模式**拒绝一切外部尺寸干预**。

**当前解法**（`src/main.js`）：改用 `Scale.NONE` + 自写 `setupHiDpi()`：
- 逻辑尺寸 = CSS 像素 × `PIXEL_SCALE`（默认 `min(devicePixelRatio, 2)`，`?dpr=1|2|3` 可覆盖）
- canvas 的 CSS 尺寸手动设回 CSS 像素
- **后果：逻辑坐标 ≠ CSS 像素** —— 所有按 CSS 像素设计的尺寸（字号/padding/间距）
  **必须过 `systems/Layout.js` 的 `px()`**，漏一处那部分 UI 就缩小一半。
- **测试脚本也必须换算**：`page.mouse.click` 收 CSS 像素，游戏内坐标是逻辑像素。
  统一走 `tests/_nav.mjs` 的 `findButton()`（已内置换算）。

### 4.2 测试禁止硬编码点击坐标

曾因按钮从 `H*0.64` 挪到 `H*0.60`，4 个测试脚本静默点空，却只报无关的 `economy undefined`。
**用 `tests/_nav.mjs` 从 Phaser 交互对象动态取中心。**

### 4.3 其他四条铁律

| 规则 | 踩坑后果 |
|---|---|
| 协同不要改成每帧算 | 只取决于塔的位置，每帧遍历邻域是纯浪费（只在建造/升级/卖出后重算） |
| `cell` 不要向上 clamp 到 44px | 会让网格溢出窄屏（360px 屏上 8×44=352 > 344） |
| `WaveManager` 进刷怪阶段不要重置 `timer` | 会丢 dt 溢出的刷怪额度（卡顿帧丢怪） |
| `pointerout` 不能当作一次点击 | 手指从按钮移向地图会触发它，把刚进的建造模式取消 |
| 一律用对象池，不 `new`/`destroy` | 补刀特效曾违反此条 → 真机卡顿 |

**完整清单见 `docs/progress.md` 的「已修正的架构缺陷」与 `README.md` 的「改动前请注意」。**

---

## 5. 测试体系

```powershell
# 需要 8788 在跑
node tests\logic-check.mjs       # 190 项纯逻辑断言
node tests\combat-flow.mjs       #  26 项建造/升级/协同/卖塔/击杀
node tests\ui-flow.mjs           #  38 项真实鼠标点击 UI 交互
node tests\phase6-flow.mjs       #  29 项地图2/胜负/引导/存档/音效
node tests\stress-flow.mjs       #  11 项对象池复用与场景泄漏
node tests\mechanics-flow.mjs    #  17 项机制组合（协同降级/溅射/连锁/减速/毒/集火）
node tests\visual-flow.mjs       #  42 项视觉与布局结构（重叠/形状/血条/调试面板）
node tests\human-flow.mjs        #  31 项完整人机流程预演
node tests\smoke-flow.mjs        #     场景链路 + 敌人行走
node tests\headless-check.mjs http://192.168.1.8:8788/index.html   # 6 视口 JS 错误
node tests\screenshot.mjs        #     三视口 × 五阶段截图 → docs/screenshots/

# 纯 node，不需要浏览器与服务
node tests\balance-check.mjs     # 数值自洽性分析（解析式近似）
node tests\auto-balance.mjs level-02   # 自动试玩 → 逐波漏怪 → 参数枚举
node tests\perf-check.mjs        # 产物体积 / 首屏 / 帧率（帧率不可作验收依据）
node tests\playthrough.mjs "http://192.168.1.8:8788" "教学" 4   # 真实端到端通关
node tests\verify-deploy.mjs     # 部署后线上验证
```

**基线：384 项断言全绿 + 6 视口 0 错误。改完代码跑一遍，失败项会精确指向问题。**

---

## 6. 改数值的地方（改平衡不要碰逻辑）

| 文件 | 内容 |
|---|---|
| `src/data/towers.js` | 6 塔 × 3 级数值 + `buildCost` / `upgradeCost` |
| `src/data/enemies.js` | 4 种敌人（3 种 + 精英） |
| `src/data/levels/level-0N.js` | 路径、起始金币/生命、`prepTime`、波次表 |
| `src/systems/WaveManager.js` | `HP_GROWTH_PER_WAVE = 0.18` |
| `src/scenes/GameScene.js` | `BOUNTY_GROWTH_PER_WAVE = 0.12` · `TAP_*` 补刀参数 |
| `src/systems/Economy.js` | `SELL_REFUND_RATE = 0.7` |
| `src/systems/Adjacency.js` | `PER_NEIGHBOR = 0.05` · `MAX_STACKS = 4` |

**当前核心数值**：两关 `startLives: 20` · `prepTime: 15` · `startGold` 170 / 200。

---

## 7. 已知的设计缺陷（供升级工作参考）

### 7.1 经济公式曾经脱钩（已修，但值得理解）

**现象**：敌人 HP 每波 +18%，而**赏金原本是死数**（普通怪永远 8 金）→ 越打越买不起塔。
**真机反馈**：用户"第 2 关过不去"，答"**钱不够**"。

**当时差点改错方向**：我原准备降敌人 HP（按"打不死"的思路），
但那是拍脑袋 —— 用户的实际症状是"没钱建塔"。

**用 `auto-balance.mjs` 枚举出来的真实结论**：
- 崩溃点是**第 3 波**（快速怪），不是后段
- 快速怪速度 2.16 格/秒，穿越路径仅 **6.9s**，塔的射程窗口极短
- **只加赏金救不了**（两关仍失败），**必须同时加起始金币**
- 加完后第 3 波从漏 8–9 只变成**漏 0 只**

### 7.2 精英波的输出窗口问题

`level-02` 第 12 波只有 **1 只精英**（2682 HP / 12.5s 在场时间 = 需恒定 214 DPS）。
"一只大怪"的设计没考虑它**只给一次输出窗口**。当前靠加钱缓解，未根本解决。

### 7.3 解析式平衡模型的根本缺陷

`balance-check.mjs` 假设"所有塔的 DPS 都能作用于所有敌人"，
但**塔沿路径分散** —— 一只敌人走完全程只经过其中几座。
实测：总 DPS 196 × 覆盖率 29% ≈ **有效 57**，而需求 92。
**真实有效输出约为解析值的 1/4。** 该脚本的结论**不能作为绝对判据**。

---

## 8. 架构速览

```
src/
├── main.js              Phaser.Game 配置 + PIXEL_SCALE + setupHiDpi()
├── scenes/              Boot → Menu → LevelSelect → Game(+Hud 并行) → Result
├── entities/            Tower(矩形) / Enemy(圆形+血条) / Projectile
├── systems/             ★ 10 个模块，多数不 import Phaser，可在 node 里测
│   ├── Layout.js        三朝向布局 + 统一缩放层 px()
│   ├── MapGrid.js       关卡 → 格类型表
│   ├── PathMath.js      路径插值
│   ├── WaveManager.js   波次状态机 + HP 曲线
│   ├── Economy.js       金币收支与退款
│   ├── Targeting.js     索敌策略
│   ├── Adjacency.js     协同规则（通用 + 3 组特例）
│   ├── Combat.js        伤害分配与结算
│   ├── Save.js          存档（版本号 + 全失败降级）
│   └── Audio.js         合成音效（Web Audio，零素材）
└── data/                towers / enemies / levels  ← 改数值只动这里
```

**关键设计决策**（改动前务必读 `docs/spec.md` 对应章节）：
- **伤害在锁定瞬间结算**，弹道只是视觉（§3.3）—— 避开"目标中途死亡"一整类边界情况
- **协同不是每帧计算**，缓存到塔上，仅建造/升级/卖出后重算（§5.1）
- **对象池**用于敌人/塔/弹道/补刀特效（§3.2）
- **双坐标系统**：`gx/gy` = 格坐标（纯逻辑）；`x/y` = 像素（渲染）
- **数据与逻辑分离**（§3.6）：改平衡不碰逻辑代码

---

## 9. 新会话开场建议

```
我在继续开发 D:\Users\Danny\Documents\tower-defense 这个塔防游戏。
请先读 docs/HANDOFF.md（交接文档）与 docs/progress.md（台账），
然后我们做 <你要做的升级>。
```

**注意**：本项目按 `$DSH_HOME/AGENTS.md` 的阶段流水线走
（① 发散 → ② 收敛 → ③ 规划 → ④ 实现 → ⑤ 验证）。
**升级工作若触及多模块或对外契约，属 Architectural 级，需要走完整流程。**
