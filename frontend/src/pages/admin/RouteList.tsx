import { Badge, Card } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { getRoutes } from '../../api';
import { Empty, LoadError, Loading } from '../../components/LoadState';
import { useAsync } from '../../hooks/useAsync';
import { formatDateTime } from '../../lib/format';

const RouteList = () => {
  const { data: routes, error, loading, reload } = useAsync(getRoutes, []);

  return (
    <>
      <div className="page-title">
        <h4>노선 관리</h4>
        <Link to="/config/routes/new" className="btn btn-primary btn-sm">
          + 새 노선
        </Link>
      </div>

      {error && <LoadError message={error} onRetry={reload} />}
      {loading && !routes && <Loading />}
      {routes && routes.length === 0 && <Empty icon="🗺️">등록된 노선이 없습니다.</Empty>}

      <div className="d-grid gap-2">
        {routes?.map((r) => {
          const first = r.points[0];
          const last = r.points[r.points.length - 1];
          return (
            <Card key={r._id} className="list-card">
              <Card.Body className="d-flex align-items-center gap-3">
                <div className="flex-grow-1 min-w-0">
                  <div className="d-flex align-items-center gap-2">
                    <span className="fw-bold text-truncate">{r.routeName}</span>
                    {!!r.activeDriveCount && (
                      <Badge bg="success">운행 중 {r.activeDriveCount}</Badge>
                    )}
                  </div>
                  <div className="small text-muted text-truncate">
                    {first?.name} → {last?.name} · {r.points.length}개 지점
                    {first?.scheduledTime && ` · ${first.scheduledTime} 출발`}
                  </div>
                  {r.updatedAt && (
                    <div className="small text-muted">수정 {formatDateTime(r.updatedAt)}</div>
                  )}
                </div>
                <div className="d-flex gap-2 flex-shrink-0">
                  <Link to={`/config/routes/${r._id}`} className="btn btn-outline-secondary btn-sm">
                    수정
                  </Link>
                  <Link
                    to={`/config/drives?routeId=${r._id}`}
                    className="btn btn-outline-secondary btn-sm d-none d-sm-inline-block"
                  >
                    기록
                  </Link>
                </div>
              </Card.Body>
            </Card>
          );
        })}
      </div>

      {routes && routes.length > 0 && (
        <div className="text-center mt-4">
          <Link to="/config/driver" className="btn btn-dark">
            🚌 운전 시작하러 가기
          </Link>
        </div>
      )}
    </>
  );
};

export default RouteList;
