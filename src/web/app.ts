import { Hono } from 'hono';
import authRoutes from './routes/auth.js';
import settingsRoutes from './routes/settings.js';
import connectRoutes from './routes/connect.js';
import type { User } from '../db/index.js';

// Variables型を宣言してc.get('user')を型安全にする
export type AppVariables = { user: User };
export type AppEnv = { Variables: AppVariables };

const app = new Hono<AppEnv>();

app.route('/auth', authRoutes);
app.route('/settings', settingsRoutes);
app.route('/connect', connectRoutes);

app.get('/', (c) => c.redirect('/auth/login'));
app.get('/health', (c) => c.json({ status: 'ok' }));

export default app;
