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
  const [logs, setLogs] = useState<string[]>([]);
  const lastPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const addLog = (msg: string) => {
    const now = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const newLog = `[${now}] ${msg}`;
    setLogs((prev) => [newLog, ...prev].slice(0, 3)); // 최신순 3개 유지
  };

  const getDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ) => {
    const R = 6371e3; // 지구 반지름 (m)
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  useEffect(() => {
    fetchInitialData();
    const saved = localStorage.getItem('activeDriveId');
    if (saved) resume(saved);
  }, []);

  const fetchInitialData = async () => {
    try {
      const resRoutes = await getRoutes();
      setRoutes(resRoutes.data);
      const resActive = await axios.get(
        'https://loc.junlab.xyz/api/drive/active/all'
      );
      setActiveDrives(resActive.data);
    } catch (err) {
      console.error('데이터 로딩 실패', err);
    }
  };

  const resume = (id: string) => {
    axios
      .get(`https://loc.junlab.xyz/api/drive/${id}`)
      .then((res) => {
        setActiveDrive(res.data);
        setCheckpoints(res.data.checkpoints || []);
        setIsWatching(true);
        localStorage.setItem('activeDriveId', id);
      })
      .catch(() => localStorage.removeItem('activeDriveId'));
  };

  const start = async (id: string) => {
    try {
      const res = await startDrive(id);
      setActiveDrive(res.data);
      setCheckpoints(res.data.checkpoints || []);
      setIsWatching(true);
      localStorage.setItem('activeDriveId', res.data._id);
    } catch (err) {
      alert('운행 시작 실패');
    }
  };

  const manualArrive = async (idx: number) => {
    try {
      const res = await axios.patch(
        `https://loc.junlab.xyz/api/drive/${activeDrive._id}/checkpoint/${idx}/complete`
      );
      setCheckpoints(res.data.checkpoints || []);
    } catch (err) {
      alert('수기 도착 처리 실패');
    }
  };

  const end = async () => {
    if (!confirm('정말로 운행을 종료하고 마감하시겠습니까?')) return;
    try {
      await axios.post(
        `https://loc.junlab.xyz/api/drive/${activeDrive._id}/end`
      );
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
            const { latitude: curLat, longitude: curLng } = p.coords;

            // 1. 이전 위치가 있고, 거리가 100m 미만이면 전송 스킵
            if (lastPosRef.current) {
              const distance = getDistance(
                lastPosRef.current.lat,
                lastPosRef.current.lng,
                curLat,
                curLng
              );

              const distance_threshold = 20;
              if (distance < distance_threshold) {
                addLog(
                  `이동 거리 부족 (${Math.round(
                    distance
                  )}m / ${distance_threshold}m) - 전송 스킵`
                );
                return;
              }
            }

            try {
              const res = await updateLocation(activeDrive._id, curLat, curLng);
              lastPosRef.current = { lat: curLat, lng: curLng };

              setCheckpoints(res.data.checkpoints || []);
              if (res.data.message) setMessage(res.data.message);
              addLog('위치 정보 전송 성공');
            } catch (err) {
              addLog('위치 전송 실패 (서버 오류)');
            }
          },
          (e) => {
            addLog('GPS 신호를 찾을 수 없습니다.');
          },
          { enableHighAccuracy: true }
        );
      }, 5000);
    }
    return () => {
      clearInterval(timerRef.current);
      lastPosRef.current = null; // 종료 시 초기화
    };
  }, [isWatching, activeDrive]);

  useEffect(() => {
    let wakeLock: any = null;
    let isCancelled = false;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          const lock = await navigator.wakeLock.request('screen');
          if (isCancelled) {
            lock.release();
            return;
          }
          wakeLock = lock;
          addLog('화면 꺼짐 방지 활성화');
        }
      } catch (err: any) {
        console.error(`${err.name}, ${err.message}`);
      }
    };

    if (isWatching) {
      requestWakeLock();
    }

    return () => {
      isCancelled = true;
      if (wakeLock !== null) wakeLock.release();
    };
  }, [isWatching]);

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
          <Card.Body className="p-0">
            {' '}
            {/* 패딩 조절로 테이블 밀착 */}
            <div className="p-3 bg-light">
              <h5 className="fw-bold mb-0 text-secondary">🔄 진행 중인 운행</h5>
            </div>
            <Table
              hover
              className="mb-0 small bg-white align-middle text-center"
            >
              <thead className="table-light">
                <tr>
                  <th className="py-2">구분</th>
                  <th className="text-start ps-3 py-2">노선 정보</th>
                  <th className="py-2">상태</th>
                  <th className="text-center pe-3 py-2">설정</th>
                </tr>
              </thead>
              <tbody>
                {activeDrives.map((d) => (
                  <tr key={d._id}>
                    {/* 1. 구분 (실시간 뱃지) */}
                    <td className="py-3">
                      <div className="d-flex justify-content-center align-items-center">
                        <Badge bg="success" className="px-2 py-1">
                          실시간
                        </Badge>
                      </div>
                    </td>

                    {/* 2. 노선 정보 (왼쪽 정렬) */}
                    <td className="text-start ps-3 py-3">
                      <div
                        className="fw-bold text-primary"
                        style={{ fontSize: '0.95rem' }}
                      >
                        {d.routeId?.routeName}
                      </div>
                      <div className="text-muted small">
                        ID: {d._id.slice(-6)}
                      </div>
                    </td>

                    {/* 3. 상태 */}
                    <td className="py-3">
                      <Badge
                        bg={d.status === 'running' ? 'success' : 'secondary'}
                        className="px-2 py-1"
                      >
                        {d.status === 'running' ? '운행중' : '대기중'}
                      </Badge>
                    </td>

                    {/* 4. 설정 (접속/도착 버튼) */}
                    <td className="text-center pe-3 py-3">
                      <Button
                        variant="outline-success"
                        size="sm"
                        className="fw-bold px-3"
                        onClick={() => resume(d._id)}
                      >
                        접속
                      </Button>
                    </td>
                  </tr>
                ))}

                {activeDrives.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="text-center py-5 text-muted bg-white"
                    >
                      <div className="mb-2">📭</div>
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
        <div
          className="bg-dark text-light p-2 rounded shadow-sm"
          style={{ fontSize: '0.75rem', fontFamily: 'monospace', opacity: 0.8 }}
        >
          <div className="fw-bold border-bottom border-secondary mb-1 pb-1">
            📡 실시간 전송 로그
          </div>
          {logs.length === 0 ? (
            <div className="text-secondary italic">전송 대기 중...</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} style={{ opacity: i === 0 ? 1 : 0.6 }}>
                {i === 0 && '● '} {log}
              </div>
            ))
          )}
        </div>
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
          <Table hover className="mb-0 small bg-white align-middle text-center">
            <thead className="table-light sticky-top">
              <tr>
                <th className="py-2">구분</th>
                <th className="text-start ps-3 py-2">정차지 정보</th>
                <th className="py-2">시간</th>
                <th className="py-2">상태</th>
                <th className="text-center pe-3 py-2">설정</th>
              </tr>
            </thead>
            <tbody>
              {(checkpoints || []).map((cp, i) => {
                const isArrived = cp.status === 'arrived';
                const isDeparted = cp.status === 'departed';
                const isPassed = isArrived || isDeparted; // 도착했거나 이미 떠났거나

                // 1. 구분 뱃지 로직
                let typeBadge = (
                  <Badge bg="warning" className="text-dark">
                    경유
                  </Badge>
                );
                if (i === 0) typeBadge = <Badge bg="primary">출발</Badge>;
                else if (i === checkpoints.length - 1)
                  typeBadge = <Badge bg="dark">종점</Badge>;

                return (
                  <tr
                    key={i}
                    className={isPassed ? 'table-success opacity-75' : ''}
                    style={isArrived ? { borderLeft: '5px solid #198754' } : {}} // 정차 중인 곳 강조
                  >
                    {/* 1. 구분 */}
                    <td className="py-3">
                      <div className="d-flex justify-content-center align-items-center">
                        {typeBadge}
                      </div>
                    </td>

                    {/* 2. 정차지 정보 */}
                    <td className="text-start ps-3 py-3">
                      <div
                        className={`fw-bold ${
                          isPassed ? 'text-muted' : 'text-primary'
                        }`}
                        style={{ fontSize: '0.95rem' }}
                      >
                        {cp.pointName}
                        {isArrived && (
                          <Badge bg="success" pill className="ms-2 small blink">
                            정차중
                          </Badge>
                        )}
                      </div>
                    </td>

                    {/* 3. 시간 정보 (도착 시간 vs 출발 시간 표시) */}
                    <td className="py-3">
                      <div className="fw-bold fs-6">
                        {isDeparted && cp.departureTime
                          ? new Date(cp.departureTime).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : cp.arrivalTime
                          ? new Date(cp.arrivalTime).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : cp.scheduledTime}
                      </div>
                      <small
                        className={isPassed ? 'text-success' : 'text-muted'}
                      >
                        {isDeparted
                          ? '출발완료'
                          : isArrived
                          ? '도착/정차'
                          : '예정'}
                      </small>
                    </td>

                    {/* 4. 상태 뱃지 */}
                    <td className="py-3">
                      <Badge
                        bg={
                          isDeparted
                            ? 'dark'
                            : isArrived
                            ? 'success'
                            : cp.status === 'approaching'
                            ? 'warning'
                            : 'secondary'
                        }
                        className="px-2 py-1"
                      >
                        {isDeparted
                          ? '출발'
                          : isArrived
                          ? '도착'
                          : cp.status === 'approaching'
                          ? '곧도착'
                          : '대기'}
                      </Badge>
                    </td>

                    {/* 5. 설정 */}
                    <td className="text-center pe-3 py-3">
                      {/* 아직 도착 전일 때만 버튼 표시 */}
                      {!isPassed && (
                        <Button
                          variant="primary"
                          size="sm"
                          className="fw-bold px-3 shadow-sm"
                          onClick={() => manualArrive(i)}
                        >
                          도착
                        </Button>
                      )}
                      {isArrived && (
                        <Badge
                          bg="outline-success"
                          className="text-success border border-success"
                        >
                          정차 중
                        </Badge>
                      )}
                      {isDeparted && (
                        <span className="text-success fw-bold">✓</span>
                      )}
                    </td>
                  </tr>
                );
              })}
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

