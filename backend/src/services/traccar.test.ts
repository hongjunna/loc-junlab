import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimestamp, parseTraccarRequest } from './traccar';

const now = new Date('2026-10-26T10:00:00Z');

test('Traccar Client 9.x JSON 본문 파싱 (속도 m/s, 배터리 0~1)', () => {
  const body = {
    device_id: 'abc123',
    location: {
      timestamp: '2026-10-26T09:59:50.000Z',
      coords: {
        latitude: 37.5,
        longitude: 127.01,
        accuracy: 8,
        speed: 10,
        heading: 90,
        altitude: 30,
      },
      is_moving: true,
      battery: { level: 0.42, is_charging: false },
    },
  };
  const { deviceId, fixes } = parseTraccarRequest({}, body, now);
  assert.equal(deviceId, 'abc123');
  assert.equal(fixes.length, 1);
  assert.deepEqual(
    { ...fixes[0], recordedAt: fixes[0].recordedAt.toISOString() },
    {
      deviceId: 'abc123',
      lat: 37.5,
      lng: 127.01,
      accuracy: 8,
      heading: 90,
      speed: 10,
      battery: 42,
      recordedAt: '2026-10-26T09:59:50.000Z',
    }
  );
});

test('쿼리 파라미터 형식 파싱 (속도 knots → m/s, 초 단위 timestamp)', () => {
  const { fixes } = parseTraccarRequest(
    {
      id: 'dev1',
      lat: '37.5',
      lon: '127',
      speed: '10',
      bearing: '180',
      accuracy: '12',
      batt: '77',
      timestamp: '1793008790',
    },
    {},
    now
  );
  assert.equal(fixes.length, 1);
  assert.equal(fixes[0].deviceId, 'dev1');
  assert.ok(Math.abs(fixes[0].speed! - 5.14444) < 0.001);
  assert.equal(fixes[0].heading, 180);
  assert.equal(fixes[0].battery, 77);
  assert.equal(fixes[0].recordedAt.getTime(), 1793008790 * 1000);
});

test('location="lat,lon" 과 form 본문, deviceid 별칭', () => {
  const { fixes } = parseTraccarRequest({}, { deviceid: 'dev2', location: '37.4,126.9' }, now);
  assert.equal(fixes[0].deviceId, 'dev2');
  assert.equal(fixes[0].lat, 37.4);
  assert.equal(fixes[0].lng, 126.9);
});

test('좌표 없는 요청은 기기 ID만, 잘못된 좌표는 무시', () => {
  assert.deepEqual(parseTraccarRequest({ id: 'x' }, {}, now), { deviceId: 'x', fixes: [] });
  assert.equal(parseTraccarRequest({ id: 'x', lat: '0', lon: '0' }, {}, now).fixes.length, 0);
  assert.equal(parseTraccarRequest({ id: 'x', lat: '99', lon: '1' }, {}, now).fixes.length, 0);
  assert.equal(parseTraccarRequest({}, { device_id: 'x', location: {} }, now).fixes.length, 0);
});

test('JSON 배열(버퍼 일괄 전송)은 시간순 정렬', () => {
  const mk = (ts: string, lng: number) => ({
    device_id: 'd',
    location: {
      timestamp: ts,
      coords: { latitude: 37.5, longitude: lng, accuracy: 5, speed: 0, heading: 0, altitude: 0 },
    },
  });
  const { fixes } = parseTraccarRequest(
    {},
    [mk('2026-10-26T09:59:00Z', 2), mk('2026-10-26T09:58:00Z', 1)],
    now
  );
  assert.deepEqual(
    fixes.map((f) => f.lng),
    [1, 2]
  );
});

test('timestamp 형식: ms, 날짜 문자열, 미래 시각 보정', () => {
  assert.equal(parseTimestamp('1793008790000', now).getTime(), 1793008790000);
  assert.equal(
    parseTimestamp('2026-10-26 09:00:00', now).getHours(),
    new Date('2026-10-26T09:00:00').getHours()
  );
  assert.equal(parseTimestamp('2030-01-01T00:00:00Z', now).getTime(), now.getTime());
  assert.equal(parseTimestamp(undefined, now), now);
});
