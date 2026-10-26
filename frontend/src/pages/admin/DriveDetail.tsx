import { Badge, Card } from 'react-bootstrap';
import { Link, useParams } from 'react-router-dom';
import { getDrive } from '../../api';
import DriveTimetable from '../../components/DriveTimetable';
import { LoadError, Loading } from '../../components/LoadState';
import DriveMap from '../../components/map/DriveMap';
import { useAsync } from '../../hooks/useAsync';
import { formatDateTime, toLatLng } from '../../lib/format';
import type { LatLng } from '../../types';

const DriveDetail = () => {
  const { id = '' } = useParams();
  const { data: drive, error, reload } = useAsync(() => getDrive(id), [id]);

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!drive) return <Loading />;

  const track: LatLng[] = (drive.track || []).map((p) => [p.lat, p.lng]);
  const running = drive.status === 'running';
  const car =
    running && drive.currentLocation?.coordinates
      ? { pos: toLatLng(drive.currentLocation.coordinates) }
      : null;

  return (
    <>
      <div className="page-title">
        <h4 className="text-truncate">{drive.routeName}</h4>
        <Link to="/config/drives" className="btn btn-outline-secondary btn-sm flex-shrink-0">
          목록
        </Link>
      </div>
      <Card className="mb-3">
        <Card.Body className="small d-flex flex-wrap gap-3">
          <span>
            {running ? <Badge bg="success">운행 중</Badge> : <Badge bg="dark">종료</Badge>}
            {drive.endReason === 'stale' && (
              <Badge bg="secondary" className="ms-1">
                위치 갱신 없음으로 자동 종료
              </Badge>
            )}
          </span>
          <span>시작 {formatDateTime(drive.startTime)}</span>
          {drive.endTime && <span>종료 {formatDateTime(drive.endTime)}</span>}
          {drive.shareCode && (
            <span>
              공유 코드 <b>{drive.shareCode}</b>
            </span>
          )}
        </Card.Body>
      </Card>
      <div className="detail-map mb-3">
        <DriveMap
          checkpoints={drive.checkpoints}
          currentIndex={running ? drive.currentIndex : -1}
          car={car}
          track={track}
          autoFollow={false}
        />
      </div>
      <Card>
        <DriveTimetable
          checkpoints={drive.checkpoints}
          currentIndex={drive.currentIndex}
          baseDate={drive.startTime}
          running={running}
        />
      </Card>
      {drive.checkpoints.some((c) => c.manual) && (
        <div className="small text-muted mt-2">
          * 일부 정류장은 운전자가 수기로 도착 처리했습니다.
        </div>
      )}
    </>
  );
};

export default DriveDetail;
