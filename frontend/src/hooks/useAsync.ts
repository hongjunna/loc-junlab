import { useCallback, useEffect, useState, type DependencyList } from 'react';
import { errorMessage } from '../api';

/**
 * 비동기 데이터 로딩 + 다시 불러오기
 */
export const useAsync = <T>(fn: () => Promise<T>, deps: DependencyList) => {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const [seq, setSeq] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  useEffect(() => {
    let cancelled = false;
    run()
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch(
        (err) => !cancelled && setState((s) => ({ ...s, error: errorMessage(err), loading: false }))
      );
    return () => {
      cancelled = true;
    };
  }, [run, seq]);

  const reload = useCallback(() => setSeq((s) => s + 1), []);
  const setData = useCallback((data: T) => setState({ data, error: null, loading: false }), []);
  return { ...state, reload, setData };
};
