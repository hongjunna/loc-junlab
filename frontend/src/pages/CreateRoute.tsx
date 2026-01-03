import React, { useState } from 'react';
import {
  Form,
  Button,
  Row,
  Col,
  Card,
  Modal,
  InputGroup,
  Badge,
  ListGroup,
  Spinner,
} from 'react-bootstrap';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  useMapEvents,
} from 'react-leaflet';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import { createRoute } from '../services/api';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';

// [지도 클릭 컴포넌트]
const LocationPicker = ({ onLocationSelect, selectedPos }: any) => {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng);
    },
  });
  return selectedPos ? (
    <CircleMarker
      center={selectedPos}
      radius={10}
      pathOptions={{
        color: 'white',
        fillColor: '#ff4d4f',
        fillOpacity: 1,
        weight: 3,
      }}
    />
  ) : null;
};

// --- 기존 정류소 불러오기 모달 ---
const LoadPointModal = ({ show, onHide, onSelect }: any) => {
  const [points, setPoints] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (show) fetchPoints();
  }, [show]);

  const fetchPoints = async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        'https://loc.junlab.xyz/api/routes/data/points'
      );
      setPoints(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredPoints = points.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Modal show={show} onHide={onHide} centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title>기존 정류소 불러오기</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Control
          type="text"
          placeholder="정류소명 검색..."
          className="mb-3"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          autoFocus
        />
        {loading ? (
          <div className="text-center">
            <Spinner animation="border" size="sm" />
          </div>
        ) : (
          <ListGroup variant="flush">
            {filteredPoints.map((p, idx) => (
              <ListGroup.Item
                key={idx}
                action
                onClick={() => {
                  onSelect(p);
                  onHide();
                }}
              >
                <div className="fw-bold">{p.name}</div>
                <div className="text-muted small">
                  {p.location.coordinates[1]}, {p.location.coordinates[0]}
                </div>
              </ListGroup.Item>
            ))}
            {filteredPoints.length === 0 && (
              <div className="text-center text-muted py-3">
                검색 결과가 없습니다.
              </div>
            )}
          </ListGroup>
        )}
      </Modal.Body>
    </Modal>
  );
};

// --- 역노선 생성 모달 ---
const ReverseRouteModal = ({ show, onHide, onSelect }: any) => {
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (show) fetchRoutes();
  }, [show]);

  const fetchRoutes = async () => {
    setLoading(true);
    try {
      const res = await axios.get('https://loc.junlab.xyz/api/routes');
      setRoutes(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title>역노선 생성 (기존 노선 선택)</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading ? (
          <div className="text-center">
            <Spinner animation="border" size="sm" />
          </div>
        ) : (
          <ListGroup variant="flush">
            {routes.map((r) => (
              <ListGroup.Item key={r._id} action onClick={() => onSelect(r)}>
                <div className="fw-bold">{r.routeName}</div>
                <div className="text-muted small">
                  총 {r.points?.length || 0}개 지점
                </div>
              </ListGroup.Item>
            ))}
            {routes.length === 0 && (
              <div className="text-center text-muted py-3">
                노선이 없습니다.
              </div>
            )}
          </ListGroup>
        )}
      </Modal.Body>
    </Modal>
  );
};

const CreateRoute = () => {
  const [routeName, setRouteName] = useState('');
  const [points, setPoints] = useState<any[]>([]);

  // [추가됨] 반경 설정 상태 (기본값: 접근 100m, 도착 20m)
  const [radiusSettings, setRadiusSettings] = useState({
    approach: 100, // m 단위
    arrival: 50, // m 단위
  });

  const [input, setInput] = useState({
    name: '',
    lat: '',
    lng: '',
    type: '경유지',
    hour: '',
    minute: '',
    announce: false,
  });

  const [showMap, setShowMap] = useState(false);
  const [tempLocation, setTempLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showReverseModal, setShowReverseModal] = useState(false);

  const handleMapClick = (latlng: { lat: number; lng: number }) =>
    setTempLocation(latlng);
  const confirmLocation = () => {
    if (tempLocation) {
      setInput({
        ...input,
        lat: tempLocation.lat.toFixed(6),
        lng: tempLocation.lng.toFixed(6),
      });
      setShowMap(false);
    } else {
      alert('위치를 클릭해주세요.');
    }
  };

  const handlePointSelect = (point: any) => {
    setInput({
      ...input,
      name: point.name,
      lat: String(point.location.coordinates[1]),
      lng: String(point.location.coordinates[0]),
    });
  };

  const handleReverseSelect = (route: any) => {
    if (!route.points) return;

    // 1. 포인트 역순 정렬 및 타입/시간 재설정
    const reversedPoints = [...route.points]
      .reverse()
      .map((p: any, idx: number, arr: any[]) => {
        let newType = p.type;

        // 첫 지점 -> 출발지
        if (idx === 0) newType = '출발지';
        // 마지막 지점 -> 도착지
        else if (idx === arr.length - 1) newType = '도착지';
        // 그 외 출발/도착지였던 것들 -> 경유지 (중간에 껴있게 되므로)
        else if (p.type === '출발지' || p.type === '도착지') newType = '경유지';

        return {
          ...p,
          id: `rev-${Date.now()}-${idx}`, // DnD용 새 ID
          type: newType,
          scheduledTime: '', // 시간은 역방향이므로 초기화
        };
      });

    setRouteName(`${route.routeName} (역방향)`);
    setPoints(reversedPoints);

    if (route.settings) {
      setRadiusSettings({
        approach: (route.settings.approachRadius || 0.1) * 1000,
        arrival: (route.settings.arrivalRadius || 0.02) * 1000,
      });
    }
    setShowReverseModal(false);
  };

  const addPointToList = () => {
    if (!input.name || !input.lat || !input.lng)
      return alert('필수 정보를 입력해주세요.');

    if (isNaN(Number(input.lat)) || isNaN(Number(input.lng)))
      return alert('위도와 경도는 숫자여야 합니다.');

    let formattedTime = '';
    if (input.hour && input.minute) {
      const hh = input.hour.padStart(2, '0');
      const mm = input.minute.padStart(2, '0');
      formattedTime = `${hh}:${mm}`;
    }

    setPoints([
      ...points,
      {
        id: Date.now().toString(),
        name: input.name,
        location: {
          type: 'Point',
          coordinates: [Number(input.lng), Number(input.lat)],
        },
        type: input.type,
        scheduledTime: formattedTime,
        useAnnouncement: input.announce,
      },
    ]);

    setInput({
      ...input,
      name: '',
      lat: '',
      lng: '',
      hour: '',
      minute: '',
      announce: false,
    });
  };

  const handleDelete = (indexToDelete: number) => {
    if (window.confirm('정말 삭제하시겠습니까?')) {
      setPoints(points.filter((_, idx) => idx !== indexToDelete));
    }
  };

  const handleEdit = (indexToEdit: number) => {
    const p = points[indexToEdit];
    const [hh, mm] = p.scheduledTime ? p.scheduledTime.split(':') : ['', ''];

    setInput({
      name: p.name,
      lat: String(p.location.coordinates[1]),
      lng: String(p.location.coordinates[0]),
      type: p.type,
      hour: hh,
      minute: mm,
      announce: p.useAnnouncement,
    });
    setPoints(points.filter((_, idx) => idx !== indexToEdit));
  };

  const handleOnDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const startPoints = points.filter((p) => p.type === '출발지');
    const endPoints = points.filter((p) => p.type === '도착지');
    const middlePoints = points.filter(
      (p) => p.type !== '출발지' && p.type !== '도착지'
    );

    const [reorderedItem] = middlePoints.splice(result.source.index, 1);
    middlePoints.splice(result.destination.index, 0, reorderedItem);

    setPoints([...startPoints, ...middlePoints, ...endPoints]);
  };

  const handleSaveRoute = async () => {
    if (!routeName || points.length === 0)
      return alert('노선 정보를 입력해주세요.');

    // [저장 로직 수정] 미터 단위를 킬로미터로 변환하여 전송
    const payload = {
      routeName,
      points,
      settings: {
        approachRadius: Number(radiusSettings.approach) / 1000, // 100m -> 0.1km
        arrivalRadius: Number(radiusSettings.arrival) / 1000, // 20m -> 0.02km
      },
    };

    try {
      await createRoute(payload);
      alert(
        `✅ 저장 완료!\n(접근: ${radiusSettings.approach}m / 도착: ${radiusSettings.arrival}m)`
      );
      setRouteName('');
      setPoints([]);
      setRadiusSettings({ approach: 100, arrival: 20 }); // 초기화
    } catch (err) {
      alert('❌ 저장 실패');
    }
  };

  // 지도 초기 중심 좌표 계산 (마지막 포인트 기준)
  const getMapCenter = (): [number, number] => {
    if (points.length > 0) {
      const lastPoint = points[points.length - 1];
      return [
        lastPoint.location.coordinates[1],
        lastPoint.location.coordinates[0],
      ];
    }
    return [37.5665, 126.978];
  };

  // 렌더링 분리
  const startPoints = points.filter((p) => p.type === '출발지');
  const endPoints = points.filter((p) => p.type === '도착지');
  const middlePoints = points.filter(
    (p) => p.type !== '출발지' && p.type !== '도착지'
  );

  const RenderListItem = ({
    p,
    index,
    isDraggable = false,
    onDelete,
    onEdit,
  }: any) => (
    <div
      className={`d-flex align-items-center bg-white border rounded p-2 mb-2 shadow-sm ${
        p.type === '출발지'
          ? 'border-primary border-2'
          : p.type === '도착지'
          ? 'border-dark border-2'
          : ''
      }`}
    >
      <div
        className="me-3 text-muted"
        style={{ width: '20px', cursor: isDraggable ? 'grab' : 'default' }}
      >
        {isDraggable ? '☰' : '🔒'}
      </div>
      <div className="flex-grow-1">
        <div className="d-flex align-items-center">
          <Badge
            bg={
              p.type === '출발지'
                ? 'primary'
                : p.type === '도착지'
                ? 'dark'
                : 'secondary'
            }
            className="me-2"
          >
            {p.type}
          </Badge>
          <span className="fw-bold">{p.name}</span>
          <span className="ms-2 text-muted small">
            {p.scheduledTime || '--:--'}
          </span>
        </div>
        <div className="text-muted small" style={{ fontSize: '0.75rem' }}>
          {p.location.coordinates[1]}, {p.location.coordinates[0]}
          {p.useAnnouncement && (
            <span className="text-primary ms-2">📢 방송</span>
          )}
        </div>
      </div>
      <div className="d-flex gap-1">
        <Button variant="outline-secondary" size="sm" onClick={() => onEdit(p)}>
          ✏️
        </Button>
        <Button variant="outline-danger" size="sm" onClick={() => onDelete(p)}>
          🗑️
        </Button>
      </div>
    </div>
  );

  return (
    <div className="full-width-content p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="fw-bold mb-0">🛠 노선 등록</h4>
        <Button
          variant="outline-dark"
          size="sm"
          onClick={() => setShowReverseModal(true)}
        >
          🔄 역노선 생성하기
        </Button>
      </div>

      {/* 1. 노선 명칭 및 반경 설정 */}
      <Card className="border-0 shadow-sm mb-4">
        <Card.Body>
          <Form.Group className="mb-3">
            <Form.Label className="fw-bold small">노선 명칭</Form.Label>
            <Form.Control
              size="lg"
              placeholder="예: 101번 버스"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
            />
          </Form.Group>

          {/* [추가됨] 반경 설정 섹션 */}
          <h6 className="fw-bold small text-muted mb-2">
            🚩 운행 판정 범위 설정 (기본값 적용됨)
          </h6>
          <Row className="g-2">
            <Col xs={6}>
              <Form.Label className="small mb-1">
                접근(Approaching) 판정
              </Form.Label>
              <InputGroup size="sm">
                <Form.Control
                  type="number"
                  value={radiusSettings.approach}
                  onChange={(e) =>
                    setRadiusSettings({
                      ...radiusSettings,
                      approach: Number(e.target.value),
                    })
                  }
                />
                <InputGroup.Text>m 이내</InputGroup.Text>
              </InputGroup>
            </Col>
            <Col xs={6}>
              <Form.Label className="small mb-1">도착(Arrived) 판정</Form.Label>
              <InputGroup size="sm">
                <Form.Control
                  type="number"
                  value={radiusSettings.arrival}
                  onChange={(e) =>
                    setRadiusSettings({
                      ...radiusSettings,
                      arrival: Number(e.target.value),
                    })
                  }
                />
                <InputGroup.Text>m 이내</InputGroup.Text>
              </InputGroup>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* 2. 지점 입력 폼 */}
      <Card className="bg-light border-0 mb-4 shadow-sm">
        <Card.Body>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="fw-bold mb-0">📍 지점 정보 입력</h6>
            <div>
              <Button
                variant="outline-secondary"
                size="sm"
                className="me-2"
                onClick={() => setShowLoadModal(true)}
              >
                📂 불러오기
              </Button>
              <Button
                variant="outline-primary"
                size="sm"
                onClick={() => {
                  setTempLocation(null);
                  setShowMap(true);
                }}
              >
                🗺️ 지도 선택
              </Button>
            </div>
          </div>

          <Form.Group className="mb-2">
            <Form.Control
              placeholder="지점명"
              value={input.name}
              onChange={(e) => setInput({ ...input, name: e.target.value })}
            />
          </Form.Group>

          <Row className="g-2 mb-2">
            <Col>
              <Form.Control
                placeholder="위도"
                value={input.lat}
                onChange={(e) => setInput({ ...input, lat: e.target.value })}
              />
            </Col>
            <Col>
              <Form.Control
                placeholder="경도"
                value={input.lng}
                onChange={(e) => setInput({ ...input, lng: e.target.value })}
              />
            </Col>
          </Row>

          <Row className="g-2 mb-3">
            <Col xs={4}>
              <Form.Select
                value={input.type}
                onChange={(e) => setInput({ ...input, type: e.target.value })}
              >
                <option>출발지</option>
                <option>경유지</option>
                <option>가상정류소</option>
                <option>도착지</option>
              </Form.Select>
            </Col>
            <Col xs={4}>
              <InputGroup>
                <Form.Control
                  placeholder="HH"
                  type="number"
                  min="0"
                  max="23"
                  value={input.hour}
                  onChange={(e) => setInput({ ...input, hour: e.target.value })}
                />
                <InputGroup.Text className="px-1">:</InputGroup.Text>
                <Form.Control
                  placeholder="MM"
                  type="number"
                  min="0"
                  max="59"
                  value={input.minute}
                  onChange={(e) =>
                    setInput({ ...input, minute: e.target.value })
                  }
                />
              </InputGroup>
            </Col>
            <Col
              xs={4}
              className="d-flex align-items-center justify-content-end"
            >
              <Form.Check
                type="checkbox"
                label="방송"
                checked={input.announce}
                onChange={(e) =>
                  setInput({ ...input, announce: e.target.checked })
                }
              />
            </Col>
          </Row>

          <Button variant="primary" className="w-100" onClick={addPointToList}>
            추가하기 ⬇️
          </Button>
        </Card.Body>
      </Card>

      {/* 3. 리스트 영역 */}
      <h6 className="fw-bold mb-2">📋 노선 구성</h6>
      <div className="route-list-container mb-4">
        {startPoints.map((p, i) => (
          <RenderListItem
            key={i}
            p={p}
            onDelete={() => handleDelete(points.indexOf(p))}
            onEdit={() => handleEdit(points.indexOf(p))}
          />
        ))}

        <DragDropContext onDragEnd={handleOnDragEnd}>
          <Droppable droppableId="middle-points">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef}>
                {middlePoints.map((p, index) => (
                  <Draggable key={p.id} draggableId={p.id} index={index}>
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        style={{
                          ...provided.draggableProps.style,
                          marginBottom: '8px',
                        }}
                      >
                        <RenderListItem
                          p={p}
                          isDraggable={true}
                          onDelete={() => handleDelete(points.indexOf(p))}
                          onEdit={() => handleEdit(points.indexOf(p))}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        {endPoints.map((p, i) => (
          <RenderListItem
            key={i}
            p={p}
            onDelete={() => handleDelete(points.indexOf(p))}
            onEdit={() => handleEdit(points.indexOf(p))}
          />
        ))}
        {points.length === 0 && (
          <div className="text-center py-4 text-muted border rounded bg-light">
            지점을 추가해주세요.
          </div>
        )}
      </div>

      <Button
        variant="success"
        size="lg"
        className="w-100 py-3 fw-bold shadow"
        onClick={handleSaveRoute}
      >
        💾 노선 저장 완료
      </Button>

      <Modal show={showMap} onHide={() => setShowMap(false)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>지도 위치 선택</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-0" style={{ height: '400px' }}>
          {showMap && (
            <MapContainer
              center={getMapCenter()}
              zoom={13}
              style={{ width: '100%', height: '100%' }}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <LocationPicker
                onLocationSelect={handleMapClick}
                selectedPos={tempLocation}
              />
            </MapContainer>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="primary"
            onClick={confirmLocation}
            disabled={!tempLocation}
          >
            선택 완료
          </Button>
        </Modal.Footer>
      </Modal>

      <LoadPointModal
        show={showLoadModal}
        onHide={() => setShowLoadModal(false)}
        onSelect={handlePointSelect}
      />

      <ReverseRouteModal
        show={showReverseModal}
        onHide={() => setShowReverseModal(false)}
        onSelect={handleReverseSelect}
      />
    </div>
  );
};

export default CreateRoute;

