import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { Alert, Badge, Button, Card, Col, Form, Row, Spinner } from 'react-bootstrap';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import { useFeedback } from '../feedback/context';
import { FitBounds } from '../map/MapHelpers';
import PointFormModal from './PointFormModal';
import { toLatLng } from '../../lib/format';
import {
  DEFAULT_CENTER,
  DEFAULT_SETTINGS,
  TILE_ATTRIBUTION,
  TILE_URL,
  TYPE_BADGE,
} from '../../lib/ui';
import type { PointType, RouteInput, RoutePoint, RouteSettings } from '../../types';

interface EditorPoint extends RoutePoint {
  key: string;
}

let keySeq = 0;
const withKey = (p: RoutePoint): EditorPoint => ({ ...p, key: p._id || `new-${++keySeq}` });

// 출발지는 맨 앞, 도착지는 맨 뒤로 정렬
const normalize = (points: EditorPoint[]) => [
  ...points.filter((p) => p.type === '출발지'),
  ...points.filter((p) => p.type !== '출발지' && p.type !== '도착지'),
  ...points.filter((p) => p.type === '도착지'),
];

const validateRoute = (routeName: string, points: RoutePoint[], settings: RouteSettings) => {
  const errors: string[] = [];
  if (!routeName.trim()) errors.push('노선 이름을 입력해주세요.');
  const starts = points.filter((p) => p.type === '출발지').length;
  const ends = points.filter((p) => p.type === '도착지').length;
  if (starts !== 1) errors.push('출발지가 1개 있어야 합니다.');
  if (ends !== 1) errors.push('도착지가 1개 있어야 합니다.');
  if (points.length < 2) errors.push('지점은 최소 2개 이상이어야 합니다.');
  if (!(settings.arrivalRadius >= 10 && settings.arrivalRadius <= 1000))
    errors.push('도착 반경은 10~1000m 사이여야 합니다.');
  if (!(settings.approachRadius >= 20 && settings.approachRadius <= 5000))
    errors.push('접근 반경은 20~5000m 사이여야 합니다.');
  if (settings.arrivalRadius >= settings.approachRadius)
    errors.push('도착 반경은 접근 반경보다 작아야 합니다.');
  return errors;
};

// 예정 시각이 앞 정류장보다 이른 경우 (자정 넘김일 수도 있으므로 경고만)
const timeWarnings = (points: RoutePoint[]) => {
  const warnings: string[] = [];
  let prev: { name: string; time: string } | null = null;
  for (const p of points) {
    if (!p.scheduledTime) continue;
    if (prev && p.scheduledTime < prev.time) {
      warnings.push(
        `'${p.name}'의 예정 시각(${p.scheduledTime})이 '${prev.name}'(${prev.time})보다 이릅니다.`
      );
    }
    prev = { name: p.name, time: p.scheduledTime };
  }
  return warnings;
};

interface Props {
  initial?: Partial<RouteInput>;
  submitLabel: string;
  onSubmit: (data: RouteInput) => Promise<void>;
  toolbar?: ReactNode;
  notice?: ReactNode;
  footerStart?: ReactNode;
}

const RouteEditor = ({ initial, submitLabel, onSubmit, toolbar, notice, footerStart }: Props) => {
  const { confirm } = useFeedback();
  const [routeName, setRouteName] = useState(initial?.routeName || '');
  const [settings, setSettings] = useState<RouteSettings>(initial?.settings || DEFAULT_SETTINGS);
  const [points, setPoints] = useState<EditorPoint[]>(() =>
    normalize((initial?.points || []).map(withKey))
  );
  const [editing, setEditing] = useState<{ key: string | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const errors = validateRoute(routeName, points, settings);
  const warnings = timeWarnings(points);
  const starts = points.filter((p) => p.type === '출발지');
  const middles = points.filter((p) => p.type !== '출발지' && p.type !== '도착지');
  const ends = points.filter((p) => p.type === '도착지');

  const editingPoint = editing?.key ? points.find((p) => p.key === editing.key) || null : null;
  const allowedTypes = (current: PointType | null): PointType[] => [
    ...(starts.length === 0 || current === '출발지' ? (['출발지'] as const) : []),
    '경유지',
    '가상정류소',
    ...(ends.length === 0 || current === '도착지' ? (['도착지'] as const) : []),
  ];
  const defaultType: PointType = starts.length === 0 ? '출발지' : '경유지';

  const savePoint = (p: RoutePoint) => {
    setPoints((prev) => {
      if (editing?.key) {
        return normalize(prev.map((x) => (x.key === editing.key ? { ...p, key: x.key } : x)));
      }
      return normalize([...prev, withKey(p)]);
    });
    setEditing(null);
  };

  const removePoint = async (p: EditorPoint) => {
    const ok = await confirm({
      title: `'${p.name}' 지점을 삭제할까요?`,
      confirmLabel: '삭제',
      variant: 'danger',
    });
    if (ok) setPoints((prev) => prev.filter((x) => x.key !== p.key));
  };

  const moveMiddle = (from: number, to: number) => {
    if (to < 0 || to >= middles.length) return;
    const next = [...middles];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setPoints([...starts, ...next, ...ends]);
  };

  const handleDragEnd = (result: DropResult) => {
    if (result.destination) moveMiddle(result.source.index, result.destination.index);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    if (errors.length > 0) return;
    setSubmitting(true);
    try {
      await onSubmit({
        routeName: routeName.trim(),
        settings,
        points: points.map((p) => {
          const { key, ...rest } = p;
          void key;
          return rest;
        }),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const latlngs = useMemo(() => points.map((p) => toLatLng(p.location.coordinates)), [points]);
  const fitKey = latlngs.map((p) => p.join(',')).join('|');

  const renderItem = (p: EditorPoint, order: number, drag?: { index: number }) => {
    const badge = TYPE_BADGE[p.type];
    return (
      <div
        className={`point-item ${p.type === '출발지' || p.type === '도착지' ? 'point-item-fixed' : ''}`}
      >
        <div className="point-order">{drag ? '☰' : order}</div>
        <div className="flex-grow-1 min-w-0">
          <div className="d-flex align-items-center gap-2">
            <Badge bg={badge.bg} text={badge.text as 'dark' | undefined}>
              {badge.label}
            </Badge>
            <span className="fw-bold text-truncate">{p.name}</span>
          </div>
          <div className="text-muted small">
            {p.scheduledTime || '시간 미정'}
            {p.useAnnouncement && <span className="ms-2">📢 방송</span>}
          </div>
        </div>
        <div className="d-flex gap-1 flex-shrink-0">
          {drag && (
            <>
              <Button
                variant="light"
                size="sm"
                aria-label="위로"
                disabled={drag.index === 0}
                onClick={() => moveMiddle(drag.index, drag.index - 1)}
              >
                ▲
              </Button>
              <Button
                variant="light"
                size="sm"
                aria-label="아래로"
                disabled={drag.index === middles.length - 1}
                onClick={() => moveMiddle(drag.index, drag.index + 1)}
              >
                ▼
              </Button>
            </>
          )}
          <Button
            variant="outline-secondary"
            size="sm"
            aria-label="수정"
            onClick={() => setEditing({ key: p.key })}
          >
            ✏️
          </Button>
          <Button
            variant="outline-danger"
            size="sm"
            aria-label="삭제"
            onClick={() => removePoint(p)}
          >
            🗑️
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Form noValidate onSubmit={handleSubmit} className="route-editor">
      {toolbar}
      {notice}

      <Card className="mb-3">
        <Card.Body>
          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold">노선 이름</Form.Label>
            <Form.Control
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              placeholder="예: 출근 1호차"
              isInvalid={showErrors && !routeName.trim()}
            />
          </Form.Group>
          <Row className="g-2">
            <Col xs={6}>
              <Form.Label className="small fw-semibold">접근(안내) 반경</Form.Label>
              <div className="input-group input-group-sm">
                <Form.Control
                  type="number"
                  min={20}
                  max={5000}
                  value={settings.approachRadius}
                  onChange={(e) =>
                    setSettings({ ...settings, approachRadius: Number(e.target.value) })
                  }
                />
                <span className="input-group-text">m</span>
              </div>
            </Col>
            <Col xs={6}>
              <Form.Label className="small fw-semibold">도착 판정 반경</Form.Label>
              <div className="input-group input-group-sm">
                <Form.Control
                  type="number"
                  min={10}
                  max={1000}
                  value={settings.arrivalRadius}
                  onChange={(e) =>
                    setSettings({ ...settings, arrivalRadius: Number(e.target.value) })
                  }
                />
                <span className="input-group-text">m</span>
              </div>
            </Col>
          </Row>
          <Form.Text>
            정류장에서 접근 반경 안에 들어오면 안내 방송, 도착 반경 안에 들어오면 도착으로
            처리합니다.
          </Form.Text>
        </Card.Body>
      </Card>

      <div className="route-preview-map mb-3">
        <MapContainer center={latlngs[0] || DEFAULT_CENTER} zoom={12} className="h-100 w-100">
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
          <FitBounds points={latlngs} fitKey={fitKey} />
          {latlngs.length > 1 && (
            <Polyline
              positions={latlngs}
              pathOptions={{ color: '#4f46e5', weight: 3, opacity: 0.6 }}
            />
          )}
          {points.map((p, i) => (
            <CircleMarker
              key={p.key}
              center={latlngs[i]}
              radius={p.type === '가상정류소' ? 5 : 7}
              pathOptions={{
                color: 'white',
                weight: 2,
                fillOpacity: 1,
                fillColor:
                  p.type === '출발지' ? '#0d6efd' : p.type === '도착지' ? '#198754' : '#6c757d',
              }}
            >
              <Tooltip>
                {i + 1}. {p.name}
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
        {points.length === 0 && (
          <div className="map-empty-overlay">지점을 추가하면 노선이 표시됩니다</div>
        )}
      </div>

      <div className="d-flex justify-content-between align-items-center mb-2">
        <h6 className="fw-bold mb-0">지점 목록 ({points.length})</h6>
        <Button size="sm" onClick={() => setEditing({ key: null })}>
          + 지점 추가
        </Button>
      </div>

      <div className="mb-3">
        {starts.map((p) => (
          <div key={p.key}>{renderItem(p, 1)}</div>
        ))}
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="middle-points">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef}>
                {middles.map((p, index) => (
                  <Draggable key={p.key} draggableId={p.key} index={index}>
                    {(drag) => (
                      <div ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps}>
                        {renderItem(p, starts.length + index + 1, { index })}
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
        {ends.map((p) => (
          <div key={p.key}>{renderItem(p, points.length)}</div>
        ))}
        {points.length === 0 && (
          <div className="text-center text-muted border rounded py-4 small">
            아직 지점이 없습니다. 출발지부터 추가해보세요.
          </div>
        )}
      </div>

      {warnings.length > 0 && (
        <Alert variant="warning" className="small py-2">
          {warnings.map((w) => (
            <div key={w}>⚠️ {w}</div>
          ))}
        </Alert>
      )}
      {showErrors && errors.length > 0 && (
        <Alert variant="danger" className="small py-2">
          {errors.map((e) => (
            <div key={e}>• {e}</div>
          ))}
        </Alert>
      )}

      <div className="editor-footer">
        {footerStart}
        <Button type="submit" variant="primary" className="ms-auto px-4" disabled={submitting}>
          {submitting ? <Spinner size="sm" /> : submitLabel}
        </Button>
      </div>

      {editing && (
        <PointFormModal
          initial={editingPoint}
          defaultType={defaultType}
          allowedTypes={allowedTypes(editingPoint?.type || null)}
          existing={points
            .filter((p) => p.key !== editing.key)
            .map((p) => ({ name: p.name, pos: toLatLng(p.location.coordinates) }))}
          onSave={savePoint}
          onHide={() => setEditing(null)}
        />
      )}
    </Form>
  );
};

export default RouteEditor;
