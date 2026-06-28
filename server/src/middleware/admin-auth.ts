import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export interface AdminRequest extends Request {
  isAdmin?: boolean;
}

export function adminAuth(
  req: AdminRequest,
  res: Response,
  next: NextFunction,
): void {
  // Check session cookie
  const sessionToken =
    req.headers.cookie?.match(/session=[^;]*/)?.[0]?.split('=')[1];

  if (!sessionToken) {
    res.status(401).json({ error: '未登录' });
    return;
  }

  // Basic validation - in production, verify against database
  req.isAdmin = true;
  next();
}

export function getDefaultSystemPrompt(): string {
  return config.defaultSystemPrompt;
}
