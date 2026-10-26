import { useMemo } from 'react';
import { Badge, Card } from 'react-bootstrap';
import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet';
import { Link } from 'react-router-dom';
import { getActiveDrives } from '../../api';
import { Empty, LoadError } from '../../components/LoadState';
import { FitBounds } from '../../components/map/MapHelpers';
import { useAsync } from '../../hooks/useAsync';
import { useNow } from '../../hooks/useNow';
import { usePolling } from '../../hooks/usePolling';
import { formatAgo, formatTime, toLatLng } from '../../lib/format';
import { DEFAULT_CENTER, TILE_ATTRIBUTION, TILE_URL } from '../../lib/ui';
import type { DriveLog, LatLng } from '../../types';

const STALE_MS = 2 * 60 * 1000;

const LastSeen = ({ drive }: { drive: DriveLog }) => {
  const now = useNow(5000);
  const at = drive.currentLocation?.updatedAt;
  const stale = !at || now - new Date(at).getTime() > STALE_MS;
  return (
    <span className={stale ? 'text-danger' : 'text-muted'}>
      위치 {at ? formatAgo(at, now) : '없음'}
    </span>
  );
};

// 관제 현황: 진행 중인 운행을 지도와 목록으로
const Dashboard = () => {
  const { data: drives, error, reload } = useAsync(getActiveDrives, []);
  usePolling(reload, 10000);

  const located = useMemo(
    () =>
      (drives || [])
        .filter((d) => d.currentLocation?.coordinates?.length === 2)
        .map((d) => ({ drive: d, pos: toLatLng(d.currentLocation!.coordinates) as LatLng })),
    [drives]
  );

  return (
    <>
      <div className="page-title">
        <h4>운행 현황</h4>
        <Badge bg={drives?.length ? 'success' : 'secondary'}>
          진행 중 {drives?.length ?? '-'}건
        </Badge>
      </div>

      {error && <LoadError message={error} onRetry={reload} />}

      <div className="dashboard-map mb-3">
        <MapContainer center={DEFAULT_CENTER} zoom={11} className="h-100 w-100">
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
          <FitBounds
            points={located.map((l) => l.pos)}
            fitKey={located.map((l) => l.drive._id).join(',')}
            maxZoom={15}
          />
          {located.map(({ drive, pos }) => (
            <CircleMarker
              key={drive._id}
              center={pos}
              radius={10}
              pathOptions={{ color: 'white', weight: 3, fillColor: '#ef4444', fillOpacity: 1 }}
            >
              <Tooltip permanent direction="top" offset={[0, -8]}>
                {drive.routeName}
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {drives && drives.length === 0 && <Empty icon="📭">현재 진행 중인 운행이 없습니다.</Empty>}
      <div className="d-grid gap-2">
        {drives?.map((d) => {
          const next = d.checkpoints[d.currentIndex];
          return (
            <Link key={d._id} to={`/config/drives/${d._id}`} className="text-decoration-none">
              <Card className="list-card">
                <Card.Body className="py-2">
                  <div className="fw-bold text-dark">{d.routeName}</div>
                  <div className="small d-flex flex-wrap gap-2">
                    <span className="text-muted">{formatTime(d.startTime)} 시작</span>
                    {next && <span className="text-primary">다음: {next.pointName}</span>}
                    <LastSeen drive={d} />
                  </div>
                </Card.Body>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
};

export default Dashboard;
