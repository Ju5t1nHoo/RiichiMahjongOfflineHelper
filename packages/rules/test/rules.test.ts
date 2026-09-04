import { describe, it, expect } from 'vitest';
import {
  HAN_NUMS,
  FU_OPTS,
  rup,
  tierBase,
  tierName,
  needFu,
  baseOf,
  settleRon,
  settleTsumo,
  settleNoten,
  settleChombo,
  type RoundContext,
} from '../src/index';

const ctx4 = (dealer = 0, honba = 0, riichi = 0): RoundContext => ({
  mode: 4,
  dealer,
  honba,
  riichiSticks: riichi,
  honbaStick: 300,
});

describe('满贯档位', () => {
  it('tierBase 正确映射', () => {
    expect(tierBase(5)).toBe(2000);
    expect(tierBase(6)).toBe(3000);
    expect(tierBase(7)).toBe(3000);
    expect(tierBase(8)).toBe(4000);
    expect(tierBase(10)).toBe(4000);
    expect(tierBase(11)).toBe(6000);
    expect(tierBase(12)).toBe(6000);
    expect(tierBase(13)).toBe(8000);
    expect(tierBase(26)).toBe(16000);
    expect(tierBase(39)).toBe(24000);
    expect(tierBase(52)).toBe(32000);
    expect(tierBase(65)).toBe(40000);
    expect(tierBase(78)).toBe(48000);
  });

  it('tierName 正确', () => {
    expect(tierName(5)).toBe('满贯');
    expect(tierName(7)).toBe('跳满');
    expect(tierName(10)).toBe('倍满');
    expect(tierName(12)).toBe('三倍满');
    expect(tierName(13)).toBe('役满');
    expect(tierName(26)).toBe('双倍役满');
    expect(tierName(78)).toBe('六倍役满');
  });

  it('HAN_NUMS 与 FU_OPTS', () => {
    expect(HAN_NUMS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 26, 39, 52, 65, 78]);
    expect(FU_OPTS).toEqual([20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110]);
  });
});

describe('基本点 baseOf', () => {
  it('1~4 番按符计算', () => {
    expect(baseOf(1, 30)).toBe(240);
    expect(baseOf(2, 30)).toBe(480);
    expect(baseOf(3, 30)).toBe(960);
    expect(baseOf(4, 30)).toBe(1920);
  });

  it('满贯封顶', () => {
    expect(baseOf(4, 40)).toBe(2000); // 2560 → 2000
    expect(baseOf(3, 70)).toBe(2000); // 2240 → 2000
  });

  it('切上满贯', () => {
    expect(baseOf(4, 30)).toBe(1920);
    expect(baseOf(4, 30, true)).toBe(2000);
    expect(baseOf(3, 60)).toBe(1920);
    expect(baseOf(3, 60, true)).toBe(2000);
  });

  it('5 番以上走档位', () => {
    expect(baseOf(5, 0)).toBe(2000);
    expect(baseOf(13, 0)).toBe(8000);
    expect(baseOf(26, 0)).toBe(16000);
  });

  it('needFu', () => {
    expect(needFu(1)).toBe(true);
    expect(needFu(4)).toBe(true);
    expect(needFu(5)).toBe(false);
    expect(needFu(13)).toBe(false);
  });
});

describe('rup', () => {
  it('向上取整到百位', () => {
    expect(rup(240)).toBe(300);
    expect(rup(960)).toBe(1000);
    expect(rup(1440)).toBe(1500);
    expect(rup(1920)).toBe(2000);
    expect(rup(300)).toBe(300);
  });
});

describe('荣和 settleRon', () => {
  it('子家荣和 1番30符 = 1000', () => {
    const d = settleRon(ctx4(), [{ seat: 1, han: 1, fu: 30 }], 0).deltas;
    expect(d[0]).toBe(-1000); // 放铳者付 960 → 1000
    expect(d[1]).toBe(1000);
  });

  it('亲家荣和 1番30符 = 1500', () => {
    const d = settleRon(ctx4(), [{ seat: 0, han: 1, fu: 30 }], 1).deltas;
    expect(d[0]).toBe(1500);
    expect(d[1]).toBe(-1500);
  });

  it('子家荣和 满贯 = 8000', () => {
    const d = settleRon(ctx4(), [{ seat: 1, han: 5, fu: 0 }], 0).deltas;
    expect(d[1]).toBe(8000);
    expect(d[0]).toBe(-8000);
  });

  it('多家荣和各自番符 + 本场 + 立直棒，头跳归最近者', () => {
    const d = settleRon(
      { mode: 4, dealer: 0, honba: 2, riichiSticks: 1, honbaStick: 300 },
      [{ seat: 2, han: 3, fu: 30 }, { seat: 3, han: 4, fu: 30 }],
      1,
    ).deltas;
    // seat2: 3番30符 base=960 rup(960×4)=3900 + 本场600 + 立直棒1000 = 5500（头跳）
    // seat3: 4番30符 base=1920 rup(1920×4)=7700（不含本场/供托）
    expect(d[0]).toBe(0);
    expect(d[1]).toBe(-(3900 + 7700 + 600)); // -12200
    expect(d[2]).toBe(5500);
    expect(d[3]).toBe(7700);
  });
});

describe('自摸 settleTsumo', () => {
  it('四麻亲家自摸 1番30符 = 每家 500', () => {
    expect(settleTsumo(ctx4(0), 0, 1, 30).deltas).toEqual([1500, -500, -500, -500]);
  });

  it('四麻子家自摸 1番30符 = 亲 500 / 子 300', () => {
    expect(settleTsumo(ctx4(0), 1, 1, 30).deltas).toEqual([-500, 1100, -300, -300]);
  });

  it('三麻子家自摸', () => {
    const d = settleTsumo({ mode: 3, dealer: 0, honba: 0, riichiSticks: 0, honbaStick: 200 }, 1, 1, 30).deltas;
    expect(d).toEqual([-500, 800, -300]);
  });

  it('二麻对家全额', () => {
    const d = settleTsumo({ mode: 2, dealer: 0, honba: 0, riichiSticks: 0, honbaStick: 300 }, 1, 1, 30).deltas;
    expect(d).toEqual([-1000, 1000]);
  });
});

describe('不听罚符 settleNoten', () => {
  it('1 听 3 不听', () => {
    expect(settleNoten(ctx4(), [true, false, false, false]).deltas).toEqual([3000, -1000, -1000, -1000]);
  });

  it('2 听 2 不听', () => {
    expect(settleNoten(ctx4(), [true, true, false, false]).deltas).toEqual([1500, 1500, -1500, -1500]);
  });

  it('全听牌无罚符', () => {
    expect(settleNoten(ctx4(), [true, true, true, true]).deltas).toEqual([0, 0, 0, 0]);
  });
});

describe('罚符 settleChombo', () => {
  it('8000 罚点均分，余数归庄家', () => {
    const d = settleChombo(ctx4(), 1, 8000).deltas;
    expect(d).toEqual([2800, -8000, 2600, 2600]);
  });
});
