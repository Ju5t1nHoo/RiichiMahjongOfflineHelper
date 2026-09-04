import { Hono, type Context, type Next } from 'hono';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from './db';

const SESSION_COOKIE = 'riichi_session';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

export type AuthUser = { id: string; username: string; signature: string };
export type Variables = { user: AuthUser };

const setCookie = (c: Context, token: string) => {
  c.header('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${TTL_MS / 1000}`);
};
const getToken = (c: Context) => {
  const m = (c.req.header('cookie') ?? '').match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return m ? m[1] : null;
};

export const auth = new Hono();

auth.post('/register', async (c) => {
  const { username, password } = await c.req.json();
  if (!username || !password) return c.json({ error: '用户名和密码必填' }, 400);
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return c.json({ error: '用户名已存在' }, 409);
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { username, passwordHash } });
  const token = randomBytes(32).toString('hex');
  await prisma.session.create({ data: { token, userId: user.id, expiresAt: new Date(Date.now() + TTL_MS) } });
  setCookie(c, token);
  return c.json({ id: user.id, username: user.username }, 201);
});

auth.post('/login', async (c) => {
  const { username, password } = await c.req.json();
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return c.json({ error: '用户名或密码错误' }, 401);
  }
  const token = randomBytes(32).toString('hex');
  await prisma.session.create({ data: { token, userId: user.id, expiresAt: new Date(Date.now() + TTL_MS) } });
  setCookie(c, token);
  return c.json({ id: user.id, username: user.username });
});

auth.post('/logout', async (c) => {
  const token = getToken(c);
  if (token) await prisma.session.deleteMany({ where: { token } });
  c.header('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
  return c.json({ ok: true });
});

export const authMiddleware = async (c: Context<{ Variables: Variables }>, next: Next) => {
  const token = getToken(c);
  if (token) {
    const session = await prisma.session.findUnique({ where: { token }, include: { user: true } });
    if (session && session.expiresAt > new Date()) {
      c.set('user', { id: session.user.id, username: session.user.username, signature: session.user.signature });
      return next();
    }
  }
  return c.json({ error: '未登录' }, 401);
};
