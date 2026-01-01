import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

interface AutoZoomProps {
  carPos: [number, number];
  prevStopPos: [number, number] | null;
  nextStopPos: [number, number] | null;
  isAutoZoom: boolean;
  setIsAutoZoom: (val: boolean) => void;
}

/**
 * [스마트 줌 컴포넌트]
 * 차량의 현재 위치와 이전/다음 정류장을 계산하여
 * 지도 화면 안에 모두 들어오도록 자동으로 줌과 위치를 조절합니다.
 */
const AutoZoom = ({
  carPos,
  prevStopPos,
  nextStopPos,
  isAutoZoom,
  setIsAutoZoom,
}: AutoZoomProps) => {
  const map = useMap();

  // 사용자가 지도를 직접 조작(드래그, 줌)하면 자동 줌 모드를 해제합니다.
  useEffect(() => {
    const disableAutoZoom = () => {
      if (isAutoZoom) setIsAutoZoom(false);
    };

    map.on('dragstart', disableAutoZoom);
    map.on('zoomstart', disableAutoZoom);

    return () => {
      map.off('dragstart', disableAutoZoom);
      map.off('zoomstart', disableAutoZoom);
    };
  }, [map, isAutoZoom, setIsAutoZoom]);

  // 위치 데이터나 자동 줌 상태가 변경될 때 지도를 이동시킵니다.
  useEffect(() => {
    if (!isAutoZoom || !carPos) return;

    // 1. 화면에 포함시킬 좌표 리스트 생성 (차량 위치는 필수)
    const pointsToInclude: L.LatLngExpression[] = [carPos];

    // 2. 이전 정류장과 다음 정류장이 있다면 추가
    if (prevStopPos) pointsToInclude.push(prevStopPos);
    if (nextStopPos) pointsToInclude.push(nextStopPos);

    if (pointsToInclude.length > 1) {
      // 여러 지점이 있을 경우 모든 점이 포함되는 영역(Bounds) 계산
      const bounds = L.latLngBounds(pointsToInclude);

      map.fitBounds(bounds, {
        padding: [70, 70], // 상하좌우 여백 (px)
        maxZoom: 17, // 너무 과하게 확대되는 것 방지
        animate: true,
        duration: 1.0, // 부드러운 이동 시간 (초)
      });
    } else {
      // 좌표가 차량 위치 하나뿐일 경우 해당 위치로 중심 이동
      map.setView(carPos, 16, {
        animate: true,
      });
    }
  }, [carPos, prevStopPos, nextStopPos, isAutoZoom, map]);

  return null; // UI를 렌더링하지 않는 로직 전용 컴포넌트
};

export default AutoZoom;
