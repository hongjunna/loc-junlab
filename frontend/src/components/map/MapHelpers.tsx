import { useEffect, useRef } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { LatLng } from '../../types';

/**
 * fitKey가 바뀔 때만 points가 모두 보이도록 맞춘다.
 * (좌표 배열이 렌더마다 새로 만들어져도 지도가 흔들리지 않게)
 */
export const FitBounds = ({
  points,
  fitKey,
  maxZoom = 16,
  padding = 40,
}: {
  points: LatLng[];
  fitKey: string;
  maxZoom?: number;
  padding?: number;
}) => {
  const map = useMap();
  const pointsRef = useRef(points);
  useEffect(() => {
    pointsRef.current = points;
  });

  useEffect(() => {
    const pts = pointsRef.current;
    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.setView(pts[0], Math.min(maxZoom, 15), { animate: true });
      return;
    }
    map.fitBounds(L.latLngBounds(pts), { padding: [padding, padding], maxZoom, animate: true });
  }, [fitKey, map, maxZoom, padding]);

  return null;
};

export const ClickHandler = ({ onClick }: { onClick: (pos: LatLng) => void }) => {
  useMapEvents({
    click(e) {
      onClick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
};

// 지도가 숨겨져 있다가 보일 때(모달, 접힘) 타일이 깨지지 않도록
export const InvalidateOnResize = ({ dep }: { dep: unknown }) => {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 320);
    return () => clearTimeout(t);
  }, [dep, map]);
  return null;
};

// 사용자가 지도를 직접 움직이면 알려줌
export const UserInteraction = ({ onInteract }: { onInteract: () => void }) => {
  useMapEvents({
    dragstart: onInteract,
    zoomstart: (e) => {
      // fitBounds 등 프로그램 이동은 originalEvent가 없음
      if ((e as unknown as { originalEvent?: Event }).originalEvent) onInteract();
    },
  });
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    el.addEventListener('wheel', onInteract, { passive: true });
    el.addEventListener('touchstart', onTouch, { passive: true });
    function onTouch(e: TouchEvent) {
      if (e.touches.length > 1) onInteract();
    }
    return () => {
      el.removeEventListener('wheel', onInteract);
      el.removeEventListener('touchstart', onTouch);
    };
  }, [map, onInteract]);
  return null;
};

export const FlyTo = ({ target }: { target: { pos: LatLng; seq: number } | null }) => {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target.pos, Math.max(map.getZoom(), 15), { duration: 0.8 });
  }, [target, map]);
  return null;
};
