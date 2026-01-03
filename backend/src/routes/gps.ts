import { Router } from 'express';
import mongoose from 'mongoose';

const gps_router = Router();

gps_router.post('/gps/log', async (req, res) => {
  try {
    const logData = {
      ...req.body,
      receivedAt: new Date(), // 서버 수신 시간 기록
    };

    // Mongoose 모델을 거치지 않고 MongoDB 컬렉션에 직접 접근하여 저장
    await mongoose.connection.collection('gps_logs').insertOne(logData);
    res.status(201).json({ message: 'Data saved successfully' });
  } catch (err) {
    console.error('GPS logging failed:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default gps_router;

