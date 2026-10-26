import crypto from 'crypto';
import { config } from '../config';
import { DriveLog, type ICheckpoint } from '../models/drive_log';
import { DEFAULT_APPROACH_RADIUS, DEFAULT_ARRIVAL_RADIUS, Route } from '../models/route';

// 헷갈리는 문자(0/O, 1/I/L) 제외
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const SHARE_CODE_LENGTH = 6;
export const SHARE_CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${SHARE_CODE_LENGTH}}$`);

export const generateShareCode = async () => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const bytes = crypto.randomBytes(SHARE_CODE_LENGTH);
    const code = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    if (!(await DriveLog.exists({ shareCode: code }))) return code;
  }
  throw new Error('공유 코드 생성 실패');
};

// 예전 운행 데이터는 반경을 km 단위로 저장했으므로 m 단위로 보정
export const normalizeRadius = (value: number | undefined, fallback: number) => {
  if (!value || value <= 0) return fallback;
  return value < 5 ? value * 1000 : value;
};

export const driveSettings = (settings?: { approachRadius?: number; arrivalRadius?: number }) => ({
  approachRadius: normalizeRadius(settings?.approachRadius, DEFAULT_APPROACH_RADIUS),
  arrivalRadius: normalizeRadius(settings?.arrivalRadius, DEFAULT_ARRIVAL_RADIUS),
});

/**
 * 스냅샷 이전 버전의 운행 데이터(체크포인트에 좌표가 없음)는
 * 노선 정보로 채워 넣는다.
 */
export const hydrateLegacyCheckpoints = async (drive: {
  routeId: unknown;
  checkpoints: ICheckpoint[];
  routeName?: string;
}) => {
  const missing = drive.checkpoints.some((cp) => !cp.coordinates || cp.coordinates.length !== 2);
  if (!missing && drive.routeName) return false;
  const route = await Route.findById(drive.routeId).lean();
  if (!route) return false;
  drive.routeName = drive.routeName || route.routeName;
  drive.checkpoints.forEach((cp, i) => {
    const p = route.points[i];
    if (!p) return;
    if (!cp.coordinates || cp.coordinates.length !== 2) cp.coordinates = p.location.coordinates;
    if (!cp.type) cp.type = p.type;
    if (cp.useAnnouncement === undefined) cp.useAnnouncement = p.useAnnouncement;
  });
  return true;
};

// 일정 시간 이상 위치 갱신이 없는 운행 자동 종료
export const closeStaleDrives = async () => {
  const threshold = new Date(Date.now() - config.staleDriveHours * 60 * 60 * 1000);
  const result = await DriveLog.updateMany(
    {
      status: 'running',
      $or: [
        { updatedAt: { $lt: threshold } },
        // timestamps 도입 이전 데이터
        { updatedAt: { $exists: false }, startTime: { $lt: threshold } },
      ],
    },
    { $set: { status: 'completed', endTime: new Date(), endReason: 'stale' } }
  );
  if (result.modifiedCount > 0) {
    console.log(`🧹 오래된 운행 ${result.modifiedCount}건 자동 종료`);
  }
};
