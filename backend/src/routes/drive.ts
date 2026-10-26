import { Router } from 'express';
import { HttpError, notFound } from '../http';
import { DriveLog, MAX_TRACK_POINTS } from '../models/drive_log';
import { Route } from '../models/route';
import {
  closeStaleDrives,
  driveSettings,
  generateShareCode,
  hydrateLegacyCheckpoints,
} from '../services/drive';
import { applyLocation, manualArrive } from '../services/tracker';
import { locationSchema, startDriveSchema } from '../validation';

// 이 값보다 정확도가 나쁜 좌표는 위치만 갱신하고 정류장 판정에는 쓰지 않음
const MAX_ACCURACY_FOR_JUDGE = 100; // m

const router = Router();

const findRunning = async (id: string) => {
  const drive = await DriveLog.findById(id);
  if (!drive) throw notFound('운행 기록');
  if (drive.status !== 'running') throw new HttpError(409, '이미 종료된 운행입니다.');
  if (await hydrateLegacyCheckpoints(drive)) drive.markModified('checkpoints');
  return drive;
};

// 운행 시작: 노선 정보를 체크포인트로 스냅샷
router.post('/drives', async (req, res) => {
  const { routeId } = startDriveSchema.parse(req.body);
  const route = await Route.findOne({ _id: routeId, is_deleted: { $ne: true } });
  if (!route) throw notFound('노선');
  if (route.points.length === 0) throw new HttpError(400, '지점이 없는 노선입니다.');

  const drive = await DriveLog.create({
    routeId,
    routeName: route.routeName,
    shareCode: await generateShareCode(),
    checkpoints: route.points.map((p) => ({
      pointName: p.name,
      type: p.type,
      coordinates: p.location.coordinates,
      scheduledTime: p.scheduledTime,
      useAnnouncement: p.useAnnouncement,
      status: 'pending',
    })),
    settings: driveSettings(route.settings),
  });
  res.status(201).json(drive);
});

// 진행 중인 운행 목록
router.get('/drives/active', async (_req, res) => {
  await closeStaleDrives();
  const drives = await DriveLog.find({ status: 'running' }).sort({ startTime: -1 }).lean();
  for (const d of drives) await hydrateLegacyCheckpoints(d);
  res.json(drives);
});

// 운행 기록 목록 (최신순, 커서 페이지네이션)
router.get('/drives', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const filter: Record<string, unknown> = {};
  if (req.query.routeId) filter.routeId = req.query.routeId;
  if (req.query.before) filter.startTime = { $lt: new Date(String(req.query.before)) };
  const drives = await DriveLog.find(filter).sort({ startTime: -1 }).limit(limit).lean();
  for (const d of drives) await hydrateLegacyCheckpoints(d);
  res.json(drives);
});

// 운행 상세 (궤적 포함)
router.get('/drives/:id', async (req, res) => {
  const drive = await DriveLog.findById(req.params.id).select('+track +undoSnapshot').lean();
  if (!drive) throw notFound('운행 기록');
  await hydrateLegacyCheckpoints(drive);
  const { undoSnapshot, ...rest } = drive;
  res.json({ ...rest, canUndo: !!undoSnapshot });
});

// 실시간 위치 전송 및 정류장 판정
router.post('/drives/:id/location', async (req, res) => {
  const { latitude, longitude, accuracy, heading, speed } = locationSchema.parse(req.body);
  const drive = await findRunning(req.params.id);
  const now = new Date();

  drive.currentLocation = {
    type: 'Point',
    coordinates: [longitude, latitude],
    accuracy,
    heading: heading ?? undefined,
    speed: speed ?? undefined,
    updatedAt: now,
  };

  const judged = accuracy === undefined || accuracy <= MAX_ACCURACY_FOR_JUDGE;
  let events: ReturnType<typeof applyLocation>['events'] = [];
  if (judged) {
    const result = applyLocation(
      drive.toObject().checkpoints,
      drive.currentIndex,
      { lat: latitude, lng: longitude },
      driveSettings(drive.settings),
      now
    );
    drive.set('checkpoints', result.checkpoints);
    drive.currentIndex = result.currentIndex;
    events = result.events;
    // 자동 판정으로 상태가 바뀌면 이전 수기 처리는 되돌릴 수 없음
    if (events.length > 0) drive.set('undoSnapshot', null);
  }
  await drive.save();

  await DriveLog.updateOne(
    { _id: drive._id },
    {
      $push: {
        track: { $each: [{ lat: latitude, lng: longitude, t: now }], $slice: -MAX_TRACK_POINTS },
      },
    }
  );

  res.json({
    checkpoints: drive.checkpoints,
    currentIndex: drive.currentIndex,
    currentLocation: drive.currentLocation,
    events,
    judged,
  });
});

// 수기 도착 처리
router.post('/drives/:id/checkpoints/:index/arrive', async (req, res) => {
  const drive = await findRunning(req.params.id);
  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0 || index >= drive.checkpoints.length) {
    throw new HttpError(400, '잘못된 정류장 번호입니다.');
  }
  const before = {
    checkpoints: drive.toObject().checkpoints,
    currentIndex: drive.currentIndex,
  };
  const result = manualArrive(before.checkpoints, index);
  drive.set('checkpoints', result.checkpoints);
  drive.currentIndex = result.currentIndex;
  drive.set('undoSnapshot', before);
  await drive.save();
  res.json({
    checkpoints: drive.checkpoints,
    currentIndex: drive.currentIndex,
    events: result.events,
    canUndo: true,
  });
});

// 직전 수기 처리 되돌리기
router.post('/drives/:id/undo', async (req, res) => {
  const drive = await DriveLog.findById(req.params.id).select('+undoSnapshot');
  if (!drive) throw notFound('운행 기록');
  if (!drive.undoSnapshot) throw new HttpError(409, '되돌릴 작업이 없습니다.');
  drive.set('checkpoints', drive.undoSnapshot.checkpoints);
  drive.currentIndex = drive.undoSnapshot.currentIndex;
  drive.set('undoSnapshot', null);
  await drive.save();
  res.json({ checkpoints: drive.checkpoints, currentIndex: drive.currentIndex, canUndo: false });
});

// 운행 종료
router.post('/drives/:id/end', async (req, res) => {
  const drive = await DriveLog.findById(req.params.id);
  if (!drive) throw notFound('운행 기록');
  if (drive.status === 'running') {
    drive.status = 'completed';
    drive.endTime = new Date();
    drive.endReason = 'manual';
    await drive.save();
  }
  res.json(drive);
});

export default router;
