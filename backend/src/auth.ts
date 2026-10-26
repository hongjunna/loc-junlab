import crypto from 'crypto';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { config } from './config';
import { HttpError } from './http';

// 외부 의존성 없이 HMAC 서명 토큰을 사용 ("만료시각.서명")
const sign = (payload: string) =>
  crypto.createHmac('sha256', config.authSecret).update(payload).digest('base64url');

export const issueToken = () => {
  const exp = Date.now() + config.authTtlHours * 60 * 60 * 1000;
  return { token: `${exp}.${sign(String(exp))}`, expiresAt: new Date(exp) };
};

export const verifyToken = (token: string) => {
  const [exp, signature] = token.split('.');
  if (!exp || !signature) return false;
  const expected = sign(exp);
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return false;
  }
  return Number(exp) > Date.now();
};

const safeEqual = (a: string, b: string) => {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !verifyToken(token)) {
    throw new HttpError(401, '로그인이 필요합니다.');
  }
  next();
};

// 무차별 대입 방지용 간단한 IP별 실패 횟수 제한
const failures = new Map<string, { count: number; until: number }>();
const MAX_FAILURES = 5;
const LOCK_MS = 5 * 60 * 1000;

const loginSchema = z.object({ password: z.string().min(1) });

export const authRouter = Router();

authRouter.post('/auth/login', (req, res) => {
  const ip = req.ip || 'unknown';
  const record = failures.get(ip);
  if (record && record.until > Date.now()) {
    throw new HttpError(429, '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.');
  }

  const { password } = loginSchema.parse(req.body);
  if (!safeEqual(password, config.adminPassword)) {
    const count = (record?.count || 0) + 1;
    failures.set(ip, {
      count,
      until: count >= MAX_FAILURES ? Date.now() + LOCK_MS : 0,
    });
    throw new HttpError(401, '비밀번호가 올바르지 않습니다.');
  }

  failures.delete(ip);
  res.json(issueToken());
});

authRouter.get('/auth/me', requireAuth, (_req, res) => {
  res.json({ ok: true });
});
