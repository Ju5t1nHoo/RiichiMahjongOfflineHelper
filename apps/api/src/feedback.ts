import { Hono } from 'hono';
import { prisma } from './db';
import { authMiddleware, type Variables } from './auth';

export const feedback = new Hono<{ Variables: Variables }>();
feedback.use('*', authMiddleware);

feedback.post('/', async (c) => {
  const user = c.get('user');
  const { content, contact } = await c.req.json();
  if (!content) return c.json({ error: '建议内容必填' }, 400);
  const fb = await prisma.feedback.create({
    data: { userId: user.id, content, contact: contact ?? null },
  });
  return c.json(fb, 201);
});
