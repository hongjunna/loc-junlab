import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import routeRoutes from './routes/route';
import * as dotenv from 'dotenv'; // 추가

dotenv.config(); // .env 파일의 내용을 process.env에 로드

const app = express();
app.use(cors());
app.use(express.json());

// 몽고DB 연결 (도커 컨테이너 이름이 'mongodb'라고 가정)
const MONGO_URI =
  process.env.MONGO_URI || 'mongodb://localhost:27017/bus-project';

mongoose
  .connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected...'))
  .catch((err) => console.log('❌ MongoDB Connection Error:', err));

// 기본 라우트
app.get('/', (req, res) => res.send('Bus Tracking Server Running'));
app.use('/api', routeRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

