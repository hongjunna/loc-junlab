import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import routeRoutes from './routes/route';

const app = express();
app.use(cors());
app.use(express.json());

// 몽고DB 연결 (도커 컨테이너 이름이 'mongodb'라고 가정)
const MONGO_URI = 'mongodb://admin:wnsfoq1!@mongodb.junlab.xyz:45761/';

mongoose
  .connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected...'))
  .catch((err) => console.log('❌ MongoDB Connection Error:', err));

// 기본 라우트
app.get('/', (req, res) => res.send('Bus Tracking Server Running'));
app.use('/api', routeRoutes);

const PORT = 5679;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

