import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import FeedbackProvider from './components/feedback/FeedbackProvider';
import RequireAuth from './components/RequireAuth';
import { Loading } from './components/LoadState';
import PassengerView from './pages/passenger/PassengerView';
import PublicHome from './pages/passenger/PublicHome';

// 관리자/운전자 화면은 승객이 내려받지 않도록 분리
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const DriveDetail = lazy(() => import('./pages/admin/DriveDetail'));
const DriveHistory = lazy(() => import('./pages/admin/DriveHistory'));
const Login = lazy(() => import('./pages/admin/Login'));
const RouteEdit = lazy(() => import('./pages/admin/RouteEdit'));
const RouteList = lazy(() => import('./pages/admin/RouteList'));
const RouteNew = lazy(() => import('./pages/admin/RouteNew'));
const DriverHome = lazy(() => import('./pages/driver/DriverHome'));
const DriverRun = lazy(() => import('./pages/driver/DriverRun'));

const NotFound = () => (
  <div className="center-page text-center">
    <div className="fs-1">🧭</div>
    <h5 className="fw-bold mt-2">페이지를 찾을 수 없습니다</h5>
    <Link to="/" className="btn btn-primary mt-3">
      처음으로
    </Link>
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <FeedbackProvider>
        <Suspense fallback={<Loading />}>
          <Routes>
            {/* 공개(승객) 페이지 */}
            <Route path="/" element={<PublicHome />} />
            <Route path="/p/:code" element={<PassengerView />} />
            <Route path="/passenger" element={<PassengerView />} />

            {/* 관리자/운전자 페이지 */}
            <Route path="/config/login" element={<Login />} />
            <Route
              path="/config/driver/:id"
              element={
                <RequireAuth>
                  <DriverRun />
                </RequireAuth>
              }
            />
            <Route
              path="/config"
              element={
                <RequireAuth>
                  <AdminLayout />
                </RequireAuth>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="routes" element={<RouteList />} />
              <Route path="routes/new" element={<RouteNew />} />
              <Route path="routes/:id" element={<RouteEdit />} />
              <Route path="drives" element={<DriveHistory />} />
              <Route path="drives/:id" element={<DriveDetail />} />
              <Route path="driver" element={<DriverHome />} />
              {/* 예전 주소 호환 */}
              <Route path="driving" element={<Navigate to="/config" replace />} />
              <Route path="create" element={<Navigate to="/config/routes/new" replace />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </FeedbackProvider>
    </BrowserRouter>
  );
}

export default App;
