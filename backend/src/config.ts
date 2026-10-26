import 'dotenv/config';

const required = (key: string) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`환경변수 ${key}가 설정되지 않았습니다. (.env.example 참고)`);
  }
  return value;
};

export const config = {
  port: Number(process.env.PORT) || 5678,
  mongoUri: required('MONGO_URI'),
  // 관리자/운전자 로그인 비밀번호
  adminPassword: required('ADMIN_PASSWORD'),
  // 토큰 서명용 비밀키
  authSecret: required('AUTH_SECRET'),
  // 토큰 유효기간 (시간)
  authTtlHours: Number(process.env.AUTH_TTL_HOURS) || 24 * 7,
  // 허용할 프론트엔드 origin (쉼표 구분, 비우면 같은 origin만)
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // 이 시간 이상 위치 갱신이 없는 운행은 자동 종료
  staleDriveHours: Number(process.env.STALE_DRIVE_HOURS) || 12,
  // 운행 종료 후 공유 링크가 유효한 시간
  shareExpireHours: Number(process.env.SHARE_EXPIRE_HOURS) || 24,
};
