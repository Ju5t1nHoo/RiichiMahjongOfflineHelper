/** 可选番数：1~13 连续，14~25 跳过（役满按 13 的倍数计数），26/39/52/65/78 */
export const HAN_NUMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 26, 39, 52, 65, 78] as const;

/** 符数标准档位 */
export const FU_OPTS = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110] as const;

/** 向上取整到百位 */
export function rup(x: number): number {
  return Math.ceil(x / 100) * 100;
}

/** 满贯档位基本点（5 番及以上） */
export function tierBase(han: number): number {
  if (han <= 5) return 2000; // 满贯
  if (han <= 7) return 3000; // 跳满
  if (han <= 10) return 4000; // 倍满
  if (han <= 12) return 6000; // 三倍满
  return 8000 * (han / 13); // 役满起，每 13 番 ×1
}

const TIER_NAMES = ['', '役满', '双倍役满', '三倍役满', '四倍役满', '五倍役满', '六倍役满'];

/** 档位名（5 番及以上） */
export function tierName(han: number): string {
  if (han <= 5) return '满贯';
  if (han <= 7) return '跳满';
  if (han <= 10) return '倍满';
  if (han <= 12) return '三倍满';
  const k = han / 13;
  return TIER_NAMES[k] ?? `${k}倍役满`;
}

/** 是否需要符数（1~4 番需要，5 番及以上走档位） */
export function needFu(han: number): boolean {
  return han <= 4;
}

/** 基本点 = 符 × 2^(番+2)，封顶 2000；切上满贯把 1920 进位到 2000 */
export function baseOf(han: number, fu: number, kiriage = false): number {
  if (han <= 4) {
    let base = fu * Math.pow(2, han + 2);
    if (kiriage && base === 1920) base = 2000;
    return Math.min(base, 2000);
  }
  return tierBase(han);
}
