import type { ReactNode } from 'react';
import { Alert, Button, Spinner } from 'react-bootstrap';

export const Loading = () => (
  <div className="text-center py-5 text-muted">
    <Spinner animation="border" size="sm" className="me-2" />
    불러오는 중...
  </div>
);

export const LoadError = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <Alert variant="danger" className="d-flex align-items-center justify-content-between gap-2">
    <span>{message}</span>
    {onRetry && (
      <Button size="sm" variant="outline-danger" onClick={onRetry}>
        다시 시도
      </Button>
    )}
  </Alert>
);

export const Empty = ({ icon, children }: { icon: string; children: ReactNode }) => (
  <div className="text-center py-5 text-muted bg-white rounded-3 border">
    <div className="mb-2 fs-2">{icon}</div>
    {children}
  </div>
);
