import { useState, type FormEvent } from 'react';
import { Button, Col, Form, Modal, Row } from 'react-bootstrap';
import LoadPointModal from '../LoadPointModal';
import MapPickerModal from '../map/MapPickerModal';
import { POINT_TYPES, type LatLng, type PointType, type RoutePoint } from '../../types';

interface Props {
  initial: RoutePoint | null; // null이면 새 지점
  defaultType: PointType;
  allowedTypes: PointType[];
  existing: { name: string; pos: LatLng }[];
  onSave: (point: RoutePoint) => void;
  onHide: () => void;
}

const PointFormModal = ({
  initial,
  defaultType,
  allowedTypes,
  existing,
  onSave,
  onHide,
}: Props) => {
  const [name, setName] = useState(initial?.name || '');
  const [type, setType] = useState<PointType>(initial?.type || defaultType);
  const [lat, setLat] = useState(initial ? String(initial.location.coordinates[1]) : '');
  const [lng, setLng] = useState(initial ? String(initial.location.coordinates[0]) : '');
  const [time, setTime] = useState(initial?.scheduledTime || '');
  const [announce, setAnnounce] = useState(initial?.useAnnouncement ?? type !== '가상정류소');
  const [showMap, setShowMap] = useState(false);
  const [showLoad, setShowLoad] = useState(false);
  const [validated, setValidated] = useState(false);

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const coordValid =
    lat.trim() !== '' &&
    lng.trim() !== '' &&
    Math.abs(latNum) <= 90 &&
    Math.abs(lngNum) <= 180 &&
    !isNaN(latNum) &&
    !isNaN(lngNum);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // 모달은 포털로 렌더링되지만 React 이벤트는 바깥 노선 폼까지 버블링되므로 차단
    e.stopPropagation();
    setValidated(true);
    if (!name.trim() || !coordValid) return;
    onSave({
      ...(initial?._id ? { _id: initial._id } : {}),
      name: name.trim(),
      type,
      location: { type: 'Point', coordinates: [lngNum, latNum] },
      scheduledTime: time || undefined,
      useAnnouncement: announce,
    });
  };

  return (
    <>
      <Modal show={!showMap && !showLoad} onHide={onHide} centered>
        <Form noValidate onSubmit={handleSubmit}>
          <Modal.Header closeButton>
            <Modal.Title className="fs-5">{initial ? '지점 수정' : '지점 추가'}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="d-flex gap-2 mb-3">
              <Button
                variant="outline-primary"
                size="sm"
                className="flex-fill"
                onClick={() => setShowMap(true)}
              >
                🗺️ 지도/장소 검색
              </Button>
              <Button
                variant="outline-secondary"
                size="sm"
                className="flex-fill"
                onClick={() => setShowLoad(true)}
              >
                📂 기존 정류소
              </Button>
            </div>

            <Form.Group className="mb-2">
              <Form.Label className="small fw-semibold">지점명</Form.Label>
              <Form.Control
                value={name}
                onChange={(e) => setName(e.target.value)}
                isInvalid={validated && !name.trim()}
                placeholder="예: 시청 앞"
              />
              <Form.Control.Feedback type="invalid">지점명을 입력해주세요.</Form.Control.Feedback>
            </Form.Group>

            <Row className="g-2 mb-2">
              <Col xs={6}>
                <Form.Label className="small fw-semibold">위도</Form.Label>
                <Form.Control
                  inputMode="decimal"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  isInvalid={validated && !coordValid}
                  placeholder="37.5665"
                />
              </Col>
              <Col xs={6}>
                <Form.Label className="small fw-semibold">경도</Form.Label>
                <Form.Control
                  inputMode="decimal"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  isInvalid={validated && !coordValid}
                  placeholder="126.9780"
                />
              </Col>
              {validated && !coordValid && (
                <div className="invalid-feedback d-block">
                  위치를 지도에서 선택하거나 올바른 좌표를 입력해주세요.
                </div>
              )}
            </Row>

            <Row className="g-2 mb-2">
              <Col xs={6}>
                <Form.Label className="small fw-semibold">구분</Form.Label>
                <Form.Select value={type} onChange={(e) => setType(e.target.value as PointType)}>
                  {POINT_TYPES.map((t) => (
                    <option key={t} value={t} disabled={!allowedTypes.includes(t)}>
                      {t}
                      {t === '가상정류소' ? ' (정차 없이 통과)' : ''}
                    </option>
                  ))}
                </Form.Select>
              </Col>
              <Col xs={6}>
                <Form.Label className="small fw-semibold">예정 시각 (선택)</Form.Label>
                <Form.Control type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </Col>
            </Row>

            <Form.Check
              id="point-announce"
              type="switch"
              label="접근 시 안내 방송"
              checked={announce}
              onChange={(e) => setAnnounce(e.target.checked)}
            />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={onHide}>
              취소
            </Button>
            <Button type="submit" variant="primary">
              {initial ? '수정 완료' : '추가'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {showMap && (
        <MapPickerModal
          show
          onHide={() => setShowMap(false)}
          initial={coordValid ? [latNum, lngNum] : null}
          existing={existing}
          onPick={({ pos, name: placeName }) => {
            setLat(pos[0].toFixed(6));
            setLng(pos[1].toFixed(6));
            if (placeName && !name.trim()) setName(placeName);
          }}
        />
      )}
      <LoadPointModal
        show={showLoad}
        onHide={() => setShowLoad(false)}
        onSelect={(p) => {
          setName(p.name);
          setLat(String(p.location.coordinates[1]));
          setLng(String(p.location.coordinates[0]));
        }}
      />
    </>
  );
};

export default PointFormModal;
