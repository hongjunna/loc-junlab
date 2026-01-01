import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Tooltip,
  Polyline,
} from 'react-leaflet';
import { Table, Badge, Spinner, Alert, Button } from 'react-bootstrap';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';

import { getAdjustedTime } from '../services/time_helper';
import AutoZoom from './components/AutoZoom'; // 컴포넌트 분리 추천

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
    label: '도착',
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

const TYPE_BADGE = {
  출발지: { bg: 'primary', label: '출발점' },
  경유지: { bg: 'warning', label: '경유' },
  가상정류소: { bg: 'dark', label: '경유(가상)' },
  도착지: { bg: 'success', label: '종점' },
};

const formatTime = (isoString: string) => {
  if (!isoString) return '-';
  return new Date(isoString).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const PassengerView = () => {
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAutoZoom, setIsAutoZoom] = useState(true);
  const [countdown, setCountdown] = useState(15);

  // 데이터 로딩 로직
  const fetchData = async () => {
    if (!id) return;
    try {
      const res = await axios.get(`https://loc.junlab.xyz/api/drive/${id}`);
      setData(res.data);
      setCountdown(15);
    } catch (e) {
      setError('데이터 로딩 실패');
    }
  };

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
    return data.checkpoints
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
  const carPos: [number, number] =
    data.currentLocation && data.currentLocation.coordinates
      ? [
          data.currentLocation.coordinates[1],
          data.currentLocation.coordinates[0],
        ]
      : [37.5665, 126.978]; // 기본값 (서울)

  const nextStopPos: [number, number] | null =
    nextIdx !== -1 ? [stops[nextIdx].lat, stops[nextIdx].lng] : null;
  const prevStopPos: [number, number] | null =
    lastArrivedIdx !== -1
      ? [stops[lastArrivedIdx].lat, stops[lastArrivedIdx].lng]
      : null;

  return (
    <div
      className="app-main d-flex flex-column mt-3"
      style={{ height: '100vh', overflow: 'hidden' }}
    >
      {/* 1. 지도 영역 */}
      <div style={{ height: '45vh', position: 'relative' }}>
        <MapContainer center={carPos} zoom={15} style={{ height: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <AutoZoom
            carPos={carPos}
            prevStopPos={prevStopPos}
            nextStopPos={nextStopPos}
            isAutoZoom={isAutoZoom}
            setIsAutoZoom={setIsAutoZoom}
          />

          {/* 차량 마커 */}
          {data.status === 'running' &&
            stops[0]?.status !== 'pending' &&
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
                  <strong>현재 차량 위치</strong>
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
                fillColor: stop.status === 'arrived' ? '#888888' : '#ff4d4f',
                fillOpacity: 1,
                weight: 2,
              }}
            >
              <Tooltip direction="bottom" permanent>
                <div className="text-center small">
                  <b
                    style={{
                      color: stop.status === 'arrived' ? '#888888' : '#ff4d4f',
                    }}
                  >
                    {stop.pointName}
                  </b>
                  <br />
                  {stop.scheduledTime}
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

      {/* 2. 정보 요약 바 */}
      <div className="p-3 bg-white border-bottom text-center shadow-sm">
        <h5 className="fw-bold mb-1">{data.routeId?.routeName}</h5>
        <div className="d-flex justify-content-center align-items-center gap-2">
          <Badge bg={stops[0]?.status === 'pending' ? 'warning' : 'success'}>
            {stops[0]?.status === 'pending' ? '운행대기' : '운행중'}
          </Badge>
          <small className="text-muted">
            {stops[0]?.status === 'pending'
              ? '운행 시작 대기 중'
              : `기점 출발 시각: ${formatTime(data.startTime)}`}
          </small>
        </div>
      </div>
      <small className="text-primary fw-bold text-end p-1">
        {countdown}초 후 정보 자동 갱신
      </small>

      {/* 3. 리스트 영역 */}
      <div className="flex-grow-1 overflow-auto bg-light mb-5">
        <Table
          hover
          className="mb-0 small bg-white align-middle text-center text-nowrap"
        >
          <thead className="table-light sticky-top">
            <tr>
              <th>구분</th>
              <th className="text-start ps-3">체크포인트 정보</th>
              <th>도착예정시간</th>
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

              // 시간 계산
              const timeValue =
                isDeparted && stop.departureTime
                  ? formatTime(stop.departureTime)
                  : isActuallyArrived && stop.arrivalTime
                  ? formatTime(stop.arrivalTime)
                  : getAdjustedTime(
                      stop.scheduledTime,
                      stops[0].scheduledTime,
                      data.startTime ? new Date(data.startTime) : null
                    );

              return (
                <tr
                  key={i}
                  className={ui.rowClass}
                  style={
                    ui.accent ? { borderLeft: `5px solid ${ui.accent}` } : {}
                  }
                >
                  <td className="py-3">
                    <div className="d-flex justify-content-center align-items-center gap-1">
                      {isNext && !isActuallyArrived && !isApproaching && (
                        <span>📍</span>
                      )}
                      <Badge bg={type.bg}>{type.label}</Badge>
                    </div>
                  </td>
                  <td className="text-start ps-3 py-3">
                    <div className="d-flex align-items-center gap-2">
                      <span
                        className={`fw-bold ${
                          isActuallyArrived ? 'text-success' : 'text-primary'
                        }`}
                      >
                        {stop.pointName}
                      </span>
                      {isNext && !isActuallyArrived && !isApproaching && (
                        <Badge bg="warning" text="dark" pill>
                          다음 목적지
                        </Badge>
                      )}
                      {isActuallyArrived && (
                        <Badge bg="success" pill className="blink">
                          정차중
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="fw-bold fs-6">{timeValue}</div>
                    <small
                      className={
                        isActuallyArrived || isDeparted
                          ? 'text-success'
                          : 'text-muted'
                      }
                    >
                      {isDeparted
                        ? '출발'
                        : isActuallyArrived
                        ? '도착'
                        : '예정'}
                    </small>
                  </td>
                  <td className="pe-3">
                    <Badge bg={ui.bg} text={ui.text} className="px-2 py-1">
                      {ui.label}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    </div>
  );
};

export default PassengerView;

