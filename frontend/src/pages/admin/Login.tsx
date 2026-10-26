import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, Form, Spinner } from 'react-bootstrap';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage, login } from '../../api';

const Login = () => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(password);
      const next = params.get('next');
      navigate(next && next.startsWith('/config') ? next : '/config', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="center-page">
      <Card className="shadow-sm w-100" style={{ maxWidth: 360 }}>
        <Card.Body className="p-4">
          <div className="text-center mb-4">
            <div className="display-6">🚌</div>
            <h5 className="fw-bold mt-2 mb-0">운행관리 로그인</h5>
            <small className="text-muted">관리자·운전자 전용</small>
          </div>
          <Form onSubmit={handleSubmit}>
            <Form.Control
              type="password"
              size="lg"
              placeholder="비밀번호"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {error && (
              <Alert variant="danger" className="small py-2 mt-3 mb-0">
                {error}
              </Alert>
            )}
            <Button type="submit" size="lg" className="w-100 mt-3" disabled={loading || !password}>
              {loading ? <Spinner size="sm" /> : '로그인'}
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </div>
  );
};

export default Login;
