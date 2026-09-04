import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { prisma } from './db';
import { authMiddleware, type Variables } from './auth';

export const me = new Hono<{ Variables: Variables }>();
me.use('*', authMiddleware);

// 更新个性签名（≤100 字）
me.patch('/signature', async (c) => {
  const user = c.get('user');
  const { signature } = await c.req.json();
  if (typeof signature !== 'string' || signature.length > 100) {
    return c.json({ error: '签名需为 ≤100 字的文本' }, 400);
  }
  const updated = await prisma.user.update({ where: { id: user.id }, data: { signature } });
  return c.json({ id: updated.id, username: updated.username, signature: updated.signature });
});

// 修改密码（需验证旧密码）
me.post('/password', async (c) => {
  const user = c.get('user');
  const { oldPassword, newPassword } = await c.req.json();
  if (!oldPassword || !newPassword) return c.json({ error: '旧密码和新密码必填' }, 400);
  const u = await prisma.user.findUnique({ where: { id: user.id } });
  if (!u || !(await bcrypt.compare(oldPassword, u.passwordHash))) {
    return c.json({ error: '旧密码错误' }, 401);
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  return c.json({ ok: true });
});

// 规则默认设置（按四人/三人/二人保存）
me.get('/rules', async (c) => {
  const u = await prisma.user.findUnique({ where: { id: c.get('user').id } });
  return c.json((u?.ruleDefaults as Record<string, unknown>) ?? {});
});

me.put('/rules', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  await prisma.user.update({ where: { id: user.id }, data: { ruleDefaults: body } });
  return c.json({ ok: true });
});
