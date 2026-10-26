import { getDistance } from 'geolib';
import type { ICheckpoint } from '../models/drive_log';

export interface Position {
  lat: number;
  lng: number;
}

export interface TrackerSettings {
  approachRadius: number; // m
  arrivalRadius: number; // m
}

export type TrackerEventKind = 'approach' | 'arrive' | 'depart' | 'pass';

export interface TrackerEvent {
  kind: TrackerEventKind;
  index: number;
  pointName: string;
  announce: boolean;
  message: string;
}

export interface TrackerResult {
  checkpoints: ICheckpoint[];
  currentIndex: number;
  events: TrackerEvent[];
}

// 출발 판정은 도착 반경보다 넉넉하게 (GPS 튐으로 인한 출발/도착 반복 방지)
export const DEPART_HYSTERESIS = 1.5;
// 몇 개 앞 정류장까지 "이미 지나쳤는지" 확인할지
export const LOOKAHEAD = 3;

export const distanceTo = (pos: Position, cp: ICheckpoint) =>
  getDistance(
    { latitude: pos.lat, longitude: pos.lng },
    { latitude: cp.coordinates[1], longitude: cp.coordinates[0] }
  );

const josa = (word: string, withBatchim: string, without: string) => {
  const last = word.charCodeAt(word.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return `${withBatchim.slice(0, 1)}(${without})`;
  return (last - 0xac00) % 28 ? withBatchim : without;
};

const messageFor = (kind: TrackerEventKind, name: string) => {
  switch (kind) {
    case 'approach':
      return `잠시 후 ${name}에 도착합니다.`;
    case 'arrive':
      return `${name}에 도착했습니다.`;
    case 'depart':
      return `${name}에서 출발했습니다.`;
    case 'pass':
      return `${name}${josa(name, '을', '를')} 통과했습니다.`;
  }
};

/**
 * 현재 위치를 받아 체크포인트 상태를 갱신하는 순수 함수.
 *
 * - 항상 "다음 목표 정류장(currentIndex)"부터 순서대로만 판정한다.
 *   (뒤쪽 정류장이 먼저 판정되거나, 출발지=도착지 노선에서 오판정되는 문제 방지)
 * - 한 번의 위치 업데이트에서 여러 단계를 연속으로 처리한다.
 *   (출발 → 다음 정류장 접근, 또는 여러 정류장 통과)
 */
export const applyLocation = (
  input: ICheckpoint[],
  inputIndex: number,
  pos: Position,
  settings: TrackerSettings,
  now: Date = new Date()
): TrackerResult => {
  const checkpoints = input.map((cp) => ({ ...cp }));
  const events: TrackerEvent[] = [];
  let i = Math.max(0, inputIndex);

  const emit = (kind: TrackerEventKind, index: number) => {
    const cp = checkpoints[index];
    events.push({
      kind,
      index,
      pointName: cp.pointName,
      announce: kind === 'approach' && cp.useAnnouncement,
      message: messageFor(kind, cp.pointName),
    });
  };

  const markPassed = (index: number) => {
    const cp = checkpoints[index];
    const wasArrived = cp.status === 'arrived';
    cp.status = 'departed';
    if (!cp.arrivalTime) cp.arrivalTime = now;
    if (!cp.departureTime) cp.departureTime = now;
    emit(wasArrived ? 'depart' : 'pass', index);
  };

  // 무한 루프 방지: 한 업데이트에서 처리할 수 있는 단계 수 제한
  for (let guard = 0; guard < checkpoints.length * 3 && i < checkpoints.length; guard++) {
    const cp = checkpoints[i];
    const dist = distanceTo(pos, cp);
    const isLast = i === checkpoints.length - 1;

    // 1. 이미 앞쪽 정류장 도착 반경 안이라면, 그 사이 정류장은 모두 통과 처리
    //    (출발지로 이동하는 길에 다른 정류장을 지나치는 경우는 제외)
    const startNotReached = i === 0 && cp.status === 'pending';
    if (!isLast && !startNotReached && cp.status !== 'arrived') {
      let skipTo = -1;
      for (let j = i + 1; j < Math.min(checkpoints.length, i + 1 + LOOKAHEAD); j++) {
        if (distanceTo(pos, checkpoints[j]) <= settings.arrivalRadius) {
          skipTo = j;
          break;
        }
      }
      if (skipTo !== -1 && dist > settings.arrivalRadius) {
        for (let k = i; k < skipTo; k++) markPassed(k);
        i = skipTo;
        continue;
      }
    }

    // 2. 도착
    if (
      (cp.status === 'pending' || cp.status === 'approaching') &&
      dist <= settings.arrivalRadius
    ) {
      cp.status = 'arrived';
      cp.arrivalTime = now;
      emit('arrive', i);
      continue;
    }

    // 3. 출발 (도착 상태에서 반경을 충분히 벗어남)
    if (cp.status === 'arrived') {
      if (!isLast && dist > settings.arrivalRadius * DEPART_HYSTERESIS) {
        cp.status = 'departed';
        cp.departureTime = now;
        emit('depart', i);
        i += 1;
        continue;
      }
      break;
    }

    // 4. 접근
    if (cp.status === 'pending' && dist <= settings.approachRadius) {
      cp.status = 'approaching';
      emit('approach', i);
      continue;
    }

    // 5. 접근 중이었는데 도착 반경에 들지 못하고
    //    다음 정류장이 더 가까워졌거나 접근 반경을 벗어난 경우 → 통과
    if (cp.status === 'approaching' && !isLast) {
      const distToNext = distanceTo(pos, checkpoints[i + 1]);
      const leftZone = dist > settings.approachRadius * 1.2;
      if ((distToNext < dist || leftZone) && dist > settings.arrivalRadius) {
        markPassed(i);
        i += 1;
        continue;
      }
    }

    break;
  }

  return { checkpoints, currentIndex: Math.min(i, checkpoints.length - 1), events };
};

/**
 * 수기 도착 처리: target 이전 정류장은 모두 출발 처리, target은 도착 처리
 */
export const manualArrive = (
  input: ICheckpoint[],
  target: number,
  now: Date = new Date()
): TrackerResult => {
  const checkpoints = input.map((cp) => ({ ...cp }));
  const events: TrackerEvent[] = [];
  for (let k = 0; k < target; k++) {
    const cp = checkpoints[k];
    if (cp.status !== 'departed') {
      cp.status = 'departed';
      if (!cp.arrivalTime) cp.arrivalTime = now;
      cp.departureTime = now;
      cp.manual = true;
    }
  }
  const cp = checkpoints[target];
  if (cp.status !== 'arrived' && cp.status !== 'departed') {
    cp.status = 'arrived';
    cp.arrivalTime = now;
    cp.manual = true;
    events.push({
      kind: 'arrive',
      index: target,
      pointName: cp.pointName,
      announce: false,
      message: messageFor('arrive', cp.pointName),
    });
  }
  return { checkpoints, currentIndex: target, events };
};
