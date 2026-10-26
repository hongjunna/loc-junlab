import { NavLink, Outlet } from 'react-router-dom';
import { Button } from 'react-bootstrap';
import { logout } from '../../api';

const NAV = [
  { to: '/config', label: '현황', end: true },
  { to: '/config/routes', label: '노선 관리' },
  { to: '/config/drives', label: '운행 기록' },
  { to: '/config/driver', label: '🚌 운전 시작' },
];

const AdminLayout = () => (
  <div className="admin-shell">
    <header className="admin-header">
      <div className="admin-header-inner">
        <NavLink to="/config" className="admin-brand">
          🚌 운행관리
        </NavLink>
        <Button
          variant="link"
          size="sm"
          className="text-white-50 text-decoration-none p-0"
          onClick={logout}
        >
          로그아웃
        </Button>
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

export default AdminLayout;
