import type { Mode, RuleSnapshot } from '@riichi/rules';

/** 马点「自定义」的哨兵值（存于规则记录的 uma 字段） */
export const CUSTOM_UMA = '__custom__';

/** 马点标签 → 数组（千点单位），长度 = 模式 */
export const UMA_MAP: Record<string, number[]> = {
  '10-5': [10, 5, -5, -10],
  '10-0': [10, 0, 0, -10],
  '5-10': [5, 10, -10, -5],
  '20-10': [20, 10, -10, -20],
  '30-10': [30, 10, -10, -30],
  '+10/0/-10': [10, 0, -10],
  '+20/0/-20': [20, 0, -20],
  '+10/+5/-15': [10, 5, -15],
  '+10/-10': [10, -10],
  '+20/-20': [20, -20],
};

/** 各模式的马点预设标签 */
export const UMA_OPTIONS: Record<Mode, string[]> = {
  4: ['10-5', '10-0', '5-10', '20-10', '30-10'],
  3: ['+10/0/-10', '+20/0/-20', '+10/+5/-15'],
  2: ['+10/-10', '+20/-20'],
};

/** 各模式的规则默认值（uma 为标签，经 umaArray 转数组） */
export const RULE_FIELDS: Record<Mode, Record<string, any>> = {
  4: { length: '半庄战', startPoints: 25000, oka: 30000, honbaStick: 300, notenBappu: 3000, extendBelowOka: true, hanMin: '一番缚', kiriage: false, hakoshita: true, unlimitedTopRenchan: false, uma: '10-5', keepDecimal: true },
  3: { length: '半庄战', startPoints: 25000, oka: 30000, honbaStick: 200, notenBappu: 3000, extendBelowOka: true, hanMin: '一番缚', kiriage: false, hakoshita: true, unlimitedTopRenchan: false, uma: '+10/0/-10', keepDecimal: true },
  2: { length: '半庄战', startPoints: 50000, oka: 50000, honbaStick: 300, notenBappu: 3000, extendBelowOka: true, hanMin: '一番缚', kiriage: false, hakoshita: true, unlimitedTopRenchan: false, uma: '+10/-10', keepDecimal: true },
};

/** 从规则记录解析马点数组：预设标签 → UMA_MAP；自定义 → umaCustom 逗号分隔 */
export const umaArray = (r: { uma?: string; umaCustom?: string }): number[] =>
  r.uma === CUSTOM_UMA
    ? (r.umaCustom?.trim() ? r.umaCustom.trim().split(/[\s,，]+/).map(Number) : [])
    : (UMA_MAP[r.uma ?? ''] ?? [10, 5, -5, -10]);

export const toRuleSnapshot = (r: Record<string, any>): RuleSnapshot => ({
  length: r.length, startPoints: Number(r.startPoints), oka: Number(r.oka), honbaStick: Number(r.honbaStick), notenBappu: Number(r.notenBappu),
  extendBelowOka: !!r.extendBelowOka, hanMin: r.hanMin, kiriage: !!r.kiriage, hakoshita: !!r.hakoshita,
  unlimitedTopRenchan: !!r.unlimitedTopRenchan, uma: umaArray(r), keepDecimal: !!r.keepDecimal,
});
