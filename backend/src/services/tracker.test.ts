import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLocation, manualArrive, type Position } from './tracker';
import type { ICheckpoint } from '../models/drive_log';

// 위도 0.001도 ≈ 111m. 경도 방향으로 일직선 노선을 만든다.
const at = (km: number): Position => ({ lat: 37.5, lng: 127 + km / 88.4 });

const cp = (name: string, km: number, extra: Partial<ICheckpoint> = {}): ICheckpoint => {
  const p = at(km);
  return {
    pointName: name,
    type: '경유지',
    coordinates: [p.lng, p.lat],
    useAnnouncement: false,
    status: 'pending',
    ...extra,
  };
};

const settings = { approachRadius: 300, arrivalRadius: 50 };

const drive = (checkpoints: ICheckpoint[], path: number[]) => {
  let state = { checkpoints, currentIndex: 0 };
  const events: string[] = [];
  for (const km of path) {
    const r = applyLocation(state.checkpoints, state.currentIndex, at(km), settings);
    state = r;
    events.push(...r.events.map((e) => `${e.kind}:${e.pointName}`));
  }
  return { ...state, events };
};

test('순서대로 접근 → 도착 → 출발', () => {
  const r = drive([cp('A', 0), cp('B', 2), cp('C', 4)], [0, 0.5, 1.8, 2, 2.3, 4]);
  assert.deepEqual(r.events, [
    'arrive:A',
    'depart:A',
    'approach:B',
    'arrive:B',
    'depart:B',
    'arrive:C',
  ]);
  assert.equal(r.currentIndex, 2);
  assert.deepEqual(
    r.checkpoints.map((c) => c.status),
    ['departed', 'departed', 'arrived']
  );
});

test('출발지 = 도착지인 순환 노선에서 시작하자마자 도착지로 판정하지 않음', () => {
  const r = drive([cp('차고지', 0), cp('B', 2), cp('차고지', 0)], [0]);
  assert.deepEqual(r.events, ['arrive:차고지']);
  assert.equal(r.checkpoints[2].status, 'pending');
});

test('위치 전송 간격이 길어 정류장을 건너뛰어도 통과 처리 후 다음 정류장 도착', () => {
  const r = drive([cp('A', 0), cp('B', 1), cp('C', 1.4), cp('D', 3)], [0, 0.5, 3]);
  assert.deepEqual(
    r.checkpoints.map((c) => c.status),
    ['departed', 'departed', 'departed', 'arrived']
  );
  assert.ok(r.events.includes('pass:B'));
  assert.ok(r.events.includes('pass:C'));
  assert.equal(r.currentIndex, 3);
});

test('접근 반경은 들어왔지만 도착 반경을 스치지 않고 지나가면 통과 처리', () => {
  const r = drive([cp('A', 0), cp('B', 2), cp('C', 4)], [0, 0.5, 1.8, 2.2, 2.6]);
  assert.equal(r.checkpoints[1].status, 'departed');
  assert.ok(r.events.includes('pass:B'));
});

test('도착 반경 경계에서 GPS가 튀어도 출발 판정은 히스테리시스 적용', () => {
  // 도착 반경 50m, 출발은 75m 이상 벗어나야 함
  const r = drive([cp('A', 0), cp('B', 2)], [0, 0.06]);
  assert.equal(r.checkpoints[0].status, 'arrived');
});

test('출발지로 가는 길에 다른 정류장을 지나도 출발지를 건너뛰지 않음', () => {
  const r = drive([cp('A', 2), cp('B', 1), cp('C', 3)], [1]);
  assert.equal(r.checkpoints[0].status, 'pending');
  assert.equal(r.checkpoints[1].status, 'pending');
});

test('접근 이벤트는 방송 설정된 정류장만 announce', () => {
  const r = applyLocation(
    [cp('A', 0, { status: 'departed' }), cp('B', 2, { useAnnouncement: true })],
    1,
    at(1.8),
    settings
  );
  assert.equal(r.events[0].kind, 'approach');
  assert.equal(r.events[0].announce, true);
  assert.equal(r.events[0].message, '잠시 후 B에 도착합니다.');
});

test('수기 도착: 이전 정류장은 출발, 대상은 도착 처리', () => {
  const r = manualArrive([cp('A', 0, { status: 'arrived' }), cp('B', 2), cp('C', 4)], 2);
  assert.deepEqual(
    r.checkpoints.map((c) => c.status),
    ['departed', 'departed', 'arrived']
  );
  assert.ok(r.checkpoints[0].departureTime);
  assert.ok(r.checkpoints[1].arrivalTime);
  assert.equal(r.currentIndex, 2);
});
