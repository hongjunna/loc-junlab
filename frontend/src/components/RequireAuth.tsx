import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { auth } from '../api';

const RequireAuth = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [loggedIn] = useState(auth.isLoggedIn);

  // 토큰 만료 등으로 401을 받으면 로그인 화면으로
  useEffect(() => {
    const onLogout = () => {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      navigate(`/config/login?next=${next}`, { replace: true });
    };
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, [navigate]);

  if (!loggedIn) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/config/login?next=${next}`} replace />;
  }
  return <>{children}</>;
};

export default RequireAuth;
