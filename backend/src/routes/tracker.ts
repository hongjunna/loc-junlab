import crypto from 'crypto';
import { Router } from 'express';
import { currentUser } from '../auth';
import { notFound } from '../http';
import { DriveLog } from '../models/drive_log';
import { Tracker } from '../models/tracker';
import { hydrateLegacyCheckpoints, ingestLocation } from '../services/drive';
import { parseTraccarRequest } from '../services/traccar';
import { trackerSchema } from '../validation';

// 앱에 직접 입력하기 쉽도록 소문자+숫자 (헷갈리는 0/o, 1/l/i 제외)
const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const ID_LENGTH = 12;
// 휴대폰과 서버의 시계 차이 허용 범위
const CLOCK_SKEW_MS = 3 * 60 * 1000;

const generateDeviceId = async () => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const bytes = crypto.randomBytes(ID_LENGTH);
    const id = Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
    if (!(await Tracker.exists({ deviceId: id }))) return id;
  }
  throw new Error('기기 ID 생성 실패');
};

// ---------- 관리 API (로그인 필요) ----------
export const trackerAdminRouter = Router();

trackerAdminRouter.get('/trackers', async (_req, res) => {
  const [trackers, running] = await Promise.all([
    Tracker.find().sort({ createdAt: -1 }).lean(),
    DriveLog.find({ status: 'running', trackerId: { $ne: null } })
      .select('trackerId routeName')
      .lean(),
  ]);
  const byTracker = new Map(running.map((d) => [String(d.trackerId), d]));
  res.json(
    trackers.map((t) => {
      const drive = byTracker.get(String(t._id));
      return { ...t, activeDrive: drive ? { _id: drive._id, routeName: drive.routeName } : null };
    })
  );
});

trackerAdminRouter.get('/trackers/:id', async (req, res) => {
  const tracker = await Tracker.findById(req.params.id).lean();
  if (!tracker) throw notFound('트래커 기기');
  res.json(tracker);
});

trackerAdminRouter.post('/trackers', async (req, res) => {
  const { name } = trackerSchema.parse(req.body);
  const user = currentUser(req);
  const tracker = await Tracker.create({
    name,
    deviceId: await generateDeviceId(),
    createdBy: user?.email || user?.name,
  });
  res.status(201).json(tracker);
});

trackerAdminRouter.put('/trackers/:id', async (req, res) => {
  const { name } = trackerSchema.parse(req.body);
  const tracker = await Tracker.findByIdAndUpdate(req.params.id, { name }, { new: true });
  if (!tracker) throw notFound('트래커 기기');
  res.json(tracker);
});

// 기기 ID 재발급 (유출되었을 때)
trackerAdminRouter.post('/trackers/:id/regenerate', async (req, res) => {
  const tracker = await Tracker.findByIdAndUpdate(
    req.params.id,
    { deviceId: await generateDeviceId(), $unset: { lastSeenAt: 1, lastLocation: 1 } },
    { new: true }
  );
  if (!tracker) throw notFound('트래커 기기');
  res.json(tracker);
});

trackerAdminRouter.delete('/trackers/:id', async (req, res) => {
  const tracker = await Tracker.findByIdAndDelete(req.params.id);
  if (!tracker) throw notFound('트래커 기기');
  // 진행 중 운행에서 연결 해제
  await DriveLog.updateMany(
    { trackerId: tracker._id, status: 'running' },
    { $set: { trackerId: null } }
  );
  res.json({ message: '삭제되었습니다.' });
});

// ---------- Traccar Client 수신 (기기 ID로 인증) ----------
export const traccarIngestRouter = Router();

traccarIngestRouter.all('/traccar', async (req, res) => {
  const { deviceId, fixes } = parseTraccarRequest(req.query as Record<string, unknown>, req.body);
  if (!deviceId) {
    res.status(400).send('device id required');
    return;
  }
  const tracker = await Tracker.findOne({ deviceId });
  if (!tracker) {
    // 앱에서 "전송 실패"로 보이게 해서 설정 오류를 알 수 있도록
    res.status(404).send('unknown device');
    return;
  }

  const latest = fixes[fixes.length - 1];
  tracker.lastSeenAt = new Date();
  if (latest) {
    tracker.lastLocation = {
      lat: latest.lat,
      lng: latest.lng,
      accuracy: latest.accuracy,
      battery: latest.battery,
      recordedAt: latest.recordedAt,
    };
  }
  await tracker.save();

  if (fixes.length > 0) {
    const drive = await DriveLog.findOne({ trackerId: tracker._id, status: 'running' });
    if (drive) {
      if (await hydrateLegacyCheckpoints(drive)) drive.markModified('checkpoints');
      for (const fix of fixes) {
        // 운행 시작 전에 측정된(버퍼에 남아 있던) 좌표는 무시. 휴대폰 시계 오차는 허용
        if (fix.recordedAt.getTime() < drive.startTime.getTime() - CLOCK_SKEW_MS) continue;
        await ingestLocation(drive, { ...fix, source: 'traccar' });
      }
    }
  }

  res.status(200).send('OK');
});
