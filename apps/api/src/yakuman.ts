import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { prisma } from './db';
import { authMiddleware, type Variables } from './auth';
import { YAKUMAN_TYPES, YAKUMAN_OTHER } from '@riichi/rules';

const PHOTO_DIR = process.env.PHOTO_DIR ?? './data/yakuman';
const PHOTO_RE = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i;
const EXT = { jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp' } as const;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 单张 ≤5MB

export const yakuman = new Hono<{ Variables: Variables }>();
yakuman.use('*', authMiddleware);

// 记录役满：雀士 + 役种 + 发生时刻 + 照片（base64 data URL 1~3 张）
yakuman.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { playerId, yakumanType, yakumanTypeCustom, occurredAt, photos } = body ?? {};

  if (!playerId) return c.json({ error: '需选择雀士' }, 400);
  if (!yakumanType) return c.json({ error: '需选择役满役种' }, 400);
  if (!YAKUMAN_TYPES.includes(yakumanType) && yakumanType !== YAKUMAN_OTHER) return c.json({ error: '无效的役满役种' }, 400);
  if (yakumanType === YAKUMAN_OTHER && !yakumanTypeCustom?.trim()) return c.json({ error: '「其它」需填写具体役满名称' }, 400);
  if (!Array.isArray(photos) || photos.length < 1 || photos.length > 3) return c.json({ error: '照片需 1~3 张' }, 400);

  const occurred = occurredAt ? new Date(occurredAt) : new Date();
  if (isNaN(occurred.getTime())) return c.json({ error: '时间无效' }, 400);

  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player) return c.json({ error: '雀士不存在' }, 404);

  await mkdir(PHOTO_DIR, { recursive: true });
  const files: string[] = [];
  for (const p of photos) {
    const m = PHOTO_RE.exec(String(p));
    if (!m) return c.json({ error: '照片需为 jpg/png 的 data URL' }, 400);
    const ext = EXT[m[1] as keyof typeof EXT];
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX_PHOTO_BYTES) return c.json({ error: '单张照片超过 5MB' }, 400);
    const name = `${randomBytes(12).toString('hex')}-${files.length}.${ext}`;
    await writeFile(path.join(PHOTO_DIR, name), buf);
    files.push(name);
  }

  const rec = await prisma.yakuman.create({
    data: {
      playerId,
      yakumanType,
      yakumanTypeCustom: yakumanType === YAKUMAN_OTHER ? yakumanTypeCustom.trim() : null,
      occurredAt: occurred,
      photos: files,
      creatorUserId: user.id,
    },
    include: { player: true, creator: { select: { username: true } } },
  });
  return c.json(rec, 201);
});

// 役满墙列表：发生时刻倒序，offset 分页
yakuman.get('/', async (c) => {
  const skip = Math.max(0, Number(c.req.query('skip') ?? 0));
  const take = Math.min(50, Math.max(1, Number(c.req.query('take') ?? 20)));
  const list = await prisma.yakuman.findMany({
    orderBy: { occurredAt: 'desc' },
    skip,
    take,
    include: { player: true, creator: { select: { username: true } } },
  });
  return c.json(list);
});

// 出图：GET /api/yakuman/photos/:file
yakuman.get('/photos/:file', async (c) => {
  const file = c.req.param('file');
  if (!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(file)) return c.json({ error: '无效文件名' }, 400);
  const p = path.join(PHOTO_DIR, file);
  if (!existsSync(p)) return c.json({ error: '照片不存在' }, 404);
  const buf = await readFile(p);
  const type = file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  return new Response(buf, { status: 200, headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' } });
});

// 删除：仅上传者
yakuman.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const rec = await prisma.yakuman.findUnique({ where: { id } });
  if (!rec) return c.json({ error: '记录不存在' }, 404);
  if (rec.creatorUserId !== user.id) return c.json({ error: '只能删除自己上传的役满' }, 403);
  for (const f of rec.photos) {
    try { await unlink(path.join(PHOTO_DIR, f)); } catch { /* ignore */ }
  }
  await prisma.yakuman.delete({ where: { id } });
  return c.json({ ok: true });
});
