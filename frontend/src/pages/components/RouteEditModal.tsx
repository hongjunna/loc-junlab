import React, { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  Form,
  Alert,
  Spinner,
  Row,
  Col,
  InputGroup,
  Badge,
  Card,
  ListGroup,
} from 'react-bootstrap';
import axios from 'axios';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// --- 지도 클릭 컴포넌트 (CreateRoute와 동일) ---
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

  useEffect(() => {
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

interface RouteEditModalProps {
  show: boolean;
  onHide: () => void;
  routeId: string | null;
  onUpdate: () => void;
}

const RouteEditModal = ({
  show,
  onHide,
  routeId,
  onUpdate,
}: RouteEditModalProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- 상태 관리 ---
  const [routeName, setRouteName] = useState('');
  const [points, setPoints] = useState<any[]>([]);
  const [radiusSettings, setRadiusSettings] = useState({
    approach: 100,
    arrival: 20,
  });

  // 입력 폼 상태
  const [input, setInput] = useState({
    name: '',
    lat: '',
    lng: '',
    type: '경유지',
    hour: '',
    minute: '',
    announce: false,
  });

  // 지도 모달 상태
  const [showMap, setShowMap] = useState(false);
  const [tempLocation, setTempLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [showLoadModal, setShowLoadModal] = useState(false);

  useEffect(() => {
    if (show && routeId) {
      fetchRoute();
    }
  }, [show, routeId]);

  // --- 데이터 불러오기 ---
  const fetchRoute = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(
        `https://loc.junlab.xyz/api/routes/${routeId}`
      );
      const data = res.data;

      setRouteName(data.routeName);

      // 포인트 데이터 가공 (UI용 id 부여)
      const loadedPoints = (data.points || []).map((p: any, idx: number) => ({
        ...p,
        id: p._id || `temp-${Date.now()}-${idx}`, // DND를 위한 고유 ID
        scheduledTime: p.scheduledTime || '',
      }));
      setPoints(loadedPoints);

      // 반경 설정 (km -> m 변환)
      if (data.settings) {
        setRadiusSettings({
          approach: (data.settings.approachRadius || 0.1) * 1000,
          arrival: (data.settings.arrivalRadius || 0.02) * 1000,
        });
      }
    } catch (err) {
      setError('노선 정보를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // --- 핸들러 로직 ---
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

  const addPointToList = () => {
    if (!input.name || !input.lat || !input.lng)
      return alert('필수 정보를 입력해주세요.');

    let formattedTime = '';
    if (input.hour && input.minute) {
      formattedTime = `${input.hour.padStart(2, '0')}:${input.minute.padStart(
        2,
        '0'
      )}`;
    }

    const newPoint = {
      id: `new-${Date.now()}`,
      name: input.name,
      location: {
        type: 'Point',
        coordinates: [Number(input.lng), Number(input.lat)],
      },
      type: input.type,
      scheduledTime: formattedTime,
      useAnnouncement: input.announce,
    };

    setPoints([...points, newPoint]);
    setInput({
      name: '',
      lat: '',
      lng: '',
      type: '경유지',
      hour: '',
      minute: '',
      announce: false,
    });
  };

  const handleDelete = (index: number) => {
    if (window.confirm('삭제하시겠습니까?')) {
      setPoints(points.filter((_, i) => i !== index));
    }
  };

  const handleEditPoint = (index: number) => {
    const p = points[index];
    const [hh, mm] = p.scheduledTime ? p.scheduledTime.split(':') : ['', ''];
    setInput({
      name: p.name,
      lat: String(p.location.coordinates[1]),
      lng: String(p.location.coordinates[0]),
      type: p.type,
      hour: hh,
      minute: mm,
      announce: p.useAnnouncement || false,
    });
    // 편집 시 해당 항목은 리스트에서 제거하고 폼으로 이동 (CreateRoute 방식)
    setPoints(points.filter((_, i) => i !== index));
  };

  const handleOnDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    // CreateRoute와 동일하게 중간 경유지만 드래그 가능하도록 처리
    const startPoints = points.filter((p) => p.type === '출발지');
    const endPoints = points.filter((p) => p.type === '도착지');
    const middlePoints = points.filter(
      (p) => p.type !== '출발지' && p.type !== '도착지'
    );

    const [reorderedItem] = middlePoints.splice(result.source.index, 1);
    middlePoints.splice(result.destination.index, 0, reorderedItem);

    setPoints([...startPoints, ...middlePoints, ...endPoints]);
  };

  const handleSave = async () => {
    if (!routeId) return;
    try {
      // 저장 시 m -> km 변환
      const payload = {
        routeName,
        points,
        settings: {
          approachRadius: Number(radiusSettings.approach) / 1000,
          arrivalRadius: Number(radiusSettings.arrival) / 1000,
        },
      };

      await axios.put(`https://loc.junlab.xyz/api/routes/${routeId}`, {
        ...payload,
      });
      onUpdate();
      onHide();
    } catch (err) {
      setError('저장 중 오류가 발생했습니다.');
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

  // 렌더링 헬퍼
  const startPoints = points.filter((p) => p.type === '출발지');
  const endPoints = points.filter((p) => p.type === '도착지');
  const middlePoints = points.filter(
    (p) => p.type !== '출발지' && p.type !== '도착지'
  );

  const RenderListItem = ({ p, isDraggable, onDelete, onEdit }: any) => (
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
        <div className="text-muted small">
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
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>노선 수정</Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        {loading ? (
          <div className="text-center">
            <Spinner animation="border" />
          </div>
        ) : (
          <Form>
            {error && <Alert variant="danger">{error}</Alert>}

            {/* 1. 기본 정보 */}
            <Form.Group className="mb-3">
              <Form.Label>노선 이름</Form.Label>
              <Form.Control
                type="text"
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
              />
            </Form.Group>

            <Row className="mb-3">
              <Col xs={6}>
                <Form.Label className="small">접근 반경 (m)</Form.Label>
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
              </Col>
              <Col xs={6}>
                <Form.Label className="small">도착 반경 (m)</Form.Label>
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
              </Col>
            </Row>

            <hr />

            {/* 2. 지점 입력 폼 */}
            <Card className="bg-light border-0 mb-3">
              <Card.Body>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <h6 className="fw-bold mb-0">📍 지점 추가/수정</h6>
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
                <Row className="g-2 mb-2">
                  <Col xs={12}>
                    <Form.Control
                      placeholder="지점명"
                      value={input.name}
                      onChange={(e) =>
                        setInput({ ...input, name: e.target.value })
                      }
                    />
                  </Col>
                  <Col xs={6}>
                    <Form.Control
                      placeholder="위도"
                      value={input.lat}
                      onChange={(e) =>
                        setInput({ ...input, lat: e.target.value })
                      }
                    />
                  </Col>
                  <Col xs={6}>
                    <Form.Control
                      placeholder="경도"
                      value={input.lng}
                      onChange={(e) =>
                        setInput({ ...input, lng: e.target.value })
                      }
                    />
                  </Col>
                </Row>
                <Row className="g-2 mb-2">
                  <Col xs={4}>
                    <Form.Select
                      value={input.type}
                      onChange={(e) =>
                        setInput({ ...input, type: e.target.value })
                      }
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
                        value={input.hour}
                        onChange={(e) =>
                          setInput({ ...input, hour: e.target.value })
                        }
                      />
                      <InputGroup.Text>:</InputGroup.Text>
                      <Form.Control
                        placeholder="MM"
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
                <Button
                  variant="primary"
                  className="w-100"
                  onClick={addPointToList}
                >
                  리스트에 추가 ⬇️
                </Button>
              </Card.Body>
            </Card>

            {/* 3. 리스트 (DND) */}
            <div className="route-list-container">
              {startPoints.map((p, i) => (
                <RenderListItem
                  key={p.id || i}
                  p={p}
                  onDelete={() => handleDelete(points.indexOf(p))}
                  onEdit={() => handleEditPoint(points.indexOf(p))}
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
                                onEdit={() =>
                                  handleEditPoint(points.indexOf(p))
                                }
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
                  key={p.id || i}
                  p={p}
                  onDelete={() => handleDelete(points.indexOf(p))}
                  onEdit={() => handleEditPoint(points.indexOf(p))}
                />
              ))}
            </div>
          </Form>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          취소
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={loading}>
          저장
        </Button>
      </Modal.Footer>

      {/* 지도 선택 중첩 모달 */}
      <Modal
        show={showMap}
        onHide={() => setShowMap(false)}
        centered
        size="lg"
        style={{ zIndex: 1060 }}
      >
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
    </Modal>
  );
};

export default RouteEditModal;

