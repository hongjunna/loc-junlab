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
app.get('/api/health', (_req, res) => {
  const dbOk = mongoose.connection.readyState === 1;
  res.status(dbOk ? 200 : 503).json({ ok: dbOk });
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

const start = async () => {
  await mongoose.connect(config.mongoUri);
  console.log('✅ MongoDB Connected');

  await closeStaleDrives();
  setInterval(() => closeStaleDrives().catch(console.error), 10 * 60 * 1000);

  app.listen(config.port, () => {
    console.log(`🚗 Server is running on port ${config.port}`);
  });
};

start().catch((err) => {
  console.error('❌ 서버 시작 실패:', err);
  process.exit(1);
});
