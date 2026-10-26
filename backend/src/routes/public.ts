import { Router } from 'express';
import mongoose from 'mongoose';
import { config } from '../config';
import { HttpError, notFound } from '../http';
import { DriveLog, type IDriveLog } from '../models/drive_log';
import { hydrateLegacyCheckpoints, SHARE_CODE_RE } from '../services/drive';

const router = Router();

// 승객 화면에 노출할 궤적 최대 개수
const PUBLIC_TRACK_POINTS = 500;

/**
 * 승객용 응답. 내부 ID나 출발지 도착 전 위치(운전자 개인 이동)는 노출하지 않는다.
 */
const toPublic = (drive: IDriveLog & { track?: IDriveLog['track'] }) => {
  const first = drive.checkpoints[0];
  // 출발지에 도착하기 전까지는 차량 위치를 공개하지 않음
  const startedAt = first?.arrivalTime ? new Date(first.arrivalTime) : null;
  const visible = !!startedAt;
  return {
    shareCode: drive.shareCode,
    routeName: drive.routeName,
    status: drive.status,
    startTime: drive.startTime,
    endTime: drive.endTime,
    startedAt,
    currentIndex: drive.currentIndex,
    checkpoints: drive.checkpoints.map((cp) => ({
      pointName: cp.pointName,
      type: cp.type,
      coordinates: cp.coordinates,
      scheduledTime: cp.scheduledTime,
      status: cp.status,
      arrivalTime: cp.arrivalTime,
      departureTime: cp.departureTime,
    })),
    currentLocation:
      visible && drive.currentLocation?.coordinates?.length === 2
        ? {
            coordinates: drive.currentLocation.coordinates,
            heading: drive.currentLocation.heading,
            speed: drive.currentLocation.speed,
            accuracy: drive.currentLocation.accuracy,
            updatedAt: drive.currentLocation.updatedAt ?? drive.updatedAt,
          }
        : null,
    track: visible
      ? (drive.track || [])
          .filter((p) => new Date(p.t) >= startedAt!)
          .slice(-PUBLIC_TRACK_POINTS)
          .map((p) => [p.lat, p.lng])
      : [],
    serverTime: new Date(),
  };
};

router.get('/public/drives/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  let drive;
  if (SHARE_CODE_RE.test(code)) {
    drive = await DriveLog.findOne({ shareCode: code }).select('+track').lean();
  } else if (mongoose.isValidObjectId(req.params.code)) {
    // 공유 코드 도입 이전에 공유된 링크(/passenger?id=...) 호환
    drive = await DriveLog.findOne({ _id: req.params.code, shareCode: { $exists: false } })
      .select('+track')
      .lean();
  }
  if (!drive) throw notFound('운행');

  if (drive.status === 'completed' && drive.endTime) {
    const expireAt = new Date(drive.endTime).getTime() + config.shareExpireHours * 60 * 60 * 1000;
    if (Date.now() > expireAt) throw new HttpError(410, '공유 기간이 만료된 운행입니다.');
  }

  await hydrateLegacyCheckpoints(drive);
  res.set('Cache-Control', 'no-store');
  res.json(toPublic(drive));
});

export default router;
