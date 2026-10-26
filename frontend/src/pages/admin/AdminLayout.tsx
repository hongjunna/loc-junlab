import { NavLink, Outlet } from 'react-router-dom';
import { Button } from 'react-bootstrap';
import { auth, logout } from '../../api';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';

const NAV = [
  { to: '/config', label: '현황', end: true },
  { to: '/config/routes', label: '노선 관리' },
  { to: '/config/drives', label: '운행 기록' },
  { to: '/config/trackers', label: '📱 위치 앱' },
  { to: '/config/members', label: '사용자' },
  { to: '/config/driver', label: '🚗 운전 시작' },
];

const AdminLayout = () => {
  useDocumentMeta('운행관리', { noindex: true });
  const user = auth.user();

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-header-inner">
          <NavLink to="/config" className="admin-brand">
            <img src="/favicon.svg" alt="" width={22} height={22} className="me-2" />
            운행관리
          </NavLink>
          <div className="d-flex align-items-center gap-2 min-w-0">
            {user?.picture && (
              <img
                src={user.picture}
                alt=""
                width={24}
                height={24}
                className="rounded-circle"
                referrerPolicy="no-referrer"
              />
            )}
            <span className="small text-white-50 text-truncate d-none d-sm-inline">
              {user?.name || user?.email}
            </span>
            <Button
              variant="link"
              size="sm"
              className="text-white-50 text-decoration-none p-0 flex-shrink-0"
              onClick={logout}
            >
              로그아웃
            </Button>
          </div>
        </div>
        <nav className="admin-nav">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
