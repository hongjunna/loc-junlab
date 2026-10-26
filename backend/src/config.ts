import 'dotenv/config';

const fail = (message: string): never => {
  console.error(`❌ 설정 오류: ${message}`);
  process.exit(1);
};

const required = (key: string) => {
  const value = process.env[key];
  if (!value) fail(`환경변수 ${key}가 설정되지 않았습니다. (backend/.env.example 참고)`);
  return value as string;
};

// .env.example 의 예시값(USER, PASSWORD, HOST:PORT)이 남아 있으면 바로 안내
const checkMongoUri = (uri: string) => {
  if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
    fail('MONGO_URI 는 mongodb:// 또는 mongodb+srv:// 로 시작해야 합니다. (앞뒤 따옴표·공백 확인)');
  }
  const placeholders = ['//USER', ':PASSWORD@', '@HOST', ':PORT/'].filter((p) => uri.includes(p));
  if (placeholders.length > 0) {
    fail(
      `MONGO_URI 에 예시값(${placeholders.join(', ')})이 남아 있습니다. 실제 아이디·비밀번호·호스트·포트로 바꿔주세요.`
    );
  }
  return uri;
};

/**
 * MONGO_URI 가 있으면 그대로 (외부 DB), 없으면 docker-compose 의 내장 mongo 서비스 주소를 만든다.
 */
const resolveMongoUri = () => {
  if (process.env.MONGO_URI) return checkMongoUri(process.env.MONGO_URI);
  const user = process.env.MONGO_INITDB_ROOT_USERNAME;
  const password = process.env.MONGO_INITDB_ROOT_PASSWORD;
  if (!user || !password) {
    fail('MONGO_INITDB_ROOT_USERNAME/PASSWORD(내장 DB) 또는 MONGO_URI(외부 DB)를 설정해주세요.');
  }
  const host = process.env.MONGO_HOST || 'mongo:27017';
  const db = process.env.MONGO_DB || 'loc';
  return `mongodb://${encodeURIComponent(user!)}:${encodeURIComponent(password!)}@${host}/${db}?authSource=admin`;
};

const list = (value?: string) =>
  (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  port: Number(process.env.PORT) || 5678,
  mongoUri: resolveMongoUri(),
  // 토큰 서명용 비밀키
  authSecret: required('AUTH_SECRET'),
  // 비밀번호 로그인 (비우거나 예시값 그대로면 비활성화)
  adminPassword: process.env.ADMIN_PASSWORD === 'change-me' ? '' : process.env.ADMIN_PASSWORD || '',
  // 구글 로그인 OAuth 클라이언트 ID (비우면 구글 로그인 비활성화)
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  // 항상 로그인을 허용할 구글 계정 (쉼표 구분). 화면에서 추가한 사용자와 함께 허용됨
  adminEmails: list(process.env.ADMIN_EMAILS).map((e) => e.toLowerCase()),
  // 토큰 유효기간 (시간)
  authTtlHours: Number(process.env.AUTH_TTL_HOURS) || 24 * 7,
  // 허용할 프론트엔드 origin (쉼표 구분, 비우면 같은 origin만)
  corsOrigins: list(process.env.CORS_ORIGINS),
  // 공유 링크 미리보기(OG)에 쓸 서비스 주소. 비우면 요청 주소 기준
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/$/, ''),
  // 이 시간 이상 위치 갱신이 없는 운행은 자동 종료
  staleDriveHours: Number(process.env.STALE_DRIVE_HOURS) || 12,
  // 운행 종료 후 공유 링크가 유효한 시간
  shareExpireHours: Number(process.env.SHARE_EXPIRE_HOURS) || 24,
};

if (!config.adminPassword && !config.googleClientId) {
  throw new Error(
    'ADMIN_PASSWORD 또는 GOOGLE_CLIENT_ID 중 하나 이상을 설정해야 로그인할 수 있습니다.'
  );
}
if (config.googleClientId && config.adminEmails.length === 0) {
  console.warn(
    '⚠️ GOOGLE_CLIENT_ID 가 설정됐지만 ADMIN_EMAILS 가 비어 있습니다. 화면에서 추가한 사용자만 구글 로그인할 수 있습니다.'
  );
}
