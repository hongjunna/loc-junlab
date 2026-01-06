import React, { useState, useEffect, useMemo, use } from 'react';
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

import { getAdjustedTime } from '../services/time_helper';
import AutoZoom from './components/AutoZoom'; // 컴포넌트 분리 추천
import { TYPE_BADGE } from './ui_constants';

// --- 상수 및 스타일 매핑 ---
const STATUS_UI = {
  departed: {
    bg: 'secondary',
    text: 'white',
    label: '도착 후 출발',
    rowClass: 'bg-light text-muted opacity-75',
    accent: '',
  },
  arrived: {
    bg: 'success',
    text: 'white',
    label: '도착/통과중',
    rowClass: 'table-success',
    accent: '#198754',
  },
  approaching: {
    bg: 'danger',
    text: 'white',
    label: '곧도착',
    rowClass: 'table-primary',
    accent: '#007bff',
  },
  next: {
    bg: 'light',
    text: 'dark',
    label: '예정',
    rowClass: 'table-warning animate-highlight',
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

  // 데이터 로딩 로직
  const fetchData = async () => {
    if (!id) return;
    try {
      const res = await axios.get(`https://loc.junlab.xyz/api/drive/${id}`);
      setData(res.data);
      console.log('Fetched data:', res.data);
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

  useEffect(() => {
    console.log('Driving status updated:', drivingStatus);
  }, [drivingStatus]);

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
    <div
      className="app-main d-flex flex-column"
      style={{ height: '100vh', overflow: 'hidden' }}
    >
      {/* 1. 지도 영역 */}
      <div id="map">
        <div style={{ height: '40vh', position: 'relative' }}>
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
                    fillColor: '#007bff',
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
                  fillColor: stop.status === 'arrived' ? '#ff4d4f' : '#888888',
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

          {/* 내 위치 버튼 */}
          <Button
            variant="light"
            size="sm"
            className="position-absolute shadow-sm fw-bold"
            style={{ top: '10px', right: '10px', zIndex: 1000 }}
            onClick={handleUserLocation}
          >
            📍 내 위치
          </Button>

          {!isAutoZoom && (
            <Button
              variant="primary"
              size="sm"
              className="position-absolute shadow rounded-pill px-3 fw-bold"
              style={{
                bottom: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1000,
              }}
              onClick={() => setIsAutoZoom(true)}
            >
              🔄 줌 초기화
            </Button>
          )}
        </div>
      </div>

      {/* 2. 정보 요약 바 */}
      <div className="p-3 bg-white border-bottom text-center shadow-sm">
        <h5 className="fw-bold mb-2 text-center">{data.routeId?.routeName}</h5>
        <div className="d-flex justify-content-center align-items-center gap-2">
          <Badge
            bg={
              drivingStatus === '운행대기'
                ? 'secondary'
                : drivingStatus === '운행중'
                ? 'success'
                : 'dark'
            }
          >
            {drivingStatus}
          </Badge>
          <small className="text-muted">
            {drivingStatus === '운행대기'
              ? '운행 시작 대기 중'
              : `기점 출발 시각: ${formatTime(data.startTime)}`}
          </small>
        </div>
        {drivingStatus === '운행대기' ? (
          <h5 className="mt-3" style={{ color: '#ffc207', fontWeight: 'bold' }}>
            이 운행은 출발 대기중입니다.
          </h5>
        ) : (
          drivingStatus !== '운행중' && (
            <h5 className="mt-3" style={{ color: 'red', fontWeight: 'bold' }}>
              이 운행은 종료되었습니다.
            </h5>
          )
        )}
      </div>
      <div id="timetable-info" className="d-flex flex-column">
        <small className="text-primary fw-bold text-end p-1">
          {countdown}초 후 정보 자동 갱신
        </small>
        <span
          className="mb-2 text-muted small me-1"
          style={{ fontSize: '12px', textAlign: 'end' }}
        >
          *도착/출발시간은 예정이 아닌 해당 포인트에
          <br />
          <strong>실제로 도착하고 출발한 시간을</strong> 나타냅니다.
        </span>
      </div>
      {/* 3. 리스트 영역 */}
      <div id="timetable">
        <div className="flex-grow-1 overflow-auto bg-light mb-5">
          <Table
            hover
            className="mb-0 small bg-white align-middle text-center text-nowrap"
          >
            <thead className="table-light sticky-top">
              <tr>
                <th className="ps-3">체크포인트 정보</th>
                <th>도착시간</th>
                <th>출발시간</th>
                <th>상태</th>
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
                    className={ui.rowClass}
                    style={{
                      cursor: 'pointer',
                      ...(ui.accent
                        ? { borderLeft: `5px solid ${ui.accent}` }
                        : {}),
                    }}
                    onClick={() => {
                      setIsAutoZoom(false);
                      setSelectedPos([stop.lat, stop.lng]);
                    }}
                  >
                    <td className="text-start ps-3 py-3">
                      <div className="d-flex align-items-center gap-2">
                        <Badge
                          bg={type.bg}
                          text={type.bg === 'warning' ? 'dark' : 'white'}
                          pill
                        >
                          {type.label}
                        </Badge>
                        <span
                          className={`fw-bold ${
                            isActuallyArrived ? 'text-success' : ''
                          }`}
                          style={isPassed ? { color: 'gray' } : {}}
                        >
                          {stop.pointName}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="fw-bold fs-6">
                        {arrivalTime ? formatTime(arrivalTime) : '-'}
                      </div>
                    </td>
                    <td>
                      <div className="fw-bold fs-6">
                        {departureTime ? formatTime(departureTime) : '-'}
                      </div>
                    </td>
                    <td className="pe-3">
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
          </Table>
        </div>
      </div>
    </div>
  );
};

export default PassengerView;

