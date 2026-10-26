import crypto from 'crypto';
import { Router, type Request, type RequestHandler } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { config } from './config';
import { HttpError, notFound } from './http';
import { Member } from './models/member';

export interface AuthUser {
  method: 'password' | 'google';
  email?: string;
  name?: string;
  picture?: string;
}

interface TokenPayload extends AuthUser {
  exp: number;
}

// 외부 의존성 없이 HMAC 서명 토큰을 사용 ("base64url(payload).서명")
const sign = (data: string) =>
  crypto.createHmac('sha256', config.authSecret).update(data).digest('base64url');

export const issueToken = (user: AuthUser) => {
  const exp = Date.now() + config.authTtlHours * 60 * 60 * 1000;
  const data = Buffer.from(JSON.stringify({ ...user, exp } satisfies TokenPayload)).toString(
    'base64url'
  );
  return { token: `${data}.${sign(data)}`, expiresAt: new Date(exp), user };
};

export const verifyToken = (token: string): TokenPayload | null => {
  const [data, signature] = token.split('.');
  if (!data || !signature) return null;
  const expected = sign(data);
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString()) as TokenPayload;
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
};

export const currentUser = (req: Request) => (req as Request & { user?: AuthUser }).user;

// 기록에 남길 사용자 표시
export const userLabel = (user?: AuthUser) =>
  user ? { method: user.method, email: user.email, name: user.name } : undefined;

const safeEqual = (a: string, b: string) => {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = token ? verifyToken(token) : null;
  if (!payload) throw new HttpError(401, '로그인이 필요합니다.');
  (req as Request & { user?: AuthUser }).user = payload;
  next();
};

// 무차별 대입 방지용 간단한 IP별 실패 횟수 제한
const failures = new Map<string, { count: number; until: number }>();
const MAX_FAILURES = 5;
const LOCK_MS = 5 * 60 * 1000;

const checkLock = (ip: string) => {
  const record = failures.get(ip);
  if (record && record.until > Date.now()) {
    throw new HttpError(429, '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.');
  }
};

const recordFailure = (ip: string) => {
  const count = (failures.get(ip)?.count || 0) + 1;
  failures.set(ip, { count, until: count >= MAX_FAILURES ? Date.now() + LOCK_MS : 0 });
};

const googleClient = config.googleClientId ? new OAuth2Client(config.googleClientId) : null;

const isAllowedEmail = async (email: string) =>
  config.adminEmails.includes(email) || !!(await Member.exists({ email }));

export const authRouter = Router();

// 로그인 화면에서 사용할 수 있는 로그인 방식
authRouter.get('/auth/config', (_req, res) => {
  res.json({
    password: !!config.adminPassword,
    googleClientId: config.googleClientId || null,
  });
});

authRouter.post('/auth/login', (req, res) => {
  if (!config.adminPassword) throw new HttpError(400, '비밀번호 로그인이 비활성화되어 있습니다.');
  const ip = req.ip || 'unknown';
  checkLock(ip);
  const { password } = z.object({ password: z.string().min(1) }).parse(req.body);
  if (!safeEqual(password, config.adminPassword)) {
    recordFailure(ip);
    throw new HttpError(401, '비밀번호가 올바르지 않습니다.');
  }
  failures.delete(ip);
  res.json(issueToken({ method: 'password', name: '관리자(비밀번호)' }));
});

// 구글 ID 토큰(Google Identity Services credential)을 검증하고 로그인
authRouter.post('/auth/google', async (req, res) => {
  if (!googleClient) throw new HttpError(400, '구글 로그인이 설정되어 있지 않습니다.');
  const ip = req.ip || 'unknown';
  checkLock(ip);
  const { credential } = z.object({ credential: z.string().min(1) }).parse(req.body);

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: config.googleClientId,
    });
    payload = ticket.getPayload();
  } catch {
    recordFailure(ip);
    throw new HttpError(401, '구글 인증 정보를 확인할 수 없습니다.');
  }
  const email = payload?.email?.toLowerCase();
  if (!payload || !email || !payload.email_verified) {
    throw new HttpError(401, '이메일이 확인된 구글 계정만 사용할 수 있습니다.');
  }
  if (!(await isAllowedEmail(email))) {
    recordFailure(ip);
    throw new HttpError(403, `${email} 계정은 등록되지 않았습니다. 관리자에게 등록을 요청하세요.`);
  }

  failures.delete(ip);
  await Member.updateOne({ email }, { $set: { lastLoginAt: new Date(), name: payload.name } });
  res.json(issueToken({ method: 'google', email, name: payload.name, picture: payload.picture }));
});

authRouter.get('/auth/me', requireAuth, (req, res) => {
  res.json(currentUser(req));
});

// 구글 로그인 허용 사용자 관리
export const memberRouter = Router();

memberRouter.get('/members', async (_req, res) => {
  const members = await Member.find().sort({ createdAt: -1 }).lean();
  res.json({ admins: config.adminEmails, members, googleEnabled: !!config.googleClientId });
});

memberRouter.post('/members', async (req, res) => {
  const { email, name } = z
    .object({
      email: z.string().trim().toLowerCase().email('이메일 형식이 아닙니다.'),
      name: z.string().trim().optional(),
    })
    .parse(req.body);
  if (config.adminEmails.includes(email) || (await Member.exists({ email }))) {
    throw new HttpError(409, '이미 등록된 이메일입니다.');
  }
  const user = currentUser(req);
  const member = await Member.create({ email, name, addedBy: user?.email || user?.name });
  res.status(201).json(member);
});

memberRouter.delete('/members/:id', async (req, res) => {
  const member = await Member.findByIdAndDelete(req.params.id);
  if (!member) throw notFound('사용자');
  res.json({ message: '삭제되었습니다.' });
});
