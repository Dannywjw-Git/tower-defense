# 部署到 GitHub Pages

> 目标：朋友在任何地方点开链接即可游玩（spec §2.7）。
> 本仓库**已就绪**：git 已初始化 + 2 个提交，`.nojekyll` 已放置，资源全为相对路径。

---

## 前置条件

- 有 GitHub 账号
- git 身份已配置（本机已配：`DnnyWng` / `dannywjw@qq.com`）

---

## 步骤

### 1. 在 GitHub 建一个**空**仓库

- 名字任意，建议 `tower-defense`
- ⚠️ **不要**勾选 "Add a README" / ".gitignore" / "license"
  （保持空仓库，否则推送时会冲突）
- 可见性 Public / Private 均可（Private 也能开 Pages）

### 2. 关联远程并推送

```powershell
cd D:\Users\Danny\Documents\tower-defense
git remote add origin https://github.com/<你的用户名>/tower-defense.git
git push -u origin main
```

**首次推送需要 Token**（GitHub 已不支持密码登录）：

> GitHub → 右上头像 → Settings → Developer settings →
> Personal access tokens → **Fine-grained tokens** → Generate new token
> → Repository access 选该仓库 → Permissions 给 **Contents: Read and write**
> → 生成后**立刻复制**（只显示一次）→ 推送时把它当密码粘贴

### 3. 开启 Pages

仓库 → **Settings** → **Pages**：

| 项 | 值 |
|---|---|
| Source | Deploy from a branch |
| Branch | `main` |
| Folder | `/ (root)` |

点 **Save**，等 1–2 分钟。

### 4. 上线地址

```
https://<你的用户名>.github.io/tower-defense/
```

---

## 三条已经处理好的坑（spec §2.7）

| 坑 | 状态 | 说明 |
|---|---|---|
| **资源引用必须相对路径** | ✅ 已检查 | 全项目无 `src="/..."` 这类绝对引用；绝对路径在子路径部署下会全部 404 |
| **`.nojekyll`** | ✅ 已放置 | 关闭 Jekyll，避免它忽略下划线开头的文件并拖慢构建 |
| **`vendor/phaser.min.js` 入库** | ✅ 已提交 | 1061 KB，本地自持引擎、不用 CDN —— 这是"不用 CDN"的代价 |

---

## 验证部署成功

浏览器打开上线地址，应看到标题「塔防游戏」。

**白屏时的排查顺序**：
1. 开发者工具 → Console，看有没有 404
2. 确认 URL 里的仓库名与实际一致（大小写敏感）
3. 确认 Pages 构建已完成（Settings → Pages 页顶会显示最近一次构建状态）

---

## 更新流程

```powershell
cd D:\Users\Danny\Documents\tower-defense
git add -A
git commit -m "说明这次改了什么"
git push
```

Pages 会自动重建，约 1 分钟生效。

---

## 迁移预案（若国内访问不稳）

整个项目**无后端、无构建**，所以迁到阿里云 OSS / 腾讯云 COS
**只是上传同一批文件、零代码改动**。

需要上传的内容：

```
index.html
.nojekyll
vendor/
src/
assets/
```

（`tests/` `docs/` `scripts/` 是开发用，不必上传）

这是"纯静态架构"换来的保险 —— 换托管方不影响一行代码。
