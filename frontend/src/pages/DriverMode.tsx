import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Card, Button, Table, Badge, Alert } from 'react-bootstrap';
import { getRoutes, startDrive, updateLocation } from '../services/api';

const DriverMode = () => {
  const [routes, setRoutes] = useState<any[]>([]);
  const [activeDrives, setActiveDrives] = useState<any[]>([]);
  const [activeDrive, setActiveDrive] = useState<any>(null);
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [message, setMessage] = useState(
    '노선을 선택하거나 진행 중인 운행에 연결하세요.'
  );
  const [isWatching, setIsWatching] = useState(false);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    fetchInitialData();
    const saved = localStorage.getItem('activeDriveId');
    if (saved) resume(saved);
  }, []);

  const fetchInitialData = async () => {
    try {
      const resRoutes = await getRoutes();
      setRoutes(resRoutes.data);
      const resActive = await axios.get('/api/drive/active/all');
      setActiveDrives(resActive.data);
    } catch (err) {
      console.error('데이터 로딩 실패', err);
    }
  };

  const resume = (id: string) => {
    axios
      .get(`/api/drive/${id}`)
      .then((res) => {
        setActiveDrive(res.data);
        setCheckpoints(res.data.checkpoints);
        setIsWatching(true);
        localStorage.setItem('activeDriveId', id);
      })
      .catch(() => localStorage.removeItem('activeDriveId'));
  };

  const start = async (id: string) => {
    try {
      const res = await startDrive(id);
      setActiveDrive(res.data);
      setCheckpoints(res.data.checkpoints);
      setIsWatching(true);
      localStorage.setItem('activeDriveId', res.data._id);
    } catch (err) {
      alert('운행 시작 실패');
    }
  };

  const manualArrive = async (idx: number) => {
    try {
      const res = await axios.patch(
        `/api/drive/${activeDrive._id}/checkpoint/${idx}/complete`
      );
      setCheckpoints(res.data.checkpoints);
    } catch (err) {
      alert('수기 도착 처리 실패');
    }
  };

  const end = async () => {
    if (!confirm('정말로 운행을 종료하고 마감하시겠습니까?')) return;
    try {
      await axios.post(`/api/drive/${activeDrive._id}/end`);
      localStorage.removeItem('activeDriveId');
      window.location.reload();
    } catch (err) {
      alert('운행 종료 실패');
    }
  };

  // [수정됨] 무조건 클립보드 복사만 수행
  const handleShare = async () => {
    if (!activeDrive) return;

    const shareUrl = `${window.location.origin}/passenger?id=${activeDrive._id}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      alert('📋 운행 정보 링크가 복사되었습니다!');
    } catch (err) {
      console.error('클립보드 복사 실패:', err);
      // 보안상 이유로 복사가 안 될 경우를 대비해 수동 복사 유도
      prompt('링크를 복사해주세요:', shareUrl);
    }
  };

  useEffect(() => {
    if (isWatching && activeDrive) {
      timerRef.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
          async (p) => {
            const res = await updateLocation(
              activeDrive._id,
              p.coords.latitude,
              p.coords.longitude
            );
            setCheckpoints(res.data.checkpoints);
            if (res.data.message) setMessage(res.data.message);
          },
          (e) => {},
          { enableHighAccuracy: true }
        );
      }, 5000);
    }
    return () => clearInterval(timerRef.current);
  }, [isWatching, activeDrive]);

  // 메인 선택 화면
  if (!activeDrive) {
    return (
      <div className="w-100 p-3">
        <Card className="border-0 shadow-sm mb-4">
          <Card.Body>
            <h5 className="fw-bold mb-3">🆕 새 운행 시작</h5>
            <Table hover responsive className="mb-0">
              <tbody>
                {routes.map((r) => (
                  <tr key={r._id}>
                    <td className="align-middle py-3">{r.routeName}</td>
                    <td className="text-end align-middle">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => start(r._id)}
                      >
                        시작
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card.Body>
        </Card>

        <Card className="border-0 shadow-sm bg-light">
          <Card.Body>
            <h5 className="fw-bold mb-3 text-secondary">🔄 진행 중인 운행</h5>
            <Table hover responsive className="mb-0">
              <tbody>
                {activeDrives.map((d) => (
                  <tr key={d._id}>
                    <td className="align-middle py-3">
                      {d.routeId?.routeName}
                    </td>
                    <td className="text-end align-middle">
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => resume(d._id)}
                      >
                        접속
                      </Button>
                    </td>
                  </tr>
                ))}
                {activeDrives.length === 0 && (
                  <tr>
                    <td className="text-center py-4 text-muted">
                      현재 진행 중인 운행이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      </div>
    );
  }

  // 실시간 운행 화면
  return (
    <div className="d-flex flex-column flex-grow-1 w-100">
      <div className="p-3 bg-white border-bottom d-flex justify-content-between align-items-center">
        <Button
          variant="outline-dark"
          size="sm"
          onClick={() => setActiveDrive(null)}
        >
          ← 목록
        </Button>
        <Badge bg="success" className="px-3 py-2">
          실시간 운행 중
        </Badge>
      </div>

      <div className="p-3">
        <Alert
          variant="info"
          className="text-center py-3 mb-0 fw-bold shadow-sm"
        >
          {message}
        </Alert>
      </div>

      <Card className="border-0 flex-grow-1 rounded-0">
        <Card.Header className="bg-primary text-white text-center py-3 border-0">
          <h5 className="mb-2 fw-bold">{activeDrive.routeId?.routeName}</h5>

          <Button
            variant="light"
            size="sm"
            className="text-primary fw-bold rounded-pill px-3 shadow-sm"
            onClick={handleShare}
          >
            🔗 링크 복사하기
          </Button>
        </Card.Header>

        <div className="table-responsive">
          <Table hover className="align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th className="ps-3 py-3">정차지</th>
                <th className="text-center">상태</th>
                <th className="text-end pe-3">수기</th>
              </tr>
            </thead>
            <tbody>
              {checkpoints.map((cp, i) => (
                <tr
                  key={i}
                  className={cp.status === 'arrived' ? 'table-success' : ''}
                >
                  <td className="ps-3 py-3">
                    <div className="fw-bold">{cp.pointName}</div>
                    <div className="text-muted small">
                      {cp.arrivalTime
                        ? new Date(cp.arrivalTime).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : cp.scheduledTime}
                    </div>
                  </td>
                  <td className="text-center">
                    <Badge
                      bg={
                        cp.status === 'arrived'
                          ? 'success'
                          : cp.status === 'approaching'
                          ? 'warning'
                          : 'secondary'
                      }
                      className="px-2 py-1"
                    >
                      {cp.status}
                    </Badge>
                  </td>
                  <td className="text-end pe-3">
                    {cp.status !== 'arrived' && (
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={() => manualArrive(i)}
                      >
                        도착
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>

      <Button
        variant="danger"
        size="lg"
        className="w-100 py-4 fw-bold rounded-0 mt-auto shadow-lg"
        style={{ fontSize: '1.2rem', border: 'none' }}
        onClick={end}
      >
        🏁 운행 종료 마감
      </Button>
    </div>
  );
};

export default DriverMode;

