import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { getDb } from '../db';

const router = Router();

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { password } = req.body;

  if (!password) {
    res.status(400).json({ error: '请输入密码' });
    return;
  }

  const hashedPassword = await bcrypt.hash(config.adminPassword, 10);

  // Compare with stored password (we hash the input and compare with stored hash)
  // For simplicity, we compare the raw input against the config password
  const isMatch = await bcrypt.compare(password, hashedPassword);

  // Actually, let's compare directly with config.adminPassword
  // The hashedPassword above was just for bcryptjs usage demonstration
  const directMatch = password === config.adminPassword;

  if (!directMatch) {
    res.status(401).json({ error: '密码错误' });
    return;
  }

  const token = uuidv4();
  const now = Date.now();
  const db = getDb();

  // Clean up expired sessions
  db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(now);

  // Insert new session
  db.prepare(
    'INSERT INTO admin_sessions (token, created_at, expires_at) VALUES (?, ?, ?)',
  ).run(token, now, now + config.sessionMaxAge);

  res.cookie('session', token, {
    httpOnly: true,
    secure: false, // Set to true in production with HTTPS
    sameSite: 'lax',
    maxAge: config.sessionMaxAge,
    path: '/api',
  });

  res.json({ success: true });
});

router.post('/logout', (req: Request, res: Response): void => {
  res.clearCookie('session', { path: '/api' });
  res.json({ success: true });
});

router.get('/session', (req: Request, res: Response): void => {
  const sessionToken =
    req.headers.cookie?.match(/session=[^;]*/)?.[0]?.split('=')[1];

  if (!sessionToken) {
    res.json({ authenticated: false });
    return;
  }

  const db = getDb();
  const now = Date.now();
  const session = db
    .prepare('SELECT * FROM admin_sessions WHERE token = ? AND expires_at > ?')
    .get(sessionToken, now) as { token: string } | undefined;

  if (session) {
    res.json({ authenticated: true });
  } else {
    res.json({ authenticated: false });
  }
});

export default router;
