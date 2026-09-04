import { baseOf, rup } from './tiers';
import type { RoundContext } from './types';

/** 结算明细项：某玩家的一笔带标签的点数变动（正=得，负=付） */
export interface SettleItem {
  seat: number;
  label: string;
  amount: number;
}

/** 结算结果：净变动 deltas + 带标签的明细 items（deltas 由 items 聚合，保证一致） */
export interface SettleResult {
  deltas: number[];
  items: SettleItem[];
}

/** 荣和赢家：座位 + 各自番符（多家荣和各算各的） */
export interface RonWinner {
  seat: number;
  han: number;
  fu: number;
}

function add(items: SettleItem[], seat: number, label: string, amount: number) {
  if (amount !== 0) items.push({ seat, label, amount });
}

function resultOf(items: SettleItem[], n: number): SettleResult {
  const deltas = new Array<number>(n).fill(0);
  for (const it of items) deltas[it.seat] += it.amount;
  return { deltas, items };
}

/**
 * 荣和：winners 每家按自己的番符从 discarder 处收点。
 * 头跳——离放铳者逆时针最近的和牌者独占本场棒与立直棒（供托）。
 * 返回每家点数变动（正=得，负=付）与带标签明细。
 */
export function settleRon(
  ctx: RoundContext,
  winners: RonWinner[],
  discarder: number,
  kiriage = false,
): SettleResult {
  const n = ctx.mode;
  const items: SettleItem[] = [];
  if (winners.length === 0) return resultOf(items, n);

  const dist = (w: number) => (w - discarder + n) % n;
  const ordered = [...winners].sort((a, b) => dist(a.seat) - dist(b.seat));

  ordered.forEach((win, k) => {
    const mult = win.seat === ctx.dealer ? 6 : 4;
    const amt = rup(baseOf(win.han, win.fu, kiriage) * mult);
    add(items, win.seat, '荣和', amt);
    add(items, discarder, '被荣和', -amt);
    if (k === 0) {
      const honba = ctx.honba * ctx.honbaStick;
      add(items, win.seat, '本场', honba);
      add(items, discarder, '本场', -honba);
      add(items, win.seat, '供托', ctx.riichiSticks * 1000);
    }
  });
  return resultOf(items, n);
}

/**
 * 自摸：四麻亲家各家付 2×、子家自摸亲家付 2× 其余子家付 1×；三麻同；二麻对家全额。
 */
export function settleTsumo(
  ctx: RoundContext,
  winner: number,
  han: number,
  fu: number,
  kiriage = false,
): SettleResult {
  const n = ctx.mode;
  const items: SettleItem[] = [];
  const base = baseOf(han, fu, kiriage);
  const honbaTotal = ctx.honba * ctx.honbaStick;

  if (n === 2) {
    const opp = 1 - winner;
    const mult = winner === ctx.dealer ? 6 : 4;
    const amt = rup(base * mult);
    add(items, winner, '自摸', amt);
    add(items, opp, '自摸', -amt);
    add(items, winner, '本场', honbaTotal);
    add(items, opp, '本场', -honbaTotal);
    add(items, winner, '供托', ctx.riichiSticks * 1000);
    return resultOf(items, n);
  }

  const honbaEach = ctx.honba * (ctx.honbaStick / (n - 1)); // = honba × 100（四麻/三麻）
  let tsumoSum = 0;
  for (let o = 0; o < n; o++) {
    if (o === winner) continue;
    const mult = winner === ctx.dealer ? 2 : o === ctx.dealer ? 2 : 1;
    const pay = rup(base * mult);
    add(items, o, '自摸', -pay);
    add(items, o, '本场', -honbaEach);
    tsumoSum += pay;
  }
  add(items, winner, '自摸', tsumoSum);
  add(items, winner, '本场', honbaTotal);
  add(items, winner, '供托', ctx.riichiSticks * 1000);
  return resultOf(items, n);
}

/** 不听罚符：不听者共凑 notenBappu，由听牌者均分；全听/全不听则无。 */
export function settleNoten(ctx: RoundContext, tenpai: boolean[], notenBappu = 3000): SettleResult {
  const n = ctx.mode;
  const items: SettleItem[] = [];
  const tenpaiCount = tenpai.filter((v) => v).length;
  const notenCount = tenpai.filter((v) => !v).length;
  if (tenpaiCount === 0 || notenCount === 0) return resultOf(items, n);

  const perTenpai = notenBappu / tenpaiCount;
  const perNoten = notenBappu / notenCount;
  for (let i = 0; i < n; i++) {
    if (tenpai[i]) add(items, i, '罚符', perTenpai);
    else add(items, i, '罚符', -perNoten);
  }
  return resultOf(items, n);
}

/** 罚符：被罚者付 amount，均分给其他玩家，余数归庄家。 */
export function settleChombo(ctx: RoundContext, chombo: number, amount: number): SettleResult {
  const n = ctx.mode;
  const items: SettleItem[] = [];
  const each = Math.floor(amount / (n - 1) / 100) * 100;
  const rest = amount - each * (n - 1);
  add(items, chombo, '罚符', -amount);
  for (let o = 0; o < n; o++) {
    if (o === chombo) continue;
    add(items, o, '罚符', each + (o === ctx.dealer ? rest : 0));
  }
  return resultOf(items, n);
}
