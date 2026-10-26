import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import { config } from './config';
import { authRouter, requireAuth } from './auth';
import { errorHandler } from './http';
import routeRoutes from './routes/route';
import driveRoutes from './routes/drive';
import publicRoutes from './routes/public';
import { closeStaleDrives } from './services/drive';

const app = express();
app.set('trust proxy', true); // Nginx 뒤에서 실제 클라이언트 IP 사용
app.use(cors({ origin: config.corsOrigins.length > 0 ? config.corsOrigins : false }));
app.use(express.json({ limit: '1mb' }));

// 헬스체크 (배포 스크립트에서 사용)
app.get('/api/health', (_req, res) => {
  const dbOk = mongoose.connection.readyState === 1;
  res.status(dbOk ? 200 : 503).json({ ok: dbOk });
});

// 공개 API (승객용)
app.use('/api', authRouter);
app.use('/api', publicRoutes);

// 관리자/운전자 API
app.use('/api', requireAuth, routeRoutes);
app.use('/api', requireAuth, driveRoutes);

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
    console.log(`🚌 Server is running on port ${config.port}`);
  });
};

start().catch((err) => {
  console.error('❌ 서버 시작 실패:', err);
  process.exit(1);
});
