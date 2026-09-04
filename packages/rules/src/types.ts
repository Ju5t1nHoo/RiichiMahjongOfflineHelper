export type Mode = 4 | 3 | 2;

export type SettlementType = 'RON' | 'TSUMO' | 'DRAW' | 'CHOMBO';

export type GameLength = '东风战' | '半庄战' | '一庄战';
export type HanMin = '一番缚' | '二番缚' | '三番缚' | '四番缚' | '五番缚';

/** 规则快照（对应 requirements §5 参数表） */
export interface RuleSnapshot {
  length: GameLength;
  startPoints: number; // 基础分
  oka: number; // 返点
  honbaStick: number; // 本场点棒（300 四/二麻，200 三麻）
  notenBappu: number; // 不听罚符
  extendBelowOka: boolean; // 不满返点延局
  hanMin: HanMin; // 番缚
  kiriage: boolean; // 切上满贯
  hakoshita: boolean; // 击飞
  unlimitedTopRenchan: boolean; // 终局第一无限连庄
  uma: number[]; // 马点（千点单位），长度 = mode
  keepDecimal: boolean; // 得点保留一位小数
}

/** 一手结算的上下文 */
export interface RoundContext {
  mode: Mode;
  dealer: number; // 庄家 seat（0-based，按逆时针递增）
  honba: number; // 本场数
  riichiSticks: number; // 供托中的立直棒根数
  honbaStick: number; // 每本场点棒
}
