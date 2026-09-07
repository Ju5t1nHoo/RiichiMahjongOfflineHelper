import type { Mode, RuleSnapshot, GameLength } from './types';

/** 一手结算后的局面 */
export interface RoundState {
  mode: Mode;
  dealer: number; // 庄家 seat（0-based）
  honba: number; // 本场数
  wind: number; // 场风 index（0=东，1=南…）
  hand: number; // 局数 1~4
}

/** 结算结果对局面的影响分类 */
export type Outcome =
  | { kind: 'win'; winnerIsDealer: boolean }
  | { kind: 'draw'; dealerTenpai: boolean }
  | { kind: 'chombo' };

/** 轮庄：庄家 +1、本场清零、局数 +1（局数 > 4 则场风 +1） */
function rotate(state: RoundState): RoundState {
  const handNext = state.hand >= 4 ? 1 : state.hand + 1;
  return {
    ...state,
    dealer: (state.dealer + 1) % state.mode,
    honba: 0,
    hand: handNext,
    wind: state.hand >= 4 ? state.wind + 1 : state.wind,
  };
}

/**
 * 局面自动推进（requirements §4.7 + §4.6 罚符）：
 * - 庄家荣和/自摸 → 本场 +1、庄家不变。
 * - 闲家荣和/自摸 → 换庄、本场清零、局数 +1（>4 则场风 +1）。
 * - 流局 → 本场 +1，庄家按亲家是否听牌判定连庄（不听则换庄）。
 * - 罚符 → 本场 +1、庄家连庄。
 */
export function advance(state: RoundState, outcome: Outcome): RoundState {
  switch (outcome.kind) {
    case 'win':
      return outcome.winnerIsDealer ? { ...state, honba: state.honba + 1 } : rotate(state);
    case 'draw':
      return outcome.dealerTenpai ? { ...state, honba: state.honba + 1 } : rotate(state);
    case 'chombo':
      return { ...state, honba: state.honba + 1 };
  }
}

/**
 * 终局顺位：得点 = (素点 − 返点)/1000 + TOP赏 + 马点。
 * TOP赏（オカ）= (返点 − 基础分) × 人数 ÷ 1000，归第一名；使总得点归零。
 * 按素点从高到低排；同分时按东一局起家的初始座次（东→南→西→北，亲家优先）打破平局。
 */
export function finalScores(
  rawScores: number[],
  rule: RuleSnapshot,
  initialDealer = 0,
): { score: number; rank: number }[] {
  const n = rawScores.length;
  const order = rawScores
    .map((raw, seat) => ({ seat, raw }))
    .sort((a, b) => b.raw - a.raw || ((a.seat - initialDealer + n) % n) - ((b.seat - initialDealer + n) % n));

  const rank = new Array<number>(n).fill(0);
  order.forEach((o, i) => { rank[o.seat] = i + 1; });

  const topBonus = ((rule.oka - rule.startPoints) * n) / 1000;
  return rawScores.map((raw, i) => {
    const uma = rule.uma[rank[i] - 1] ?? 0;
    const top = rank[i] === 1 ? topBonus : 0;
    let score = (raw - rule.oka) / 1000 + top + uma;
    score = rule.keepDecimal ? Math.round(score * 10) / 10 : Math.round(score);
    return { score, rank: rank[i] };
  });
}

/** 游戏长度的场数：东风战 1、半庄战 2、一庄战 4、无限庄战 Infinity（不因场风到圈自动结束） */
export function gameEndWind(length: GameLength): number {
  return { 东风战: 1, 半庄战: 2, 一庄战: 4, 无限庄战: Infinity }[length];
}

/**
 * 是否终局（requirements §4.8）：传入推进后的局面与各家素点。
 * - 击飞：任一家 < 0 立即终局。
 * - 打完最后一场（wind ≥ 长度场数）：
 *   - 庄家赢最后一场：未达第一强制连庄；是第一看「终局第一无限连庄」开关。
 *   - 无人达返点且开启「不满返点延局」→ 加打一圈（不结束）。
 */
export function shouldEnd(
  state: RoundState,
  rule: RuleSnapshot,
  points: number[],
  lastOutcome: Outcome,
): boolean {
  if (rule.hakoshita && points.some((p) => p < 0)) return true;
  if (state.wind < gameEndWind(rule.length)) return false;

  if (lastOutcome.kind === 'win' && lastOutcome.winnerIsDealer) {
    const dealerPoints = points[state.dealer] ?? 0;
    const isTop = points.every((p) => dealerPoints >= p);
    if (!isTop) return false; // 未达第一强制连庄
    if (rule.unlimitedTopRenchan) return false; // 开关开 → 连庄
  }

  if (rule.extendBelowOka && !points.some((p) => p >= rule.oka)) return false; // 延局
  return true;
}
