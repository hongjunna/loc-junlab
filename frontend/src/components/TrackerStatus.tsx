import { Badge } from 'react-bootstrap';
import { useNow } from '../hooks/useNow';
import { formatAgo } from '../lib/format';
import { TRACKER_ONLINE_MS } from '../lib/ui';
import type { TrackerSummary } from '../types';

// 트래커 기기의 마지막 수신 상태 (매초 갱신)
const TrackerStatus = ({
  tracker,
  compact = false,
}: {
  tracker: TrackerSummary;
  compact?: boolean;
}) => {
  const now = useNow(1000);
  const seen = tracker.lastSeenAt ? new Date(tracker.lastSeenAt).getTime() : null;
  const online = seen !== null && now - seen < TRACKER_ONLINE_MS;
  const battery = tracker.lastLocation?.battery;

  if (seen === null) {
    return (
      <Badge bg="secondary">{compact ? '수신 기록 없음' : '아직 수신된 위치가 없습니다'}</Badge>
    );
  }
  return (
    <span className="d-inline-flex align-items-center gap-2 flex-wrap">
      <Badge bg={online ? 'success' : 'warning'} text={online ? undefined : 'dark'}>
        {online ? '● 연결됨' : '신호 없음'}
      </Badge>
      <span className="small text-muted">
        {formatAgo(tracker.lastSeenAt, now)} 수신
        {battery !== undefined && ` · 🔋${Math.round(battery)}%`}
        {!compact &&
          tracker.lastLocation?.accuracy !== undefined &&
          ` · ±${Math.round(tracker.lastLocation.accuracy)}m`}
      </span>
    </span>
  );
};

export default TrackerStatus;
