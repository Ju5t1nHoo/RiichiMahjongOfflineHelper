import { Hono } from 'hono';
import { prisma } from './db';
import { authMiddleware, type Variables } from './auth';
import { settleRon, settleTsumo, settleNoten, settleChombo, type RoundContext, type RonWinner } from '@riichi/rules';

export const games = new Hono<{ Variables: Variables }>();
games.use('*', authMiddleware);

// 开局：创建牌局（进行中），participants: [{ seat, playerId?, tempName? }]
games.post('/', async (c) => {
  const user = c.get('user');
  const { mode, ruleSnapshot, participants, liveState } = await c.req.json();
  if (!mode || !ruleSnapshot || !Array.isArray(participants)) {
    return c.json({ error: '缺少 mode / ruleSnapshot / participants' }, 400);
  }
  const game = await prisma.game.create({
    data: {
      creatorUserId: user.id,
      mode,
      ruleSnapshot,
      liveState: liveState ?? null,
      status: 'PLAYING',
      participants: {
        create: participants.map((p: any) => ({
          seat: p.seat,
          playerId: p.playerId ?? null,
          tempName: p.tempName ?? null,
        })),
      },
    },
    include: { participants: true },
  });
  return c.json(game, 201);
});

// 我的创建（含进行中/已终局）
games.get('/mine', async (c) => {
  const user = c.get('user');
  const mode = c.req.query('mode');
  const list = await prisma.game.findMany({
    where: { creatorUserId: user.id, ...(mode ? { mode: Number(mode) } : {}) },
    orderBy: { createdAt: 'desc' },
    include: { participants: { include: { player: true } } },
  });
  return c.json(list);
});

// 数据广场（已终局，时间倒序）
games.get('/feed', async (c) => {
  const mode = c.req.query('mode');
  const list = await prisma.game.findMany({
    where: { status: 'FINISHED', ...(mode ? { mode: Number(mode) } : {}) },
    orderBy: { endedAt: 'desc' },
    include: {
      participants: { include: { player: true } },
      creator: { select: { username: true } },
    },
  });
  return c.json(list);
});

// 牌局详情（含逐局结算）
games.get('/:id', async (c) => {
  const id = c.req.param('id');
  const game = await prisma.game.findUnique({
    where: { id },
    include: {
      participants: { include: { player: true } },
      settlements: { orderBy: { seq: 'asc' } },
      creator: { select: { username: true } },
    },
  });
  if (!game) return c.json({ error: '牌局不存在' }, 404);
  return c.json(game);
});

// 终局 / 恢复：改状态 + 写入终局素点/得点/顺位
games.patch('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { status, participants } = await c.req.json();
  const game = await prisma.game.findUnique({ where: { id } });
  if (!game || game.creatorUserId !== user.id) return c.json({ error: '无权限' }, 403);

  if (participants) {
    for (const p of participants) {
      await prisma.gameParticipant.update({
        where: { id: p.id },
        data: {
          finalRawScore: p.finalRawScore,
          finalScore: p.finalScore,
          rank: p.rank,
        },
      });
    }
  }
  const updated = await prisma.game.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(status === 'FINISHED' ? { endedAt: new Date() } : {}),
    },
  });
  return c.json(updated);
});

// 追加一条结算：用 @riichi/rules 复核点数并落库
games.post('/:id/settlements', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const game = await prisma.game.findUnique({ where: { id }, include: { participants: true } });
  if (!game || game.creatorUserId !== user.id) return c.json({ error: '无权限' }, 403);

  const body = await c.req.json();
  const ctx: RoundContext = {
    mode: game.mode as 4 | 3 | 2,
    dealer: body.dealer,
    honba: body.honba ?? 0,
    riichiSticks: body.riichiSticks ?? 0,
    honbaStick: game.mode === 3 ? 200 : 300,
  };

  let deltas: number[] = new Array(game.mode).fill(0);
  let han: number | null = null;
  let fu: number | null = null;
  if (body.type === 'RON') {
    const winners: RonWinner[] = Array.isArray(body.winners) ? body.winners : [];
    const r = settleRon(ctx, winners, body.discarder, body.kiriage);
    deltas = r.deltas;
    han = winners[0]?.han ?? null;
    fu = winners[0]?.fu ?? null;
  } else if (body.type === 'TSUMO') {
    deltas = settleTsumo(ctx, body.winner, body.han, body.fu, body.kiriage).deltas;
    han = body.han ?? null;
    fu = body.fu ?? null;
  } else if (body.type === 'DRAW') {
    if (body.subType === 'NOTEN') deltas = settleNoten(ctx, body.tenpai).deltas;
    else if (body.subType === 'NAGASHI_MANGAN') deltas = settleTsumo(ctx, body.winner, 5, 0).deltas; // 满贯自摸
    // ABORTIVE（途中流局）：不结算，deltas 全 0
  } else if (body.type === 'CHOMBO') {
    deltas = settleChombo(ctx, body.chombo, body.amount).deltas;
  }

  const seq = body.seq ?? (await prisma.settlement.count({ where: { gameId: id } })) + 1;
  const settlement = await prisma.settlement.create({
    data: {
      gameId: id,
      seq,
      type: body.type,
      subType: body.subType ?? null,
      han,
      fu,
      honba: body.honba ?? 0,
      detail: { ...body, deltas },
    },
  });
  if (body.liveState) {
    await prisma.game.update({ where: { id }, data: { liveState: body.liveState } });
  }
  return c.json(settlement, 201);
});
