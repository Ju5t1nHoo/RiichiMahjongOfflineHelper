import { Hono } from 'hono';
import { prisma } from './db';
import { authMiddleware, type Variables } from './auth';

export const stats = new Hono<{ Variables: Variables }>();
stats.use('*', authMiddleware);

interface Agg {
  playerId: string;
  name: string;
  avatar: string | null;
  games: number;
  rankSum: number;
  dist: number[];
  total: number;
  net: number;
  tobi: number;
  avgRank: number;
}

async function aggregate(mode: number, playerId?: string): Promise<Agg[]> {
  const rows = await prisma.gameParticipant.findMany({
    where: {
      game: { status: 'FINISHED', mode },
      playerId: playerId ?? { not: null },
    },
    include: { player: true, game: { select: { ruleSnapshot: true } } },
  });
  const map = new Map<string, Agg>();
  for (const r of rows) {
    if (!r.playerId || !r.player) continue;
    let agg = map.get(r.playerId);
    if (!agg) {
      agg = { playerId: r.playerId, name: r.player.name, avatar: r.player.avatar, games: 0, rankSum: 0, dist: [0, 0, 0, 0], total: 0, net: 0, tobi: 0, avgRank: 0 };
      map.set(r.playerId, agg);
    }
    agg.games++;
    if (r.rank != null) {
      agg.rankSum += r.rank;
      if (r.rank >= 1 && r.rank <= 4) agg.dist[r.rank - 1]++;
    }
    if (r.finalScore != null) agg.total += Number(r.finalScore);
    if (r.finalRawScore != null) {
      const oka = (r.game.ruleSnapshot as { oka?: number } | null)?.oka ?? 30000;
      agg.net += (r.finalRawScore - oka) / 1000;
      if (r.finalRawScore < 0) agg.tobi++;
    }
  }
  return [...map.values()].map((a) => ({ ...a, avgRank: a.games ? a.rankSum / a.games : 0 }));
}

// 手级指标：和牌/自摸/荣和/放铳/立直/平均番（解析 Settlement.detail 的座位信息）
async function handStats(playerId: string, mode: number) {
  const parts = await prisma.gameParticipant.findMany({
    where: { playerId, game: { status: 'FINISHED', mode } },
    select: { gameId: true, seat: true },
  });
  const seatByGame = new Map(parts.map((p) => [p.gameId, p.seat]));
  const settlements = await prisma.settlement.findMany({
    where: { gameId: { in: [...seatByGame.keys()] } },
    select: { gameId: true, type: true, han: true, detail: true },
  });

  let hands = 0, win = 0, tsumo = 0, ron = 0, dealIn = 0, riichi = 0, hanSum = 0, winHands = 0;
  for (const s of settlements) {
    const seat = seatByGame.get(s.gameId);
    if (seat == null) continue;
    hands++;
    const d = s.detail as any;
    const inRiichi = Array.isArray(d?.riichi) && d.riichi.includes(seat);
    if (inRiichi) riichi++;
    if (s.type === 'RON') {
      const winners: any[] = Array.isArray(d?.winners) ? d.winners : [];
      const me = winners.find((w) => (typeof w === 'number' ? w === seat : w?.seat === seat));
      if (me != null) {
        win++; ron++;
        hanSum += typeof me === 'number' ? (s.han ?? 0) : (me.han ?? 0);
        winHands++;
      }
      if (d?.discarder === seat) dealIn++;
    } else if (s.type === 'TSUMO' && d?.winner === seat) {
      win++; tsumo++; hanSum += s.han ?? 0; winHands++;
    }
  }
  return { hands, win, tsumo, ron, dealIn, riichi, hanSum, winHands };
}

// 排行榜：默认总得点降序，可切换平均顺位（升）/ 牌局数（降）
stats.get('/players', async (c) => {
  const mode = Number(c.req.query('mode') ?? 4);
  const sort = c.req.query('sort') ?? 'total';
  const list = await aggregate(mode);
  list.sort((a, b) => (sort === 'avgRank' ? a.avgRank - b.avgRank : b[sort as 'total' | 'games'] - a[sort as 'total' | 'games']));
  return c.json(list);
});

// 雀士详情：牌局级 + 手级
stats.get('/players/:id', async (c) => {
  const id = c.req.param('id');
  const mode = Number(c.req.query('mode') ?? 4);
  const found = (await aggregate(mode, id))[0];
  if (!found) return c.json({ error: '雀士不存在或无数据' }, 404);

  const player = await prisma.player.findUnique({ where: { id } });
  const boundUser = player?.boundUserId
    ? await prisma.user.findUnique({ where: { id: player.boundUserId }, select: { username: true, signature: true } })
    : null;

  const hs = await handStats(id, mode);
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
  return c.json({
    ...found,
    boundUser,
    net: Math.round(found.net * 10) / 10,
    hands: hs.hands,
    win: hs.win,
    winRate: pct(hs.win, hs.hands),
    tsumo: hs.tsumo,
    tsumoRate: pct(hs.tsumo, hs.win),
    ron: hs.ron,
    dealIn: hs.dealIn,
    dealInRate: pct(hs.dealIn, hs.hands),
    riichi: hs.riichi,
    riichiRate: pct(hs.riichi, hs.hands),
    avgHan: hs.winHands ? Math.round((hs.hanSum / hs.winHands) * 10) / 10 : 0,
  });
});
