import { useEffect, useRef, useState } from 'react';

// Google Identity Services 최소 타입
interface GoogleId {
  initialize: (options: {
    client_id: string;
    callback: (res: { credential: string }) => void;
    ux_mode?: 'popup' | 'redirect';
  }) => void;
  renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let scriptPromise: Promise<void> | null = null;

const loadScript = () => {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error('구글 로그인 스크립트를 불러오지 못했습니다.'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
};

interface Props {
  clientId: string;
  onCredential: (credential: string) => void;
}

const GoogleSignInButton = ({ clientId, onCredential }: Props) => {
  const ref = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    callbackRef.current = onCredential;
  });

  useEffect(() => {
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (res) => callbackRef.current(res.credential),
          ux_mode: 'popup',
        });
        window.google.accounts.id.renderButton(ref.current, {
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          locale: 'ko',
          width: ref.current.offsetWidth || 300,
        });
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return (
    <>
      <div ref={ref} className="google-btn" />
      {error && <div className="small text-danger mt-2">{error}</div>}
    </>
  );
};

export default GoogleSignInButton;
