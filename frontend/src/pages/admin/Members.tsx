import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, Form, InputGroup, ListGroup, Spinner } from 'react-bootstrap';
import { addMember, errorMessage, getMembers, removeMember } from '../../api';
import { useFeedback } from '../../components/feedback/context';
import { LoadError, Loading } from '../../components/LoadState';
import { useAsync } from '../../hooks/useAsync';
import { formatDateTime } from '../../lib/format';
import type { Member } from '../../types';

// 구글 로그인을 허용할 사용자 관리
const Members = () => {
  const { toast, confirm } = useFeedback();
  const { data, error, reload } = useAsync(getMembers, []);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await addMember(email.trim(), name.trim() || undefined);
      toast(`${email.trim()} 계정을 추가했습니다.`, { variant: 'success' });
      setEmail('');
      setName('');
      reload();
    } catch (err) {
      toast(errorMessage(err), { variant: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (m: Member) => {
    const ok = await confirm({
      title: `${m.email} 계정을 삭제할까요?`,
      body: '이미 로그인된 기기는 로그인 유지 기간이 끝날 때까지 사용할 수 있습니다.',
      confirmLabel: '삭제',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await removeMember(m._id);
      reload();
    } catch (err) {
      toast(errorMessage(err), { variant: 'danger' });
    }
  };

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!data) return <Loading />;

  return (
    <>
      <div className="page-title">
        <h4>사용자</h4>
      </div>

      {!data.googleEnabled && (
        <Alert variant="warning" className="small">
          구글 로그인이 꺼져 있습니다. 서버 <code>backend/.env</code>에{' '}
          <code>GOOGLE_CLIENT_ID</code>를 설정하면 아래 계정으로 구글 로그인할 수 있습니다.
        </Alert>
      )}

      <Card className="mb-3">
        <Card.Body>
          <h6 className="fw-bold">구글 계정 추가</h6>
          <p className="small text-muted">
            추가한 구글 계정은 관리자·운전자 화면에 로그인할 수 있습니다. 모두 같은 권한을 가집니다.
          </p>
          <Form onSubmit={handleAdd}>
            <InputGroup className="mb-2">
              <Form.Control
                type="email"
                placeholder="driver@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </InputGroup>
            <InputGroup>
              <Form.Control
                placeholder="이름 (선택)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button type="submit" disabled={saving || !email.trim()}>
                {saving ? <Spinner size="sm" /> : '추가'}
              </Button>
            </InputGroup>
          </Form>
        </Card.Body>
      </Card>

      <Card>
        <ListGroup variant="flush">
          {data.admins.map((a) => (
            <ListGroup.Item key={a} className="d-flex align-items-center gap-2">
              <span className="flex-grow-1 text-truncate">{a}</span>
              <Badge bg="dark">기본 관리자</Badge>
            </ListGroup.Item>
          ))}
          {data.members.map((m) => (
            <ListGroup.Item key={m._id} className="d-flex align-items-center gap-2">
              <div className="flex-grow-1 min-w-0">
                <div className="text-truncate">
                  {m.email}
                  {m.name && <span className="text-muted ms-2">{m.name}</span>}
                </div>
                <div className="small text-muted">
                  {m.lastLoginAt
                    ? `최근 로그인 ${formatDateTime(m.lastLoginAt)}`
                    : '아직 로그인 안 함'}
                </div>
              </div>
              <Button size="sm" variant="outline-danger" onClick={() => handleRemove(m)}>
                삭제
              </Button>
            </ListGroup.Item>
          ))}
          {data.admins.length === 0 && data.members.length === 0 && (
            <ListGroup.Item className="text-muted small text-center py-4">
              등록된 구글 계정이 없습니다.
            </ListGroup.Item>
          )}
        </ListGroup>
      </Card>
      <div className="small text-muted mt-2">
        기본 관리자는 서버 <code>.env</code>의 <code>ADMIN_EMAILS</code>로 설정하며 여기서 삭제할 수
        없습니다.
      </div>
    </>
  );
};

export default Members;
