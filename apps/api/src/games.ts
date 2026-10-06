import { Hono } from 'hono';
import { prisma } from './db';
import { authMiddleware, type Variables } from './auth';
import { settleRon, settleTsumo, settleNoten, settleChombo, finalScores, type RoundContext, type RonWinner, type RuleSnapshot } from '@riichi/rules';

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

// 牌局录分：直接录入终局素点，校验总分并计算得点/顺位后落库（FINISHED）
games.post('/quick', async (c) => {
  const user = c.get('user');
  const { mode, ruleSnapshot, participants } = await c.req.json();
  if (![2, 3, 4].includes(mode)) return c.json({ error: 'mode 必须是 2 / 3 / 4' }, 400);
  const rule = ruleSnapshot as RuleSnapshot;
  if (!rule || !Number.isInteger(rule.startPoints) || rule.startPoints % 100 !== 0) return c.json({ error: '基础分需为 100 的整数倍' }, 400);
  if (!Number.isInteger(rule.oka) || rule.oka % 100 !== 0) return c.json({ error: '返点需为 100 的整数倍' }, 400);
  if (!Array.isArray(rule.uma) || rule.uma.length !== mode || !rule.uma.every((v) => Number.isInteger(v))) return c.json({ error: `马点需为 ${mode} 个整数` }, 400);
  if (!Array.isArray(participants) || participants.length !== mode) return c.json({ error: `参与人数需为 ${mode}` }, 400);

  const seatMap = new Map<number, any>();
  for (const p of participants) {
    if (!Number.isInteger(p.seat) || p.seat < 0 || p.seat >= mode) return c.json({ error: '座位序号无效' }, 400);
    if (seatMap.has(p.seat)) return c.json({ error: '座位重复' }, 400);
    if (!p.playerId) return c.json({ error: '每个座位需选择雀士' }, 400);
    if (!Number.isInteger(p.finalRawScore) || p.finalRawScore % 100 !== 0) return c.json({ error: '素点需为 100 的整数倍' }, 400);
    seatMap.set(p.seat, p);
  }

  const rawScores: number[] = [];
  const playerIds: string[] = [];
  for (let i = 0; i < mode; i++) {
    rawScores.push(seatMap.get(i).finalRawScore);
    playerIds.push(seatMap.get(i).playerId);
  }
  if (new Set(playerIds).size !== mode) return c.json({ error: '同一雀士不能重复占多个座位' }, 400);

  const total = rawScores.reduce((a, b) => a + b, 0);
  const expect = rule.startPoints * mode;
  if (total !== expect) {
    const diff = total - expect;
    return c.json({ error: `总分应为 ${expect}，当前 ${total}，${diff > 0 ? `多 ${diff}` : `少 ${-diff}`}` }, 400);
  }

  const found = await prisma.player.findMany({ where: { id: { in: playerIds } } });
  if (found.length !== mode) return c.json({ error: '存在无效的雀士' }, 400);

  const results = finalScores(rawScores, rule, 0);

  const game = await prisma.game.create({
    data: {
      creatorUserId: user.id,
      mode,
      ruleSnapshot,
      status: 'FINISHED',
      endedAt: new Date(),
      participants: {
        create: rawScores.map((_, i) => ({
          seat: i,
          playerId: playerIds[i],
          finalRawScore: rawScores[i],
          finalScore: results[i].score,
          rank: results[i].rank,
        })),
      },
    },
    include: { participants: { include: { player: true } } },
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
    include: { participants: { include: { player: true } }, _count: { select: { settlements: true } } },
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
      _count: { select: { settlements: true } },
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
