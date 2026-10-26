import { useState } from 'react';
import { Badge, Button, Card, Form, Spinner } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router-dom';
import { errorMessage, getDrives, getRoutes } from '../../api';
import { Empty, LoadError, Loading } from '../../components/LoadState';
import { useAsync } from '../../hooks/useAsync';
import { delayMinutes, formatDateTime, scheduleOf } from '../../lib/format';
import type { DriveLog } from '../../types';

// 운행 요약: 도착지 기준 지연
const summary = (d: DriveLog) => {
  const last = d.checkpoints[d.checkpoints.length - 1];
  const sched = scheduleOf(d.checkpoints, d.startTime);
  const delay = delayMinutes(sched[sched.length - 1]?.planned || null, last?.arrivalTime);
  const done = d.checkpoints.filter(
    (c) => c.status === 'arrived' || c.status === 'departed'
  ).length;
  return { delay, done };
};

const DriveHistory = () => {
  const [params, setParams] = useSearchParams();
  const routeId = params.get('routeId') || '';
  const { data: routes } = useAsync(getRoutes, []);
  const {
    data: drives,
    error,
    loading,
    reload,
    setData,
  } = useAsync(() => getDrives({ routeId }), [routeId]);
  const [more, setMore] = useState<{ loading: boolean; done: boolean; error?: string }>({
    loading: false,
    done: false,
  });

  const loadMore = async () => {
    if (!drives?.length) return;
    setMore({ loading: true, done: false });
    try {
      const next = await getDrives({ routeId, before: drives[drives.length - 1].startTime });
      setData([...drives, ...next]);
      setMore({ loading: false, done: next.length === 0 });
    } catch (err) {
      setMore({ loading: false, done: false, error: errorMessage(err) });
    }
  };

  return (
    <>
      <div className="page-title">
        <h4>운행 기록</h4>
      </div>

      <Form.Select
        size="sm"
        className="mb-3"
        value={routeId}
        onChange={(e) => {
          setMore({ loading: false, done: false });
          setParams(e.target.value ? { routeId: e.target.value } : {});
        }}
      >
        <option value="">전체 노선</option>
        {routes?.map((r) => (
          <option key={r._id} value={r._id}>
            {r.routeName}
          </option>
        ))}
      </Form.Select>

      {error && <LoadError message={error} onRetry={reload} />}
      {loading && !drives && <Loading />}
      {drives && drives.length === 0 && <Empty icon="📭">운행 기록이 없습니다.</Empty>}

      <div className="d-grid gap-2">
        {drives?.map((d) => {
          const { delay, done } = summary(d);
          return (
            <Link key={d._id} to={`/config/drives/${d._id}`} className="text-decoration-none">
              <Card className="list-card">
                <Card.Body className="py-2">
                  <div className="d-flex align-items-center gap-2">
                    {d.status === 'running' ? (
                      <Badge bg="success">운행 중</Badge>
                    ) : d.endReason === 'stale' ? (
                      <Badge bg="secondary">자동 종료</Badge>
                    ) : (
                      <Badge bg="dark">종료</Badge>
                    )}
                    <span className="fw-bold text-dark text-truncate">{d.routeName}</span>
                  </div>
                  <div className="small text-muted d-flex flex-wrap gap-2 mt-1">
                    <span>{formatDateTime(d.startTime)}</span>
                    <span>
                      {done}/{d.checkpoints.length} 정류장
                    </span>
                    {delay !== null && (
                      <span className={delay > 1 ? 'text-danger' : 'text-success'}>
                        도착{' '}
                        {delay > 1 ? `${delay}분 지연` : delay < -1 ? `${-delay}분 빠름` : '정시'}
                      </span>
                    )}
                  </div>
                </Card.Body>
              </Card>
            </Link>
          );
        })}
      </div>

      {drives && drives.length >= 30 && !more.done && (
        <div className="text-center mt-3">
          {more.error && <div className="text-danger small mb-2">{more.error}</div>}
          <Button variant="outline-secondary" size="sm" onClick={loadMore} disabled={more.loading}>
            {more.loading ? <Spinner size="sm" /> : '더 보기'}
          </Button>
        </div>
      )}
    </>
  );
};

export default DriveHistory;
