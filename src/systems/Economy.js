// 金币收支与卖塔退款 —— 纯逻辑，不依赖 Phaser
//
// spec §4.4：起始 120 金币、每波清空奖励 20 + 波数×5、卖塔返还累计投入的 70%。
// 硬规则：**任何路径下金币都不得为负**。

/** 卖塔返还累计投入（含升级费）的比例 */
export const SELL_REFUND_RATE = 0.7

export class Economy {
  constructor(gold = 0) {
    if (!Number.isFinite(gold) || gold < 0) throw new Error(`初始金币非法: ${gold}`)
    this.gold = Math.round(gold)
  }

  canAfford(cost) {
    return Number.isFinite(cost) && this.gold >= cost
  }

  /**
   * 扣款。余额不足时返回 false 且**不改变任何状态**。
   * @returns {boolean} 是否成功
   */
  spend(cost) {
    if (!Number.isFinite(cost) || cost < 0) throw new Error(`spend 收到非法金额: ${cost}`)
    if (!this.canAfford(cost)) return false
    this.gold -= cost
    return true
  }

  /** 入账：击杀赏金、波次清空奖励 */
  earn(amount) {
    if (!Number.isFinite(amount) || amount < 0) throw new Error(`earn 收到非法金额: ${amount}`)
    this.gold += Math.round(amount)
    return this.gold
  }

  /**
   * 卖塔退款：按累计投入的 70% 返还，向下取整（不凭空多出金币）。
   * @param {number} totalInvested 该塔的累计投入（造价 + 所有升级费）
   * @returns {number} 实际返还金额
   */
  sellRefund(totalInvested) {
    if (!Number.isFinite(totalInvested) || totalInvested < 0) {
      throw new Error(`sellRefund 收到非法投入额: ${totalInvested}`)
    }
    const refund = Math.floor(totalInvested * SELL_REFUND_RATE)
    this.gold += refund
    return refund
  }
}

/** 每波清空奖励：20 + 波数 × 5（递增，防后期经济崩） */
export function waveClearBonus(wave) {
  return 20 + wave * 5
}
