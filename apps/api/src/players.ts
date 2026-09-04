import { Hono } from 'hono';
import { prisma } from './db';
import { authMiddleware, type Variables } from './auth';

export const players = new Hono<{ Variables: Variables }>();
players.use('*', authMiddleware);

// 搜索雀士；?unbound=1 只看未绑定的（用于「绑定雀士」）
players.get('/', async (c) => {
  const q = c.req.query('q') ?? '';
  const unbound = c.req.query('unbound') === '1';
  const list = await prisma.player.findMany({
    where: {
      ...(q ? { name: { contains: q } } : {}),
      ...(unbound ? { boundUserId: null } : {}),
    },
    orderBy: { name: 'asc' },
    take: 100,
  });
  return c.json(list);
});

// 创建雀士（自动绑定给当前用户）
players.post('/', async (c) => {
  const user = c.get('user');
  const { name, avatar } = await c.req.json();
  if (!name) return c.json({ error: '名称必填' }, 400);
  const player = await prisma.player.create({
    data: { name, avatar: avatar ?? null, boundUserId: user.id },
  });
  return c.json(player, 201);
});

// 编辑（仅限自己绑定）
players.patch('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { name, avatar } = await c.req.json();
  const player = await prisma.player.findUnique({ where: { id } });
  if (!player || player.boundUserId !== user.id) return c.json({ error: '只能编辑自己绑定的雀士' }, 403);
  const updated = await prisma.player.update({
    where: { id },
    data: { ...(name ? { name } : {}), ...(avatar !== undefined ? { avatar } : {}) },
  });
  return c.json(updated);
});

// 解绑（释放所有权，雀士仍在全局注册表）
players.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const player = await prisma.player.findUnique({ where: { id } });
  if (!player || player.boundUserId !== user.id) return c.json({ error: '只能解绑自己的雀士' }, 403);
  await prisma.player.update({ where: { id }, data: { boundUserId: null } });
  return c.json({ ok: true });
});

// 绑定一个未绑定的雀士（获得所有权）
players.post('/:id/bind', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const player = await prisma.player.findUnique({ where: { id } });
  if (!player) return c.json({ error: '雀士不存在' }, 404);
  if (player.boundUserId) return c.json({ error: '该雀士已被绑定' }, 409);
  await prisma.player.update({ where: { id }, data: { boundUserId: user.id } });
  return c.json({ ok: true });
});
