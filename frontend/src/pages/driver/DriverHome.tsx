import { useState } from 'react';
import { Badge, Button, Card, Spinner } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { errorMessage, getActiveDrives, getRoutes, startDrive } from '../../api';
import { useFeedback } from '../../components/feedback/context';
import { Empty, LoadError, Loading } from '../../components/LoadState';
import { useAsync } from '../../hooks/useAsync';
import { formatTime } from '../../lib/format';
import { ACTIVE_DRIVE_KEY } from '../../lib/ui';
import type { Route } from '../../types';

const DriverHome = () => {
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const routes = useAsync(getRoutes, []);
  const active = useAsync(getActiveDrives, []);
  const [starting, setStarting] = useState<string | null>(null);
  const [myDriveId] = useState(() => {
    try {
      return localStorage.getItem(ACTIVE_DRIVE_KEY);
    } catch {
      return null;
    }
  });
  const myDrive = active.data?.find((d) => d._id === myDriveId);

  const handleStart = async (route: Route) => {
    if (route.activeDriveCount) {
      const ok = await confirm({
        title: '이미 진행 중인 운행이 있습니다',
        body: `'${route.routeName}' 노선은 이미 운행 중입니다. 새 운행을 또 시작할까요?\n이어서 운행하려면 아래 '진행 중인 운행'에서 접속하세요.`,
        confirmLabel: '새로 시작',
      });
      if (!ok) return;
    }
    setStarting(route._id);
    try {
      const drive = await startDrive(route._id);
      try {
        localStorage.setItem(ACTIVE_DRIVE_KEY, drive._id);
      } catch {
        // 무시
      }
      navigate(`/config/driver/${drive._id}`);
    } catch (err) {
      toast(errorMessage(err), { variant: 'danger' });
    } finally {
      setStarting(null);
    }
  };

  return (
    <>
      <div className="page-title">
        <h4>운전 시작</h4>
      </div>

      {myDrive && (
        <Link to={`/config/driver/${myDrive._id}`} className="resume-banner">
          <div>
            <div className="fw-bold">진행 중이던 운행이 있습니다</div>
            <div className="small">{myDrive.routeName} · 탭하여 이어서 운행</div>
          </div>
          <span className="fs-4">›</span>
        </Link>
      )}

      <div className="section-label">🔄 진행 중인 운행</div>
      {active.error && <LoadError message={active.error} onRetry={active.reload} />}
      {active.loading && !active.data && <Loading />}
      {active.data?.length === 0 && (
        <div className="text-muted small mb-3 ps-1">진행 중인 운행이 없습니다.</div>
      )}
      <div className="d-grid gap-2 mb-4">
        {active.data?.map((d) => (
          <Card key={d._id} className="list-card">
            <Card.Body className="d-flex align-items-center gap-2">
              <div className="flex-grow-1 min-w-0">
                <div className="d-flex align-items-center gap-2">
                  <Badge bg="success">운행 중</Badge>
                  <span className="fw-bold text-truncate">{d.routeName}</span>
                </div>
                <div className="small text-muted">
                  {formatTime(d.startTime)} 시작 · 다음 {d.checkpoints[d.currentIndex]?.pointName}
                </div>
              </div>
              <Link to={`/config/driver/${d._id}`} className="btn btn-success btn-sm fw-bold px-3">
                이어서 운행
              </Link>
            </Card.Body>
          </Card>
        ))}
      </div>

      <div className="section-label">🆕 새 운행 시작</div>
      {routes.error && <LoadError message={routes.error} onRetry={routes.reload} />}
      {routes.loading && !routes.data && <Loading />}
      {routes.data?.length === 0 && (
        <Empty icon="🗺️">
          등록된 노선이 없습니다.
          <div className="mt-2">
            <Link to="/config/routes/new" className="btn btn-outline-primary btn-sm">
              노선 등록하기
            </Link>
          </div>
        </Empty>
      )}
      <div className="d-grid gap-2">
        {routes.data?.map((r) => (
          <Card key={r._id} className="list-card">
            <Card.Body className="d-flex align-items-center gap-2">
              <div className="flex-grow-1 min-w-0">
                <div className="fw-bold text-truncate">{r.routeName}</div>
                <div className="small text-muted text-truncate">
                  {r.points[0]?.name} → {r.points[r.points.length - 1]?.name}
                  {r.points[0]?.scheduledTime && ` · ${r.points[0].scheduledTime}`}
                </div>
              </div>
              <Button
                className="fw-bold px-3"
                onClick={() => handleStart(r)}
                disabled={starting !== null}
              >
                {starting === r._id ? <Spinner size="sm" /> : '시작'}
              </Button>
            </Card.Body>
          </Card>
        ))}
      </div>
    </>
  );
};

export default DriverHome;
