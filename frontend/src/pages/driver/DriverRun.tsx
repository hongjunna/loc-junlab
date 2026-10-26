import { useCallback, useState } from 'react';
import { Badge, Button, Collapse, Modal, Spinner } from 'react-bootstrap';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  arriveCheckpoint,
  endDrive,
  errorMessage,
  getDrive,
  getTrackers,
  sendLocation,
  setDriveTracker,
  undoCheckpoint,
} from '../../api';
import LocationSourcePicker from '../../components/LocationSourcePicker';
import { useFeedback } from '../../components/feedback/context';
import { LoadError, Loading } from '../../components/LoadState';
import ShareModal from '../../components/ShareModal';
import { useAsync } from '../../hooks/useAsync';
import { useGeoTracker, type GeoFix } from '../../hooks/useGeoTracker';
import { useNow } from '../../hooks/useNow';
import { usePolling } from '../../hooks/usePolling';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import { useSpeech } from '../../hooks/useSpeech';
import { useWakeLock } from '../../hooks/useWakeLock';
import {
  distance,
  formatAgo,
  formatDistance,
  formatTime,
  hhmm,
  scheduleOf,
  toLatLng,
} from '../../lib/format';
import { ACTIVE_DRIVE_KEY, STATUS_BADGE, TYPE_BADGE } from '../../lib/ui';
import type { Checkpoint, CheckpointUpdate, DriveLog, Tracker, TrackerEvent } from '../../types';
import './DriverRun.css';

// 이 시간 이상 전송이 안 되면 경고
const SEND_STALE_MS = 45 * 1000;

const GPS_ERROR_TEXT = {
  denied: '위치 권한이 거부되었습니다. 브라우저/기기 설정에서 위치 권한을 허용해주세요.',
  unavailable: 'GPS 신호를 찾을 수 없습니다.',
  timeout: 'GPS 응답이 지연되고 있습니다.',
  unsupported: '이 브라우저는 위치 기능을 지원하지 않습니다.',
};

// 전송 상태 표시줄 (매초 갱신되는 부분만 분리)
const StatusBar = ({
  lastSentAt,
  lastFix,
  sendFailed,
  gpsError,
  wakeLock,
}: {
  lastSentAt: number | null;
  lastFix: GeoFix | null;
  sendFailed: boolean;
  gpsError: keyof typeof GPS_ERROR_TEXT | null;
  wakeLock: { supported: boolean; active: boolean };
}) => {
  const now = useNow(1000);
  const stale = !lastSentAt || now - lastSentAt > SEND_STALE_MS;
  const level =
    gpsError || (stale && lastSentAt) ? 'danger' : sendFailed || !lastSentAt ? 'warning' : 'ok';

  return (
    <div className={`run-status run-status-${level}`}>
      <div className="d-flex justify-content-between align-items-center gap-2">
        <span>
          📡{' '}
          {gpsError
            ? 'GPS 오류'
            : lastSentAt
              ? `전송 ${formatAgo(new Date(lastSentAt).toISOString(), now)}`
              : 'GPS 수신 대기 중...'}
          {sendFailed && ' · 전송 실패, 재시도 중'}
        </span>
        <span className="text-nowrap">
          {lastFix && `±${Math.round(lastFix.accuracy)}m`}
          {lastFix?.speed != null &&
            lastFix.speed >= 0 &&
            ` · ${Math.round(lastFix.speed * 3.6)}km/h`}
        </span>
      </div>
      {gpsError && <div className="small mt-1">{GPS_ERROR_TEXT[gpsError]}</div>}
      {!gpsError && stale && lastSentAt && (
        <div className="small mt-1">
          위치가 전송되지 않고 있습니다. 이 화면을 켜둔 채로 유지해주세요.
        </div>
      )}
      {wakeLock.supported && !wakeLock.active && (
        <div className="small mt-1">
          ⚠️ 화면 꺼짐 방지가 해제되었습니다. 화면을 한 번 터치해주세요.
        </div>
      )}
    </div>
  );
};

// Traccar 위치 앱으로 전송 중일 때 상태 표시줄
const TrackerBar = ({ drive }: { drive: DriveLog }) => {
  const now = useNow(1000);
  const tracker = drive.trackerId!;
  const loc = drive.currentLocation?.source === 'traccar' ? drive.currentLocation : null;
  const at = loc?.updatedAt || tracker.lastSeenAt;
  const stale = !at || now - new Date(at).getTime() > 3 * 60 * 1000;
  const battery = loc?.battery ?? tracker.lastLocation?.battery;
  return (
    <div className={`run-status run-status-${!at ? 'warning' : stale ? 'danger' : 'ok'}`}>
      <div className="d-flex justify-content-between align-items-center gap-2">
        <span className="text-truncate">
          📱 {tracker.name} · {at ? `수신 ${formatAgo(at, now)}` : '수신 대기 중...'}
        </span>
        <span className="text-nowrap">
          {loc?.accuracy !== undefined && `±${Math.round(loc.accuracy)}m`}
          {battery !== undefined && ` · 🔋${Math.round(battery)}%`}
        </span>
      </div>
      <div className="small mt-1">
        {!at
          ? 'Traccar Client 앱에서 위치 전송이 켜져 있는지 확인해주세요.'
          : stale
            ? '위치 앱에서 신호가 오지 않습니다. 앱의 전송 상태와 권한을 확인해주세요.'
            : '화면을 꺼도 위치가 전송됩니다.'}
      </div>
    </div>
  );
};

const DriverRun = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const speak = useSpeech();
  const { data: drive, error, reload, setData } = useAsync(() => getDrive(id), [id]);
  useDocumentMeta(drive ? `운행 중 · ${drive.routeName}` : '운행관리', { noindex: true });
  const [engaged, setEngaged] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  const [sourceModal, setSourceModal] = useState<{
    trackers: Tracker[] | null;
    value: string | null;
  } | null>(null);
  const [lastEventSeen, setLastEventSeen] = useState<string | undefined>(undefined);

  const running = drive?.status === 'running';
  // Traccar 위치 앱으로 전송하는 운행이면 이 폰의 브라우저 위치 추적은 쓰지 않음
  const viaTracker = !!drive?.trackerId;
  const wakeLock = useWakeLock(engaged && running && !viaTracker);

  const addLog = useCallback((msg: string) => {
    const t = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    setLogs((prev) => [`[${t}] ${msg}`, ...prev].slice(0, 30));
  }, []);

  const applyUpdate = useCallback(
    (
      update: Pick<CheckpointUpdate, 'checkpoints' | 'currentIndex'> &
        Partial<Pick<DriveLog, 'currentLocation' | 'canUndo'>>
    ) => {
      if (!drive) return;
      setData({ ...drive, ...update });
    },
    [drive, setData]
  );

  const handleEvents = useCallback(
    (events: TrackerEvent[], checkpoints: Checkpoint[]) => {
      if (events.length === 0) return;
      const last = events[events.length - 1];
      setLastMessage(last.message);
      events.forEach((e) => addLog(e.message));

      const isFinal = last.kind === 'arrive' && last.index === checkpoints.length - 1;
      if (isFinal) {
        speak(`${last.pointName}, 종점에 도착했습니다. 운행 종료 버튼을 눌러주세요.`, true);
        toast('종점에 도착했습니다. 운행을 종료해주세요.', {
          variant: 'success',
          durationMs: 8000,
        });
        return;
      }
      const announce = events.find((e) => e.announce);
      if (announce) speak(announce.message, true);
      else if (last.kind === 'arrive' && checkpoints[last.index]?.useAnnouncement)
        speak(last.message);
    },
    [addLog, speak, toast]
  );

  // Traccar 모드: 서버에서 판정한 결과를 주기적으로 받아온다
  usePolling(
    async () => {
      const next = await getDrive(id);
      setData(next);
      if (next.lastEventAt && next.lastEventAt !== lastEventSeen) {
        if (lastEventSeen !== undefined && next.lastMessage) {
          setLastMessage(next.lastMessage);
          addLog(next.lastMessage);
          if (engaged) speak(next.lastMessage, true);
        }
        setLastEventSeen(next.lastEventAt);
      }
    },
    5000,
    running && viaTracker
  );

  const openSourceModal = async () => {
    setSourceModal({ trackers: null, value: drive?.trackerId?._id || null });
    try {
      const trackers = await getTrackers();
      setSourceModal((m) => (m ? { ...m, trackers } : m));
    } catch (err) {
      toast(errorMessage(err), { variant: 'danger' });
      setSourceModal(null);
    }
  };

  const saveSource = async () => {
    if (!sourceModal || !drive) return;
    setBusy(true);
    try {
      const res = await setDriveTracker(id, sourceModal.value);
      setData({ ...drive, trackerId: res.trackerId });
      setSourceModal(null);
      toast(
        res.trackerId
          ? `'${res.trackerId.name}' 위치 앱으로 전송합니다. 화면을 꺼도 됩니다.`
          : '이 폰 브라우저로 전송합니다. 화면을 켜둔 채로 유지해주세요.',
        { variant: 'info' }
      );
    } catch (err) {
      toast(errorMessage(err), { variant: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const tracker = useGeoTracker({
    enabled: engaged && running && !viaTracker,
    onSend: async (fix) => {
      try {
        const res = await sendLocation(id, {
          latitude: fix.latitude,
          longitude: fix.longitude,
          accuracy: fix.accuracy,
          heading: fix.heading,
          speed: fix.speed,
        });
        applyUpdate({ ...res, canUndo: res.events.length > 0 ? false : drive?.canUndo });
        handleEvents(res.events, res.checkpoints);
        if (!res.judged) addLog(`정확도 낮음(±${Math.round(fix.accuracy)}m) - 위치만 갱신`);
      } catch (err) {
        addLog(`전송 실패: ${errorMessage(err)}`);
        // 다른 곳에서 운행이 종료된 경우
        if ((err as { status?: number }).status === 409) reload();
        throw err;
      }
    },
  });

  const engage = () => {
    // 사용자 탭 안에서 음성을 한 번 재생해야 이후 자동 안내가 허용됨
    const resumed = drive?.checkpoints.some((c) => c.status !== 'pending');
    speak(resumed ? '운행을 재개합니다.' : '운행을 시작합니다.', true);
    setEngaged(true);
    try {
      localStorage.setItem(ACTIVE_DRIVE_KEY, id);
    } catch {
      // 무시
    }
  };

  const handleArrive = async (index: number) => {
    if (!drive) return;
    const cp = drive.checkpoints[index];
    // 아직 도착하지 않은 채로 건너뛰게 되는 정류장 수 (정차 중인 정류장은 제외)
    const skipped = drive.checkpoints
      .slice(drive.currentIndex, index)
      .filter((c) => c.status === 'pending' || c.status === 'approaching').length;
    if (skipped > 0) {
      const ok = await confirm({
        title: `'${cp.pointName}'까지 도착 처리할까요?`,
        body: `앞의 정류장 ${skipped}곳은 통과한 것으로 처리됩니다.`,
        confirmLabel: '도착 처리',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await arriveCheckpoint(id, index);
      applyUpdate(res);
      handleEvents(res.events || [], res.checkpoints);
      toast(`${cp.pointName} 도착 처리됨`, {
        action: { label: '되돌리기', onClick: () => handleUndo() },
      });
    } catch (err) {
      toast(errorMessage(err), { variant: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const handleUndo = async () => {
    try {
      const res = await undoCheckpoint(id);
      applyUpdate(res);
      setLastMessage(null);
      toast('도착 처리를 되돌렸습니다.');
    } catch (err) {
      toast(errorMessage(err), { variant: 'danger' });
    }
  };

  const handleEnd = async () => {
    if (!drive) return;
    const last = drive.checkpoints[drive.checkpoints.length - 1];
    const ok = await confirm({
      title: '운행을 종료할까요?',
      body:
        last.status === 'pending' || last.status === 'approaching'
          ? '아직 종점에 도착하지 않았습니다. 종료하면 위치 공유가 중단됩니다.'
          : '종료하면 위치 공유가 중단됩니다.',
      confirmLabel: '운행 종료',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await endDrive(id);
      speak('운행을 종료합니다.', true);
      try {
        localStorage.removeItem(ACTIVE_DRIVE_KEY);
      } catch {
        // 무시
      }
      setData({ ...drive, ...res, track: drive.track });
      setEngaged(false);
    } catch (err) {
      toast(errorMessage(err), { variant: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    if (running)
      toast('운행은 계속 진행 중입니다. 목록에서 다시 접속할 수 있습니다.', { variant: 'info' });
    navigate('/config/driver');
  };

  if (error) {
    return (
      <div className="p-3">
        <LoadError message={error} onRetry={reload} />
        <Link to="/config/driver">← 운전 시작 화면으로</Link>
      </div>
    );
  }
  if (!drive) return <Loading />;

  const { checkpoints, currentIndex } = drive;
  const schedule = scheduleOf(checkpoints, drive.startTime);
  const current = checkpoints[currentIndex];
  const stoppedAt = current?.status === 'arrived' ? current : null;
  const nextIndex = stoppedAt ? currentIndex + 1 : currentIndex;
  const next = checkpoints[nextIndex];
  const myPos: [number, number] | null =
    !viaTracker && tracker.lastFix
      ? [tracker.lastFix.latitude, tracker.lastFix.longitude]
      : drive.currentLocation?.coordinates
        ? toLatLng(drive.currentLocation.coordinates)
        : null;
  const message = lastMessage || drive.lastMessage;
  const distToNext = next && myPos ? distance(myPos, toLatLng(next.coordinates)) : null;
  const nextSched = next ? schedule[nextIndex] : null;
  const finished = !running;

  return (
    <div className="run-container">
      <header className="run-header">
        <Button variant="link" className="run-back" onClick={leave} aria-label="목록으로">
          ‹
        </Button>
        <div className="flex-grow-1 min-w-0 text-center">
          <div className="run-title text-truncate">{drive.routeName}</div>
          <small className={running ? 'text-success fw-bold' : 'text-muted'}>
            {running ? '● 운행 중' : '운행 종료됨'}
            {drive.shareCode && ` · 코드 ${drive.shareCode}`}
          </small>
        </div>
        {running && (
          <Button
            variant="light"
            className="run-icon-btn"
            onClick={openSourceModal}
            aria-label="위치 전송 방식"
            title="위치 전송 방식"
          >
            📡
          </Button>
        )}
        <Button
          variant="light"
          className="run-icon-btn"
          onClick={() => setShowShare(true)}
          aria-label="공유"
        >
          🔗
        </Button>
      </header>

      {running && viaTracker && <TrackerBar drive={drive} />}
      {running && engaged && !viaTracker && (
        <StatusBar
          lastSentAt={tracker.lastSentAt}
          lastFix={tracker.lastFix}
          sendFailed={tracker.sendFailed}
          gpsError={tracker.lastError}
          wakeLock={wakeLock}
        />
      )}

      <div className="run-content">
        {finished ? (
          <div className="next-card next-card-done">
            <div className="fs-1">🏁</div>
            <div className="fw-bold fs-5">운행이 종료되었습니다</div>
            <div className="text-muted small">{formatTime(drive.endTime)} 종료</div>
            <div className="d-flex gap-2 justify-content-center mt-3">
              <Link to="/config/driver" className="btn btn-primary">
                운전 시작 화면
              </Link>
              <Link to={`/config/drives/${drive._id}`} className="btn btn-outline-secondary">
                운행 기록 보기
              </Link>
            </div>
          </div>
        ) : (
          <>
            {stoppedAt && (
              <div className="stopped-card">
                <Badge bg="success" className="blink">
                  정차 중
                </Badge>
                <span className="fw-bold ms-2">{stoppedAt.pointName}</span>
                <span className="text-muted small ms-auto">
                  {formatTime(stoppedAt.arrivalTime)} 도착
                </span>
              </div>
            )}
            {next ? (
              <div
                className={`next-card ${next.status === 'approaching' ? 'next-card-approaching' : ''}`}
              >
                <div className="next-label">
                  {next.status === 'approaching'
                    ? '곧 도착'
                    : nextIndex === 0
                      ? '출발지로 이동'
                      : '다음 정류장'}
                  <span className="ms-2 text-muted">
                    {nextIndex + 1}/{checkpoints.length}
                  </span>
                </div>
                <div className="next-name">{next.pointName}</div>
                <div className="next-meta">
                  <div>
                    <div className="next-meta-label">남은 거리</div>
                    <div className="next-meta-value">
                      {distToNext !== null ? formatDistance(distToNext) : '-'}
                    </div>
                  </div>
                  <div>
                    <div className="next-meta-label">예정</div>
                    <div className="next-meta-value">
                      {hhmm(nextSched?.adjusted || nextSched?.planned || null)}
                    </div>
                  </div>
                </div>
                <Button
                  size="lg"
                  variant={next.status === 'approaching' ? 'success' : 'primary'}
                  className="w-100 fw-bold mt-3 py-3"
                  disabled={busy}
                  onClick={() => handleArrive(nextIndex)}
                >
                  {next.pointName} 도착
                </Button>
              </div>
            ) : (
              <div className="next-card next-card-done">
                <div className="fs-1">🏁</div>
                <div className="fw-bold">종점에 도착했습니다</div>
                <div className="text-muted small">아래 버튼으로 운행을 종료해주세요.</div>
              </div>
            )}

            {message && <div className="run-message">🔔 {message}</div>}
            {drive.canUndo && (
              <Button
                variant="outline-secondary"
                size="sm"
                className="w-100 mb-2"
                onClick={handleUndo}
              >
                ↩ 마지막 수기 도착 처리 되돌리기
              </Button>
            )}
          </>
        )}

        <button type="button" className="timeline-toggle" onClick={() => setShowAll((v) => !v)}>
          전체 정류장 ({checkpoints.length}) {showAll ? '▲' : '▼'}
        </button>
        <Collapse in={showAll || finished}>
          <div>
            <ol className="timeline">
              {checkpoints.map((cp, i) => {
                const badge = TYPE_BADGE[cp.type] || TYPE_BADGE['경유지'];
                const status = STATUS_BADGE[cp.status];
                const done = cp.status === 'departed' || cp.status === 'arrived';
                const sched = schedule[i];
                return (
                  <li
                    key={i}
                    className={`timeline-item tl-${cp.status} ${i === nextIndex && running ? 'tl-next' : ''}`}
                  >
                    <div className="tl-dot" />
                    <div className="flex-grow-1 min-w-0">
                      <div className="d-flex align-items-center gap-2">
                        <Badge bg={badge.bg} text={badge.text as 'dark' | undefined}>
                          {badge.label}
                        </Badge>
                        <span className="fw-semibold text-truncate">{cp.pointName}</span>
                      </div>
                      <div className="small text-muted">
                        예정 {hhmm(sched.adjusted || sched.planned)}
                        {cp.arrivalTime && ` · 도착 ${formatTime(cp.arrivalTime)}`}
                        {cp.departureTime && ` · 출발 ${formatTime(cp.departureTime)}`}
                        {cp.manual && ' · 수기'}
                      </div>
                    </div>
                    {running && !done && i > nextIndex ? (
                      <Button
                        size="sm"
                        variant="outline-primary"
                        disabled={busy}
                        onClick={() => handleArrive(i)}
                      >
                        도착
                      </Button>
                    ) : (
                      <Badge bg={status.bg} text={status.text as 'dark' | undefined}>
                        {status.label}
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </Collapse>

        <button
          type="button"
          className="timeline-toggle text-muted small"
          onClick={() => setShowLogs((v) => !v)}
        >
          시스템 로그 {showLogs ? '▲' : '▼'}
        </button>
        {showLogs && (
          <div className="log-console">
            {logs.length === 0 ? (
              <div className="fst-italic">기록 없음</div>
            ) : (
              logs.map((l, i) => <div key={i}>{l}</div>)
            )}
          </div>
        )}
      </div>

      {running && (
        <footer className="run-footer">
          <Button
            variant="outline-danger"
            className="w-100 fw-bold py-2"
            onClick={handleEnd}
            disabled={busy}
          >
            {busy ? <Spinner size="sm" /> : '🏁 운행 종료'}
          </Button>
        </footer>
      )}

      {running && !engaged && (
        <div className="engage-overlay">
          <div className="engage-card">
            <div className="fs-1">🚗</div>
            <div className="fw-bold fs-5 mt-2">{drive.routeName}</div>
            {viaTracker ? (
              <ul className="text-start small text-muted mt-3 mb-4 ps-3">
                <li>
                  위치는 <b>📱 {drive.trackerId!.name}</b>의 Traccar Client 앱이 보냅니다.
                </li>
                <li>앱에서 위치 전송이 켜져 있는지 확인하세요. 화면을 꺼도 됩니다.</li>
                <li>이 화면을 켜두면 정류장 안내 음성을 들을 수 있습니다.</li>
              </ul>
            ) : (
              <ul className="text-start small text-muted mt-3 mb-4 ps-3">
                <li>운행 중에는 이 화면을 켜둔 채로 유지해주세요.</li>
                <li>다른 앱으로 전환하거나 화면이 꺼지면 위치 전송이 멈춥니다.</li>
                <li>위치 권한 요청이 뜨면 &lsquo;허용&rsquo;을 눌러주세요.</li>
                <li>
                  화면을 끄고 운행하려면 상단 📡 버튼에서 <b>위치 앱</b>으로 바꾸세요.
                </li>
              </ul>
            )}
            <Button size="lg" className="w-100 fw-bold py-3" onClick={engage}>
              {checkpoints.some((c) => c.status !== 'pending') ? '운행 재개' : '운행 시작'}
            </Button>
            <Button variant="link" className="mt-2 text-muted" onClick={leave}>
              나중에
            </Button>
          </div>
        </div>
      )}

      <ShareModal drive={drive} show={showShare} onHide={() => setShowShare(false)} />

      <Modal show={!!sourceModal} onHide={() => setSourceModal(null)} centered scrollable>
        <Modal.Header closeButton>
          <Modal.Title className="fs-5">위치 전송 방식</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {sourceModal?.trackers ? (
            <LocationSourcePicker
              trackers={sourceModal.trackers}
              value={sourceModal.value}
              currentDriveId={drive._id}
              onChange={(value) => setSourceModal((m) => (m ? { ...m, value } : m))}
            />
          ) : (
            <Loading />
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setSourceModal(null)}>
            취소
          </Button>
          <Button onClick={saveSource} disabled={busy || !sourceModal?.trackers}>
            변경
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default DriverRun;
