import type { Checkpoint, LatLng, LngLat } from '../types';

export const toLatLng = (c: LngLat): LatLng => [c[1], c[0]];

// 두 좌표 사이 거리 (m)
export const distance = (a: LatLng, b: LatLng) => {
  const R = 6371e3;
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

export const formatDistance = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)}km` : `${Math.round(m / 10) * 10}m`;

export const formatTime = (iso?: string | null) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

export const formatDateTime = (iso?: string | null) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

// "n초 전", "n분 전"
export const formatAgo = (iso: string | undefined, now: number) => {
  if (!iso) return '-';
  const sec = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (sec < 10) return '방금';
  if (sec < 60) return `${sec}초 전`;
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  return `${Math.floor(sec / 3600)}시간 전`;
};

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const atMinutes = (base: Date, minutes: number) => {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d;
};

/**
 * 정류장별 예정 시각을 계산한다.
 * - planned: 시간표상 예정 시각 (운행 시작일 기준)
 * - adjusted: 출발지 실제 출발 시각에 맞춰 보정한 예정 시각
 */
export const scheduleOf = (checkpoints: Checkpoint[], baseDate: string) => {
  const first = checkpoints[0];
  const actualStart = first?.departureTime || first?.arrivalTime;
  const baseSched = first?.scheduledTime ? toMinutes(first.scheduledTime) : null;
  const base = new Date(baseDate);

  return checkpoints.map((cp) => {
    if (!cp.scheduledTime) return { planned: null, adjusted: null };
    const sched = toMinutes(cp.scheduledTime);
    const planned = atMinutes(base, sched);
    let adjusted: Date | null = null;
    if (actualStart && baseSched !== null) {
      adjusted = new Date(new Date(actualStart).getTime() + (sched - baseSched) * 60000);
    }
    return { planned, adjusted };
  });
};

// 예정 대비 지연(분). 양수면 지연, 음수면 빠름
export const delayMinutes = (planned: Date | null, actual?: string) => {
  if (!planned || !actual) return null;
  return Math.round((new Date(actual).getTime() - planned.getTime()) / 60000);
};

export const formatDelay = (min: number | null) => {
  if (min === null) return null;
  if (Math.abs(min) <= 1) return '정시';
  return min > 0 ? `${min}분 지연` : `${-min}분 빠름`;
};

export const hhmm = (d: Date | null) =>
  d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '-';
