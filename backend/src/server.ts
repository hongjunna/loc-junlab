import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import { config } from './config';
import { authRouter, memberRouter, requireAuth } from './auth';
import { errorHandler } from './http';
import routeRoutes from './routes/route';
import driveRoutes from './routes/drive';
import publicRoutes from './routes/public';
import ogRoutes from './routes/og';
import { traccarIngestRouter, trackerAdminRouter } from './routes/tracker';
import { closeStaleDrives } from './services/drive';

const app = express();
// Nginx(로컬/도커 사설망) 뒤에서 실제 클라이언트 IP 사용. 외부에서 보낸 X-Forwarded-For 는 신뢰하지 않음
app.set('trust proxy', 'loopback, linklocal, uniquelocal');
app.use(cors({ origin: config.corsOrigins.length > 0 ? config.corsOrigins : false }));
app.use(express.json({ limit: '1mb' }));
// Traccar Client(OsmAnd 프로토콜)는 form 본문으로 보낼 수 있음
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// 헬스체크 (배포 스크립트에서 사용)
const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

app.get('/api/health', (_req, res) => {
  const state = mongoose.connection.readyState as number;
  res.status(state === 1 ? 200 : 503).json({ ok: state === 1, db: DB_STATES[state] ?? 'unknown' });
});

// 공개 API (승객용)
app.use('/api', authRouter);
app.use('/api', publicRoutes);
app.use('/api', ogRoutes);
app.use('/api', traccarIngestRouter);

// 관리자/운전자 API
app.use('/api', requireAuth, routeRoutes);
app.use('/api', requireAuth, driveRoutes);
app.use('/api', requireAuth, trackerAdminRouter);
app.use('/api', requireAuth, memberRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: '존재하지 않는 API입니다.' });
});
app.use(errorHandler);

// 로그에 접속 대상만 남기고 비밀번호는 가림
const describeMongo = (uri: string) => {
  try {
    const u = new URL(uri);
    return `${u.protocol}//${u.username ? `${decodeURIComponent(u.username)}:****@` : ''}${u.host}${u.pathname}`;
  } catch {
    return '(MONGO_URI 형식 오류)';
  }
};

// 흔한 연결 실패 원인을 한국어로 안내
const mongoHint = (err: unknown) => {
  const msg = String((err as Error)?.message || err);
  if (/auth|Authentication failed/i.test(msg))
    return '아이디/비밀번호가 틀렸거나 authSource 가 맞지 않습니다. 비밀번호를 바꿨다면 .env 의 MONGO_URI 도 바꿨는지, 특수문자를 URL 인코딩(! → %21)했는지 확인하세요.';
  if (/ENOTFOUND|getaddrinfo/i.test(msg))
    return 'DB 호스트 이름을 찾을 수 없습니다. 주소 오타나 DNS 를 확인하세요.';
  if (/ECONNREFUSED/i.test(msg))
    return 'DB 포트에 연결이 거부되었습니다. 같은 서버의 DB라면 컨테이너 안에서 localhost 는 자기 자신이므로 host.docker.internal 이나 서버 IP를 쓰세요.';
  if (/timed out|Server selection/i.test(msg))
    return 'DB 응답이 없습니다. 방화벽/보안그룹에서 이 서버의 접속을 허용했는지, 포트가 맞는지 확인하세요.';
  if (/Invalid scheme|URI/i.test(msg))
    return 'MONGO_URI 형식이 잘못되었습니다. (따옴표·공백 포함 여부 확인)';
  return '';
};

const start = async () => {
  // DB 연결 전에 먼저 서버를 띄워 헬스체크가 상태(db: connecting)를 알 수 있게 함
  app.listen(config.port, () => {
    console.log(`🚗 Server is running on port ${config.port}`);
  });

  console.log(`⏳ MongoDB 연결 중: ${describeMongo(config.mongoUri)}`);
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10_000 });
  } catch (err) {
    console.error(`❌ MongoDB 연결 실패: ${(err as Error).message}`);
    const hint = mongoHint(err);
    if (hint) console.error(`💡 ${hint}`);
    process.exit(1);
  }
  console.log('✅ MongoDB Connected');

  await closeStaleDrives();
  setInterval(() => closeStaleDrives().catch(console.error), 10 * 60 * 1000);
};

start().catch((err) => {
  console.error('❌ 서버 시작 실패:', err);
  process.exit(1);
});
