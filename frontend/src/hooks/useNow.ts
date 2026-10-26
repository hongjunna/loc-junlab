import { useEffect, useState } from 'react';

// "n초 전" 같은 표시용. 필요한 작은 컴포넌트에서만 사용해 큰 화면 전체가 매초 리렌더되지 않게 한다.
export const useNow = (intervalMs = 1000) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
};
