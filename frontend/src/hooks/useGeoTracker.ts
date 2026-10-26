import { useEffect, useRef, useState } from 'react';
import { distance } from '../lib/format';

export interface GeoFix {
  latitude: number;
  longitude: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export type GeoError = 'denied' | 'unavailable' | 'timeout' | 'unsupported' | null;

interface Options {
  enabled: boolean;
  /** 이동이 없어도 최소 이 간격마다 전송 (정차 중 상태 판정, 생존 신호) */
  heartbeatMs?: number;
  /** 이 간격보다 자주는 보내지 않음 */
  minIntervalMs?: number;
  /** 이 거리 이상 움직이면 minInterval이 지나는 즉시 전송 */
  minDistanceM?: number;
  /** 이 값보다 정확도가 나쁜 좌표는 버림 */
  maxAccuracyM?: number;
  onSend: (fix: GeoFix) => Promise<void>;
}

/**
 * watchPosition 기반 위치 추적 + 전송 스케줄링.
 * 속도와 무관하게 "거리 이동" 또는 "heartbeat"로 전송해서 서행/정차 시에도 판정이 누락되지 않게 한다.
 */
export const useGeoTracker = ({
  enabled,
  heartbeatMs = 15000,
  minIntervalMs = 3000,
  minDistanceM = 15,
  maxAccuracyM = 80,
  onSend,
}: Options) => {
  const [lastFix, setLastFix] = useState<GeoFix | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<GeoError>(null);
  const [sendFailed, setSendFailed] = useState(false);

  const onSendRef = useRef(onSend);
  useEffect(() => {
    onSendRef.current = onSend;
  });

  useEffect(() => {
    if (!enabled) return;
    if (!('geolocation' in navigator)) {
      queueMicrotask(() => setLastError('unsupported'));
      return;
    }

    let latest: GeoFix | null = null;
    let lastSent: GeoFix | null = null;
    let lastSentTime = 0;
    let sending = false;

    const trySend = async (force = false) => {
      if (!latest || sending) return;
      const now = Date.now();
      const elapsed = now - lastSentTime;
      const moved = lastSent
        ? distance([lastSent.latitude, lastSent.longitude], [latest.latitude, latest.longitude])
        : Infinity;
      const due =
        force ||
        !lastSent ||
        elapsed >= heartbeatMs ||
        (elapsed >= minIntervalMs && moved >= minDistanceM);
      if (!due) return;

      sending = true;
      const fix = latest;
      try {
        await onSendRef.current(fix);
        lastSent = fix;
        lastSentTime = Date.now();
        setLastSentAt(lastSentTime);
        setSendFailed(false);
      } catch {
        setSendFailed(true);
        // 실패 시 다음 위치 수신 때 다시 시도하도록 시간만 조금 당겨둠
        lastSentTime = Date.now() - heartbeatMs + minIntervalMs;
      } finally {
        sending = false;
      }
    };

    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        setLastError(null);
        const fix: GeoFix = {
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
          heading: p.coords.heading,
          speed: p.coords.speed,
          timestamp: p.timestamp,
        };
        setLastFix(fix);
        if (fix.accuracy > maxAccuracyM) return;
        latest = fix;
        trySend();
      },
      (e) => {
        setLastError(e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable');
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
    );

    // 위치 콜백이 뜸할 때(정차 중)도 heartbeat 전송
    const timer = setInterval(() => trySend(), 1000);
    // 화면이 다시 켜지면 즉시 전송
    const onVisible = () => {
      if (document.visibilityState === 'visible') trySend(true);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, heartbeatMs, minIntervalMs, minDistanceM, maxAccuracyM]);

  return { lastFix, lastSentAt, lastError, sendFailed };
};
