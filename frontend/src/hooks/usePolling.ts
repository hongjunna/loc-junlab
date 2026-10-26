import { useEffect, useRef } from 'react';

/**
 * 탭이 보일 때만 주기적으로 실행. 다시 보이면 즉시 한 번 실행한다.
 */
export const usePolling = (fn: () => void | Promise<void>, intervalMs: number, enabled = true) => {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === 'visible') {
        try {
          await fnRef.current();
        } catch {
          // 호출부에서 처리
        }
      }
      if (!stopped) timer = setTimeout(tick, intervalMs);
    };

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      tick();
    };

    timer = setTimeout(tick, intervalMs);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs, enabled]);
};
