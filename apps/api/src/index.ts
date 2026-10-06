import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { auth, authMiddleware, type Variables } from './auth';
import { me } from './me';
import { players } from './players';
import { games } from './games';
import { stats } from './stats';
import { feedback } from './feedback';
import { yakuman } from './yakuman';

const app = new Hono<{ Variables: Variables }>();

app.get('/api/health', (c) => c.json({ ok: true }));
app.route('/api/auth', auth);

app.use('/api/me', authMiddleware);
app.get('/api/me', (c) => c.json(c.get('user')));
app.route('/api/me', me);

app.route('/api/players', players);
app.route('/api/games', games);
app.route('/api/stats', stats);
app.route('/api/feedback', feedback);
app.route('/api/yakuman', yakuman);

serve({ fetch: app.fetch, port: Number(process.env.PORT) || 3000 }, (info) => {
  console.log(`API listening on port ${info.port}`);
});
