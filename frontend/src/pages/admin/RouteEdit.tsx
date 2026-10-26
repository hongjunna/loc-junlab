import { Alert, Button } from 'react-bootstrap';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, deleteRoute, errorMessage, getRoute, updateRoute } from '../../api';
import { useFeedback } from '../../components/feedback/context';
import { LoadError, Loading } from '../../components/LoadState';
import RouteEditor from '../../components/route-editor/RouteEditor';
import { useAsync } from '../../hooks/useAsync';
import type { RouteInput } from '../../types';

const RouteEdit = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const { data: route, error, reload } = useAsync(() => getRoute(id), [id]);

  const handleSubmit = async (data: RouteInput) => {
    try {
      await updateRoute(id, data);
      toast('노선이 저장되었습니다.', { variant: 'success' });
      navigate('/config/routes');
    } catch (err) {
      toast(errorMessage(err), { variant: 'danger' });
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: '이 노선을 삭제할까요?',
      body: '지난 운행 기록은 그대로 남습니다.',
      confirmLabel: '삭제',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteRoute(id);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 409)) {
        toast(errorMessage(err), { variant: 'danger' });
        return;
      }
      const force = await confirm({
        title: '진행 중인 운행이 있습니다',
        body: `${err.message}\n그래도 삭제할까요? 진행 중인 운행은 계속됩니다.`,
        confirmLabel: '그래도 삭제',
        variant: 'danger',
      });
      if (!force) return;
      try {
        await deleteRoute(id, true);
      } catch (e) {
        toast(errorMessage(e), { variant: 'danger' });
        return;
      }
    }
    toast('노선이 삭제되었습니다.');
    navigate('/config/routes');
  };

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (!route) return <Loading />;

  return (
    <>
      <div className="page-title">
        <h4>노선 수정</h4>
      </div>
      <RouteEditor
        initial={route as RouteInput}
        submitLabel="저장"
        onSubmit={handleSubmit}
        notice={
          !!route.activeDriveCount && (
            <Alert variant="info" className="small py-2">
              이 노선으로 진행 중인 운행이 {route.activeDriveCount}건 있습니다. 수정 내용은 다음
              운행부터 적용됩니다.
            </Alert>
          )
        }
        footerStart={
          <Button variant="outline-danger" onClick={handleDelete}>
            노선 삭제
          </Button>
        }
      />
    </>
  );
};

export default RouteEdit;
