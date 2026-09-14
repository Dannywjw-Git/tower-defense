// 存档 —— localStorage，含版本号与**全部失败降级路径**
//
// spec §3.7：`version` 字段不可省略 —— 否则将来改格式会静默损坏朋友的旧存档。
// spec §3.8：隐私模式 / 配额满时必须降级为「本局不存档」，而不是崩溃。
//
// 本模块**永不抛错**：任何异常都退化为「无存档」，绝不影响游玩。

const KEY = 'tower-defense-save'
export const SAVE_VERSION = 1

export function emptySave() {
  return {
    version: SAVE_VERSION,
    /** 最佳战绩（用于关卡选择界面展示） */
    best: { score: 0, wave: 0, levelId: null },
    /** 已通关的关卡 id */
    cleared: [],
    /** 未完成一局的进度快照（用于「继续」） */
    progress: null,
  }
}

/** 探测 localStorage 是否真的可写（隐私模式下 setItem 会抛错） */
function storage() {
  try {
    const s = globalThis.localStorage
    if (!s) return null
    const probe = '__td_probe__'
    s.setItem(probe, '1')
    s.removeItem(probe)
    return s
  } catch {
    return null
  }
}

export function isAvailable() {
  return storage() !== null
}

export function load() {
  const s = storage()
  if (!s) return emptySave()
  try {
    const raw = s.getItem(KEY)
    if (!raw) return emptySave()
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return emptySave()
    // 版本不符 → 重置。宁可丢存档，也不要用错格式读出错数据。
    if (data.version !== SAVE_VERSION) return emptySave()
    return { ...emptySave(), ...data }
  } catch {
    return emptySave()
  }
}

export function save(data) {
  const s = storage()
  if (!s) return false
  try {
    s.setItem(KEY, JSON.stringify({ ...data, version: SAVE_VERSION }))
    return true
  } catch {
    // 配额满：降级为不存档
    return false
  }
}

export function clear() {
  const s = storage()
  if (!s) return false
  try {
    s.removeItem(KEY)
    return true
  } catch {
    return false
  }
}

/** 通关：记录 cleared、刷新 best、清掉进度 */
export function markCleared(levelId, stats = {}) {
  const d = load()
  if (!d.cleared.includes(levelId)) d.cleared.push(levelId)

  const score = Math.round(stats.score || 0)
  if (score > d.best.score) {
    d.best = { score, wave: stats.wave || 0, levelId }
  }
  d.progress = null
  save(d)
  return d
}

/** 失败：只刷新 best，不记 cleared */
export function markFailed(stats = {}) {
  const d = load()
  const score = Math.round(stats.score || 0)
  if (score > d.best.score) {
    d.best = { score, wave: stats.wave || 0, levelId: stats.levelId || null }
  }
  d.progress = null
  save(d)
  return d
}

/** 保存局内进度快照 */
export function saveProgress(snapshot) {
  const d = load()
  d.progress = snapshot
  return save(d)
}

export function clearProgress() {
  const d = load()
  d.progress = null
  return save(d)
}

/** 是否已通关某关 */
export function isCleared(levelId) {
  return load().cleared.includes(levelId)
}
