import { useState } from 'react';
import { Badge, Button, Card, Form, InputGroup, Spinner, Tab, Tabs } from 'react-bootstrap';
import { QRCodeSVG } from 'qrcode.react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  deleteTracker,
  errorMessage,
  getTracker,
  regenerateTracker,
  renameTracker,
} from '../../api';
import { useFeedback } from '../../components/feedback/context';
import { LoadError, Loading } from '../../components/LoadState';
import TrackerStatus from '../../components/TrackerStatus';
import { useAsync } from '../../hooks/useAsync';
import { usePolling } from '../../hooks/usePolling';
import { copyText } from '../../lib/clipboard';
import { TRACCAR_APP, traccarServerUrl } from '../../lib/ui';

const CopyField = ({ label, value }: { label: string; value: string }) => {
  const { toast } = useFeedback();
  return (
    <Form.Group className="mb-3">
      <Form.Label className="small fw-semibold mb-1">{label}</Form.Label>
      <InputGroup>
        <Form.Control
          readOnly
          value={value}
          className="font-monospace"
          onFocus={(e) => e.target.select()}
        />
        <Button
          variant="outline-primary"
          onClick={() =>
            copyText(value)
              .then(() => toast(`${label} 복사됨`, { variant: 'success' }))
              .catch(() =>
                toast('복사하지 못했습니다. 직접 선택해 복사해주세요.', { variant: 'warning' })
              )
          }
        >
          복사
        </Button>
      </InputGroup>
    </Form.Group>
  );
};

// 권장 설정값 (Traccar Client 설정 화면 항목명은 영어로 표시됨)
const SETTINGS: { name: string; ko: string; value: string; note?: string }[] = [
  {
    name: 'Location accuracy',
    ko: '위치 정확도',
    value: 'High',
    note: 'Highest는 GPS를 항상 켜서 배터리를 더 씁니다',
  },
  { name: 'Distance', ko: '거리', value: '20 m', note: '이동 중 약 20m마다 전송' },
  {
    name: 'Interval',
    ko: '간격',
    value: '10 s',
    note: 'Android에서 거리 0 또는 Highest일 때만 적용',
  },
  {
    name: 'Stationary heartbeat',
    ko: '정차 중 전송 간격',
    value: '60 s',
    note: '정차 중에도 연결 상태 유지',
  },
  {
    name: 'Offline buffering',
    ko: '오프라인 저장',
    value: '켜기',
    note: '터널·음영 지역 좌표를 나중에 전송',
  },
  { name: 'Wake lock', ko: '깨우기 유지', value: '켜기', note: 'Android만. 이동 중 끊김 감소' },
];

const TrackerSetup = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const { data: tracker, error, reload, setData } = useAsync(() => getTracker(id), [id]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  // 앱 설정 중에 연결 여부를 바로 확인할 수 있도록 자주 갱신
  usePolling(reload, 4000);

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!tracker) return <Loading />;

  const serverUrl = traccarServerUrl();

  const handleRename = async () => {
    setBusy(true);
    try {
      setData(await renameTracker(id, name.trim()));
      setEditing(false);
    } catch (err) {
      toast(errorMessage(err), { variant: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerate = async () => {
    const ok = await confirm({
      title: '기기 ID를 새로 발급할까요?',
      body: '기존 ID로는 더 이상 위치가 전송되지 않습니다. 앱의 Device identifier를 새 ID로 바꿔야 합니다.',
      confirmLabel: '새로 발급',
      variant: 'warning',
    });
    if (!ok) return;
    try {
      setData(await regenerateTracker(id));
      toast('새 기기 ID를 발급했습니다. 앱 설정을 바꿔주세요.', { variant: 'success' });
    } catch (err) {
      toast(errorMessage(err), { variant: 'danger' });
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `'${tracker.name}' 기기를 삭제할까요?`,
      body: '진행 중인 운행에 연결되어 있다면 연결이 해제됩니다.',
      confirmLabel: '삭제',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteTracker(id);
      toast('삭제했습니다.');
      navigate('/config/trackers');
    } catch (err) {
      toast(errorMessage(err), { variant: 'danger' });
    }
  };

  return (
    <>
      <div className="page-title">
        {editing ? (
          <InputGroup size="sm">
            <Form.Control
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <Button onClick={handleRename} disabled={busy || !name.trim()}>
              {busy ? <Spinner size="sm" /> : '저장'}
            </Button>
            <Button variant="outline-secondary" onClick={() => setEditing(false)}>
              취소
            </Button>
          </InputGroup>
        ) : (
          <>
            <h4 className="text-truncate">{tracker.name}</h4>
            <div className="d-flex gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="outline-secondary"
                onClick={() => {
                  setName(tracker.name);
                  setEditing(true);
                }}
              >
                이름 변경
              </Button>
              <Link to="/config/trackers" className="btn btn-outline-secondary btn-sm">
                목록
              </Link>
            </div>
          </>
        )}
      </div>

      <Card className="mb-3 tracker-status-card">
        <Card.Body>
          <div className="small text-muted mb-1">연결 상태</div>
          <TrackerStatus tracker={tracker} />
          {!tracker.lastSeenAt && (
            <div className="small text-muted mt-2">
              아래 순서대로 앱을 설정하면 이곳이 <Badge bg="success">● 연결됨</Badge> 으로 바뀝니다.
              (자동 새로고침)
            </div>
          )}
        </Card.Body>
      </Card>

      <ol className="setup-steps">
        <li>
          <h6>Traccar Client 앱 설치 (무료)</h6>
          <div className="d-flex gap-2 flex-wrap">
            <a
              className="btn btn-dark btn-sm"
              href={TRACCAR_APP.android}
              target="_blank"
              rel="noreferrer"
            >
              ▶ Google Play
            </a>
            <a
              className="btn btn-dark btn-sm"
              href={TRACCAR_APP.ios}
              target="_blank"
              rel="noreferrer"
            >
              App Store
            </a>
          </div>
          <div className="small text-muted mt-2">
            PC에서 보고 있다면 휴대폰 카메라로 QR을 찍어 설치 페이지를 여세요.
          </div>
          <div className="d-flex gap-3 mt-2 d-none d-md-flex">
            <div className="text-center small">
              <QRCodeSVG value={TRACCAR_APP.android} size={96} />
              <div>Android</div>
            </div>
            <div className="text-center small">
              <QRCodeSVG value={TRACCAR_APP.ios} size={96} />
              <div>iPhone</div>
            </div>
          </div>
        </li>

        <li>
          <h6>앱 설정 화면에 아래 두 값을 입력</h6>
          <CopyField label="Device identifier (기기 식별자)" value={tracker.deviceId} />
          <CopyField label="Server URL (서버 URL)" value={serverUrl} />
          <div className="small text-muted">
            기기 식별자는 비밀번호처럼 다뤄주세요. 다른 사람에게 알려지면 아래에서 새로 발급할 수
            있습니다.
          </div>
        </li>

        <li>
          <h6>권장 설정</h6>
          <div className="table-responsive">
            <table className="table table-sm small align-middle mb-1">
              <thead>
                <tr>
                  <th>앱 항목</th>
                  <th>권장값</th>
                  <th className="d-none d-sm-table-cell">설명</th>
                </tr>
              </thead>
              <tbody>
                {SETTINGS.map((s) => (
                  <tr key={s.name}>
                    <td>
                      <div className="fw-semibold">{s.name}</div>
                      <div className="text-muted">{s.ko}</div>
                    </td>
                    <td className="fw-bold text-nowrap">{s.value}</td>
                    <td className="d-none d-sm-table-cell text-muted">{s.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="small text-muted">
            앱 버전에 따라 일부 항목은 고급(Advanced) 설정 안에 있거나 없을 수 있습니다.
          </div>
        </li>

        <li>
          <h6>위치 권한과 배터리 설정 (중요)</h6>
          <Tabs defaultActiveKey="android" className="mb-2 small" fill>
            <Tab eventKey="android" title="Android">
              <ul className="small mb-0">
                <li>
                  위치 권한: <b>항상 허용</b> (설정 → 애플리케이션 → Traccar Client → 권한 → 위치)
                </li>
                <li>
                  배터리: <b>제한 없음</b> (삼성: 설정 → 애플리케이션 → Traccar Client → 배터리 →
                  제한 없음)
                </li>
                <li>삼성 &lsquo;절전 앱/잠자는 앱&rsquo; 목록에 들어 있다면 제외</li>
                <li>
                  제조사별 방법:{' '}
                  <a href="https://dontkillmyapp.com/?lang=ko" target="_blank" rel="noreferrer">
                    dontkillmyapp.com
                  </a>
                </li>
              </ul>
            </Tab>
            <Tab eventKey="ios" title="iPhone">
              <ul className="small mb-0">
                <li>
                  설정 → Traccar Client → 위치 → <b>항상</b>, <b>정확한 위치 켜기</b>
                </li>
                <li>
                  설정 → Traccar Client → <b>백그라운드 앱 새로 고침 켜기</b>
                </li>
                <li>저전력 모드에서는 전송 간격이 길어질 수 있습니다</li>
                <li>앱 전환기에서 Traccar Client를 위로 밀어 종료하지 마세요</li>
              </ul>
            </Tab>
          </Tabs>
        </li>

        <li>
          <h6>앱에서 위치 전송 켜기</h6>
          <div className="small">
            앱 첫 화면의 추적(Tracking) 스위치를 켜면 전송이 시작됩니다. 위의 연결 상태가{' '}
            <b>연결됨</b>으로 바뀌는지 확인하세요. 몇 분이 지나도 바뀌지 않으면 서버 URL과 기기
            식별자를 다시 확인하고, 앱의 상태/로그 화면에 오류가 표시되는지 확인하세요.
          </div>
        </li>

        <li>
          <h6>운행할 때</h6>
          <div className="small">
            <Link to="/config/driver">운전 시작</Link> 화면에서 노선을 시작할 때 위치 전송 방식으로{' '}
            <b>{tracker.name}</b>을(를) 선택하세요. 진행 중인 운행에서도 바꿀 수 있습니다. 운행이
            없을 때 앱이 보내는 위치는 연결 확인에만 쓰이고 공유되지 않습니다. 하루 운행이 끝나면
            앱의 전송을 꺼두면 배터리를 아낄 수 있습니다.
          </div>
        </li>
      </ol>

      <div className="d-flex gap-2 justify-content-end mt-4">
        <Button variant="outline-warning" size="sm" onClick={handleRegenerate}>
          기기 ID 새로 발급
        </Button>
        <Button variant="outline-danger" size="sm" onClick={handleDelete}>
          기기 삭제
        </Button>
      </div>
    </>
  );
};

export default TrackerSetup;
