import { useState, type FormEvent } from 'react';
import { Button, Form } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

const CODE_LENGTH = 6;

// 공유 코드 입력 화면 (링크 대신 코드만 전달받은 경우)
const PublicHome = () => {
  const [code, setCode] = useState('');
  const navigate = useNavigate();

  const normalized = code.replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
  const valid = normalized.length === CODE_LENGTH || /^[0-9a-f]{24}$/i.test(code.trim());

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    navigate(
      normalized.length === CODE_LENGTH ? `/p/${normalized}` : `/passenger?id=${code.trim()}`
    );
  };

  return (
    <div className="center-page">
      <div className="text-center mb-4">
        <div className="display-3 mb-2">🚌</div>
        <h2 className="fw-bold">실시간 위치 조회</h2>
        <p className="text-muted mb-0">공유받은 6자리 조회 코드를 입력해 주세요.</p>
      </div>
      <Form onSubmit={handleSubmit} className="w-100" style={{ maxWidth: 340 }}>
        <Form.Control
          className="code-input"
          placeholder="ABC123"
          value={code}
          maxLength={24}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          onChange={(e) => setCode(e.target.value)}
          aria-label="조회 코드"
        />
        <Button type="submit" size="lg" className="w-100 mt-3" disabled={!valid}>
          조회
        </Button>
        <p className="text-muted small text-center mt-3">
          링크를 받으셨다면 링크를 누르면 바로 열립니다.
        </p>
      </Form>
    </div>
  );
};

export default PublicHome;
