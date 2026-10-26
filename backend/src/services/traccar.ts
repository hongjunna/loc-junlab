/**
 * Traccar Client(OsmAnd 프로토콜) 요청 파싱
 *
 * 참고: Traccar 서버 OsmAndProtocolDecoder
 * - JSON 본문 (Traccar Client 9.x): { device_id, location: { timestamp, coords: {...}, battery, is_moving } }
 *   속도는 m/s
 * - 쿼리/폼 파라미터 (이전 버전, OsmAnd 앱): id|deviceid, lat, lon | location="lat,lon", timestamp,
 *   speed(knots), bearing|heading, accuracy, batt
 */

export interface TraccarFix {
  deviceId: string;
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number;
  speed?: number; // m/s
  battery?: number; // 0~100
  recordedAt: Date;
}

const KNOT_TO_MPS = 0.514444;

const num = (v: unknown) => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const nonNegative = (v: unknown) => {
  const n = num(v);
  return n !== undefined && n >= 0 ? n : undefined;
};

export const parseTimestamp = (v: unknown, now = new Date()) => {
  if (v === undefined || v === null || v === '') return now;
  const n = Number(v);
  let d: Date;
  if (Number.isFinite(n)) {
    // 초 단위면 ms로 변환
    d = new Date(n < 1e11 ? n * 1000 : n);
  } else {
    d = new Date(String(v).replace(' ', 'T'));
  }
  if (Number.isNaN(d.getTime())) return now;
  // 기기 시계가 미래로 크게 틀어진 경우 서버 시각 사용
  return d.getTime() > now.getTime() + 5 * 60 * 1000 ? now : d;
};

const validCoords = (lat?: number, lng?: number): lat is number =>
  lat !== undefined &&
  lng !== undefined &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180 &&
  !(lat === 0 && lng === 0);

interface JsonLocation {
  timestamp?: string;
  coords?: Record<string, unknown>;
  battery?: { level?: number };
}

const fromJson = (body: Record<string, unknown>, now: Date): TraccarFix | null => {
  const deviceId = String(body.device_id ?? '').trim();
  const location = body.location as JsonLocation | undefined;
  const coords = location?.coords;
  if (!deviceId || !coords) return null;
  const lat = num(coords.latitude);
  const lng = num(coords.longitude);
  if (!validCoords(lat, lng)) return null;
  const level = num(location?.battery?.level);
  return {
    deviceId,
    lat,
    lng: lng!,
    accuracy: nonNegative(coords.accuracy),
    heading: nonNegative(coords.heading),
    speed: nonNegative(coords.speed),
    battery: level !== undefined && level >= 0 ? Math.round(level * 100) : undefined,
    recordedAt: parseTimestamp(location?.timestamp, now),
  };
};

const fromParams = (params: Record<string, unknown>, now: Date): TraccarFix | null => {
  const deviceId = String(params.id ?? params.deviceid ?? '').trim();
  if (!deviceId) return null;
  let lat = num(params.lat);
  let lng = num(params.lon);
  if ((lat === undefined || lng === undefined) && typeof params.location === 'string') {
    const [a, b] = params.location.split(',');
    lat = num(a);
    lng = num(b);
  }
  if (!validCoords(lat, lng)) return null;
  if (params.valid === 'false' || params.valid === '0') return null;
  const speedKnots = nonNegative(params.speed);
  return {
    deviceId,
    lat,
    lng: lng!,
    accuracy: nonNegative(params.accuracy),
    heading: nonNegative(params.bearing ?? params.heading),
    speed: speedKnots !== undefined ? speedKnots * KNOT_TO_MPS : undefined,
    battery: nonNegative(params.batt),
    recordedAt: parseTimestamp(params.timestamp, now),
  };
};

/**
 * 요청 하나에서 위치 목록을 뽑는다. (JSON 배열로 여러 개가 오는 경우도 처리)
 * 기기 ID는 있지만 좌표가 없는 경우(상태 신호) deviceId만 담아 반환한다.
 */
export const parseTraccarRequest = (
  query: Record<string, unknown>,
  body: unknown,
  now = new Date()
): { deviceId: string | null; fixes: TraccarFix[] } => {
  const fixes: TraccarFix[] = [];
  let deviceId: string | null = null;

  const bodies = Array.isArray(body) ? body : body && typeof body === 'object' ? [body] : [];
  for (const b of bodies as Record<string, unknown>[]) {
    // JSON 형식은 location 이 객체. (form 형식의 location 은 "lat,lon" 문자열)
    if ('device_id' in b || (b.location !== null && typeof b.location === 'object')) {
      deviceId = deviceId || String(b.device_id ?? '').trim() || null;
      const fix = fromJson(b, now);
      if (fix) fixes.push(fix);
    } else {
      // application/x-www-form-urlencoded 본문
      const merged = { ...query, ...b };
      deviceId = deviceId || String(merged.id ?? merged.deviceid ?? '').trim() || null;
      const fix = fromParams(merged, now);
      if (fix) fixes.push(fix);
    }
  }
  if (bodies.length === 0) {
    deviceId = String(query.id ?? query.deviceid ?? '').trim() || null;
    const fix = fromParams(query, now);
    if (fix) fixes.push(fix);
  }
  fixes.sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  return { deviceId, fixes };
};
