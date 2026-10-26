import { useState } from 'react';
import { Button, ListGroup, Modal, Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { createRoute, errorMessage, getRoutes } from '../../api';
import { useFeedback } from '../../components/feedback/context';
import RouteEditor from '../../components/route-editor/RouteEditor';
import { useAsync } from '../../hooks/useAsync';
import type { PointType, Route, RouteInput } from '../../types';

// 기존 노선을 뒤집어 역방향 노선 초안을 만든다
const reverseRoute = (route: Route): Partial<RouteInput> => {
  const reversed = [...route.points].reverse();
  return {
    routeName: `${route.routeName} (역방향)`,
    settings: route.settings,
    points: reversed.map((p, idx) => {
      let type: PointType = p.type;
      if (idx === 0) type = '출발지';
      else if (idx === reversed.length - 1) type = '도착지';
      else if (p.type === '출발지' || p.type === '도착지') type = '경유지';
      // 역방향은 시간표가 다르므로 시간은 비움
      return { name: p.name, location: p.location, type, useAnnouncement: p.useAnnouncement };
    }),
  };
};

const ReverseModal = ({
  onHide,
  onSelect,
}: {
  onHide: () => void;
  onSelect: (r: Route) => void;
}) => {
  const { data: routes, loading } = useAsync(getRoutes, []);
  return (
    <Modal show onHide={onHide} centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title className="fs-5">역방향으로 만들 노선 선택</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading ? (
          <div className="text-center">
            <Spinner size="sm" />
          </div>
        ) : (
          <ListGroup variant="flush">
            {routes?.map((r) => (
              <ListGroup.Item key={r._id} action onClick={() => onSelect(r)}>
                <div className="fw-bold">{r.routeName}</div>
                <div className="text-muted small">총 {r.points.length}개 지점</div>
              </ListGroup.Item>
            ))}
            {routes?.length === 0 && (
              <div className="text-center text-muted py-3">노선이 없습니다.</div>
            )}
          </ListGroup>
        )}
      </Modal.Body>
    </Modal>
  );
};

const RouteNew = () => {
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const [initial, setInitial] = useState<Partial<RouteInput>>({});
  const [editorKey, setEditorKey] = useState(0);
  const [showReverse, setShowReverse] = useState(false);

  const handleSubmit = async (data: RouteInput) => {
    try {
      await createRoute(data);
      toast('노선이 등록되었습니다.', { variant: 'success' });
      navigate('/config/routes');
    } catch (err) {
      toast(errorMessage(err), { variant: 'danger' });
    }
  };

  return (
    <>
      <div className="page-title">
        <h4>새 노선 등록</h4>
        <Button variant="outline-dark" size="sm" onClick={() => setShowReverse(true)}>
          🔄 역노선으로 시작
        </Button>
      </div>
      <RouteEditor
        key={editorKey}
        initial={initial}
        submitLabel="노선 저장"
        onSubmit={handleSubmit}
      />
      {showReverse && (
        <ReverseModal
          onHide={() => setShowReverse(false)}
          onSelect={(r) => {
            setInitial(reverseRoute(r));
            setEditorKey((k) => k + 1);
            setShowReverse(false);
            toast('역방향 노선을 불러왔습니다. 시간을 다시 입력해주세요.', { variant: 'info' });
          }}
        />
      )}
    </>
  );
};

export default RouteNew;
