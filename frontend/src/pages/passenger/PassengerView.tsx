import { useCallback, useMemo, useState } from 'react';
import { Badge, Button, Spinner } from 'react-bootstrap';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ApiError, getPublicDrive } from '../../api';
import DriveTimetable from '../../components/DriveTimetable';
import DriveMap from '../../components/map/DriveMap';
import { useAsync } from '../../hooks/useAsync';
import { useNow } from '../../hooks/useNow';
import { usePolling } from '../../hooks/usePolling';
import { formatAgo, formatTime, hhmm, scheduleOf, toLatLng } from '../../lib/format';
import type { LatLng, PublicDrive } from '../../types';
import './PassengerView.css';

const POLL_MS = 5000;
// 이 시간 이상 위치 갱신이 없으면 신호 끊김으로 표시
const STALE_MS = 2 * 60 * 1000;

const isStale = (drive: PublicDrive, now: number) => {
  const at = drive.currentLocation?.updatedAt;
  return !at || now - new Date(at).getTime() > STALE_MS;
};

const LastUpdated = ({
  drive,
  connectionLost,
}: {
  drive: PublicDrive;
  connectionLost: boolean;
}) => {
  const now = useNow(1000);
  if (connectionLost)
    return <span className="text-warning-emphasis">⚠️ 연결 불안정 · 재시도 중</span>;
  if (drive.status !== 'running' || !drive.currentLocation) return null;
  const stale = isStale(drive, now);
  return (
    <span className={stale ? 'text-danger fw-semibold' : 'text-muted'}>
      {stale ? '⚠️ 위치 신호 끊김 · ' : ''}
      {formatAgo(drive.currentLocation.updatedAt, now)} 위치
    </span>
  );
};

// 선택한 내 정류장 안내
const MyStopCard = ({
  drive,
  index,
  onClear,
}: {
  drive: PublicDrive;
  index: number;
  onClear: () => void;
}) => {
  const now = useNow(15000);
  const cp = drive.checkpoints[index];
  if (!cp) return null;
  const sched = scheduleOf(drive.checkpoints, drive.startTime)[index];
  const expected = sched.adjusted || sched.planned;
  const stopsLeft = index - drive.currentIndex;
  const passed = cp.status === 'departed';
  const arrived = cp.status === 'arrived';

  let text: string;
  if (drive.status !== 'running')
    text =
      passed || arrived ? `${formatTime(cp.arrivalTime)} 도착했었습니다` : '운행이 종료되었습니다';
  else if (passed) text = `${formatTime(cp.departureTime)}에 지나갔습니다`;
  else if (arrived) text = '지금 정차 중입니다!';
  else if (cp.status === 'approaching') text = '곧 도착합니다!';
  else {
    const mins = expected ? Math.round((expected.getTime() - now) / 60000) : null;
    text = [
      stopsLeft > 0 ? `${stopsLeft}개 정류장 전` : '다음 정류장',
      mins !== null && mins > 0
        ? `약 ${mins}분 후 (${hhmm(expected)})`
        : expected
          ? `${hhmm(expected)} 예정`
          : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  return (
    <div
      className={`my-stop-card ${cp.status === 'approaching' || arrived ? 'my-stop-alert' : ''}`}
    >
      <div className="flex-grow-1 min-w-0">
        <div className="small opacity-75">내 정류장 · {cp.pointName}</div>
        <div className="fw-bold">{text}</div>
      </div>
      <button
        type="button"
        className="btn-close btn-close-white"
        aria-label="내 정류장 해제"
        onClick={onClear}
      />
    </div>
  );
};

const PassengerView = () => {
  const params = useParams();
  const [search] = useSearchParams();
  const code = params.code || search.get('id') || '';
  const storageKey = `myStop:${code}`;

  const { data: drive, error, reload, setData } = useAsync(() => getPublicDrive(code), [code]);
  const [connectionLost, setConnectionLost] = useState(false);
  const [autoFollow, setAutoFollow] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [flyTarget, setFlyTarget] = useState<{ pos: LatLng; seq: number } | null>(null);
  const [userPos, setUserPos] = useState<LatLng | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [myStop, setMyStop] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem(storageKey);
      return v === null ? null : Number(v);
    } catch {
      return null;
    }
  });

  // 실패해도 이전 화면은 유지하고 배너만 표시
  const refresh = useCallback(async () => {
    try {
      const next = await getPublicDrive(code);
      setData(next);
      setConnectionLost(false);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 410)) reload();
      else setConnectionLost(true);
    }
  }, [code, reload, setData]);

  usePolling(refresh, POLL_MS, !!drive && drive.status === 'running');

  const fly = (pos: LatLng) => {
    setAutoFollow(false);
    setFlyTarget((prev) => ({ pos, seq: (prev?.seq || 0) + 1 }));
  };

  const chooseStop = (index: number) => {
    if (!drive) return;
    fly(toLatLng(drive.checkpoints[index].coordinates));
    const next = myStop === index ? null : index;
    setMyStop(next);
    try {
      if (next === null) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, String(next));
    } catch {
      // 무시
    }
  };

  const handleUserLocation = () => {
    if (!navigator.geolocation) {
      setLocError('이 브라우저는 위치 기능을 지원하지 않습니다.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos: LatLng = [p.coords.latitude, p.coords.longitude];
        setUserPos(pos);
        setLocError(null);
        fly(pos);
      },
      (err) =>
        setLocError(
          err.code === 1 ? '위치 권한이 거부되었습니다.' : '현재 위치를 확인할 수 없습니다.'
        ),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const onUserInteract = useCallback(() => setAutoFollow(false), []);

  const car = useMemo(() => {
    if (!drive?.currentLocation || drive.status !== 'running') return null;
    return {
      pos: toLatLng(drive.currentLocation.coordinates),
      heading: drive.currentLocation.heading,
      stale: isStale(drive, new Date(drive.serverTime).getTime()),
    };
  }, [drive]);

  if (error) {
    const notFound = error.includes('찾을 수 없') || error.includes('만료');
    return (
      <div className="center-page text-center">
        <div className="fs-1 mb-2">{notFound ? '🔍' : '⚠️'}</div>
        <h5 className="fw-bold">{notFound ? error : '정보를 불러오지 못했습니다'}</h5>
        {!notFound && <p className="text-muted small">{error}</p>}
        <p className="text-muted small">공유받은 코드나 링크를 다시 확인해주세요.</p>
        <div className="d-flex gap-2 justify-content-center">
          {!notFound && (
            <Button variant="primary" onClick={reload}>
              다시 시도
            </Button>
          )}
          <Link to="/" className="btn btn-outline-secondary">
            코드 다시 입력
          </Link>
        </div>
      </div>
    );
  }
  if (!drive) {
    return (
      <div className="center-page">
        <Spinner animation="border" />
      </div>
    );
  }

  const waiting = drive.status === 'running' && !drive.startedAt;
  const statusLabel =
    drive.status === 'completed' ? '운행 종료' : waiting ? '운행 대기' : '운행 중';

  return (
    <div className="pv-container">
      <div className={`pv-map ${expanded ? 'pv-map-collapsed' : ''}`}>
        <DriveMap
          checkpoints={drive.checkpoints}
          currentIndex={drive.status === 'running' ? drive.currentIndex : -1}
          car={car}
          track={drive.track}
          autoFollow={autoFollow}
          onUserInteract={onUserInteract}
          flyTarget={flyTarget}
          userPos={userPos}
          myStopIndex={myStop}
          resizeKey={expanded}
        />
        <div className="pv-map-buttons">
          <button
            type="button"
            className="map-fab"
            onClick={handleUserLocation}
            aria-label="내 위치"
          >
            📍
          </button>
          {!autoFollow && (
            <button
              type="button"
              className="map-fab map-fab-wide"
              onClick={() => setAutoFollow(true)}
            >
              🚌 차량 따라가기
            </button>
          )}
        </div>
        {locError && <div className="pv-map-toast">{locError}</div>}
      </div>

      <section className={`pv-sheet ${expanded ? 'pv-sheet-expanded' : ''}`}>
        <button
          type="button"
          className="pv-handle"
          onClick={() => setExpanded((v) => !v)}
          aria-label="시간표 펼치기/접기"
        >
          <span />
        </button>
        <div className="pv-header">
          <div className="d-flex align-items-start gap-2">
            <h1 className="pv-title flex-grow-1">{drive.routeName}</h1>
            <button type="button" className="pv-expand-btn" onClick={() => setExpanded((v) => !v)}>
              {expanded ? '🗺️ 지도' : '📜 시간표'}
            </button>
          </div>
          <div className="pv-status">
            <Badge
              bg={drive.status === 'completed' ? 'secondary' : waiting ? 'warning' : 'success'}
              text={waiting ? 'dark' : undefined}
            >
              {statusLabel}
            </Badge>
            {drive.startedAt && (
              <span className="text-muted">
                출발 {formatTime(drive.checkpoints[0]?.departureTime || drive.startedAt)}
              </span>
            )}
            <span className="ms-auto">
              <LastUpdated drive={drive} connectionLost={connectionLost} />
            </span>
          </div>
          {waiting && (
            <div className="pv-notice pv-notice-waiting">
              ⏳ 차량이 출발지로 이동 중입니다. 출발지 도착 후 위치가 표시됩니다.
            </div>
          )}
          {drive.status === 'completed' && (
            <div className="pv-notice pv-notice-ended">
              🏁 운행이 종료되었습니다. {drive.endTime && `(${formatTime(drive.endTime)})`}
            </div>
          )}
          {myStop !== null && (
            <MyStopCard drive={drive} index={myStop} onClear={() => chooseStop(myStop)} />
          )}
        </div>

        <div className="pv-hint">
          {myStop === null
            ? '💡 정류장을 누르면 내 정류장으로 지정됩니다'
            : '정류장을 누르면 지도에서 위치를 보여줍니다'}
        </div>
        <div className="pv-table">
          <DriveTimetable
            checkpoints={drive.checkpoints}
            currentIndex={drive.currentIndex}
            baseDate={drive.startTime}
            running={drive.status === 'running' && !waiting}
            highlightIndex={myStop}
            onRowClick={chooseStop}
          />
        </div>
      </section>
    </div>
  );
};

export default PassengerView;
