import React, { useState, useEffect, useMemo, use, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Tooltip,
  Polyline,
  useMap,
} from 'react-leaflet';
import { Table, Badge, Spinner, Alert, Button } from 'react-bootstrap';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';
import './PassengerView.css';

import { getAdjustedTime } from '../services/time_helper';
import AutoZoom from './components/AutoZoom'; // 컴포넌트 분리 추천
import { TYPE_BADGE } from './ui_constants';

// --- 상수 및 스타일 매핑 ---
const STATUS_UI = {
  departed: {
    bg: 'secondary',
    text: 'white',
    label: '도착 후 출발',
    rowClass: 'row-departed',
    accent: '',
  },
  arrived: {
    bg: 'success',
    text: 'white',
    label: '도착/통과중',
    rowClass: 'row-arrived',
    accent: '#198754',
  },
  approaching: {
    bg: 'danger',
    text: 'white',
    label: '곧도착',
    rowClass: 'row-approaching',
    accent: '#007bff',
  },
  next: {
    bg: 'light',
    text: 'dark',
    label: '예정',
    rowClass: 'row-next',
    accent: '#ffc008',
  },
  pending: {
    bg: 'light',
    text: 'dark',
    label: '예정',
    rowClass: '',
    accent: '',
  },
};

const formatTime = (isoString: string) => {
  if (!isoString) return '-';
  return new Date(isoString).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

// 지도 이동용 컴포넌트
const MapRecenter = ({ center }: { center: [number, number] | null }) => {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 13, { duration: 1 });
  }, [center, map]);
  return null;
};

const PassengerView = () => {
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAutoZoom, setIsAutoZoom] = useState(true);
  const [countdown, setCountdown] = useState(15);
  const [drivingStatus, setDrivingStatus] = useState<string>('loading');
  const [selectedPos, setSelectedPos] = useState<[number, number] | null>(null);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Pull-to-collapse 제스처 상태
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartRef = useRef(0);
  const isPullingRef = useRef(false);

  // 터치 핸들러: 스크롤 최상단에서 아래로 당길 때 감지
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isExpanded) return;
    // 리스트가 맨 위일 때만 제스처 시작
    if (e.currentTarget.scrollTop <= 0) {
      touchStartRef.current = e.touches[0].clientY;
      isPullingRef.current = true;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isExpanded || !isPullingRef.current) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartRef.current;

    // 아래로 당기는 동작(diff > 0)이면서 스크롤이 맨 위일 때
    if (diff > 0 && e.currentTarget.scrollTop <= 0) {
      setPullDistance(diff * 0.1); // 0.4배의 저항감 적용
    } else {
      setPullDistance(0);
      isPullingRef.current = false;
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance > 5) setIsExpanded(false); // 100px 이상 당기면 닫기
    setPullDistance(0);
    isPullingRef.current = false;
  };

  // 데이터 로딩 로직
  const fetchData = async () => {
    if (!id) return;
    try {
      const res = await axios.get(`https://loc.junlab.xyz/api/drive/${id}`);
      setData(res.data);
      setCountdown(10);
    } catch (e) {
      setError('데이터 로딩 실패');
    }
  };

  useEffect(() => {
    const status = data?.status || 'loading';
    if (status === 'completed') {
      setDrivingStatus('운행종료');
      return;
    }
    const firstStopStatus = data?.checkpoints?.[0]?.status || 'pending';
    if (firstStopStatus === 'pending') {
      setDrivingStatus('운행대기');
    } else {
      setDrivingStatus('운행중');
    }
  }, [data]);

  useEffect(() => {}, [drivingStatus]);

  useEffect(() => {
    fetchData();
  }, [id]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchData();
          return 15;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [id]); // id가 변경되면 타이머도 재설정

  // 가공된 정류장 데이터 (useMemo로 최적화)
  const stops = useMemo(() => {
    if (!data || !data.checkpoints || !data.routeId?.points) return [];
    let rawStops = data.checkpoints
      .map((cp: any, idx: number) => {
        const pointInfo = data.routeId.points[idx];
        if (!pointInfo || !pointInfo.location) return null; // 데이터 매칭 실패 시 건너뜀
        return {
          ...cp,
          ...pointInfo,
          lat: pointInfo.location.coordinates[1],
          lng: pointInfo.location.coordinates[0],
        };
      })
      .filter(Boolean);

    // [데이터 후처리] 뒤에서부터 확인하여 도착/출발 완료된 지점 이전은 모두 departed 처리
    const reversedPoints = [...rawStops].reverse();
    const reprocessedPoints = [];
    let isPassedFound = false;

    for (const checkpoint of reversedPoints) {
      if (checkpoint.status === 'departed' || checkpoint.status === 'arrived') {
        isPassedFound = true;
        reprocessedPoints.push(checkpoint);
        continue;
      }
      if (isPassedFound && checkpoint.status !== 'departed') {
        // 이미 지나간 구간이므로 departed로 강제 변경
        reprocessedPoints.push({ ...checkpoint, status: 'departed' });
        continue;
      }
      reprocessedPoints.push(checkpoint);
    }
    rawStops = reprocessedPoints.reverse();

    // 출발지가 아직 출발하지 않았다면 상태 강제 조정 (접근 경로 숨김)
    if (drivingStatus !== '운행대기') {
      return rawStops.map((stop: any, i: number) => {
        if (i === 0) {
          // 출발지: 접근 중(approaching)일 때만 도착(arrived)으로 표시하여 경로 숨김
          return stop.status === 'approaching'
            ? { ...stop, status: 'arrived' }
            : stop;
        }
        return { ...stop, status: 'pending' };
      });
    }
    return rawStops;
  }, [data]);

  // 상태 인덱스 계산
  const { nextIdx, lastArrivedIdx } = useMemo(() => {
    const nextIdx = stops.findIndex((s: any) =>
      ['pending', 'approaching'].includes(s.status)
    );
    const lastArrivedIdx = stops
      .map((s: any, i: number) => (s.status === 'arrived' ? i : -1))
      .reduce((a: number, b: number) => Math.max(a, b), -1);
    return { nextIdx, lastArrivedIdx };
  }, [stops]);

  // 내 위치 찾기 핸들러
  const handleUserLocation = () => {
    if (!navigator.geolocation) {
      alert('GPS를 지원하지 않는 브라우저입니다.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserPos([latitude, longitude]);
        setSelectedPos([latitude, longitude]); // 지도 이동
        setIsAutoZoom(false); // 자동 줌 해제
      },
      (err) => {
        console.error(err);
        if (err.code === 1) {
          alert(
            '위치 권한이 거부되었습니다.\n브라우저 설정에서 위치 권한을 허용해주세요.'
          );
        } else if (err.code === 2) {
          alert(
            '위치를 확인할 수 없습니다.\nGPS 신호가 약하거나 일시적인 오류일 수 있습니다.'
          );
        } else if (err.code === 3) {
          alert(
            '위치 정보를 가져오는 데 시간이 너무 오래 걸립니다.\n잠시 후 다시 시도해주세요.'
          );
        } else {
          alert(`위치 정보를 가져올 수 없습니다.\n(${err.message})`);
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  if (error)
    return (
      <Alert variant="danger" className="m-3">
        {error}
      </Alert>
    );
  if (!data)
    return (
      <div className="p-5 text-center">
        <Spinner animation="border" />
      </div>
    );

  // 차량 위치가 없거나 좌표가 깨졌을 경우를 대비한 방어 로직
  let carPos: [number, number] =
    data.currentLocation && data.currentLocation.coordinates
      ? [
          data.currentLocation.coordinates[1],
          data.currentLocation.coordinates[0],
        ]
      : [37.5665, 126.978]; // 기본값 (서울)

  // 출발지 출발 전이거나 운행종료 등 운행중이 아닐때에는 차량 위치를 출발지로 고정 (이동 경로 숨김)
  if (stops.length > 0 && drivingStatus !== '운행중') {
    carPos = [stops[0].lat, stops[0].lng];
  }

  const nextStopPos: [number, number] | null =
    nextIdx !== -1 ? [stops[nextIdx].lat, stops[nextIdx].lng] : null;
  const prevStopPos: [number, number] | null =
    lastArrivedIdx !== -1
      ? [stops[lastArrivedIdx].lat, stops[lastArrivedIdx].lng]
      : null;

  return (
    <div className="passenger-view-container">
      {/* 1. 지도 영역 */}
      <div
        className="map-wrapper"
        style={{
          height: isExpanded ? '0' : '45%',
          opacity: isExpanded ? 0 : 1,
          transition: 'all 0.3s ease-in-out',
        }}
      >
        <MapContainer center={carPos} zoom={15} style={{ height: '100%' }}>
          <MapRecenter center={selectedPos} />
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <AutoZoom
            carPos={carPos}
            prevStopPos={prevStopPos}
            nextStopPos={nextStopPos}
            isAutoZoom={isAutoZoom}
            setIsAutoZoom={setIsAutoZoom}
          />
          {/* 사용자 위치 마커 (초록색) */}
          {userPos && (
            <CircleMarker
              center={userPos}
              radius={8}
              pathOptions={{
                color: 'white',
                fillColor: '#198754', // Bootstrap success color
                fillOpacity: 1,
                weight: 2,
              }}
            >
              <Tooltip direction="top">내 위치</Tooltip>
            </CircleMarker>
          )}
          {/* 차량 마커 */}
          {drivingStatus === '운행중' &&
            data.currentLocation && ( // 위치 정보가 있을 때만 마커 표시
              <CircleMarker
                center={carPos}
                radius={12}
                pathOptions={{
                  color: 'white',
                  fillColor: '#ff4d4f',
                  fillOpacity: 1,
                  weight: 3,
                }}
              >
                <Tooltip direction="top" permanent>
                  <strong>현재 이동 위치</strong>
                </Tooltip>
              </CircleMarker>
            )}
          {/* 정류장 마커 */}
          {stops.map((stop: any, idx: number) => (
            <CircleMarker
              key={idx}
              center={[stop.lat, stop.lng]}
              radius={7}
              pathOptions={{
                color: 'white',
                fillColor: stop.status === 'arrived' ? '#007bff' : '#888888',
                fillOpacity: 1,
                weight: 2,
              }}
            >
              <Tooltip direction="bottom" permanent>
                {stop.type === '가상정류소' ? (
                  <span className="badge text-bg-secondary">통과</span>
                ) : stop.type === '출발지' ? (
                  <span className="badge text-bg-primary">출발</span>
                ) : stop.type === '도착지' ? (
                  <span className="badge text-bg-success">도착지</span>
                ) : (
                  <span className="badge text-bg-warning">정차</span>
                )}
                <div className="text-center">
                  <b
                    style={{
                      color:
                        stop.status === 'arrived'
                          ? '#ff4d4f'
                          : stop.type === '가상정류소'
                          ? '#888888'
                          : 'black',
                    }}
                  >
                    {stop.pointName}
                  </b>
                </div>
              </Tooltip>
            </CircleMarker>
          ))}
          <Polyline
            positions={stops.map((s: any) => [s.lat, s.lng])}
            pathOptions={{ color: '#007bff', weight: 4, opacity: 0.3 }}
          />
        </MapContainer>

        {!isAutoZoom && (
          <button
            className="map-floating-btn btn-reset-zoom"
            onClick={() => setIsAutoZoom(true)}
          >
            🔄 줌 초기화
          </button>
        )}
      </div>

      {/* 2. 정보 시트 영역 (Bottom Sheet 스타일) */}
      <div
        className="info-sheet-container"
        style={{
          marginTop: isExpanded ? '0' : '-24px',
          borderRadius: isExpanded ? '0' : '24px 24px 0 0',
          // 당기는 거리만큼 시각적 이동 (드래그 중에는 transition 끔)
          transform:
            pullDistance > 0 ? `translateY(${pullDistance}px)` : 'none',
          transition: pullDistance === 0 ? 'all 0.3s ease-in-out' : 'none',
        }}
      >
        <div className="info-header">
          {/* 지도/시간표 토글 버튼 */}
          <div className="d-flex justify-content-end mb-2">
            <button
              className="btn-toggle-expand"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? '🗺️ 지도 보기' : '📜 시간표 확대'}
            </button>
          </div>
          <h1 className="route-title">{data.routeId?.routeName}</h1>

          <div className="status-badge-wrapper">
            <span
              className={`badge ${
                drivingStatus === '운행중' ? 'bg-success' : 'bg-secondary'
              }`}
            >
              {drivingStatus}
            </span>
            <span>
              {drivingStatus === '운행대기'
                ? '운행 시작 대기 중'
                : `출발: ${formatTime(data.startTime)}`}
            </span>
          </div>

          {drivingStatus === '운행대기' && (
            <div className="status-message-box waiting">
              ⏳ 이 운행은 출발 대기중입니다.
            </div>
          )}
          {drivingStatus !== '운행중' && drivingStatus !== '운행대기' && (
            <div className="status-message-box ended">
              🏁 이 운행은 종료되었습니다.
            </div>
          )}
        </div>

        <div className="refresh-info">
          <span>* 시간은 실제 도착/출발 기준입니다.</span>
          <span className="refresh-timer">{countdown}초 후 갱신</span>
        </div>

        {/* 3. 리스트 영역 */}
        <div
          className="timetable-wrapper"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <table className="custom-table">
            <thead>
              <tr>
                <th>체크포인트</th>
                <th>도착시간</th>
                <th>출발시간</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {stops.map((stop: any, i: number) => {
                const isActuallyArrived = i === lastArrivedIdx;
                const isDeparted =
                  stop.status === 'departed' ||
                  (stop.status === 'arrived' && i < lastArrivedIdx);
                const isNext = i === nextIdx;
                const isApproaching = stop.status === 'approaching';

                // 현재 정류장의 최종 UI 상태 결정
                const uiStatus = isDeparted
                  ? 'departed'
                  : isActuallyArrived
                  ? 'arrived'
                  : isApproaching
                  ? 'approaching'
                  : isNext
                  ? 'next'
                  : 'pending';
                const ui = STATUS_UI[uiStatus];
                const type = TYPE_BADGE[stop.type as keyof typeof TYPE_BADGE];
                const arrivalTime = stop.arrivalTime;
                const departureTime = stop.departureTime;
                const isPassed = uiStatus === 'departed';

                return (
                  <tr
                    key={i}
                    className={`row-item ${ui.rowClass}`}
                    onClick={() => {
                      setIsAutoZoom(false);
                      setSelectedPos([stop.lat, stop.lng]);
                    }}
                  >
                    <td>
                      <div className="d-flex align-items-center">
                        <Badge
                          bg={type.bg}
                          text={type.bg === 'warning' ? 'dark' : 'white'}
                          className="point-badge"
                        >
                          {type.label}
                        </Badge>
                        <span
                          className={`fw-bold ${
                            isActuallyArrived ? 'text-success' : ''
                          }`}
                        >
                          {stop.pointName}
                        </span>
                      </div>
                    </td>
                    <td className="text-center">
                      <div className="fw-bold">
                        {arrivalTime ? formatTime(arrivalTime) : '-'}
                      </div>
                    </td>
                    <td className="text-center">
                      <div className="fw-bold">
                        {departureTime ? formatTime(departureTime) : '-'}
                      </div>
                    </td>
                    <td className="text-center">
                      {isNext && !isActuallyArrived && !isApproaching ? (
                        <Badge bg="warning" text="dark" pill>
                          다음 목적지
                        </Badge>
                      ) : (
                        <Badge bg={ui.bg} text={ui.text} className="px-2 py-1">
                          {ui.label}
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PassengerView;

