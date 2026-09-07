import { describe, it, expect } from 'vitest';
import { advance, finalScores, shouldEnd, gameEndWind, type RoundState, type RuleSnapshot } from '../src/index';

const state4 = (over: Partial<RoundState> = {}): RoundState => ({
  mode: 4, dealer: 0, honba: 0, wind: 0, hand: 1, ...over,
});

describe('局面推进 advance', () => {
  it('庄家荣和/自摸 → 本场 +1', () => {
    expect(advance(state4(), { kind: 'win', winnerIsDealer: true })).toMatchObject({ dealer: 0, honba: 1, hand: 1 });
  });

  it('闲家荣和/自摸 → 换庄、本场清零、局数 +1', () => {
    expect(advance(state4(), { kind: 'win', winnerIsDealer: false })).toMatchObject({ dealer: 1, honba: 0, hand: 2 });
  });

  it('局数到 4 再轮庄 → 场风 +1、局数回 1', () => {
    expect(advance(state4({ hand: 4, wind: 0 }), { kind: 'win', winnerIsDealer: false })).toMatchObject({ wind: 1, hand: 1 });
  });

  it('流局且庄家听牌 → 连庄、本场 +1', () => {
    expect(advance(state4(), { kind: 'draw', dealerTenpai: true })).toMatchObject({ dealer: 0, honba: 1, hand: 1 });
  });

  it('流局且庄家不听 → 换庄、本场清零', () => {
    expect(advance(state4(), { kind: 'draw', dealerTenpai: false })).toMatchObject({ dealer: 1, honba: 0, hand: 2 });
  });

  it('罚符 → 本场 +1、连庄', () => {
    expect(advance(state4(), { kind: 'chombo' })).toMatchObject({ dealer: 0, honba: 1, hand: 1 });
  });

  it('三人局轮庄取模 3', () => {
    expect(advance({ mode: 3, dealer: 2, honba: 0, wind: 0, hand: 1 }, { kind: 'win', winnerIsDealer: false })).toMatchObject({ dealer: 0 });
  });
});

const rule4: RuleSnapshot = {
  length: '半庄战', startPoints: 25000, oka: 30000, honbaStick: 300, notenBappu: 3000,
  extendBelowOka: true, hanMin: '一番缚', kiriage: false, hakoshita: true, unlimitedTopRenchan: false,
  uma: [10, 5, -5, -10], keepDecimal: true,
};

describe('终局顺位 finalScores', () => {
  it('得点 = (素点−返点)/1000 + TOP赏 + 马点，保留一位小数', () => {
    const r = finalScores([35600, 30200, 28800, 24400], rule4);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
    expect(r[0].score).toBe(35.6); // 5.6 + 20(TOP赏) + 10
    expect(r[1].score).toBe(5.2); // 0.2 + 5
    expect(r[2].score).toBe(-6.2); // -1.2 - 5
    expect(r[3].score).toBe(-15.6); // -5.6 - 10
  });

  it('同分按起家初始座次打破平局（起家为 0）', () => {
    const r = finalScores([30200, 35600, 30200, 24400], rule4);
    // 35600 第 1；30200 座位0(东) 第 2、座位2(西) 第 3；24400 第 4
    expect(r.map((x) => x.rank)).toEqual([2, 1, 3, 4]);
  });

  it('同分按起家初始座次（东→南→西→北），非终局座位', () => {
    // 起家 = seat 2 → seat2=东, seat3=南, seat0=西, seat1=北
    const r = finalScores([25000, 30000, 30000, 20000], rule4, 2);
    // 30000 两家：seat2(东) 第1、seat1(北) 第2；25000 seat0 第3；20000 seat3 第4
    expect(r.map((x) => x.rank)).toEqual([3, 2, 1, 4]);
  });

  it('不保留小数则取整', () => {
    const r = finalScores([35600, 30200, 28800, 24400], { ...rule4, keepDecimal: false });
    expect(r[0].score).toBe(36); // 5.6 + 20 + 10 = 35.6 → 36
  });
});

describe('终局终止 shouldEnd', () => {
  const ruleHalf: RuleSnapshot = { ...rule4, length: '半庄战', hakoshita: true, extendBelowOka: true, unlimitedTopRenchan: false };

  it('击飞：任一家 <0 立即终局', () => {
    expect(shouldEnd(state4(), ruleHalf, [24000, 26000, -1000, 25000], { kind: 'win', winnerIsDealer: false })).toBe(true);
  });

  it('还没打完最后一场（wind < 长度场数）不结束', () => {
    expect(shouldEnd(state4({ wind: 1 }), ruleHalf, [25000, 25000, 25000, 25000], { kind: 'win', winnerIsDealer: false })).toBe(false);
  });

  it('打完最后一场且无延局 → 结束', () => {
    expect(shouldEnd(state4({ wind: 2 }), ruleHalf, [35000, 25000, 20000, 20000], { kind: 'win', winnerIsDealer: false })).toBe(true);
  });

  it('无人达返点 → 延局不结束', () => {
    expect(shouldEnd(state4({ wind: 2 }), ruleHalf, [29000, 25000, 25000, 21000], { kind: 'draw', dealerTenpai: true })).toBe(false);
  });

  it('庄家赢最后一场且是第一、开关关 → 结束', () => {
    expect(shouldEnd(state4({ wind: 2 }), ruleHalf, [40000, 20000, 20000, 20000], { kind: 'win', winnerIsDealer: true })).toBe(true);
  });

  it('庄家赢最后一场且是第一、开关开 → 连庄不结束', () => {
    expect(shouldEnd(state4({ wind: 2 }), { ...ruleHalf, unlimitedTopRenchan: true }, [40000, 20000, 20000, 20000], { kind: 'win', winnerIsDealer: true })).toBe(false);
  });

  it('庄家赢最后一场但非第一 → 强制连庄不结束', () => {
    expect(shouldEnd(state4({ wind: 2 }), ruleHalf, [25000, 40000, 20000, 15000], { kind: 'win', winnerIsDealer: true })).toBe(false);
  });

  it('东风战打完东场（wind=1）即结束', () => {
    expect(gameEndWind('东风战')).toBe(1);
    expect(shouldEnd(state4({ wind: 1 }), { ...ruleHalf, length: '东风战' }, [35000, 25000, 20000, 20000], { kind: 'win', winnerIsDealer: false })).toBe(true);
  });

  it('无限庄战：不因场风到圈自动结束（击飞除外）', () => {
    expect(gameEndWind('无限庄战')).toBe(Infinity);
    const ruleInf = { ...ruleHalf, length: '无限庄战' as const };
    expect(shouldEnd(state4({ wind: 99 }), ruleInf, [35000, 25000, 20000, 20000], { kind: 'win', winnerIsDealer: false })).toBe(false);
    // 击飞仍立即终局
    expect(shouldEnd(state4({ wind: 99 }), ruleInf, [35000, -1000, 20000, 20000], { kind: 'win', winnerIsDealer: false })).toBe(true);
  });
});
