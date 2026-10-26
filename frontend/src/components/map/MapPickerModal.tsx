import { useState, type FormEvent } from 'react';
import { Button, Form, InputGroup, ListGroup, Modal, Spinner } from 'react-bootstrap';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import { DEFAULT_CENTER, TILE_ATTRIBUTION, TILE_URL } from '../../lib/ui';
import type { LatLng } from '../../types';
import { ClickHandler, FitBounds, FlyTo } from './MapHelpers';

interface SearchResult {
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
}

export interface PickedLocation {
  pos: LatLng;
  name?: string;
}

interface Props {
  show: boolean;
  onHide: () => void;
  onPick: (picked: PickedLocation) => void;
  initial?: LatLng | null;
  // 이미 추가된 지점들 (참고용 표시)
  existing: { name: string; pos: LatLng }[];
}

// OpenStreetMap Nominatim 장소 검색 (무료, 초당 1회 정도로만 사용)
const searchPlaces = async (q: string): Promise<SearchResult[]> => {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({
    q,
    format: 'jsonv2',
    'accept-language': 'ko',
    countrycodes: 'kr',
    limit: '6',
  }).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error('검색 실패');
  return res.json();
};

const MapPickerModal = ({ show, onHide, onPick, initial, existing }: Props) => {
  const [selected, setSelected] = useState<PickedLocation | null>(
    initial ? { pos: initial } : null
  );
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [flyTarget, setFlyTarget] = useState<{ pos: LatLng; seq: number } | null>(null);

  const fly = (pos: LatLng) => setFlyTarget((prev) => ({ pos, seq: (prev?.seq || 0) + 1 }));

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    // 포털 모달이라도 React 이벤트는 부모 폼(지점 입력)으로 버블링되므로 차단
    e.stopPropagation();
    if (!query.trim()) return;
    setSearching(true);
    try {
      setResults(await searchPlaces(query.trim()));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleMyLocation = () => {
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        const pos: LatLng = [p.coords.latitude, p.coords.longitude];
        setSelected({ pos });
        fly(pos);
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const existingPts = existing.map((e) => e.pos);
  const fitPoints = initial ? [initial] : existingPts;

  return (
    <Modal show={show} onHide={onHide} centered size="lg" fullscreen="sm-down">
      <Modal.Header closeButton>
        <Modal.Title className="fs-5">지도에서 위치 선택</Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-0 d-flex flex-column" style={{ minHeight: 420 }}>
        <div className="p-2 border-bottom">
          <Form onSubmit={handleSearch}>
            <InputGroup size="sm">
              <Form.Control
                placeholder="장소·주소 검색 (예: 강남역)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Button type="submit" variant="primary" disabled={searching}>
                {searching ? <Spinner size="sm" /> : '검색'}
              </Button>
              <Button variant="outline-secondary" onClick={handleMyLocation} title="내 위치">
                📍
              </Button>
            </InputGroup>
          </Form>
          {results && (
            <ListGroup variant="flush" className="search-results mt-1">
              {results.length === 0 && (
                <ListGroup.Item className="small text-muted">검색 결과가 없습니다.</ListGroup.Item>
              )}
              {results.map((r, i) => (
                <ListGroup.Item
                  key={i}
                  action
                  className="small py-1"
                  onClick={() => {
                    const pos: LatLng = [Number(r.lat), Number(r.lon)];
                    setSelected({ pos, name: r.name || r.display_name.split(',')[0] });
                    fly(pos);
                    setResults(null);
                  }}
                >
                  <div className="fw-semibold">{r.name || r.display_name.split(',')[0]}</div>
                  <div className="text-muted text-truncate">{r.display_name}</div>
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}
        </div>
        <div className="flex-grow-1 position-relative" style={{ minHeight: 340 }}>
          {show && (
            <MapContainer
              center={initial || existingPts.at(-1) || DEFAULT_CENTER}
              zoom={14}
              className="h-100 w-100 position-absolute"
            >
              <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
              <FitBounds points={fitPoints} fitKey={show ? 'open' : 'closed'} />
              <FlyTo target={flyTarget} />
              <ClickHandler onClick={(pos) => setSelected({ pos })} />
              {existingPts.length > 1 && (
                <Polyline
                  positions={existingPts}
                  pathOptions={{ color: '#6366f1', weight: 3, opacity: 0.5, dashArray: '6 6' }}
                />
              )}
              {existing.map((e, i) => (
                <CircleMarker
                  key={i}
                  center={e.pos}
                  radius={6}
                  pathOptions={{ color: 'white', fillColor: '#6366f1', fillOpacity: 1, weight: 2 }}
                >
                  <Tooltip direction="top">
                    {i + 1}. {e.name}
                  </Tooltip>
                </CircleMarker>
              ))}
              {selected && (
                <CircleMarker
                  center={selected.pos}
                  radius={10}
                  pathOptions={{ color: 'white', fillColor: '#ef4444', fillOpacity: 1, weight: 3 }}
                />
              )}
            </MapContainer>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer className="justify-content-between">
        <small className="text-muted">
          {selected
            ? `${selected.pos[0].toFixed(6)}, ${selected.pos[1].toFixed(6)}`
            : '지도를 눌러 위치를 선택하세요'}
        </small>
        <div className="d-flex gap-2">
          <Button variant="outline-secondary" onClick={onHide}>
            취소
          </Button>
          <Button
            variant="primary"
            disabled={!selected}
            onClick={() => {
              if (selected) onPick(selected);
              onHide();
            }}
          >
            선택 완료
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
};

export default MapPickerModal;
