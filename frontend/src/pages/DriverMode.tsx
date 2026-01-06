import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Button, Badge } from 'react-bootstrap';
import { getRoutes, startDrive, updateLocation } from '../services/api';
import { TYPE_BADGE } from './ui_constants';
import RouteEditModal from './components/RouteEditModal';
import './DriverMode.css';
import bellSound from '../assets/bell.mp3';
import { Link } from 'react-router-dom';

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
  const lastSendTimeRef = useRef<number>(0);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editRouteId, setEditRouteId] = useState<string | null>(null);

  // TTS (Text-to-Speech) 기능 구현
  const speak = (text: string, playChime: boolean = false) => {
    return new Promise<void>((resolve) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        resolve();
        return;
      }

      // 기존에 재생 중인 음성이 있다면 취소
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 1.0; // 속도 (0.1 ~ 10)
      utterance.pitch = 1.0; // 음높이 (0 ~ 2)
      utterance.onend = () => resolve(); // 말하기가 끝나면 Promise 해결
      utterance.onerror = () => resolve(); // 에러 발생 시에도 해결

      // 한국어 목소리 선택 (Chrome 등에서 목소리 로드 대기 필요)
      const voices = window.speechSynthesis.getVoices();
      const korVoice = voices.find(
        (v) => v.lang.includes('ko') || v.name.includes('Korean')
      );
      if (korVoice) {
        utterance.voice = korVoice;
      }

      const doSpeak = () => {
        window.speechSynthesis.speak(utterance);
      };

      if (playChime) {
        const audio = new Audio(bellSound);
        // 오디오 재생이 끝나면 TTS 실행
        audio.onended = doSpeak;
        audio.onerror = () => doSpeak();
        audio.play().catch((e) => {
          console.error('오디오 재생 실패:', e);
          // 오디오 재생에 실패하면 바로 TTS 실행
          doSpeak();
        });
      } else {
        doSpeak();
      }
    });
  };

  // 브라우저 음성 목록 로드 (Chrome 대응)
  useEffect(() => {
    const loadVoices = () => window.speechSynthesis.getVoices();
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const addLog = (msg: string) => {
    const now = new Date().toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Seoul',
    });
    const newLog = `[${now}] ${msg}`;
    setLogs((prev) => [newLog, ...prev].slice(0, 3)); // 최신순 3개 유지
  };

  const dataReprocessing = (points: any[], routePointsData?: any[]) => {
    // [수정] routeId.points 정보를 병합하여 type 정보 보존
    const sourcePoints = routePointsData || activeDrive?.routeId?.points;
    let mergedPoints = points;

    if (sourcePoints && sourcePoints.length > 0) {
      mergedPoints = points.map((p, i) => {
        const routeP = sourcePoints[i];
        return {
          ...p,
          type: routeP?.type || p.type,
        };
      });
    }

    const reversedPoints = [...mergedPoints].reverse();
    const reprocessedPoints = [];
    let isDepartedFound = false;
    let isArrivedFound = false;

    for (let checkpoint of reversedPoints) {
      // 이미 이후 구간이 출발(departed) 처리되었거나,
      // 최신 도착 지점이 확인된 상태에서 이전 지점이 도착(arrived) 상태라면 -> 출발(departed)로 변경
      if (isDepartedFound) {
        if (checkpoint.status !== 'departed') {
          checkpoint.status = 'departed';
        }
        reprocessedPoints.push(checkpoint);
        continue;
      }

      if (checkpoint.status === 'departed') {
        isDepartedFound = true;
        reprocessedPoints.push(checkpoint);
        continue;
      }

      if (checkpoint.status === 'arrived') {
        if (isArrivedFound) {
          // 이미 더 나중의 정류장이 '도착' 상태이므로, 이 정류장은 이미 떠난 것으로 간주
          checkpoint.status = 'departed';
          isDepartedFound = true; // 이전 정류장들도 모두 출발 처리
        } else {
          // 가장 최신의 '도착' 상태 (현재 정차 중)
          isArrivedFound = true;
        }
        reprocessedPoints.push(checkpoint);
        continue;
      }

      reprocessedPoints.push(checkpoint);
    }
    const completedProcessedPoints = reprocessedPoints.reverse();
    setCheckpoints(completedProcessedPoints);
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
    //   const saved = localStorage.getItem('activeDriveId');
    //   if (saved) resume(saved);
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
        console.log(res.data);
        dataReprocessing(res.data.checkpoints || [], res.data.routeId?.points);
        setIsWatching(true);
        localStorage.setItem('activeDriveId', id);
      })
      .catch(() => localStorage.removeItem('activeDriveId'));
  };

  const start = async (id: string) => {
    try {
      const res = await startDrive(id);
      // [수정] 시작 시 routeId가 populate되지 않으므로 수동 병합
      const routeInfo = routes.find((r) => r._id === id);
      const driveData = { ...res.data, routeId: routeInfo };
      setActiveDrive(driveData);
      dataReprocessing(res.data.checkpoints || [], routeInfo?.points);
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
      dataReprocessing(res.data.checkpoints || []);
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
      await speak('운행을 종료합니다.', true); // 음성 안내가 끝날 때까지 대기
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
    const startPoint = checkpoints[0]?.pointName || '?';
    const endPoint = checkpoints[checkpoints.length - 1]?.pointName || '?';
    const shareText = `🚗 지금 이동중이에요!
[출발지] ${startPoint}
[도착지] ${endPoint}
실시간 이동 상황을 확인해 보세요.
${shareUrl}`;

    try {
      await navigator.clipboard.writeText(shareText);
      alert('📋 운행 정보가 복사되었습니다!');
    } catch (err) {
      console.error('클립보드 복사 실패:', err);
      // 보안상 이유로 복사가 안 될 경우를 대비해 수동 복사 유도
      prompt('전체 텍스트를 복사해주세요:', shareText);
    }
  };

  useEffect(() => {
    if (isWatching && activeDrive) {
      timerRef.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
          async (p) => {
            const { latitude: curLat, longitude: curLng, speed } = p.coords;
            const now = Date.now();

            // [속도 기반 전송 로직]
            // speed(m/s) -> km/h 변환 (null인 경우 -1)
            const currentSpeedKmh = speed !== null ? speed * 3.6 : -1;
            const MIN_SPEED_KMH = 5; // 5km/h
            const SEND_INTERVAL_MS = 5000; // 5초
            const timeDiff = now - lastSendTimeRef.current;

            let shouldSend = false;

            if (currentSpeedKmh >= 0) {
              // 1. 속도 정보가 있는 경우
              if (!lastPosRef.current) {
                shouldSend = true; // 첫 전송
              } else if (
                currentSpeedKmh > MIN_SPEED_KMH &&
                timeDiff >= SEND_INTERVAL_MS
              ) {
                shouldSend = true;
              }
            } else {
              // 2. 속도 정보가 없는 경우 (Fallback: 거리 + 시간)
              if (!lastPosRef.current) {
                shouldSend = true;
              } else {
                const distance = getDistance(
                  lastPosRef.current.lat,
                  lastPosRef.current.lng,
                  curLat,
                  curLng
                );
                // 20m 이상 이동 & 5초 경과 시 전송
                if (distance > 20 && timeDiff >= SEND_INTERVAL_MS) {
                  shouldSend = true;
                }
              }
            }

            if (!shouldSend) return;

            try {
              const res = await updateLocation(activeDrive._id, curLat, curLng);
              lastPosRef.current = { lat: curLat, lng: curLng };
              lastSendTimeRef.current = now;

              dataReprocessing(res.data.checkpoints || []);
              if (res.data.message) setMessage(res.data.message);
              const speedLog =
                currentSpeedKmh >= 0
                  ? ` (${currentSpeedKmh.toFixed(1)}km/h)`
                  : ` (${currentSpeedKmh.toFixed(1)}km/h)[대체]`;
              addLog(`위치 전송 성공${speedLog}`);
            } catch (err) {
              addLog('위치 전송 실패 (서버 오류)');
            }
          },
          (e) => {
            addLog('GPS 신호를 찾을 수 없습니다.');
          },
          { enableHighAccuracy: true }
        );
      }, 1000);
    }
    return () => {
      clearInterval(timerRef.current);
      lastPosRef.current = null; // 종료 시 초기화
      lastSendTimeRef.current = 0;
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
      <div className="driver-view-container">
        <div className="driver-header" style={{ flexDirection: 'row' }}>
          <h1 className="driver-title">🚌 기사님 모드</h1>
          <Link to="/create" className="btn btn-outline-primary">
            노선 등록하러 가기
          </Link>
        </div>

        <div className="driver-content">
          {/* 1. 새 운행 시작 섹션 */}
          <div className="section-label">🆕 새 운행 시작</div>
          {routes.map((r) => (
            <div key={r._id} className="route-card">
              <div className="fw-bold text-dark">{r.routeName}</div>
              <div className="d-flex gap-2">
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => {
                    setEditRouteId(r._id);
                    setShowEditModal(true);
                  }}
                >
                  수정
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="fw-bold px-3"
                  onClick={async () => {
                    speak('운행을 시작합니다.', true);
                    start(r._id);
                  }}
                >
                  시작
                </Button>
              </div>
            </div>
          ))}

          {/* 2. 진행 중인 운행 섹션 */}
          <div className="section-label">🔄 진행 중인 운행</div>
          {activeDrives.length === 0 ? (
            <div className="text-center py-5 text-muted bg-white rounded-3 border">
              <div className="mb-2 fs-2">📭</div>
              현재 진행 중인 운행이 없습니다.
            </div>
          ) : (
            activeDrives.map((d) => (
              <div key={d._id} className="route-card">
                <div>
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <Badge bg="success">실시간</Badge>
                    <span className="fw-bold text-primary">
                      {d.routeId?.routeName}
                    </span>
                  </div>
                  <div className="text-muted small">ID: {d._id.slice(-6)}</div>
                </div>
                <Button
                  variant="outline-success"
                  size="sm"
                  className="fw-bold px-3"
                  onClick={async () => {
                    speak('운행을 시작합니다.', true);
                    resume(d._id);
                  }}
                >
                  접속
                </Button>
              </div>
            ))
          )}
        </div>

        <RouteEditModal
          show={showEditModal}
          onHide={() => setShowEditModal(false)}
          routeId={editRouteId}
          onUpdate={fetchInitialData}
        />
      </div>
    );
  }

  // 실시간 운행 화면
  return (
    <div className="driver-view-container">
      {/* 헤더 */}
      <div className="driver-header">
        <div className="tittle-section">
          <div className="text-center flex-grow-1">
            <h5 className=" driver-title text-center text-truncate ">
              {activeDrive.routeId?.routeName}
            </h5>
            <small className="text-success fw-bold">● 실시간 운행 중</small>
          </div>
          <Button
            variant="light"
            size="sm"
            className="rounded-circle shadow-sm border"
            style={{ width: '36px', height: '36px' }}
            onClick={handleShare}
          >
            🔗
          </Button>
        </div>
        {/* 로그 콘솔 */}
        <div className="log-console mb-1 mt-2">
          <div className="d-flex flex-column justify-content-between">
            <span className="text-center">{message}</span>
          </div>
        </div>
        <div className="log-console">
          <div className="d-flex flex-column justify-content-between border-bottom border-secondary mb-2 pb-1">
            <span>📡 시스템 로그</span>
          </div>
          {logs.length === 0 ? (
            <div className="text-secondary fst-italic">전송 대기 중...</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} style={{ opacity: i === 0 ? 1 : 0.6 }}>
                {i === 0 && '> '} {log}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div className="driver-content">
        {/* 체크포인트 테이블 */}
        <table className="custom-table">
          <thead>
            <tr>
              <th>구분</th>
              <th className="text-start">정차지 정보</th>
              <th>시간</th>
              <th>상태</th>
              <th>설정</th>
            </tr>
          </thead>
          <tbody>
            {(checkpoints || []).map((cp, i) => {
              const isArrived = cp.status === 'arrived';
              const isDeparted = cp.status === 'departed';
              const isPassed = isArrived || isDeparted; // 도착했거나 이미 떠났거나

              // 1. 구분 뱃지 로직
              const badgeInfo = TYPE_BADGE[cp.type] || {
                bg: 'secondary',
                label: cp.type || '기타',
              };
              const typeBadge = (
                <Badge bg={badgeInfo.bg}>{badgeInfo.label}</Badge>
              );

              return (
                <tr
                  key={i}
                  className={
                    isPassed ? 'row-passed' : isArrived ? 'row-active' : ''
                  }
                >
                  {/* 1. 구분 */}
                  <td>
                    <div className="d-flex justify-content-center align-items-center">
                      {typeBadge}
                    </div>
                  </td>

                  {/* 2. 정차지 정보 */}
                  <td className="text-start">
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
                  <td>
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
                    <small className={isPassed ? 'text-success' : 'text-muted'}>
                      {isDeparted
                        ? '출발완료'
                        : isArrived
                        ? '도착/정차'
                        : '예정'}
                    </small>
                  </td>

                  {/* 4. 상태 뱃지 */}
                  <td>
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
                  <td className="text-center">
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
        </table>
      </div>

      {/* 하단 고정 버튼 */}
      <div className="driver-footer d-flex justify-content-between align-items-center px-3 py-2 border-top bg-white">
        <Button
          variant="link"
          className="text-decoration-none text-secondary p-0 me-2"
          onClick={async () => {
            speak('운행을 종료합니다.', true);
            setActiveDrive(null);
          }}
          style={{ width: '80px' }}
        >
          ← 목록
        </Button>
        <button className="btn-main-action btn-end" onClick={end}>
          🏁 운행 종료 마감
        </button>
      </div>

      <RouteEditModal
        show={showEditModal}
        onHide={() => setShowEditModal(false)}
        routeId={editRouteId}
        onUpdate={fetchInitialData}
      />
    </div>
  );
};

export default DriverMode;

