import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, Form, Spinner } from 'react-bootstrap';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage, getAuthConfig, login, loginWithGoogle } from '../../api';
import GoogleSignInButton from '../../components/GoogleSignInButton';
import { LoadError, Loading } from '../../components/LoadState';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';

const Login = () => {
  useDocumentMeta('로그인 · 운행관리', { noindex: true });
  const { data: methods, error: configError, reload } = useAsync(getAuthConfig, []);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const done = () => {
    const next = params.get('next');
    navigate(next && next.startsWith('/config') ? next : '/config', { replace: true });
  };

  const run = async (fn: () => Promise<unknown>) => {
    setLoading(true);
    setError(null);
    try {
      await fn();
      done();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(() => login(password));
  };

  return (
    <div className="center-page">
      <Card className="shadow-sm w-100" style={{ maxWidth: 360 }}>
        <Card.Body className="p-4">
          <div className="text-center mb-4">
            <img src="/icon-192.png" alt="" width={56} height={56} className="rounded-3" />
            <h5 className="fw-bold mt-3 mb-0">운행관리 로그인</h5>
            <small className="text-muted">관리자·운전자 전용</small>
          </div>

          {configError && <LoadError message={configError} onRetry={reload} />}
          {!methods && !configError && <Loading />}

          {methods?.googleClientId && (
            <GoogleSignInButton
              clientId={methods.googleClientId}
              onCredential={(credential) => run(() => loginWithGoogle(credential))}
            />
          )}

          {methods?.googleClientId && methods.password && (
            <div className="login-divider">
              <span>또는</span>
            </div>
          )}

          {methods?.password && (
            <Form onSubmit={handleSubmit}>
              <Form.Control
                type="password"
                size="lg"
                placeholder="비밀번호"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus={!methods.googleClientId}
              />
              <Button
                type="submit"
                size="lg"
                className="w-100 mt-3"
                disabled={loading || !password}
              >
                {loading ? <Spinner size="sm" /> : '비밀번호로 로그인'}
              </Button>
            </Form>
          )}

          {error && (
            <Alert variant="danger" className="small py-2 mt-3 mb-0">
              {error}
            </Alert>
          )}
          {loading && methods?.googleClientId && !methods.password && (
            <div className="text-center mt-3">
              <Spinner size="sm" />
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  );
};

export default Login;
