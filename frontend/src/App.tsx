import React, { useState } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useLocation,
  useNavigate,
  Navigate,
} from 'react-router-dom';
import { Navbar, Nav, Form, Button, InputGroup } from 'react-bootstrap';
import CreateRoute from './pages/CreateRoute';
import DriverMode from './pages/DriverMode';
import PassengerView from './pages/PassengerView';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

// [페이지 컴포넌트 1] 승객용 메인 (ID 검색)
const PublicHome = () => {
  const [inputId, setInputId] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputId.trim()) {
      navigate(`/passenger?id=${inputId.trim()}`);
    }
  };

  return (
    <div className="d-flex flex-column align-items-center justify-content-center h-100 px-4">
      <div className="text-center mb-5">
        <div className="display-1 mb-3">🚘</div>
        <h2 className="fw-bold">위치 조회</h2>
        <p className="text-muted">공유받으신 운용 ID를 입력해 주세요.</p>
      </div>

      <Form
        onSubmit={handleSearch}
        className="w-100"
        style={{ maxWidth: '350px' }}
      >
        <InputGroup className="mb-3" size="lg">
          <Form.Control
            placeholder="운용 ID 입력"
            aria-label="Operation ID"
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
          />
          <Button variant="primary" type="submit">
            조회
          </Button>
        </InputGroup>
      </Form>
    </div>
  );
};

// [페이지 컴포넌트 2] 관리자용 메인 (기존 메인 내용)
const AdminHome = () => {
  return (
    <div className="text-center mt-5 px-4 w-100">
      <div className="display-4 mb-3">👋</div>
      <h4 className="fw-bold">관리자 대시보드</h4>
      <p className="text-muted small">
        좌측 상단 메뉴를 통해 노선을 등록하거나
        <br />
        드라이버 모드를 실행해 보세요.
      </p>
      <div className="d-grid gap-2 mt-4">
        <Link to="/config/create" className="btn btn-outline-primary">
          노선 등록하러 가기
        </Link>
        <Link to="/config/driver" className="btn btn-outline-dark">
          드라이버 모드 시작
        </Link>
      </div>
    </div>
  );
};

// [레이아웃 컴포넌트] 상단바 및 라우팅 처리
const AppContent = () => {
  const location = useLocation();

  // 루트('/') 경로이거나 '/passenger' 경로면 승객 모드로 간주
  const isPassengerMode =
    location.pathname === '/' || location.pathname.startsWith('/passenger');
  const isAdminMode = location.pathname.startsWith('/config');

  return (
    <div className="app-wrapper">
      {/* 1. 상단 네비게이션 */}
      {isAdminMode ? (
        // [관리자용 상단바] (검은색)
        <Navbar
          bg="dark"
          variant="dark"
          className="px-3 border-0 w-100"
          style={{ minHeight: '56px' }}
        >
          {/* 관리자 로고 클릭 시 /admin으로 이동 */}
          <Navbar.Brand
            as={Link}
            to="/config/driving"
            className="fw-bold d-flex align-items-center"
          >
            <span style={{ fontSize: '1.2rem', marginRight: '8px' }}>🚌</span>
            <span className="fs-6">운행관리 시스템</span>
          </Navbar.Brand>
          <Nav className="ms-auto d-flex flex-row gap-3">
            <Nav.Link
              as={Link}
              to="/config/create"
              className="small px-0 text-white-50"
            >
              등록
            </Nav.Link>
            <Nav.Link
              as={Link}
              to="/config/driver"
              className="small px-0 text-white-50"
            >
              드라이버
            </Nav.Link>
          </Nav>
        </Navbar>
      ) : isPassengerMode ? (
        // [승객용 상단바] (파란색)
        <div></div>
      ) : (
        <Navigate to="/" replace />
      )}

      {/* 2. 메인 콘텐츠 영역 */}
      <main className="app-main flex-grow-1 d-flex flex-column">
        <Routes>
          {/* 공개(승객) 페이지 */}
          <Route path="/" element={<PublicHome />} />
          <Route path="/passenger" element={<PassengerView />} />

          {/* 관리자 페이지 */}
          <Route path="/config/driving" element={<AdminHome />} />
          <Route path="/config/create" element={<CreateRoute />} />
          <Route path="/config/driver" element={<DriverMode />} />
        </Routes>
      </main>
    </div>
  );
};

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;

