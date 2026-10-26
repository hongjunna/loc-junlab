import { useEffect, useState } from 'react';

/**
 * 화면 꺼짐 방지. 탭이 숨겨지면 브라우저가 자동 해제하므로
 * 다시 보일 때 재요청한다.
 */
export const useWakeLock = (enabled: boolean) => {
  const [active, setActive] = useState(false);
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  useEffect(() => {
    if (!enabled || !supported) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (cancelled) {
          next.release();
          return;
        }
        lock = next;
        setActive(true);
        next.addEventListener('release', () => setActive(false));
      } catch {
        setActive(false);
      }
    };

    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', request);
      lock?.release();
    };
  }, [enabled, supported]);

  return { supported, active: enabled && active };
};
