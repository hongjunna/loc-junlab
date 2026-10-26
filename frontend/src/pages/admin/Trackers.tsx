import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, Form, InputGroup, Spinner } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { createTracker, errorMessage, getTrackers } from '../../api';
import { useFeedback } from '../../components/feedback/context';
import { Empty, LoadError, Loading } from '../../components/LoadState';
import TrackerStatus from '../../components/TrackerStatus';
import { useAsync } from '../../hooks/useAsync';
import { usePolling } from '../../hooks/usePolling';

// Traccar Client 위치 앱 기기 목록
const Trackers = () => {
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const { data: trackers, error, loading, reload } = useAsync(getTrackers, []);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  usePolling(reload, 10000);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const tracker = await createTracker(name.trim());
      navigate(`/config/trackers/${tracker._id}`);
    } catch (err) {
      toast(errorMessage(err), { variant: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-title">
        <h4>위치 앱 (Traccar Client)</h4>
      </div>

      <Alert variant="info" className="small">
        <div className="fw-bold mb-1">📱 화면을 꺼도 위치가 전송됩니다</div>
        운전자 폰에 무료 앱 <b>Traccar Client</b>를 설치하고 여기서 발급한 기기 ID를 입력하면,
        화면을 끄거나 다른 앱을 써도 백그라운드에서 위치가 전송됩니다. 운행을 시작할 때 위치 전송
        방식으로 해당 기기를 선택하세요.
      </Alert>

      <Card className="mb-3">
        <Card.Body>
          <Form onSubmit={handleCreate}>
            <Form.Label className="fw-semibold small">새 기기 등록</Form.Label>
            <InputGroup>
              <Form.Control
                placeholder="예: 1호차 기사님 폰"
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
              />
              <Button type="submit" disabled={saving || !name.trim()}>
                {saving ? <Spinner size="sm" /> : '등록하고 설정하기'}
              </Button>
            </InputGroup>
          </Form>
        </Card.Body>
      </Card>

      {error && <LoadError message={error} onRetry={reload} />}
      {loading && !trackers && <Loading />}
      {trackers?.length === 0 && <Empty icon="📱">등록된 기기가 없습니다.</Empty>}

      <div className="d-grid gap-2">
        {trackers?.map((t) => (
          <Link key={t._id} to={`/config/trackers/${t._id}`} className="text-decoration-none">
            <Card className="list-card">
              <Card.Body className="py-2">
                <div className="d-flex align-items-center gap-2">
                  <span className="fw-bold text-dark text-truncate">{t.name}</span>
                  {t.activeDrive && <Badge bg="primary">운행 중 · {t.activeDrive.routeName}</Badge>}
                </div>
                <div className="mt-1">
                  <TrackerStatus tracker={t} compact />
                </div>
              </Card.Body>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
};

export default Trackers;
