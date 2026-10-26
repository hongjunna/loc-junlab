import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Modal, Toast, ToastContainer } from 'react-bootstrap';
import { FeedbackContext, type ConfirmOptions, type ToastOptions } from './context';

interface ToastItem extends ToastOptions {
  id: number;
  message: string;
}

/**
 * alert/confirm 대신 쓰는 토스트와 확인 모달
 */
const FeedbackProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);
  const idRef = useRef(0);

  const toast = useCallback((message: string, options: ToastOptions = {}) => {
    idRef.current += 1;
    const id = idRef.current;
    setToasts((prev) => [...prev.slice(-2), { id, message, ...options }]);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    resolverRef.current?.(false);
    setConfirmState(options);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const closeConfirm = (ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setConfirmState(null);
  };

  const remove = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      <ToastContainer position="bottom-center" className="p-3 toast-stack" style={{ zIndex: 2000 }}>
        {toasts.map((t) => (
          <Toast
            key={t.id}
            bg={t.variant || 'dark'}
            onClose={() => remove(t.id)}
            delay={t.durationMs ?? (t.action ? 6000 : 3000)}
            autohide
          >
            <Toast.Body
              className={`d-flex align-items-center gap-2 ${
                t.variant === 'warning' ? 'text-dark' : 'text-white'
              }`}
            >
              <span className="flex-grow-1">{t.message}</span>
              {t.action && (
                <Button
                  size="sm"
                  variant={t.variant === 'warning' ? 'dark' : 'light'}
                  onClick={() => {
                    t.action!.onClick();
                    remove(t.id);
                  }}
                >
                  {t.action.label}
                </Button>
              )}
            </Toast.Body>
          </Toast>
        ))}
      </ToastContainer>

      <Modal show={!!confirmState} onHide={() => closeConfirm(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-5">{confirmState?.title}</Modal.Title>
        </Modal.Header>
        {confirmState?.body && (
          <Modal.Body className="text-pre-line">{confirmState.body}</Modal.Body>
        )}
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => closeConfirm(false)}>
            {confirmState?.cancelLabel || '취소'}
          </Button>
          <Button variant={confirmState?.variant || 'primary'} onClick={() => closeConfirm(true)}>
            {confirmState?.confirmLabel || '확인'}
          </Button>
        </Modal.Footer>
      </Modal>
    </FeedbackContext.Provider>
  );
};

export default FeedbackProvider;
