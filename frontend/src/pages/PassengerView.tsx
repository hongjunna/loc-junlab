import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Tooltip,
  Polyline,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import { Table, Badge, Spinner, Alert, Button } from 'react-bootstrap';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';

// 시간 포맷팅 헬퍼 (ISO -> HH:mm)
const formatTime = (isoString: string) => {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

// [스마트 줌] 사용자 개입 시 자동 멈춤
const AutoZoom = ({ carPos, nextStopPos, isAutoZoom, setIsAutoZoom }: any) => {
  const map = useMap();

  useEffect(() => {
    const disableAutoZoom = () => isAutoZoom && setIsAutoZoom(false);
    map.on('dragstart', disableAutoZoom);
    map.on('zoomstart', disableAutoZoom);
    return () => {
      map.off('dragstart', disableAutoZoom);
      map.off('zoomstart', disableAutoZoom);
    };
  }, [map, isAutoZoom, setIsAutoZoom]);

  useEffect(() => {
    if (isAutoZoom && carPos) {
      if (nextStopPos) {
        const bounds = L.latLngBounds([carPos, nextStopPos]);
        map.fitBounds(bounds, {
          padding: [80, 80],
          maxZoom: 16,
          animate: true,
        });
      } else {
        map.setView(carPos, 16, { animate: true });
      }
    }
  }, [carPos, nextStopPos, isAutoZoom, map]);

  return null;
};

const PassengerView = () => {
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAutoZoom, setIsAutoZoom] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      try {
        const res = await axios.get(`/api/drive/${id}`);
        setData(res.data);
      } catch (e) {
        console.error(e);
        setError('데이터 로딩 실패');
      }
    };
    fetchData();
    const timer = setInterval(fetchData, 5000);
    return () => clearInterval(timer);
  }, [id]);

  if (error)
    return (
      <Alert variant="danger" className="m-3">
        {error}
      </Alert>
    );
  if (!data || !data.currentLocation)
    return (
      <div className="p-5 text-center">
        <Spinner animation="border" />
      </div>
    );

  const carPos: [number, number] = [
    data.currentLocation.coordinates[1],
    data.currentLocation.coordinates[0],
  ];

  // [데이터 병합] routeId.points의 상세 정보(type, announcement 등)를 checkpoints에 합침
  const mergedStops = data.checkpoints
    .map((cp: any, index: number) => {
      const pointData = data.routeId?.points[index];
      if (!pointData || !pointData.location || !pointData.location.coordinates)
        return null;

      return {
        ...cp, // status, scheduledTime, arrivalTime, departureTime 등
        lat: pointData.location.coordinates[1],
        lng: pointData.location.coordinates[0],
        type: pointData.type, // '출발지', '도착지' 등
        useAnnouncement: pointData.useAnnouncement, // 안내방송 여부
        description: pointData.description, // 혹시 모를 설명 필드
      };
    })
    .filter((stop: any) => stop !== null);

  const nextStop = mergedStops.find((stop: any) => stop.status !== 'arrived');
  const nextStopPos: [number, number] | null = nextStop
    ? [nextStop.lat, nextStop.lng]
    : null;
  const linePath = mergedStops.map((stop: any) => [stop.lat, stop.lng]);

  return (
    <div
      className="app-main flex-grow-1 d-flex flex-column"
      style={{ height: '100vh', overflow: 'hidden' }}
    >
      {/* 지도 영역 */}
      <div style={{ height: '45vh', width: '100%', position: 'relative' }}>
        <MapContainer
          center={carPos}
          zoom={15}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <AutoZoom
            carPos={carPos}
            nextStopPos={nextStopPos}
            isAutoZoom={isAutoZoom}
            setIsAutoZoom={setIsAutoZoom}
          />

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
            <Tooltip direction="top" offset={[0, -12]} opacity={1} permanent>
              <div
                style={{
                  fontWeight: 'bold',
                  color: '#007bff',
                  fontSize: '12px',
                }}
              >
                현재 차량 위치
              </div>
            </Tooltip>
          </CircleMarker>

          {mergedStops.map((stop: any, idx: number) => {
            const isArrived = stop.status === 'arrived';
            const color = isArrived ? '#888888' : '#ff4d4f';
            return (
              <CircleMarker
                key={idx}
                center={[stop.lat, stop.lng]}
                radius={7}
                pathOptions={{
                  color: 'white',
                  fillColor: color,
                  fillOpacity: 1,
                  weight: 2,
                }}
              >
                <Tooltip
                  direction="bottom"
                  offset={[0, 5]}
                  opacity={0.9}
                  permanent
                >
                  <div style={{ textAlign: 'center', lineHeight: '1.2' }}>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 'bold',
                        color: color,
                      }}
                    >
                      {stop.type === '가상정류소'
                        ? `${stop.pointName}(가상)`
                        : stop.pointName}
                    </div>
                    <div style={{ fontSize: '10px', color: '#666' }}>
                      {stop.scheduledTime}
                    </div>
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}
          <Polyline
            positions={linePath}
            pathOptions={{ color: '#007bff', weight: 4, opacity: 0.3 }}
          />
        </MapContainer>
        {!isAutoZoom && (
          <div
            style={{
              position: 'absolute',
              bottom: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000,
            }}
          >
            <Button
              variant="primary"
              size="sm"
              className="shadow rounded-pill px-3 fw-bold"
              onClick={() => setIsAutoZoom(true)}
            >
              🔄 줌 초기화
            </Button>
          </div>
        )}
      </div>

      {/* 정보 요약 바 */}
      <div className="p-3 bg-white border-bottom text-center shadow-sm">
        <h5 className="fw-bold mb-1">🚌 {data.routeId?.routeName}</h5>
        <div className="d-flex justify-content-center align-items-center gap-2">
          <Badge bg={data.status === 'driving' ? 'success' : 'secondary'}>
            {data.status === 'driving' ? '운행중' : '운행종료'}
          </Badge>
          <small className="text-muted">
            {data.startTime ? `시작: ${formatTime(data.startTime)}` : ''}
            {data.endTime ? ` ~ 종료: ${formatTime(data.endTime)}` : ''}
          </small>
        </div>
      </div>

      {/* [업그레이드 된] 리스트 영역 */}
      <div className="flex-grow-1 overflow-auto bg-light">
        <Table hover className="mb-0 small bg-white align-middle">
          <thead className="table-light sticky-top">
            <tr>
              <th className="ps-3 py-2">체크포인트 정보</th>
              <th className="text-center py-2">시간</th>
              <th className="text-end pe-3 py-2">상태</th>
            </tr>
          </thead>
          <tbody>
            {mergedStops.map((stop: any, i: number) => {
              const isArrived = stop.status === 'arrived';

              // 시간 표시 로직: 이미 도착했으면 '실제 도착 시간', 아니면 '예정 시간'
              const timeLabel = isArrived ? '도착' : '예정';
              const timeValue =
                isArrived && stop.arrivalTime
                  ? formatTime(stop.arrivalTime) // 실제 도착 시간 (HH:mm)
                  : stop.scheduledTime; // 예정 시간

              // 정류소 타입 뱃지 (출발지/도착지 등)
              let typeBadge = null;
              if (stop.type === '출발지')
                typeBadge = (
                  <Badge bg="primary" className="me-1">
                    출발
                  </Badge>
                );
              else if (stop.type === '경유지')
                typeBadge = (
                  <Badge bg="warning" className="me-1 text-dark">
                    경유
                  </Badge>
                );
              else if (stop.type === '가상정류소')
                typeBadge = (
                  <Badge bg="Secondary" className="me-1 text-dark">
                    경유(가상)
                  </Badge>
                );
              else if (stop.type === '도착지')
                typeBadge = (
                  <Badge bg="dark" className="me-1">
                    종점
                  </Badge>
                );

              return (
                <tr key={i} className={isArrived ? 'bg-light text-muted' : ''}>
                  <td className="ps-3 py-3">
                    <div className="d-flex align-items-center mb-1">
                      {typeBadge}
                      <span
                        className={`fw-bold ${isArrived ? '' : 'text-primary'}`}
                        style={{ fontSize: '0.95rem' }}
                      >
                        {stop.pointName}
                      </span>
                    </div>
                  </td>

                  {/* 2. 시간 정보 (실제 vs 예정) */}
                  <td className="text-center">
                    <div className="fw-bold fs-6">{timeValue}</div>
                    <small
                      className={isArrived ? 'text-success' : 'text-muted'}
                    >
                      {timeLabel}
                    </small>
                  </td>

                  {/* 3. 상태 뱃지 */}
                  <td className="text-end pe-3">
                    <Badge
                      bg={
                        isArrived
                          ? 'secondary'
                          : stop.status === 'approaching'
                          ? 'warning'
                          : 'light'
                      }
                      text={stop.status === 'pending' ? 'dark' : 'white'}
                      className="px-2 py-1"
                    >
                      {isArrived
                        ? '출발'
                        : stop.status === 'approaching'
                        ? '곧도착'
                        : '예정'}
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

