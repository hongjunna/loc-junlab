import { useEffect, useState } from 'react';
import { Form, ListGroup, Modal, Spinner } from 'react-bootstrap';
import { errorMessage, getAllPoints } from '../api';
import type { RoutePoint } from '../types';

interface Props {
  show: boolean;
  onHide: () => void;
  onSelect: (point: RoutePoint) => void;
}

// 다른 노선에 등록된 정류소 불러오기
const LoadPointModal = ({ show, onHide, onSelect }: Props) => {
  const [points, setPoints] = useState<RoutePoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    getAllPoints()
      .then((data) => !cancelled && setPoints(data))
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [show]);

  const filtered = (points || []).filter((p) =>
    p.name.toLowerCase().includes(searchTerm.trim().toLowerCase())
  );

  return (
    <Modal show={show} onHide={onHide} centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title className="fs-5">기존 정류소 불러오기</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Control
          type="search"
          placeholder="정류소명 검색..."
          className="mb-3"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          autoFocus
        />
        {error ? (
          <div className="text-danger small">{error}</div>
        ) : !points ? (
          <div className="text-center">
            <Spinner animation="border" size="sm" />
          </div>
        ) : (
          <ListGroup variant="flush">
            {filtered.map((p, idx) => (
              <ListGroup.Item
                key={`${p.name}-${idx}`}
                action
                onClick={() => {
                  onSelect(p);
                  onHide();
                }}
              >
                <div className="fw-bold">{p.name}</div>
                <div className="text-muted small">
                  {p.location.coordinates[1].toFixed(5)}, {p.location.coordinates[0].toFixed(5)}
                </div>
              </ListGroup.Item>
            ))}
            {filtered.length === 0 && (
              <div className="text-center text-muted py-3">검색 결과가 없습니다.</div>
            )}
          </ListGroup>
        )}
      </Modal.Body>
    </Modal>
  );
};

export default LoadPointModal;
