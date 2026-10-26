import { useMemo, useState } from 'react';
import L from 'leaflet';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMapEvents,
} from 'react-leaflet';
import { toLatLng } from '../../lib/format';
import { DEFAULT_CENTER, TILE_ATTRIBUTION, TILE_URL } from '../../lib/ui';
import type { Checkpoint, LatLng } from '../../types';
import { FitBounds, FlyTo, InvalidateOnResize, UserInteraction } from './MapHelpers';

export interface CarState {
  pos: LatLng;
  heading?: number;
  stale?: boolean;
}

interface Props {
  checkpoints: Checkpoint[];
  currentIndex: number;
  car: CarState | null;
  track?: LatLng[];
  autoFollow: boolean;
  onUserInteract?: () => void;
  flyTarget?: { pos: LatLng; seq: number } | null;
  userPos?: LatLng | null;
  myStopIndex?: number | null;
  resizeKey?: unknown;
}

const carIcon = (heading: number | undefined, stale: boolean) =>
  L.divIcon({
    className: `car-marker ${stale ? 'car-stale' : ''}`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html:
      heading !== undefined && heading !== null && !Number.isNaN(heading)
        ? `<div class="car-dot"><div class="car-arrow" style="transform: rotate(${heading}deg)"></div></div>`
        : '<div class="car-dot"></div>',
  });

const stopColor = (cp: Checkpoint, isNext: boolean) => {
  if (cp.status === 'arrived') return '#16a34a';
  if (cp.status === 'departed') return '#9ca3af';
  if (isNext || cp.status === 'approaching') return '#f59e0b';
  return '#4f46e5';
};

// 줌 레벨에 따라 라벨 표시 (겹침 방지)
const StopMarkers = ({
  checkpoints,
  currentIndex,
  myStopIndex,
}: Pick<Props, 'checkpoints' | 'currentIndex' | 'myStopIndex'>) => {
  const map = useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const [zoom, setZoom] = useState(() => map.getZoom());
  const showAll = zoom >= 15;

  return (
    <>
      {checkpoints.map((cp, i) => {
        const isNext = i === currentIndex && cp.status !== 'departed';
        const important =
          isNext ||
          i === myStopIndex ||
          i === 0 ||
          i === checkpoints.length - 1 ||
          cp.status === 'arrived';
        const permanent = showAll ? cp.type !== '가상정류소' || isNext : important;
        return (
          <CircleMarker
            key={`${i}-${permanent}`}
            center={toLatLng(cp.coordinates)}
            radius={cp.type === '가상정류소' ? 5 : isNext ? 9 : 7}
            pathOptions={{
              color: i === myStopIndex ? '#ef4444' : 'white',
              weight: i === myStopIndex ? 3 : 2,
              fillColor: stopColor(cp, isNext),
              fillOpacity: 1,
            }}
          >
            <Tooltip
              direction="right"
              offset={[8, 0]}
              permanent={permanent}
              className={`stop-label ${cp.status === 'departed' ? 'stop-label-passed' : ''} ${isNext ? 'stop-label-next' : ''}`}
            >
              {cp.pointName}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
};

const DriveMap = ({
  checkpoints,
  currentIndex,
  car,
  track = [],
  autoFollow,
  onUserInteract,
  flyTarget,
  userPos,
  myStopIndex,
  resizeKey,
}: Props) => {
  const stops = useMemo(() => checkpoints.map((cp) => toLatLng(cp.coordinates)), [checkpoints]);
  // currentIndex < 0 : 종료된 운행 (다음 정류장 강조/남은 구간 없음)
  const remaining = currentIndex < 0 ? [] : stops.slice(Math.max(0, currentIndex - (car ? 0 : 1)));
  const plannedRest = car ? [car.pos, ...remaining] : remaining;

  // 차량 + 직전/다음 정류장이 보이도록. 차량이 실제로 움직였을 때만 다시 맞춤
  const focus: LatLng[] = car
    ? [car.pos, stops[currentIndex], stops[Math.max(0, currentIndex - 1)]].filter(Boolean)
    : stops;
  const fitKey = autoFollow
    ? car
      ? `car|${currentIndex}|${car.pos[0].toFixed(4)},${car.pos[1].toFixed(4)}`
      : `stops|${stops.length}`
    : 'manual';

  return (
    <MapContainer
      center={car?.pos || stops[0] || DEFAULT_CENTER}
      zoom={14}
      className="h-100 w-100"
      zoomControl={false}
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
      {autoFollow ? (
        <FitBounds points={focus} fitKey={fitKey} padding={60} maxZoom={16} />
      ) : (
        <FitBounds points={[...stops, ...track]} fitKey="initial" />
      )}
      {onUserInteract && <UserInteraction onInteract={onUserInteract} />}
      <FlyTo target={flyTarget || null} />
      <InvalidateOnResize dep={resizeKey} />

      {/* 전체 노선 (연한 점선) */}
      {stops.length > 1 && (
        <Polyline
          positions={stops}
          pathOptions={{ color: '#6366f1', weight: 3, opacity: 0.25, dashArray: '4 8' }}
        />
      )}
      {/* 남은 구간 */}
      {plannedRest.length > 1 && (
        <Polyline
          positions={plannedRest}
          pathOptions={{ color: '#4f46e5', weight: 4, opacity: 0.45, dashArray: '8 8' }}
        />
      )}
      {/* 실제 지나온 궤적 */}
      {track.length > 1 && (
        <Polyline positions={track} pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.8 }} />
      )}

      <StopMarkers
        checkpoints={checkpoints}
        currentIndex={currentIndex}
        myStopIndex={myStopIndex}
      />

      {userPos && (
        <CircleMarker
          center={userPos}
          radius={7}
          pathOptions={{ color: 'white', fillColor: '#0ea5e9', fillOpacity: 1, weight: 2 }}
        >
          <Tooltip direction="left">내 위치</Tooltip>
        </CircleMarker>
      )}

      {car && (
        <Marker position={car.pos} icon={carIcon(car.heading, !!car.stale)} zIndexOffset={1000} />
      )}
    </MapContainer>
  );
};

export default DriveMap;
